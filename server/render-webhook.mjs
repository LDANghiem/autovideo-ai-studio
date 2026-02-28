// server/render-webhook.mjs
// ------------------------------------------------------------
// AutoVideo AI Studio — Render Webhook Service
//
// ENDPOINTS:
//   GET  /        → health check
//   POST /render  → existing video render pipeline
//   POST /dub     → 🆕 "Dub Any Video" pipeline
//
// DUB PIPELINE (7 steps):
//   [1] Download video + audio from YouTube (yt-dlp)
//   [2] Transcribe original audio (Whisper API)
//   [3] Translate transcript to target language (GPT-4o-mini)
//   [4] Generate TTS narration (ElevenLabs v3)
//   [5] Mix audio tracks (ffmpeg)
//   [6] Burn captions + replace audio (ffmpeg)
//   [7] Upload to Supabase Storage
//
// DEPENDENCIES (install on Render worker):
//   npm install youtube-dl-exec
//   Also needs ffmpeg + yt-dlp installed on the system
//   (Render Docker images include ffmpeg; yt-dlp via youtube-dl-exec)
// ------------------------------------------------------------

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { parseBuffer } from "music-metadata";

const execAsync = promisify(exec);

const app = express();
app.use(express.json({ limit: "2mb" }));

/* ============================================================
   Environment
============================================================ */
const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).trim();

const SERVICE_ROLE_KEY = (
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

const VIDEO_BUCKET = (process.env.VIDEO_BUCKET || "videos").trim();
const DUB_BUCKET = (process.env.DUB_BUCKET || "dubbed-videos").trim();
const PORT = Number(process.env.PORT || 10000);

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) " +
      "and SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================
   Shared Utilities
============================================================ */
function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function resolveAttempt(attemptFromRequest, projectAttempt) {
  const n = Number(attemptFromRequest);
  if (Number.isFinite(n) && n > 0) return n;
  const p = Number(projectAttempt);
  if (Number.isFinite(p) && p > 0) return p;
  return 1;
}

/* ── duration helpers ──────────────────────────────────────── */
function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function lengthToSeconds(lengthStr) {
  if (!lengthStr) return 60;
  const s = String(lengthStr).toLowerCase().trim();
  const secMatch = s.match(/(\d+)\s*(sec|secs|second|seconds)\b/);
  if (secMatch) return clamp(Number(secMatch[1]), 10, 1800);
  const minMatch = s.match(/(\d+)\s*(min|mins|minute|minutes)\b/);
  if (minMatch) return clamp(Number(minMatch[1]) * 60, 10, 1800);
  if (s.includes("2")) return 120;
  if (s.includes("3")) return 180;
  if (s.includes("4")) return 240;
  if (s.includes("5")) return 300;
  if (s.includes("8")) return 480;
  if (s.includes("12")) return 720;
  if (s.includes("16")) return 960;
  if (s.includes("20")) return 1200;
  if (s.includes("24")) return 1440;
  if (s.includes("30")) return 1800;
  return 60;
}

/* ── audio probing ─────────────────────────────────────────── */
async function downloadToBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Audio download failed (${r.status}): ${t || url}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function getAudioDurationSecFromUrl(audioUrl) {
  if (!audioUrl) return null;
  const buf = await downloadToBuffer(audioUrl);
  const meta = await parseBuffer(buf, "audio/mpeg");
  const d = meta?.format?.duration;
  if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  return null;
}

/* ── cache helper ──────────────────────────────────────────── */
function clearRemotionCache() {
  for (const d of [
    path.join(os.tmpdir(), "remotion"),
    path.join(os.tmpdir(), "remotion-cache"),
  ]) {
    if (fs.existsSync(d)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {}
    }
  }
}

/* ============================================================
   EXISTING: Render Pipeline (unchanged)
============================================================ */
async function runRender(projectId, attemptFromRequest) {
  const startedIso = new Date().toISOString();

  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    throw new Error(projErr?.message || "Project not found");
  }

  const attempt = resolveAttempt(attemptFromRequest, project.render_attempt);

  await admin
    .from("projects")
    .update({
      status: "rendering",
      error_message: null,
      updated_at: startedIso,
      render_started_at: startedIso,
    })
    .eq("id", projectId);

  await admin.from("project_renders").upsert(
    {
      project_id: projectId,
      user_id: project.user_id,
      attempt,
      status: "rendering",
      started_at: startedIso,
      render_started_at: startedIso,
      error_message: null,
    },
    { onConflict: "project_id,attempt" }
  );

  /* ── audio duration ──────────────────────────────────────── */
  let audioDurationSec = null;
  try {
    audioDurationSec = await getAudioDurationSecFromUrl(project.audio_url ?? null);
  } catch (e) {
    console.warn("[render] audio probe failed:", e?.message);
  }

  /* ── compute duration ────────────────────────────────────── */
  const FPS = 30;
  const requestedSeconds = lengthToSeconds(project.length);
  const audioSeconds = audioDurationSec ? Number(audioDurationSec) : 0;
  const finalSeconds = Math.max(requestedSeconds, audioSeconds || 0);
  const durationInFrames = Math.ceil((finalSeconds + 0.35) * FPS);

  console.log("[render] ─── duration ───");
  console.log("[render]   project.length :", project.length);
  console.log("[render]   requestedSec   :", requestedSeconds);
  console.log("[render]   audioDurSec    :", audioDurationSec);
  console.log("[render]   durationInFrames:", durationInFrames);

  /* ── scenes ──────────────────────────────────────────────── */
  const scenes = project.scenes ?? null;
  const sceneCount = Array.isArray(scenes) ? scenes.length : 0;
  const sceneImageCount = Array.isArray(scenes)
    ? scenes.filter((s) => s?.imageUrl).length
    : 0;

  console.log("[render]   scenes:", sceneCount, "with images:", sceneImageCount);

  /* ── video type + dimensions ──────────────────────────────── */
  const videoType = (project.video_type || "conventional").toLowerCase();
  const isVertical = videoType === "youtube_shorts" || videoType === "tiktok";

  console.log("[render]   videoType:", videoType, isVertical ? "(vertical 9:16)" : "(landscape 16:9)");

  /* ── inputProps (keep small — Remotion has size limits) ── */
  const liteScenes = Array.isArray(scenes) ? scenes.map((s, i) => ({
    index: i,
    title: s.title || "",
    imageUrl: s.imageUrl || null,
    startSec: s.startSec,
    endSec: s.endSec,
    transition: s.transition || "crossfade",
  })) : null;

  const rawWords = project.caption_words ?? [];
  const liteWords = Array.isArray(rawWords) ? rawWords.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  })) : null;

  /* ── background music URL ─────────────────────────────────── */
  const musicChoice = (project.music || "none").toLowerCase();
  const musicBucket = process.env.MUSIC_BUCKET || "music";
  const musicMap = {
    ambient: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/ambient.mp3",
    uplifting: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/uplifting.mp3",
    dramatic: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/dramatic.mp3",
  };
  const musicUrl = musicMap[musicChoice] || null;

  if (musicUrl) {
    console.log("[render]   musicUrl:", musicChoice, "→", musicUrl.slice(0, 80) + "...");
  } else {
    console.log("[render]   music: none");
  }

  const inputProps = {
    topic: project.topic ?? "Untitled Project",
    videoType,
    style: project.style ?? null,
    voice: project.voice ?? null,
    length: project.length ?? null,
    resolution: project.resolution ?? null,
    language: project.language ?? null,
    tone: project.tone ?? null,
    music: project.music ?? null,
    musicUrl,

    captionWords: liteWords,
    script: null,

    audioUrl: project.audio_url ?? null,
    audioDurationSec,
    attempt,
    durationInFrames,

    scenes: liteScenes,
  };

  const propsJson = JSON.stringify(inputProps);
  console.log("[render] inputProps size:", propsJson.length, "bytes");

  /* ── bundle + compose ────────────────────────────────────── */
  clearRemotionCache();

  const entry = path.join(process.cwd(), "src", "remotionApp", "index.ts");
  const serveUrl = await bundle(entry);

  const comp = await selectComposition({
    serveUrl,
    id: "Main",
    inputProps,
  });

  // ✅ Force override duration (proven fix)
  if (comp.durationInFrames !== durationInFrames) {
    console.log(
      "[render] ✅ OVERRIDE duration:",
      comp.durationInFrames,
      "→",
      durationInFrames
    );
    comp.durationInFrames = durationInFrames;
  }

  // ✅ Override dimensions for vertical video (Shorts/TikTok)
  if (isVertical) {
    comp.width = 1080;
    comp.height = 1920;
    console.log("[render] ✅ OVERRIDE to vertical: 1080x1920");
  } else {
    comp.width = 1920;
    comp.height = 1080;
  }

  console.log(
    "[render] FINAL →",
    "frames:", comp.durationInFrames,
    "fps:", comp.fps,
    "size:", comp.width, "x", comp.height
  );

  /* ── render ──────────────────────────────────────────────── */
  const outDir = path.join(os.tmpdir(), "renders");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${projectId}-attempt-${attempt}.mp4`);

  await renderMedia({
    composition: comp,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    crf: 30,
    pixelFormat: "yuv420p",
    muted: false,
    outputLocation: outFile,
    inputProps,
    timeoutInMilliseconds: 1800000,
    chromiumOptions: { disableGpu: true },
  });

  if (!fs.existsSync(outFile)) throw new Error(`Render output missing: ${outFile}`);

  /* ── upload ──────────────────────────────────────────────── */
  const fileBuffer = fs.readFileSync(outFile);
  const objectPath = `${project.user_id}/${projectId}/attempt-${attempt}.mp4`;

  const { error: upErr } = await admin.storage
    .from(VIDEO_BUCKET)
    .upload(objectPath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
    });

  if (upErr) throw new Error(upErr.message);

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${objectPath}`;
  const completedIso = new Date().toISOString();

  await admin
    .from("projects")
    .update({
      status: "done",
      video_url: publicUrl,
      pending_video_url: null,
      error_message: null,
      updated_at: completedIso,
      render_attempt: attempt,
      render_completed_at: completedIso,
    })
    .eq("id", projectId);

  await admin
    .from("project_renders")
    .update({
      status: "done",
      video_url: publicUrl,
      completed_at: completedIso,
      render_completed_at: completedIso,
      error_message: null,
      updated_at: completedIso,
    })
    .eq("project_id", projectId)
    .eq("attempt", attempt);

  try { fs.unlinkSync(outFile); } catch {}

  console.log("[render] ✅ done — video_url:", publicUrl);
  return { publicUrl, render_attempt: attempt };
}


/* ============================================================
   🆕 DUB PIPELINE — "Dub Any Video" feature
   Steps: download → transcribe → translate → TTS → mix → burn → upload
============================================================ */

/* ── helper: update dub project status ─────────────────────── */
async function updateDubStatus(projectId, status, progressPct, extra = {}) {
  await admin
    .from("dub_projects")
    .update({
      status,
      progress_pct: progressPct,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", projectId);
  console.log(`[dub] status → ${status} (${progressPct}%)`);
}

/* ── [DUB STEP 1] Download video + audio from YouTube ──────── */
async function dubStep1_Download(projectId, sourceUrl, workDir) {
  await updateDubStatus(projectId, "downloading", 5);

  const videoFile = path.join(workDir, "source-video.mp4");
  const audioFile = path.join(workDir, "source-audio.mp3");

  // Use youtube-dl-exec (bundles yt-dlp binary)
  const ytdlp = (await import("youtube-dl-exec")).default;

  // Download video (720p max for reasonable size, no embedded subs)
  console.log("[dub] downloading video...");
  await ytdlp(sourceUrl, {
    format: "best[height<=720][ext=mp4]/best[height<=720]/best",
    output: videoFile,
    noPlaylist: true,
    noWriteSub: true,         // don't write subtitle files
    noWriteAutoSub: true,     // don't write auto-generated subs
    noEmbedSubs: true,        // don't embed subs in video
  });

  if (!fs.existsSync(videoFile)) {
    throw new Error("Video download failed — file not found");
  }

  // Extract audio from video using ffmpeg
  console.log("[dub] extracting audio...");
  await execAsync(
    `ffmpeg -i "${videoFile}" -q:a 0 -map a -y "${audioFile}"`
  );

  if (!fs.existsSync(audioFile)) {
    throw new Error("Audio extraction failed");
  }

  // Get video duration
  let durationSec = null;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoFile}"`
    );
    durationSec = parseFloat(stdout.trim());
  } catch {}

  // Get video metadata from yt-dlp
  let title = null;
  try {
    const info = await ytdlp(sourceUrl, { dumpSingleJson: true, noPlaylist: true });
    title = info?.title || null;
    durationSec = durationSec || info?.duration || null;
  } catch {}

  // Update project with metadata
  await admin
    .from("dub_projects")
    .update({
      source_duration_sec: durationSec,
      source_title: title,
    })
    .eq("id", projectId);

  await updateDubStatus(projectId, "downloading", 10);

  console.log("[dub] ✅ step 1 done — video:", videoFile, "audio:", audioFile, "duration:", durationSec);
  return { videoFile, audioFile, durationSec };
}

/* ── [DUB STEP 2] Transcribe with Whisper API ─────────────── */
async function dubStep2_Transcribe(projectId, audioFile) {
  await updateDubStatus(projectId, "transcribing", 15);

  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  // Read audio file and send to Whisper
  const audioBuffer = fs.readFileSync(audioFile);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");

  console.log("[dub] transcribing with Whisper...");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const detectedLanguage = result.language || "unknown";
  const segments = result.segments || [];

  console.log("[dub] ✅ step 2 done — language:", detectedLanguage, "segments:", segments.length);

  // Save transcript to project
  await admin
    .from("dub_projects")
    .update({
      source_language: detectedLanguage,
      original_transcript: segments,
    })
    .eq("id", projectId);

  await updateDubStatus(projectId, "transcribing", 25);

  return { detectedLanguage, segments };
}

/* ── [DUB STEP 3] Translate with GPT-4o-mini ──────────────── */
async function dubStep3_Translate(projectId, segments, detectedLanguage, targetLanguage) {
  await updateDubStatus(projectId, "translating", 30);

  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  // Build segments for translation (just text + timestamps)
  const segmentsForTranslation = segments.map((s, i) => ({
    index: i,
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  const prompt = `You are a professional translator. Translate the following transcript from ${detectedLanguage} to ${targetLanguage}.

RULES:
- Keep the EXACT SAME number of segments (${segments.length} segments)
- Each segment maps to a specific time range — maintain that mapping
- Translate naturally and fluently, not word-for-word
- For Buddhist/spiritual content, use proper ${targetLanguage} Buddhist terminology
- Return ONLY a JSON array of objects with: index, start, end, translated_text
- No markdown, no explanation, just the JSON array

Original segments:
${JSON.stringify(segmentsForTranslation, null, 2)}`;

  console.log("[dub] translating with GPT-4o-mini...");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 16000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT translation error (${res.status}): ${errText}`);
  }

  const gptResult = await res.json();
  let translatedText = gptResult.choices?.[0]?.message?.content || "[]";

  // Clean up GPT response — strip markdown fences if present
  translatedText = translatedText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  let translatedSegments;
  try {
    translatedSegments = JSON.parse(translatedText);
  } catch {
    throw new Error("GPT returned invalid JSON for translation");
  }

  // Validate we got the right number of segments
  if (!Array.isArray(translatedSegments) || translatedSegments.length === 0) {
    throw new Error("GPT returned empty translation");
  }

  console.log("[dub] ✅ step 3 done — translated segments:", translatedSegments.length);

  // Save translated transcript
  await admin
    .from("dub_projects")
    .update({ translated_transcript: translatedSegments })
    .eq("id", projectId);

  await updateDubStatus(projectId, "translating", 45);

  return translatedSegments;
}

/* ── [DUB STEP 4] Generate TTS with ElevenLabs v3 ─────────── */
/* Phase 6: FULL-SCRIPT TTS — natural narration like real dubbing*/
/*                                                                */
/* How professional dubbing works:                                */
/*   1. Narrator reads the ENTIRE script as one flowing piece    */
/*   2. Audio engineer adjusts overall speed to fit video length */
/*   3. Result: natural, conversational speech throughout        */
/*                                                                */
/* This approach:                                                 */
/*   - Combine ALL translated text into one script               */
/*   - Add paragraph breaks (newlines) between segments for      */
/*     ElevenLabs to add natural pauses                          */
/*   - Generate in chunks of ~4000 chars (API limit) but         */
/*     chunk at PARAGRAPH boundaries, not mid-sentence           */
/*   - Concatenate chunks seamlessly                             */
/*   - Measure total narration duration vs video duration        */
/*   - Apply ONE global tempo adjustment (max 12%) to match     */
/*   - If narration is shorter than video → pad with silence    */
/*   - Result: smooth, professional-quality dubbing              */
async function dubStep4_GenerateTTS(projectId, translatedSegments, voiceId, workDir, videoDurationSec, targetLanguageCode) {
  await updateDubStatus(projectId, "generating_tts", 50);

  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");

  const finalVoiceId = voiceId || "0ggMuQ1r9f9jqBu50nJn";
  const ttsDir = path.join(workDir, "tts-parts");
  fs.mkdirSync(ttsDir, { recursive: true });

  const MAX_SPEEDUP = 1.35;       // Max 35% global speed-up (Vietnamese can be 30-40% longer than English)
  const MAX_CHARS = 4000;          // ElevenLabs chunk limit
  const langCode = targetLanguageCode || "vi"; // Dynamic language code

  /* ── Build full script with paragraph breaks ───────────────── */
  // Each segment becomes a paragraph. ElevenLabs naturally pauses
  // between paragraphs, creating breath points that sound human.
  const paragraphs = [];
  for (const seg of translatedSegments) {
    const text = (seg.translated_text || seg.text || "").trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length === 0) {
    throw new Error("No translated text to generate TTS");
  }

  // Join with newlines — ElevenLabs interprets these as natural pauses
  const fullScript = paragraphs.join("\n\n");
  console.log("[dub] full script:", paragraphs.length, "paragraphs,", fullScript.length, "chars");

  /* ── Chunk at paragraph boundaries ─────────────────────────── */
  // Split into chunks of ~MAX_CHARS, but only break between paragraphs
  const chunks = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    // If adding this paragraph would exceed limit, flush current chunk
    if (currentChunk.length > 0 && (currentChunk.length + para.length + 2) > MAX_CHARS) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + para;
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  console.log("[dub] split into", chunks.length, "TTS chunks:", chunks.map(c => c.length + " chars").join(", "));

  /* ── Generate TTS for each chunk ───────────────────────────── */
  const chunkFiles = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[dub]   TTS chunk ${i + 1}/${chunks.length}: ${chunk.length} chars`);

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: chunk,
          model_id: "eleven_v3",
          language_code: langCode,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      throw new Error(`ElevenLabs TTS error chunk ${i} (${ttsRes.status}): ${errText}`);
    }

    const chunkFile = path.join(ttsDir, `chunk-${i}.mp3`);
    fs.writeFileSync(chunkFile, Buffer.from(await ttsRes.arrayBuffer()));
    chunkFiles.push(chunkFile);

    const pct = 50 + Math.round(((i + 1) / chunks.length) * 10);
    await updateDubStatus(projectId, "generating_tts", pct);
  }

  /* ── Concatenate chunks into one raw narration ─────────────── */
  const rawNarration = path.join(workDir, "raw-narration.mp3");

  if (chunkFiles.length === 1) {
    fs.copyFileSync(chunkFiles[0], rawNarration);
  } else {
    // Concatenate with ffmpeg — seamless joining
    const listFile = path.join(ttsDir, "concat-list.txt");
    const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(listFile, listContent);

    await execAsync(
      `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${rawNarration}"`
    );
    try { fs.unlinkSync(listFile); } catch {}
  }

  // Cleanup chunk files
  for (const f of chunkFiles) { try { fs.unlinkSync(f); } catch {} }

  /* ── Measure raw narration duration ────────────────────────── */
  let narrationDuration = videoDurationSec || 60;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawNarration}"`
    );
    narrationDuration = parseFloat(stdout.trim()) || narrationDuration;
  } catch {}

  const targetDuration = videoDurationSec || narrationDuration;
  const ratio = narrationDuration / targetDuration;

  console.log("[dub] raw narration:", narrationDuration.toFixed(1), "s vs video:", targetDuration.toFixed(1), "s — ratio:", ratio.toFixed(3));

  /* ── Apply ONE global tempo adjustment ─────────────────────── */
  const narrationFile = path.join(workDir, "vietnamese-narration.wav");

  if (ratio >= 0.95 && ratio <= 1.05) {
    // Within 5% — perfect, no adjustment needed
    console.log("[dub] narration length is close enough — no tempo change ✓");
    await execAsync(`ffmpeg -i "${rawNarration}" -ar 44100 -ac 1 -y "${narrationFile}"`);

  } else if (ratio > 1.0 && ratio <= MAX_SPEEDUP) {
    // Narration is longer than video — gentle speed-up
    console.log(`[dub] speeding up ${Math.round((ratio - 1) * 100)}% to match video length`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${ratio.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else if (ratio > MAX_SPEEDUP) {
    // Narration much longer — cap at MAX_SPEEDUP
    console.log(`[dub] narration too long — capping speedup at ${Math.round((MAX_SPEEDUP - 1) * 100)}%`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${MAX_SPEEDUP.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else if (ratio < 0.95 && ratio >= 0.5) {
    // Narration is shorter than video — slow down slightly for better fill
    const slowdown = Math.max(0.88, ratio); // Don't slow more than 12%
    console.log(`[dub] slowing down ${Math.round((1 - slowdown) * 100)}% to better fill video`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${slowdown.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else {
    // Edge case — just use as-is
    console.log("[dub] edge case ratio — using narration as-is");
    await execAsync(`ffmpeg -i "${rawNarration}" -ar 44100 -ac 1 -y "${narrationFile}"`);
  }

  try { fs.unlinkSync(rawNarration); } catch {}

  /* ── Pad or trim to EXACT video duration + fade out ────────── */
  if (targetDuration > 0) {
    const finalFile = path.join(workDir, "vietnamese-narration-final.wav");
    // afade: 2 second fade-out before the end for graceful ending
    // -t: hard trim to exact video duration (safety net)
    const fadeOutDur = 2.0;
    const fadeOutStart = Math.max(0, targetDuration - fadeOutDur);
    await execAsync(
      `ffmpeg -i "${narrationFile}" -af "afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur},apad" -t ${targetDuration.toFixed(2)} -ar 44100 -ac 1 -y "${finalFile}"`
    );
    fs.renameSync(finalFile, narrationFile);

    // Verify the trim worked
    try {
      const { stdout: durCheck } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${narrationFile}"`
      );
      console.log("[dub] narration after trim+fade:", parseFloat(durCheck).toFixed(2), "s (target:", targetDuration.toFixed(2), "s)");
    } catch {}
  }

  // Cleanup
  try { fs.rmSync(ttsDir, { recursive: true, force: true }); } catch {}

  if (!fs.existsSync(narrationFile)) throw new Error("TTS narration file not created");

  console.log("[dub] ✅ step 4 done — full-script natural narration, duration matched to video");
  await updateDubStatus(projectId, "generating_tts", 65);
  return narrationFile;
}

/* ── [DUB STEP 4b] Re-transcribe narration for synced captions ─ */
/* Runs Whisper on the Vietnamese narration audio to get ACTUAL    */
/* timestamps of what the narrator says. These timestamps are     */
/* then used for captions in Step 6, ensuring perfect sync        */
/* between what viewers HEAR and what they READ.                  */
async function dubStep4b_SyncCaptions(projectId, narrationFile, translatedSegments, targetLanguageCode) {
  await updateDubStatus(projectId, "generating_tts", 67);

  if (!OPENAI_API_KEY) {
    console.log("[dub] no OPENAI_API_KEY — skipping caption re-sync, using original timestamps");
    return translatedSegments;
  }

  const langCode = targetLanguageCode || "vi";
  console.log("[dub] re-transcribing narration with Whisper for synced captions (lang:", langCode, ")...");

  // Read the narration audio
  const audioBuffer = fs.readFileSync(narrationFile);
  const blob = new Blob([audioBuffer], { type: "audio/wav" });

  const fd = new FormData();
  fd.append("file", blob, "narration.wav");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");
  fd.append("language", langCode);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn("[dub] Whisper re-transcription failed:", errText, "— using original timestamps");
    return translatedSegments;
  }

  const result = await res.json();
  const whisperSegs = result.segments || [];

  if (whisperSegs.length === 0) {
    console.log("[dub] Whisper returned 0 segments — using original timestamps");
    return translatedSegments;
  }

  // USE WHISPER'S OWN SEGMENTS DIRECTLY AS CAPTIONS
  // Whisper detected what the narrator actually said + when.
  // These timestamps perfectly match the narration audio.
  // No need to map back to original translated segments.
  const syncedSegments = whisperSegs.map((ws, i) => ({
    translated_text: ws.text?.trim() || "",
    text: ws.text?.trim() || "",
    start: ws.start,
    end: ws.end,
    index: i,
  }));

  console.log("[dub] ✅ step 4b done — using", syncedSegments.length, "Whisper-detected captions (perfectly synced to narration)");
  return syncedSegments;
}



/* ── [DUB STEP 5] Mix audio tracks with ffmpeg ────────────── */
async function dubStep5_MixAudio(projectId, narrationFile, originalAudioFile, keepOriginal, originalVolume, workDir, videoDurationSec) {
  await updateDubStatus(projectId, "assembling", 70);

  const finalAudioFile = path.join(workDir, "final-audio.mp3");

  if (keepOriginal && fs.existsSync(originalAudioFile)) {
    // Mix narration + original audio at reduced volume
    const vol = Math.max(0, Math.min(1, originalVolume || 0.15));
    console.log("[dub] mixing audio — original at", Math.round(vol * 100) + "% volume");

    // Use -t to enforce video duration limit on mixed output
    const durationFlag = videoDurationSec > 0 ? `-t ${videoDurationSec.toFixed(2)}` : "";
    await execAsync(
      `ffmpeg -i "${narrationFile}" -i "${originalAudioFile}" ` +
      `-filter_complex "[1:a]volume=${vol}[quiet];[0:a][quiet]amix=inputs=2:duration=first:dropout_transition=2" ` +
      `${durationFlag} -y "${finalAudioFile}"`
    );
  } else {
    // Just use narration only — also enforce duration
    console.log("[dub] using narration only (no original audio mix)");
    if (videoDurationSec > 0) {
      await execAsync(
        `ffmpeg -i "${narrationFile}" -t ${videoDurationSec.toFixed(2)} -c copy -y "${finalAudioFile}"`
      );
    } else {
      fs.copyFileSync(narrationFile, finalAudioFile);
    }
  }

  if (!fs.existsSync(finalAudioFile)) {
    throw new Error("Audio mixing failed");
  }

  console.log("[dub] ✅ step 5 done — final audio:", finalAudioFile);
  await updateDubStatus(projectId, "assembling", 75);

  return finalAudioFile;
}

/* ── [DUB STEP 6] Burn captions + replace audio ───────────── */
/* FIX: 3 improvements from v1:                                 */
/*   1. Smaller font (FontSize=13 instead of 22)                */
/*   2. Black bar at bottom to cover original English subs      */
/*   3. Vietnamese captions placed on the black bar area        */
async function dubStep6_AssembleVideo(projectId, videoFile, finalAudioFile, translatedSegments, captionStyle, workDir) {
  await updateDubStatus(projectId, "assembling", 80);

  // Generate SRT file from translated segments
  const srtFile = path.join(workDir, "vietnamese.srt");
  let srtContent = "";

  const segs = Array.isArray(translatedSegments) ? translatedSegments : [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const startTime = formatSrtTime(seg.start || 0);
    const endTime = formatSrtTime(seg.end || 0);
    const text = seg.translated_text || seg.text || "";

    srtContent += `${i + 1}\n${startTime} --> ${endTime}\n${text}\n\n`;
  }

  fs.writeFileSync(srtFile, srtContent, "utf-8");
  console.log("[dub] SRT file created with", segs.length, "subtitles");

  // Step 6a: Replace audio track AND strip embedded subtitle streams (-sn)
  // -sn removes soft/embedded subtitles (English CC tracks)
  // This won't remove hardcoded/burned-in subs — the black bar handles those
  const noSubsFile = path.join(workDir, "output-no-subs.mp4");
  console.log("[dub] replacing audio track + stripping embedded subtitle streams...");
  await execAsync(
    `ffmpeg -i "${videoFile}" -i "${finalAudioFile}" ` +
    `-c:v copy -c:a aac -map 0:v -map 1:a -sn -shortest -y "${noSubsFile}"`
  );

  // Step 6b: Add black bar at bottom to cover English subs + burn Vietnamese captions
  const finalOutputFile = path.join(workDir, "final-output.mp4");

  // Escape special characters in SRT path for ffmpeg (Windows paths need escaping)
  const escapedSrtPath = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");

  // Get video dimensions first
  let videoWidth = 1280;
  let videoHeight = 720;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${noSubsFile}"`
    );
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w > 0 && h > 0) { videoWidth = w; videoHeight = h; }
  } catch {}

  // Black bar height — covers bottom ~12% of video (where English subs usually sit)
  const barHeight = Math.round(videoHeight * 0.12);

  // Detect orientation: vertical (Shorts/TikTok) vs landscape
  const isVertical = videoHeight > videoWidth;

  // Caption font size — different for vertical vs landscape
  // ASS/SSA subtitles scale FontSize relative to PlayResY (default 384px).
  // We want REAL pixel sizes, so we scale up: desiredPx * (videoHeight / 384)
  // Premium style: clean, readable, not overwhelming — like Netflix dubs
  let desiredFontPx, marginV, outlineSize;

  if (isVertical) {
    // Vertical video (Shorts, TikTok, Reels)
    desiredFontPx = Math.max(28, Math.round(videoWidth / 36));   // 1080/36=30px
    marginV = Math.round(videoHeight * 0.08);
    outlineSize = 2;
  } else {
    // Landscape video (standard YouTube, TED talks, etc.)
    // Netflix-style: ~26px on 1080p, ~20px on 720p
    desiredFontPx = Math.max(18, Math.round(videoHeight / 42));  // 720→17→18px, 1080→26px
    marginV = Math.max(10, Math.round(barHeight * 0.20));
    outlineSize = 1.5;
  }

  // Scale for ASS engine: FontSize is relative to 384px, not video height
  const assScaleFactor = videoHeight / 384;
  const fontSize = Math.round(desiredFontPx * assScaleFactor);
  const scaledMarginV = Math.round(marginV * assScaleFactor);
  const scaledOutline = Math.max(1, Math.round(outlineSize * assScaleFactor));
  const scaledMarginLR = Math.round(50 * assScaleFactor);  // wider margins for centered look

  console.log("[dub] burning subtitles —", isVertical ? "VERTICAL" : "LANDSCAPE",
    videoWidth, "x", videoHeight, "bar:", barHeight,
    "px, desiredPx:", desiredFontPx, "assFontSize:", fontSize, "marginV:", scaledMarginV);

  // Build subtitle style — Premium "Netflix dub" look:
  // - Clean white text with soft dark outline + subtle shadow
  // - Semi-transparent dark background box for readability
  // - BorderStyle=3 (opaque box) with translucent BackColour
  const backColour = "&H80000000"; // 50% transparent black background box

  const subtitleStyle = [
    `FontSize=${fontSize}`,
    `FontName=Arial`,
    `Bold=0`,
    `PrimaryColour=&H00FFFFFF`,
    `OutlineColour=&H00000000`,
    `BackColour=${backColour}`,
    `Outline=${scaledOutline}`,
    `Shadow=${Math.max(1, Math.round(1 * assScaleFactor))}`,
    `MarginV=${scaledMarginV}`,
    `Alignment=2`,
    `BorderStyle=4`,
    `MarginL=${scaledMarginLR}`,
    `MarginR=${scaledMarginLR}`,
    `Spacing=${Math.max(0, Math.round(0.5 * assScaleFactor))}`,
  ].join(",");

  // Combined filter:
  // 1. drawbox: black bar at bottom to cover English subtitles
  // 2. subtitles: Vietnamese captions with adaptive styling
  await execAsync(
    `ffmpeg -i "${noSubsFile}" ` +
    `-vf "drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black:t=fill,` +
    `subtitles='${escapedSrtPath}':force_style='${subtitleStyle}'" ` +
    `-c:a copy -y "${finalOutputFile}"`
  );

  if (!fs.existsSync(finalOutputFile)) {
    throw new Error("Video assembly failed");
  }

  // Cleanup intermediate file
  try { fs.unlinkSync(noSubsFile); } catch {}

  console.log("[dub] ✅ step 6 done — final video:", finalOutputFile);
  await updateDubStatus(projectId, "assembling", 90);

  return { finalOutputFile, srtFile };
}

/* ── SRT timestamp formatter ───────────────────────────────── */
function formatSrtTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return (
    String(hrs).padStart(2, "0") + ":" +
    String(mins).padStart(2, "0") + ":" +
    String(secs).padStart(2, "0") + "," +
    String(ms).padStart(3, "0")
  );
}

/* ── [DUB STEP 7] Upload to Supabase Storage ──────────────── */
async function dubStep7_Upload(projectId, userId, finalOutputFile, srtFile) {
  await updateDubStatus(projectId, "uploading", 92);

  // Upload video
  const videoBuffer = fs.readFileSync(finalOutputFile);
  const videoPath = `${userId}/${projectId}/dubbed.mp4`;

  const { error: videoUpErr } = await admin.storage
    .from(DUB_BUCKET)
    .upload(videoPath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
    });

  if (videoUpErr) throw new Error(`Video upload failed: ${videoUpErr.message}`);

  const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/${DUB_BUCKET}/${videoPath}`;

  // Upload SRT
  let srtUrl = null;
  if (srtFile && fs.existsSync(srtFile)) {
    const srtBuffer = fs.readFileSync(srtFile);
    const srtPath = `${userId}/${projectId}/vietnamese.srt`;

    const { error: srtUpErr } = await admin.storage
      .from(DUB_BUCKET)
      .upload(srtPath, srtBuffer, {
        contentType: "text/plain",
        upsert: true,
        cacheControl: "3600",
      });

    if (!srtUpErr) {
      srtUrl = `${SUPABASE_URL}/storage/v1/object/public/${DUB_BUCKET}/${srtPath}`;
    }
  }

  // Update project as done
  await updateDubStatus(projectId, "done", 100, {
    video_url: videoUrl,
    srt_url: srtUrl,
    error_message: null,
  });

  console.log("[dub] ✅ step 7 done — video_url:", videoUrl);
  return { videoUrl, srtUrl };
}

/* ── Main dub orchestrator ─────────────────────────────────── */
async function runDub(projectId, sourceUrl, targetLanguage, voiceId, captionStyle, keepOriginal, originalVolume, targetLanguageCode) {
  console.log("[dub] ═══════════════════════════════════════");
  console.log("[dub] Starting dub pipeline for project:", projectId);
  console.log("[dub] source:", sourceUrl);
  console.log("[dub] target:", targetLanguage, "(code:", targetLanguageCode, ") voice:", voiceId);
  console.log("[dub] ═══════════════════════════════════════");

  // Create temp work directory
  const workDir = path.join(os.tmpdir(), "dub-" + projectId);
  fs.mkdirSync(workDir, { recursive: true });

  // Get the project's user_id for storage paths
  const { data: project } = await admin
    .from("dub_projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  const userId = project?.user_id || "unknown";

  try {
    // [1] Download video + extract audio
    const { videoFile, audioFile, durationSec } =
      await dubStep1_Download(projectId, sourceUrl, workDir);

    // [2] Transcribe with Whisper
    const { detectedLanguage, segments } =
      await dubStep2_Transcribe(projectId, audioFile);

    // [3] Translate with GPT
    const translatedSegments =
      await dubStep3_Translate(projectId, segments, detectedLanguage, targetLanguage);

    // [4] Generate TTS narration (full-script, language-aware)
    const narrationFile =
      await dubStep4_GenerateTTS(projectId, translatedSegments, voiceId, workDir, durationSec, targetLanguageCode);

    // [4b] Re-transcribe narration to get synced caption timestamps
    const syncedSegments =
      await dubStep4b_SyncCaptions(projectId, narrationFile, translatedSegments, targetLanguageCode);

    // [5] Mix audio (narration + original at low volume)
    const finalAudioFile =
      await dubStep5_MixAudio(projectId, narrationFile, audioFile, keepOriginal, originalVolume, workDir, durationSec);

    // [6] Burn captions + replace audio (using SYNCED timestamps)
    const { finalOutputFile, srtFile } =
      await dubStep6_AssembleVideo(projectId, videoFile, finalAudioFile, syncedSegments, captionStyle, workDir);

    // [7] Upload to Supabase
    const { videoUrl, srtUrl } =
      await dubStep7_Upload(projectId, userId, finalOutputFile, srtFile);

    console.log("[dub] ✅ PIPELINE COMPLETE");
    return { videoUrl, srtUrl };
  } finally {
    // Cleanup work directory
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      console.log("[dub] cleaned up workDir:", workDir);
    } catch {}
  }
}


/* ============================================================
   Routes
============================================================ */
app.get("/", (_req, res) => res.status(200).send("OK"));

/* ── POST /render — existing video render pipeline ─────────── */
app.post("/render", async (req, res) => {
  const expected = String(process.env.RENDER_WEBHOOK_SECRET || "").trim();
  const receivedHeader = String(req.header("x-webhook-secret") || "").trim();
  const receivedBody = String(req.body?.secret || "").trim();

  if (expected && receivedHeader !== expected && receivedBody !== expected) {
    return res.status(401).json({ error: "Invalid secret" });
  }

  const projectId = req.body?.project_id;
  const attempt = req.body?.attempt;
  if (!projectId) return jsonError(res, 400, "Missing project_id");

  res.status(202).json({ ok: true, accepted: true });

  setImmediate(async () => {
    try {
      await runRender(projectId, attempt);
    } catch (e) {
      const msg = String(e?.message || e);
      console.error("[render] ❌ failed:", msg);
      const doneIso = new Date().toISOString();

      try {
        await admin
          .from("projects")
          .update({ status: "error", error_message: msg, updated_at: doneIso, render_completed_at: doneIso })
          .eq("id", projectId);
      } catch {}

      try {
        const { data: proj } = await admin
          .from("projects")
          .select("render_attempt,user_id")
          .eq("id", projectId)
          .single();
        const a = resolveAttempt(attempt, proj?.render_attempt);
        await admin.from("project_renders").upsert(
          {
            project_id: projectId,
            user_id: proj?.user_id ?? null,
            attempt: a,
            status: "error",
            error_message: msg,
            completed_at: doneIso,
            render_completed_at: doneIso,
            updated_at: doneIso,
          },
          { onConflict: "project_id,attempt" }
        );
      } catch {}
    }
  });
});

/* ── POST /dub — "Dub Any Video" pipeline ─────────────────── */
app.post("/dub", async (req, res) => {
  const {
    project_id,
    source_url,
    target_language,
    target_language_code,
    voice_id,
    caption_style,
    keep_original_audio,
    original_audio_volume,
  } = req.body || {};

  if (!project_id) return jsonError(res, 400, "Missing project_id");
  if (!source_url) return jsonError(res, 400, "Missing source_url");

  console.log("[dub] received request — project:", project_id, "lang:", target_language, "code:", target_language_code);

  // Respond immediately (pipeline runs in background)
  res.status(202).json({ ok: true, accepted: true, project_id });

  // Run the pipeline in the background
  setImmediate(async () => {
    try {
      await runDub(
        project_id,
        source_url,
        target_language || "Vietnamese",
        voice_id || null,
        caption_style || "block",
        keep_original_audio !== false,  // default true
        original_audio_volume ?? 0.15,
        target_language_code || "vi"
      );
    } catch (e) {
      const msg = String(e?.message || e);
      console.error("[dub] ❌ PIPELINE FAILED:", msg);

      try {
        await admin
          .from("dub_projects")
          .update({
            status: "error",
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project_id);
      } catch {}
    }
  });
});

// ============================================================
// 🆕 SHORTS PIPELINE v2 — "AI Shorts Generator"
// ============================================================
// ADD THIS BLOCK to render-webhook.mjs BEFORE the app.listen() call.
//
// v2 FIXES:
//   ✅ Duration enforcement — hard clamp clips to min/max seconds
//   ✅ Last word cutoff fix — adds 0.5s audio buffer after end_time
//   ✅ Cinematic captions — Motiversity-style: UPPERCASE, white,
//      centered lower-middle, shadow outline, NO background box
// ============================================================

const SHORTS_BUCKET = (process.env.SHORTS_BUCKET || "shorts").trim();

async function updateShortsStatus(projectId, status, progressPct, extra = {}) {
  await admin
    .from("shorts_projects")
    .update({
      status,
      progress_pct: progressPct,
      progress_stage: status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", projectId);
  console.log(`[shorts] status → ${status} (${progressPct}%)`);
}

/* ── [STEP 1] Download video + extract audio ───────────────── */
async function shortsStep1_Download(projectId, sourceUrl, workDir) {
  await updateShortsStatus(projectId, "downloading", 5);
  const videoFile = path.join(workDir, "source-video.mp4");
  const audioFile = path.join(workDir, "source-audio.mp3");
  const ytdlp = (await import("youtube-dl-exec")).default;

  console.log("[shorts] downloading video...");
  await ytdlp(sourceUrl, {
    format: "best[height<=720][ext=mp4]/best[height<=720]/best",
    output: videoFile,
    noPlaylist: true,
    noWriteSub: true,
    noWriteAutoSub: true,
    noEmbedSubs: true,
  });
  if (!fs.existsSync(videoFile)) throw new Error("Video download failed");

  console.log("[shorts] extracting audio...");
  await execAsync(`ffmpeg -i "${videoFile}" -q:a 0 -map a -y "${audioFile}"`);
  if (!fs.existsSync(audioFile)) throw new Error("Audio extraction failed");

  let durationSec = null, videoWidth = 1280, videoHeight = 720;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoFile}"`);
    durationSec = parseFloat(stdout.trim());
  } catch {}
  try {
    const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoFile}"`);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w > 0 && h > 0) { videoWidth = w; videoHeight = h; }
  } catch {}

  let title = null, channel = null, thumbnailUrl = null;
  try {
    const info = await ytdlp(sourceUrl, { dumpSingleJson: true, noPlaylist: true });
    title = info?.title || null;
    channel = info?.uploader || info?.channel || null;
    thumbnailUrl = info?.thumbnail || null;
    durationSec = durationSec || info?.duration || null;
  } catch {}

  await admin.from("shorts_projects").update({
    source_title: title, source_channel: channel,
    source_thumbnail: thumbnailUrl, source_duration_sec: durationSec,
  }).eq("id", projectId);

  await updateShortsStatus(projectId, "downloading", 10);
  console.log("[shorts] ✅ step 1 — video:", videoWidth, "x", videoHeight, "dur:", durationSec);
  return { videoFile, audioFile, durationSec, videoWidth, videoHeight };
}

/* ── [STEP 2] Transcribe with Whisper ──────────────────────── */
async function shortsStep2_Transcribe(projectId, audioFile) {
  await updateShortsStatus(projectId, "transcribing", 15);
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const audioBuffer = fs.readFileSync(audioFile);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper error (${res.status}): ${await res.text()}`);

  const result = await res.json();
  console.log("[shorts] ✅ step 2 — segments:", result.segments?.length, "words:", result.words?.length);
  await updateShortsStatus(projectId, "transcribing", 25);
  return { segments: result.segments || [], words: result.words || [], fullText: result.text || "" };
}

/* ── [STEP 3] AI finds viral moments + HARD duration enforcement ── */
async function shortsStep3_AnalyzeForClips(projectId, segments, durationSec, options) {
  await updateShortsStatus(projectId, "analyzing", 30);
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const { maxClips, clipMinSeconds, clipMaxSeconds } = options;

  const timestampedTranscript = segments.map((s) => {
    const m = Math.floor(s.start / 60);
    const sec = Math.floor(s.start % 60);
    return `[${m}:${String(sec).padStart(2, "0")}] ${s.text}`;
  }).join("\n");

  const prompt = `You are an expert viral content creator. Find the ${maxClips} most viral moments from this transcript for YouTube Shorts / TikTok / Reels.

VIDEO DURATION: ${Math.round(durationSec || 0)} seconds

TRANSCRIPT:
${timestampedTranscript}

STRICT DURATION RULES (NON-NEGOTIABLE):
1. Each clip MUST be between ${clipMinSeconds} and ${clipMaxSeconds} seconds.
2. (end_time - start_time) MUST be >= ${clipMinSeconds} AND <= ${clipMaxSeconds}.
3. If a moment is too short, EXTEND end_time to include more context.
4. If too long, TRIM to best ${clipMaxSeconds}s portion.
5. start_time / end_time are SECONDS (numbers).
6. No overlapping clips.
7. Clips must END at a natural sentence boundary — NEVER mid-word or mid-sentence.
8. CRITICAL: Set end_time 2 seconds AFTER the last word finishes speaking. This prevents audio cutoff.
9. start_time should begin 1-2 seconds BEFORE the speaker starts (breathing room).

CONTENT RULES:
- Strong hook in first 3 seconds
- Emotional peaks, surprising statements, quotable moments
- Must work as standalone content — each clip must feel COMPLETE, not a fragment

Return ONLY a JSON array:
[{"index":1,"title":"...","description":"...","start_time":<sec>,"end_time":<sec>,"hook_score":<0-100>,"reason":"..."}]

VERIFY every clip: (end_time - start_time) >= ${clipMinSeconds} AND <= ${clipMaxSeconds}. No markdown.`;

  console.log("[shorts] analyzing — duration:", clipMinSeconds, "-", clipMaxSeconds, "s");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`GPT error (${res.status}): ${await res.text()}`);

  const gptResult = await res.json();
  let text = (gptResult.choices?.[0]?.message?.content || "[]").replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  let clips;
  try { clips = JSON.parse(text); } catch { throw new Error("GPT returned invalid JSON"); }
  if (!Array.isArray(clips) || clips.length === 0) throw new Error("GPT returned no clips");

  // ═══════════════════════════════════════════════════════════
  // HARD DURATION ENFORCEMENT — fixes 10s and 2:07 clips
  // ═══════════════════════════════════════════════════════════
  const videoDur = durationSec || 9999;

  clips = clips.map((clip, i) => {
    let start = Number(clip.start_time) || 0;
    let end = Number(clip.end_time) || 0;
    let dur = end - start;

    // Too short → extend end, then pull start back if needed
    if (dur < clipMinSeconds) {
      const needed = clipMinSeconds - dur;
      end = Math.min(videoDur, end + needed);
      dur = end - start;
      if (dur < clipMinSeconds) {
        start = Math.max(0, start - (clipMinSeconds - dur));
        dur = end - start;
      }
      console.log(`[shorts]   #${i+1}: SHORT → extended to ${dur.toFixed(1)}s`);
    }

    // Too long → trim
    if (dur > clipMaxSeconds) {
      end = start + clipMaxSeconds;
      dur = clipMaxSeconds;
      console.log(`[shorts]   #${i+1}: LONG → trimmed to ${dur.toFixed(1)}s`);
    }

    start = Math.max(0, start);
    end = Math.min(videoDur, end);
    dur = end - start;

    return {
      ...clip, index: i + 1,
      start_time: Math.round(start * 100) / 100,
      end_time: Math.round(end * 100) / 100,
      duration: Math.round(dur * 100) / 100,
      hook_score: clamp(Number(clip.hook_score) || 50, 0, 100),
    };
  });

  clips.sort((a, b) => b.hook_score - a.hook_score);
  clips = clips.slice(0, maxClips);

  console.log("[shorts] ✅ step 3 —", clips.length, "clips (all enforced to", clipMinSeconds, "-", clipMaxSeconds, "s)");
  await updateShortsStatus(projectId, "analyzing", 40);
  return clips;
}

/* ── [STEP 4+5] Extract clips, crop 9:16, burn CINEMATIC captions ── */
async function shortsStep4_ExtractAndProcess(projectId, videoFile, clips, segments, words, options, workDir) {
  await updateShortsStatus(projectId, "clipping", 45);

  const { captionStyle, cropMode, captionFontScale } = options;
  const clipsDir = path.join(workDir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  let srcWidth = 1280, srcHeight = 720;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoFile}"`);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w > 0 && h > 0) { srcWidth = w; srcHeight = h; }
  } catch {}

  const outWidth = 1080, outHeight = 1920;
  const cropW = Math.min(srcWidth, Math.round(srcHeight * (9 / 16)));
  const cropH = srcHeight;
  const cropX = Math.round((srcWidth - cropW) / 2);

  console.log("[shorts] crop:", srcWidth, "x", srcHeight, "→", cropW, "x", cropH);

  // ═══════════════════════════════════════════════════════════
  // CINEMATIC CAPTION STYLING — Motiversity look
  //
  // The YouTube reference shows:
  //   "I THINK IT KEEPS A LOT OF US UP AT NIGHT"
  //   - ALL CAPS white text
  //   - Clean outline (no background box)
  //   - Lower-center positioning
  //   - Elegant shadow for depth
  //   - BorderStyle=1 (outline only)
  // ═══════════════════════════════════════════════════════════
  const fontScale = clamp(captionFontScale || 0.5, 0.3, 1.0);

  let baseFontSize, marginV, outlineSize, shadowSize;
  switch (captionStyle) {
    case "centered":
      baseFontSize = 52; marginV = Math.round(outHeight * 0.30);
      outlineSize = 3; shadowSize = 2; break;
    case "karaoke":
      baseFontSize = 44; marginV = Math.round(outHeight * 0.15);
      outlineSize = 2; shadowSize = 1; break;
    case "block":
      baseFontSize = 40; marginV = Math.round(outHeight * 0.06);
      outlineSize = 2; shadowSize = 1; break;
    default:
      baseFontSize = 44; marginV = Math.round(outHeight * 0.15);
      outlineSize = 2; shadowSize = 1;
  }

  const finalFontSize = clamp(Math.round(baseFontSize * fontScale), 18, 60);

  // Scale for ASS engine: FontSize is relative to PlayResY (384px), not actual video height
  const shortsAssScale = outHeight / 384;
  const scaledShortsFontSize = Math.round(finalFontSize * shortsAssScale);
  const scaledShortsMarginV = Math.round(marginV * shortsAssScale);
  const scaledShortsOutline = Math.max(1, Math.round(outlineSize * shortsAssScale));
  const scaledShortsShadow = Math.max(1, Math.round(shadowSize * shortsAssScale));
  const scaledShortsMarginLR = Math.round(60 * shortsAssScale);

  console.log("[shorts] captions:", captionStyle, "desiredPx:", finalFontSize, "assFontSize:", scaledShortsFontSize, "marginV:", scaledShortsMarginV);

  // ═══════════════════════════════════════════════════════════
  // SMART AUDIO BUFFER v3 — Two-layer approach:
  //   Layer 1: Use Whisper SEGMENTS to find sentence boundaries
  //            (segments are aligned to natural speech boundaries)
  //   Layer 2: Use Whisper WORDS to find the precise end timestamp
  //            of the last word in that segment
  //
  // This avoids the false-boundary problem where individual words
  // like "the" or "But" were detected as sentence endings.
  // ═══════════════════════════════════════════════════════════
  const POST_SENTENCE_PAD = 2.5;  // 2.5s silence after last sentence ends
  const FADE_OUT_DURATION = 1.0;  // 1s gentle audio fade-out at clip end
  const PRE_START_PAD = 1.0;      // 1s before clip start for breathing room

  const processedClips = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipFile = path.join(clipsDir, `clip-${clip.index}.mp4`);
    const srtFile = path.join(clipsDir, `clip-${clip.index}.srt`);

    const pctBase = 45 + Math.round((i / clips.length) * 40);
    await updateShortsStatus(projectId, "clipping", pctBase);

    // ── Smart end-time v3: segment-based sentence boundary + word-level precision ──
    //
    // Step 1: Find the last Whisper SEGMENT that overlaps or starts near clip.end_time
    //         Segments are natural sentence boundaries (much more reliable than word gaps)
    // Step 2: Use word timestamps to find the precise end of that segment's last word
    // Step 3: Add generous padding for silence after speech
    //
    // This ensures we always capture the complete final sentence.

    let smartEndTime = clip.end_time + 3.0; // Minimum: 3s past GPT's end_time

    // --- Layer 1: Find the segment that contains or follows clip.end_time ---
    const overlappingSegs = segments.filter(
      (seg) => seg.start < (clip.end_time + 6) && seg.end > (clip.end_time - 3)
    );

    let targetSegEnd = clip.end_time;
    if (overlappingSegs.length > 0) {
      // Find the segment that the speech is "in the middle of" at clip.end_time
      // This is the one we need to let finish
      const activeAtEnd = overlappingSegs.find(
        (seg) => seg.start <= clip.end_time && seg.end > clip.end_time
      );

      if (activeAtEnd) {
        // Speech is ongoing at clip.end_time — extend to end of this segment
        targetSegEnd = activeAtEnd.end;
        console.log(`[shorts]   #${clip.index}: active segment ends@${activeAtEnd.end.toFixed(1)}s: "${(activeAtEnd.text || "").trim().slice(-40)}"`);
      } else {
        // clip.end_time falls in a gap between segments — check if the next segment starts very soon
        const nextSeg = overlappingSegs.find((seg) => seg.start > clip.end_time && seg.start < clip.end_time + 2);
        if (nextSeg) {
          // A segment starts within 2s — might be the continuation, include it
          targetSegEnd = nextSeg.end;
          console.log(`[shorts]   #${clip.index}: next segment (${nextSeg.start.toFixed(1)}→${nextSeg.end.toFixed(1)}s): "${(nextSeg.text || "").trim().slice(-40)}"`);
        }
      }
    }

    // --- Layer 2: Use word timestamps for precise end of the target segment ---
    if (Array.isArray(words) && words.length > 0) {
      // Find the last word that falls within the target segment
      const segWords = words.filter(
        (w) => w.start >= (clip.start_time - 1) && w.start < (targetSegEnd + 1)
      );
      if (segWords.length > 0) {
        const lastWord = segWords[segWords.length - 1];
        const preciseEnd = lastWord.end || (lastWord.start + 0.5);
        // Use the later of: segment end or last word end (Whisper sometimes disagrees)
        targetSegEnd = Math.max(targetSegEnd, preciseEnd);
        console.log(`[shorts]   #${clip.index}: lastWord="${(lastWord.word || "").trim()}" preciseEnd=${preciseEnd.toFixed(2)}s`);
      }
    }

    // --- Final smartEndTime: target segment end + generous padding ---
    smartEndTime = Math.max(smartEndTime, targetSegEnd + POST_SENTENCE_PAD);

    // --- Hard cap: Don't let the total clip (including padding) exceed max duration + tolerance ---
    const MAX_TOTAL_DURATION = (clip.duration || 60) + 8; // clip.duration from GPT + 8s max extension
    const ffmpegStartRaw = Math.max(0, clip.start_time - PRE_START_PAD);
    if ((smartEndTime - ffmpegStartRaw) > MAX_TOTAL_DURATION) {
      smartEndTime = ffmpegStartRaw + MAX_TOTAL_DURATION;
      console.log(`[shorts]   #${clip.index}: CAPPED total duration to ${MAX_TOTAL_DURATION.toFixed(0)}s`);
    }

    console.log(`[shorts]   #${clip.index}: GPT=${clip.end_time}s → segEnd=${targetSegEnd.toFixed(1)}s → smartEnd=${smartEndTime.toFixed(1)}s (+${POST_SENTENCE_PAD}s pad)`);

    // Calculate actual duration for FFmpeg
    const ffmpegStart = ffmpegStartRaw;
    const ffmpegDuration = smartEndTime - ffmpegStart;

    console.log(`[shorts] clip #${clip.index}: ${ffmpegStart.toFixed(2)}→${smartEndTime.toFixed(2)}s (${ffmpegDuration.toFixed(1)}s total)`);

    // Generate SRT with UPPERCASE text
    if (captionStyle !== "none") {
      let srtContent = "";
      let idx = 1;

      // Include segments that overlap the full smart range
      const clipSegs = segments.filter((seg) => seg.end > ffmpegStart && seg.start < smartEndTime);

      for (const seg of clipSegs) {
        const relStart = Math.max(0, seg.start - ffmpegStart);
        const relEnd = Math.min(ffmpegDuration, seg.end - ffmpegStart);
        const rawText = (seg.text || "").trim();

        if (rawText && relEnd > relStart) {
          srtContent += `${idx}\n${formatSrtTime(relStart)} --> ${formatSrtTime(relEnd)}\n${rawText.toUpperCase()}\n\n`;
          idx++;
        }
      }

      if (srtContent) fs.writeFileSync(srtFile, srtContent, "utf-8");
    }

    // Build filter chain
    // Step 1: Crop to 9:16 and scale to 1080x1920
    // Step 2: Draw black bar at bottom to COVER original hardcoded captions
    // Step 3: Burn our styled captions on top

    // Black bar covers bottom 12% of video (where original subs usually sit)
    const barHeight = Math.round(outHeight * 0.12); // ~230px on 1920h

    let filter = `crop=${cropW}:${cropH}:${cropX}:0,scale=${outWidth}:${outHeight}:flags=lanczos`;
    filter += `,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black:t=fill`;

    if (captionStyle !== "none" && fs.existsSync(srtFile)) {
      // Windows FFmpeg subtitle path fix:
      // The subtitles filter on Windows requires very specific path escaping.
      let srtPath;

      if (process.platform === "win32") {
        // Convert to forward slashes: C:\Users\... → C:/Users/...
        srtPath = srtFile.replace(/\\/g, "/");
        // Escape ALL colons: C:/Users → C\\:/Users
        srtPath = srtPath.replace(/:/g, "\\\\:");
      } else {
        srtPath = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");
      }

      console.log(`[shorts]   #${clip.index}: SRT path: ${srtPath}`);
      console.log(`[shorts]   #${clip.index}: SRT exists: ${fs.existsSync(srtFile)}, size: ${fs.statSync(srtFile).size} bytes`);

      // Motiversity-style: outline only, NO background box
      const style = [
        `FontSize=${scaledShortsFontSize}`,
        `FontName=Arial`,
        `Bold=1`,
        `PrimaryColour=&H00FFFFFF`,
        `OutlineColour=&H00000000`,
        `BackColour=&H00000000`,
        `Outline=${scaledShortsOutline}`,
        `Shadow=${scaledShortsShadow}`,
        `MarginV=${scaledShortsMarginV}`,
        `MarginL=${scaledShortsMarginLR}`,
        `MarginR=${scaledShortsMarginLR}`,
        `Alignment=2`,
        `BorderStyle=1`,
        `Spacing=1`,
      ].join(",");

      filter += `,subtitles='${srtPath}':force_style='${style}'`;
    } else {
      console.log(`[shorts]   #${clip.index}: ⚠ NO SRT FILE — captionStyle=${captionStyle}, srtExists=${fs.existsSync(srtFile)}`);
    }

    try {
      // Audio fade-out for graceful ending (last FADE_OUT_DURATION seconds)
      const fadeStart = Math.max(0, ffmpegDuration - FADE_OUT_DURATION);
      const ffmpegCmd = `ffmpeg -ss ${ffmpegStart.toFixed(2)} -i "${videoFile}" -t ${ffmpegDuration.toFixed(2)} ` +
        `-vf "${filter}" ` +
        `-af "afade=t=out:st=${fadeStart.toFixed(2)}:d=${FADE_OUT_DURATION}" ` +
        `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ` +
        `-movflags +faststart -y "${clipFile}"`;

      console.log(`[shorts]   #${clip.index}: FFmpeg filter: ${filter.slice(0, 200)}...`);

      await execAsync(ffmpegCmd);
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e);
      console.warn(`[shorts] ⚠ clip #${clip.index} FFmpeg error:`, errMsg.slice(0, 500));

      // If subtitle filter failed, retry WITHOUT subtitles
      if (errMsg.includes("subtitles") || errMsg.includes("Subtitle") || errMsg.includes("srt")) {
        console.log(`[shorts]   #${clip.index}: retrying WITHOUT subtitles...`);
        try {
          const fallbackFilter = `crop=${cropW}:${cropH}:${cropX}:0,scale=${outWidth}:${outHeight}:flags=lanczos` +
            `,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black:t=fill`;
          const fadeStart2 = Math.max(0, ffmpegDuration - FADE_OUT_DURATION);
          await execAsync(
            `ffmpeg -ss ${ffmpegStart.toFixed(2)} -i "${videoFile}" -t ${ffmpegDuration.toFixed(2)} ` +
            `-vf "${fallbackFilter}" ` +
            `-af "afade=t=out:st=${fadeStart2.toFixed(2)}:d=${FADE_OUT_DURATION}" ` +
            `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ` +
            `-movflags +faststart -y "${clipFile}"`
          );
          console.log(`[shorts]   #${clip.index}: ✅ fallback (no subs) succeeded`);
        } catch (e2) {
          console.warn(`[shorts]   #${clip.index}: fallback also failed:`, e2?.message);
          continue;
        }
      } else {
        continue;
      }
    }

    if (!fs.existsSync(clipFile)) continue;

    let actualDuration = clip.duration;
    try {
      const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipFile}"`);
      actualDuration = parseFloat(stdout.trim()) || clip.duration;
    } catch {}

    console.log(`[shorts] ✅ clip #${clip.index} → ${actualDuration.toFixed(1)}s`);
    processedClips.push({ ...clip, clipFile, actual_duration: actualDuration });
    try { if (fs.existsSync(srtFile)) fs.unlinkSync(srtFile); } catch {}
  }

  await updateShortsStatus(projectId, "clipping", 85);
  return processedClips;
}

/* ── [STEP 6] Thumbnails ───────────────────────────────────── */
async function shortsStep6_Thumbnails(projectId, processedClips, gen) {
  if (!gen) return processedClips;
  await updateShortsStatus(projectId, "thumbnails", 87);

  for (const clip of processedClips) {
    if (!clip.clipFile || !fs.existsSync(clip.clipFile)) continue;
    const thumbFile = clip.clipFile.replace(".mp4", "-thumb.jpg");
    try {
      await execAsync(`ffmpeg -ss ${Math.min(1, clip.actual_duration * 0.1)} -i "${clip.clipFile}" -vframes 1 -q:v 3 -y "${thumbFile}"`);
      if (fs.existsSync(thumbFile)) clip.thumbFile = thumbFile;
    } catch {}
  }

  await updateShortsStatus(projectId, "thumbnails", 90);
  return processedClips;
}

/* ── [STEP 7] Upload to Supabase ───────────────────────────── */
async function shortsStep7_Upload(projectId, userId, processedClips) {
  await updateShortsStatus(projectId, "uploading", 92);
  const uploadedClips = [];

  for (let i = 0; i < processedClips.length; i++) {
    const clip = processedClips[i];
    if (!clip.clipFile || !fs.existsSync(clip.clipFile)) continue;

    const videoPath = `${userId}/${projectId}/clip-${clip.index}.mp4`;
    const { error: upErr } = await admin.storage.from(SHORTS_BUCKET)
      .upload(videoPath, fs.readFileSync(clip.clipFile), { contentType: "video/mp4", upsert: true, cacheControl: "3600" });
    if (upErr) { console.warn(`[shorts] upload fail #${clip.index}:`, upErr.message); continue; }

    const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/${SHORTS_BUCKET}/${videoPath}`;

    let thumbnailUrl = null;
    if (clip.thumbFile && fs.existsSync(clip.thumbFile)) {
      const thumbPath = `${userId}/${projectId}/clip-${clip.index}-thumb.jpg`;
      const { error: thumbErr } = await admin.storage.from(SHORTS_BUCKET)
        .upload(thumbPath, fs.readFileSync(clip.thumbFile), { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
      if (!thumbErr) thumbnailUrl = `${SUPABASE_URL}/storage/v1/object/public/${SHORTS_BUCKET}/${thumbPath}`;
    }

    uploadedClips.push({
      id: `${projectId}-clip-${clip.index}`, index: clip.index,
      title: clip.title, description: clip.description,
      start_time: clip.start_time, end_time: clip.end_time,
      duration: clip.actual_duration || clip.duration,
      hook_score: clip.hook_score, reason: clip.reason,
      video_url: videoUrl, thumbnail_url: thumbnailUrl, status: "done",
    });
    await updateShortsStatus(projectId, "uploading", 92 + Math.round(((i + 1) / processedClips.length) * 6));
  }

  await admin.from("shorts_projects").update({
    clips: uploadedClips, status: "done", progress_pct: 100,
    progress_stage: "done", error_message: null, updated_at: new Date().toISOString(),
  }).eq("id", projectId);

  console.log("[shorts] ✅ step 7 — uploaded", uploadedClips.length, "clips");
  return uploadedClips;
}

/* ── Orchestrator ──────────────────────────────────────────── */
async function runShorts(projectId, sourceUrl, options) {
  console.log("[shorts] ═══════════════════════════════════════");
  console.log("[shorts] project:", projectId, "clips:", options.maxClips, "dur:", options.clipMinSeconds, "-", options.clipMaxSeconds, "s");
  console.log("[shorts] captions:", options.captionStyle, "fontScale:", options.captionFontScale);

  const workDir = path.join(os.tmpdir(), "shorts-" + projectId);
  fs.mkdirSync(workDir, { recursive: true });

  const { data: proj } = await admin.from("shorts_projects").select("user_id").eq("id", projectId).single();
  const userId = proj?.user_id || "unknown";

  try {
    const { videoFile, audioFile, durationSec } = await shortsStep1_Download(projectId, sourceUrl, workDir);
    const { segments, words } = await shortsStep2_Transcribe(projectId, audioFile);
    const clips = await shortsStep3_AnalyzeForClips(projectId, segments, durationSec, {
      maxClips: options.maxClips || 5, clipMinSeconds: options.clipMinSeconds || 30, clipMaxSeconds: options.clipMaxSeconds || 60,
    });
    const processed = await shortsStep4_ExtractAndProcess(projectId, videoFile, clips, segments, words, {
      captionStyle: options.captionStyle || "karaoke", cropMode: options.cropMode || "center", captionFontScale: options.captionFontScale || 0.5,
    }, workDir);
    const thumbed = await shortsStep6_Thumbnails(projectId, processed, options.generateThumbnails !== false);
    const uploaded = await shortsStep7_Upload(projectId, userId, thumbed);

    console.log("[shorts] ✅ COMPLETE —", uploaded.length, "clips");
    return uploaded;
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

/* ── POST /shorts ──────────────────────────────────────────── */
app.post("/shorts", async (req, res) => {
  const { project_id, source_url, max_clips, clip_length, clip_min_seconds, clip_max_seconds,
    caption_style, caption_font_scale, crop_mode, generate_thumbnails } = req.body || {};

  if (!project_id) return jsonError(res, 400, "Missing project_id");
  if (!source_url) return jsonError(res, 400, "Missing source_url");

  let minSec = Number(clip_min_seconds) || 0;
  let maxSec = Number(clip_max_seconds) || 0;
  if (!minSec || !maxSec) {
    const parts = String(clip_length || "30-60").split("-").map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) { minSec = minSec || parts[0]; maxSec = maxSec || parts[1]; }
    else { minSec = minSec || 30; maxSec = maxSec || 60; }
  }

  console.log("[shorts] POST — project:", project_id, "dur:", minSec, "-", maxSec, "s, captions:", caption_style);
  res.status(202).json({ ok: true, accepted: true, project_id });

  setImmediate(async () => {
    try {
      await runShorts(project_id, source_url, {
        maxClips: Number(max_clips) || 5, clipMinSeconds: minSec, clipMaxSeconds: maxSec,
        captionStyle: caption_style || "karaoke", captionFontScale: Number(caption_font_scale) || 0.5,
        cropMode: crop_mode || "center", generateThumbnails: generate_thumbnails !== false,
      });
    } catch (e) {
      console.error("[shorts] ❌ FAILED:", e?.message || e);
      try { await admin.from("shorts_projects").update({ status: "error", error_message: String(e?.message || e), updated_at: new Date().toISOString() }).eq("id", project_id); } catch {}
    }
  });
});


// ============================================================
// 🆕 REPURPOSE PIPELINE — "Auto-Repurpose" feature
// ============================================================
// Turn one long YouTube video → 3-5 ready-to-post vertical shorts
// Reuses existing shorts infrastructure + adds enhanced metadata
// ============================================================

const REPURPOSE_BUCKET = (process.env.REPURPOSE_BUCKET || "repurpose").trim();

async function updateRepurposeStatus(projectId, status, progressPct, extra = {}) {
  await admin
    .from("repurpose_projects")
    .update({
      status,
      progress_pct: progressPct,
      progress_stage: status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", projectId);
  console.log(`[repurpose] status → ${status} (${progressPct}%)`);
}

/* ── [STEP 1] Download — wrapper that updates repurpose_projects ── */
async function repurposeStep1_Download(projectId, sourceUrl, workDir) {
  await updateRepurposeStatus(projectId, "downloading", 5);
  const videoFile = path.join(workDir, "source-video.mp4");
  const audioFile = path.join(workDir, "source-audio.mp3");
  const ytdlp = (await import("youtube-dl-exec")).default;

  console.log("[repurpose] downloading video...");
  await ytdlp(sourceUrl, {
    format: "best[height<=720][ext=mp4]/best[height<=720]/best",
    output: videoFile,
    noPlaylist: true,
    noWriteSub: true,
    noWriteAutoSub: true,
    noEmbedSubs: true,
  });
  if (!fs.existsSync(videoFile)) throw new Error("Video download failed");

  console.log("[repurpose] extracting audio...");
  await execAsync(`ffmpeg -i "${videoFile}" -q:a 0 -map a -y "${audioFile}"`);
  if (!fs.existsSync(audioFile)) throw new Error("Audio extraction failed");

  let durationSec = null;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoFile}"`
    );
    durationSec = parseFloat(stdout.trim());
  } catch {}

  let title = null, channel = null, thumbnailUrl = null;
  try {
    const info = await ytdlp(sourceUrl, { dumpSingleJson: true, noPlaylist: true });
    title = info?.title || null;
    channel = info?.uploader || info?.channel || null;
    thumbnailUrl = info?.thumbnail || null;
    durationSec = durationSec || info?.duration || null;
  } catch {}

  await admin.from("repurpose_projects").update({
    source_title: title, source_channel: channel,
    source_thumbnail: thumbnailUrl, source_duration_sec: durationSec,
  }).eq("id", projectId);

  await updateRepurposeStatus(projectId, "downloading", 10);
  console.log("[repurpose] ✅ step 1 — dur:", durationSec);
  return { videoFile, audioFile, durationSec };
}

/* ── [STEP 2] Transcribe — wrapper that updates repurpose_projects ── */
async function repurposeStep2_Transcribe(projectId, audioFile) {
  await updateRepurposeStatus(projectId, "transcribing", 15);
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const audioBuffer = fs.readFileSync(audioFile);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper error (${res.status}): ${await res.text()}`);

  const result = await res.json();
  await admin.from("repurpose_projects").update({ transcript: result.text || "" }).eq("id", projectId);

  console.log("[repurpose] ✅ step 2 — segments:", result.segments?.length);
  await updateRepurposeStatus(projectId, "transcribing", 25);
  return { segments: result.segments || [], words: result.words || [] };
}

/* ── [STEP 3] Enhanced AI viral moment detection + SEO metadata ── */
/* KEY INSIGHT: Instead of asking GPT to pick raw timestamps (which it     */
/* does poorly), we give it NUMBERED SEGMENTS and ask it to pick           */
/* start_segment and end_segment indices. Since Whisper segments are       */
/* sentence-aligned, this GUARANTEES clips start/end on complete sentences.*/
async function repurposeStep3_Analyze(projectId, segments, durationSec, options) {
  await updateRepurposeStatus(projectId, "analyzing", 30);
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const { maxClips, clipMinSeconds, clipMaxSeconds } = options;

  // Build numbered transcript with segment indices
  // This gives GPT clear sentence boundaries to work with
  const numberedTranscript = segments.map((s, i) => {
    const m = Math.floor(s.start / 60);
    const sec = Math.floor(s.start % 60);
    return `[SEG ${i} | ${m}:${String(sec).padStart(2, "0")} → ${Math.floor(s.end / 60)}:${String(Math.floor(s.end % 60)).padStart(2, "0")}] ${s.text}`;
  }).join("\n");

  const prompt = `You are an expert viral content creator. Analyze this transcript and find the ${maxClips} most viral, self-contained moments for YouTube Shorts / TikTok / Reels.

VIDEO DURATION: ${Math.round(durationSec || 0)} seconds
TOTAL SEGMENTS: ${segments.length}

Each line below is ONE SENTENCE with its segment number and time range:
${numberedTranscript}

YOUR TASK: Pick ${maxClips} clips by choosing START and END SEGMENT numbers.

RULES:
1. Each clip = a range of consecutive segments (e.g., segments 5 through 12)
2. The clip duration (from start of first segment to end of last segment) should be between ${clipMinSeconds} and ${Math.max(clipMinSeconds, clipMaxSeconds - 8)} seconds (we add a few seconds of buffer in post-processing, so AIM SHORTER)
3. Each clip must tell a COMPLETE STORY — the first segment should set up the idea and the last segment should CONCLUDE it
4. The LAST SEGMENT of each clip must be a COMPLETE SENTENCE that concludes the thought. NEVER end on a sentence that leads into the next idea (e.g., ending with "and that's when..." or "because..." or a comma)
5. No overlapping segment ranges between clips
6. Prefer moments with: strong opening hook, emotional peaks, surprising statements, quotable conclusions
7. Each clip must work STANDALONE — a viewer with no context should understand it

FOR EACH CLIP, RETURN:
- start_segment: The segment number where the clip begins
- end_segment: The segment number where the clip ends (MUST be a concluding sentence)
- hook_score: 0-100 (how viral is this moment?)
- reason: Why this moment is viral
- suggested_title: Click-worthy title (max 60 chars, 1 emoji)
- suggested_description: 1-2 sentence post description
- suggested_hashtags: Array of 5-7 hashtags (always include #shorts)
- emotional_hook: What emotion drives this clip (curiosity, inspiration, shock, etc.)

Return ONLY a JSON array:
[{"index":1,"start_segment":<num>,"end_segment":<num>,"hook_score":<0-100>,"reason":"...","suggested_title":"...","suggested_description":"...","suggested_hashtags":["#shorts","..."],"emotional_hook":"curiosity"}]

VERIFY each clip:
1. end_segment > start_segment
2. Duration (end of last segment - start of first segment) is between ${clipMinSeconds} and ${Math.max(clipMinSeconds, clipMaxSeconds - 8)} seconds. AIM for ${Math.max(clipMinSeconds, clipMaxSeconds - 10)}-${Math.max(clipMinSeconds, clipMaxSeconds - 5)} seconds as the sweet spot.
3. The text of end_segment is a COMPLETE concluding sentence — it must END the thought, not lead into the next one
4. Segment numbers are between 0 and ${segments.length - 1}
No markdown, no explanation.`;

  console.log("[repurpose] GPT prompt length:", prompt.length, "chars");

  const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 12000,
    }),
  });
  if (!gptRes.ok) throw new Error(`GPT error (${gptRes.status}): ${await gptRes.text()}`);

  const gptResult = await gptRes.json();
  let text = (gptResult.choices?.[0]?.message?.content || "[]")
    .replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  let rawClips;
  try { rawClips = JSON.parse(text); } catch { throw new Error("GPT returned invalid JSON"); }
  if (!Array.isArray(rawClips) || rawClips.length === 0) throw new Error("GPT returned no clips");

  // Convert segment indices to timestamps
  const videoDur = durationSec || 9999;
  let clips = rawClips.map((clip, i) => {
    let startSeg = Math.max(0, Math.min(segments.length - 1, Number(clip.start_segment) || 0));
    let endSeg = Math.max(startSeg, Math.min(segments.length - 1, Number(clip.end_segment) || startSeg));

    const startTime = segments[startSeg].start;
    const endTime = segments[endSeg].end;
    let dur = endTime - startTime;

    // Duration enforcement — adjust segment range if needed
    // Use effectiveMax that's shorter than clipMaxSeconds because the smart buffer
    // in step 4 will add ~5-8s (PRE_START_PAD + POST_SENTENCE_PAD + next segment)
    const effectiveMax = Math.max(clipMinSeconds, clipMaxSeconds - 8);

    if (dur < clipMinSeconds) {
      // Extend end segments until we reach minimum duration
      while (endSeg < segments.length - 1 && dur < clipMinSeconds) {
        endSeg++;
        dur = segments[endSeg].end - startTime;
      }
      console.log(`[repurpose]   #${i+1}: SHORT (${(endTime - startTime).toFixed(0)}s) → extended to seg ${endSeg} (${dur.toFixed(0)}s)`);
    }
    if (dur > effectiveMax) {
      // Trim end segments to fit within effective max
      while (endSeg > startSeg + 1 && (segments[endSeg].end - startTime) > effectiveMax) {
        endSeg--;
      }
      dur = segments[endSeg].end - startTime;
      console.log(`[repurpose]   #${i+1}: LONG → trimmed to seg ${endSeg} (${dur.toFixed(0)}s, effectiveMax=${effectiveMax}s)`);
    }

    const finalStart = Math.max(0, segments[startSeg].start);
    const finalEnd = Math.min(videoDur, segments[endSeg].end);
    const finalDur = finalEnd - finalStart;

    // Log the actual content boundaries for debugging
    const firstSentence = (segments[startSeg].text || "").trim().slice(0, 50);
    const lastSentence = (segments[endSeg].text || "").trim().slice(-50);
    console.log(`[repurpose]   #${i+1}: segs ${startSeg}→${endSeg} | ${finalStart.toFixed(1)}→${finalEnd.toFixed(1)}s (${finalDur.toFixed(0)}s)`);
    console.log(`[repurpose]     STARTS: "${firstSentence}..."`);
    console.log(`[repurpose]     ENDS:   "...${lastSentence}"`);

    // Skip clips that are still too short after adjustment
    if (finalDur < clipMinSeconds * 0.8) {
      console.log(`[repurpose]   #${i+1}: SKIPPED — too short (${finalDur.toFixed(0)}s)`);
      return null;
    }

    return {
      ...clip, index: i + 1,
      start_time: Math.round(finalStart * 100) / 100,
      end_time: Math.round(finalEnd * 100) / 100,
      duration: Math.round(finalDur * 100) / 100,
      start_segment: startSeg,
      end_segment: endSeg,
      title: clip.suggested_title || `Clip ${i + 1}`,
      hook_score: clamp(Number(clip.hook_score) || 50, 0, 100),
      suggested_title: clip.suggested_title || `Clip ${i + 1}`,
      suggested_hashtags: Array.isArray(clip.suggested_hashtags) ? clip.suggested_hashtags : ["#shorts"],
    };
  }).filter(Boolean);

  clips.sort((a, b) => b.hook_score - a.hook_score);
  clips = clips.slice(0, maxClips);

  await admin.from("repurpose_projects").update({ detected_moments: clips }).eq("id", projectId);
  console.log("[repurpose] ✅ step 3 —", clips.length, "clips with metadata");
  await updateRepurposeStatus(projectId, "analyzing", 40);
  return clips;
}

/* ── [STEP 7] Upload to repurpose bucket + insert clips table ── */
async function repurposeStep7_Upload(projectId, userId, processedClips) {
  await updateRepurposeStatus(projectId, "uploading", 92);
  const uploadedClips = [];

  for (let i = 0; i < processedClips.length; i++) {
    const clip = processedClips[i];
    if (!clip.clipFile || !fs.existsSync(clip.clipFile)) continue;

    const videoPath = `${userId}/${projectId}/clip-${clip.index}.mp4`;
    const { error: upErr } = await admin.storage.from(REPURPOSE_BUCKET)
      .upload(videoPath, fs.readFileSync(clip.clipFile), {
        contentType: "video/mp4", upsert: true, cacheControl: "3600",
      });
    if (upErr) { console.warn(`[repurpose] upload fail #${clip.index}:`, upErr.message); continue; }

    const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/${REPURPOSE_BUCKET}/${videoPath}`;

    let thumbnailUrl = null;
    if (clip.thumbFile && fs.existsSync(clip.thumbFile)) {
      const thumbPath = `${userId}/${projectId}/clip-${clip.index}-thumb.jpg`;
      const { error: thumbErr } = await admin.storage.from(REPURPOSE_BUCKET)
        .upload(thumbPath, fs.readFileSync(clip.thumbFile), {
          contentType: "image/jpeg", upsert: true, cacheControl: "3600",
        });
      if (!thumbErr) thumbnailUrl = `${SUPABASE_URL}/storage/v1/object/public/${REPURPOSE_BUCKET}/${thumbPath}`;
    }

    const record = {
      id: `${projectId}-clip-${clip.index}`,
      index: clip.index,
      title: clip.title, description: clip.description,
      start_time: clip.start_time, end_time: clip.end_time,
      duration: clip.actual_duration || clip.duration,
      hook_score: clip.hook_score, reason: clip.reason,
      suggested_title: clip.suggested_title,
      suggested_description: clip.suggested_description,
      suggested_hashtags: clip.suggested_hashtags,
      emotional_hook: clip.emotional_hook,
      video_url: videoUrl, thumbnail_url: thumbnailUrl, status: "done",
    };
    uploadedClips.push(record);

    // Insert into normalized repurpose_clips table
    try {
      await admin.from("repurpose_clips").upsert({
        id: record.id, project_id: projectId, user_id: userId,
        clip_index: clip.index, start_time: clip.start_time, end_time: clip.end_time,
        duration: record.duration, hook_score: clip.hook_score, reason: clip.reason,
        video_url: videoUrl, thumbnail_url: thumbnailUrl,
        suggested_title: clip.suggested_title,
        suggested_description: clip.suggested_description,
        suggested_hashtags: clip.suggested_hashtags,
        status: "done",
      }, { onConflict: "id" });
    } catch (e) { console.warn("[repurpose] clips insert:", e?.message); }

    await updateRepurposeStatus(projectId, "uploading",
      92 + Math.round(((i + 1) / processedClips.length) * 6));
  }

  await admin.from("repurpose_projects").update({
    clips: uploadedClips, status: "done", progress_pct: 100,
    progress_stage: "done", error_message: null, updated_at: new Date().toISOString(),
  }).eq("id", projectId);

  console.log("[repurpose] ✅ uploaded", uploadedClips.length, "clips");
  return uploadedClips;
}

/* ── Orchestrator ──────────────────────────────────────────── */
async function runRepurpose(projectId, sourceUrl, options) {
  console.log("[repurpose] ═══════════════════════════════════════");
  console.log("[repurpose] project:", projectId, "clips:", options.maxClips,
    "dur:", options.clipMinSeconds, "-", options.clipMaxSeconds, "s");
  console.log("[repurpose] ═══════════════════════════════════════");

  const workDir = path.join(os.tmpdir(), "repurpose-" + projectId);
  fs.mkdirSync(workDir, { recursive: true });

  const { data: proj } = await admin.from("repurpose_projects")
    .select("user_id").eq("id", projectId).single();
  const userId = proj?.user_id || "unknown";

  try {
    // [1] Download
    const { videoFile, audioFile, durationSec } =
      await repurposeStep1_Download(projectId, sourceUrl, workDir);

    // [2] Transcribe
    const { segments, words } =
      await repurposeStep2_Transcribe(projectId, audioFile);

    // [3] Enhanced AI analysis + metadata
    const clips = await repurposeStep3_Analyze(projectId, segments, durationSec, {
      maxClips: options.maxClips || 5,
      clipMinSeconds: options.clipMinSeconds || 30,
      clipMaxSeconds: options.clipMaxSeconds || 60,
    });

    // [4+5] Extract clips + crop + burn captions (reuse existing shorts step)
    const processed = await shortsStep4_ExtractAndProcess(projectId, videoFile, clips, segments, words, {
      captionStyle: options.captionStyle || "karaoke",
      cropMode: options.cropMode || "center",
      captionFontScale: options.captionFontScale || 0.5,
    }, workDir);

    // [6] Thumbnails (reuse existing shorts step)
    const thumbed = await shortsStep6_Thumbnails(projectId, processed,
      options.generateThumbnails !== false);

    // [7] Upload to repurpose bucket
    const uploaded = await repurposeStep7_Upload(projectId, userId, thumbed);

    console.log("[repurpose] ✅ COMPLETE —", uploaded.length, "clips");
    return uploaded;
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

/* ── POST /repurpose endpoint ──────────────────────────────── */
app.post("/repurpose", async (req, res) => {
  const {
    project_id, source_url, max_clips, clip_min_seconds, clip_max_seconds,
    caption_style, caption_font_scale, crop_mode, generate_thumbnails,
  } = req.body || {};

  if (!project_id) return jsonError(res, 400, "Missing project_id");
  if (!source_url) return jsonError(res, 400, "Missing source_url");

  console.log("[repurpose] POST — project:", project_id, "clips:", max_clips,
    "dur:", clip_min_seconds, "-", clip_max_seconds, "s, captions:", caption_style);

  res.status(202).json({ ok: true, accepted: true, project_id });

  setImmediate(async () => {
    try {
      await runRepurpose(project_id, source_url, {
        maxClips: Number(max_clips) || 5,
        clipMinSeconds: Number(clip_min_seconds) || 30,
        clipMaxSeconds: Number(clip_max_seconds) || 60,
        captionStyle: caption_style || "karaoke",
        captionFontScale: Number(caption_font_scale) || 0.5,
        cropMode: crop_mode || "center",
        generateThumbnails: generate_thumbnails !== false,
      });
    } catch (e) {
      console.error("[repurpose] ❌ FAILED:", e?.message || e);
      try {
        await admin.from("repurpose_projects").update({
          status: "error", error_message: String(e?.message || e),
          updated_at: new Date().toISOString(),
        }).eq("id", project_id);
      } catch {}
    }
  });
});


/* ── Start server ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`[render-webhook] listening on :${PORT}`);
  console.log(`[render-webhook] endpoints: GET / | POST /render | POST /dub | POST /shorts | POST /repurpose`);
});
