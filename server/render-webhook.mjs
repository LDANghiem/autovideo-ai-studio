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
async function dubStep4_GenerateTTS(projectId, translatedSegments, voiceId, workDir, videoDurationSec, targetLanguageCode) {
  await updateDubStatus(projectId, "generating_tts", 50);

  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");

  const finalVoiceId = voiceId || "0ggMuQ1r9f9jqBu50nJn";
  const ttsDir = path.join(workDir, "tts-parts");
  fs.mkdirSync(ttsDir, { recursive: true });

  const MAX_SPEEDUP = 1.35;
  const MAX_CHARS = 4000;
  const langCode = targetLanguageCode || "vi";

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

  const fullScript = paragraphs.join("\n\n");
  console.log("[dub] full script:", paragraphs.length, "paragraphs,", fullScript.length, "chars");

  const chunks = [];
  let currentChunk = "";

  for (const para of paragraphs) {
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

  const rawNarration = path.join(workDir, "raw-narration.mp3");

  if (chunkFiles.length === 1) {
    fs.copyFileSync(chunkFiles[0], rawNarration);
  } else {
    const listFile = path.join(ttsDir, "concat-list.txt");
    const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(listFile, listContent);

    await execAsync(
      `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${rawNarration}"`
    );
    try { fs.unlinkSync(listFile); } catch {}
  }

  for (const f of chunkFiles) { try { fs.unlinkSync(f); } catch {} }

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

  const narrationFile = path.join(workDir, "vietnamese-narration.wav");

  if (ratio >= 0.95 && ratio <= 1.05) {
    console.log("[dub] narration length is close enough — no tempo change ✓");
    await execAsync(`ffmpeg -i "${rawNarration}" -ar 44100 -ac 1 -y "${narrationFile}"`);

  } else if (ratio > 1.0 && ratio <= MAX_SPEEDUP) {
    console.log(`[dub] speeding up ${Math.round((ratio - 1) * 100)}% to match video length`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${ratio.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else if (ratio > MAX_SPEEDUP) {
    console.log(`[dub] narration too long — capping speedup at ${Math.round((MAX_SPEEDUP - 1) * 100)}%`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${MAX_SPEEDUP.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else if (ratio < 0.95 && ratio >= 0.5) {
    const slowdown = Math.max(0.88, ratio);
    console.log(`[dub] slowing down ${Math.round((1 - slowdown) * 100)}% to better fill video`);
    await execAsync(
      `ffmpeg -i "${rawNarration}" -af "atempo=${slowdown.toFixed(4)}" -ar 44100 -ac 1 -y "${narrationFile}"`
    );

  } else {
    console.log("[dub] edge case ratio — using narration as-is");
    await execAsync(`ffmpeg -i "${rawNarration}" -ar 44100 -ac 1 -y "${narrationFile}"`);
  }

  try { fs.unlinkSync(rawNarration); } catch {}

  if (targetDuration > 0) {
    const finalFile = path.join(workDir, "vietnamese-narration-final.wav");
    const fadeOutDur = 2.0;
    const fadeOutStart = Math.max(0, targetDuration - fadeOutDur);
    await execAsync(
      `ffmpeg -i "${narrationFile}" -af "afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur},apad" -t ${targetDuration.toFixed(2)} -ar 44100 -ac 1 -y "${finalFile}"`
    );
    fs.renameSync(finalFile, narrationFile);

    try {
      const { stdout: durCheck } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${narrationFile}"`
      );
      console.log("[dub] narration after trim+fade:", parseFloat(durCheck).toFixed(2), "s (target:", targetDuration.toFixed(2), "s)");
    } catch {}
  }

  try { fs.rmSync(ttsDir, { recursive: true, force: true }); } catch {}

  if (!fs.existsSync(narrationFile)) throw new Error("TTS narration file not created");

  console.log("[dub] ✅ step 4 done — full-script natural narration, duration matched to video");
  await updateDubStatus(projectId, "generating_tts", 65);
  return narrationFile;
}

/* ── [DUB STEP 4b] Re-transcribe narration for synced captions ─ */
async function dubStep4b_SyncCaptions(projectId, narrationFile, translatedSegments, targetLanguageCode) {
  await updateDubStatus(projectId, "generating_tts", 67);

  if (!OPENAI_API_KEY) {
    console.log("[dub] no OPENAI_API_KEY — skipping caption re-sync, using original timestamps");
    return translatedSegments;
  }

  const langCode = targetLanguageCode || "vi";
  console.log("[dub] re-transcribing narration with Whisper for synced captions (lang:", langCode, ")...");

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
    const vol = Math.max(0, Math.min(1, originalVolume || 0.15));
    console.log("[dub] mixing audio — original at", Math.round(vol * 100) + "% volume");

    const durationFlag = videoDurationSec > 0 ? `-t ${videoDurationSec.toFixed(2)}` : "";
    await execAsync(
      `ffmpeg -i "${narrationFile}" -i "${originalAudioFile}" ` +
      `-filter_complex "[1:a]volume=${vol}[quiet];[0:a][quiet]amix=inputs=2:duration=first:dropout_transition=2" ` +
      `${durationFlag} -y "${finalAudioFile}"`
    );
  } else {
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
async function dubStep6_AssembleVideo(projectId, videoFile, finalAudioFile, translatedSegments, captionStyle, workDir) {
  await updateDubStatus(projectId, "assembling", 80);

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

  const noSubsFile = path.join(workDir, "output-no-subs.mp4");
  console.log("[dub] replacing audio track + stripping embedded subtitle streams...");
  await execAsync(
    `ffmpeg -i "${videoFile}" -i "${finalAudioFile}" ` +
    `-c:v copy -c:a aac -map 0:v -map 1:a -sn -shortest -y "${noSubsFile}"`
  );

  const finalOutputFile = path.join(workDir, "final-output.mp4");

  const escapedSrtPath = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");

  let videoWidth = 1280;
  let videoHeight = 720;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${noSubsFile}"`
    );
    const [w, h] = stdout.trim().split(",").map(Number);
    if (w > 0 && h > 0) { videoWidth = w; videoHeight = h; }
  } catch {}

  const barHeight = Math.round(videoHeight * 0.12);

  const isVertical = videoHeight > videoWidth;

  let desiredFontPx, marginV, outlineSize;

  if (isVertical) {
    desiredFontPx = Math.max(28, Math.round(videoWidth / 36));
    marginV = Math.round(videoHeight * 0.08);
    outlineSize = 2;
  } else {
    desiredFontPx = Math.max(18, Math.round(videoHeight / 42));
    marginV = Math.max(10, Math.round(barHeight * 0.20));
    outlineSize = 1.5;
  }

  const assScaleFactor = videoHeight / 384;
  const fontSize = Math.round(desiredFontPx * assScaleFactor);
  const scaledMarginV = Math.round(marginV * assScaleFactor);
  const scaledOutline = Math.max(1, Math.round(outlineSize * assScaleFactor));
  const scaledMarginLR = Math.round(50 * assScaleFactor);

  console.log("[dub] burning subtitles —", isVertical ? "VERTICAL" : "LANDSCAPE",
    videoWidth, "x", videoHeight, "bar:", barHeight,
    "px, desiredPx:", desiredFontPx, "assFontSize:", fontSize, "marginV:", scaledMarginV);

  const backColour = "&H80000000";

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

  await execAsync(
    `ffmpeg -i "${noSubsFile}" ` +
    `-vf "drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black:t=fill,` +
    `subtitles='${escapedSrtPath}':force_style='${subtitleStyle}'" ` +
    `-c:a copy -y "${finalOutputFile}"`
  );

  if (!fs.existsSync(finalOutputFile)) {
    throw new Error("Video assembly failed");
  }

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

  const workDir = path.join(os.tmpdir(), "dub-" + projectId);
  fs.mkdirSync(workDir, { recursive: true });

  const { data: project } = await admin
    .from("dub_projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  const userId = project?.user_id || "unknown";

  try {
    const { videoFile, audioFile, durationSec } =
      await dubStep1_Download(projectId, sourceUrl, workDir);

    const { detectedLanguage, segments } =
      await dubStep2_Transcribe(projectId, audioFile);

    const translatedSegments =
      await dubStep3_Translate(projectId, segments, detectedLanguage, targetLanguage);

    const narrationFile =
      await dubStep4_GenerateTTS(projectId, translatedSegments, voiceId, workDir, durationSec, targetLanguageCode);

    const syncedSegments =
      await dubStep4b_SyncCaptions(projectId, narrationFile, translatedSegments, targetLanguageCode);

    const finalAudioFile =
      await dubStep5_MixAudio(projectId, narrationFile, audioFile, keepOriginal, originalVolume, workDir, durationSec);

    const { finalOutputFile, srtFile } =
      await dubStep6_AssembleVideo(projectId, videoFile, finalAudioFile, syncedSegments, captionStyle, workDir);

    const { videoUrl, srtUrl } =
      await dubStep7_Upload(projectId, userId, finalOutputFile, srtFile);

    console.log("[dub] ✅ PIPELINE COMPLETE");
    return { videoUrl, srtUrl };
  } finally {
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

  res.status(202).json({ ok: true, accepted: true, project_id });

  setImmediate(async () => {
    try {
      await runDub(
        project_id,
        source_url,
        target_language || "Vietnamese",
        voice_id || null,
        caption_style || "block",
        keep_original_audio !== false,
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

  const videoDur = durationSec || 9999;

  clips = clips.map((clip, i) => {
    let start = Number(clip.start_time) || 0;
    let end = Number(clip.end_time) || 0;
    let dur = end - start;

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

  const shortsAssScale = outHeight / 384;
  const scaledShortsFontSize = Math.round(finalFontSize * shortsAssScale);
  const scaledShortsMarginV = Math.round(marginV * shortsAssScale);
  const scaledShortsOutline = Math.max(1, Math.round(outlineSize * shortsAssScale));
  const scaledShortsShadow = Math.max(1, Math.round(shadowSize * shortsAssScale));
  const scaledShortsMarginLR = Math.round(60 * shortsAssScale);

  console.log("[shorts] captions:", captionStyle, "desiredPx:", finalFontSize, "assFontSize:", scaledShortsFontSize, "marginV:", scaledShortsMarginV);

  const POST_SENTENCE_PAD = 2.5;
  const FADE_OUT_DURATION = 1.0;
  const PRE_START_PAD = 1.0;

  const processedClips = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipFile = path.join(clipsDir, `clip-${clip.index}.mp4`);
    const srtFile = path.join(clipsDir, `clip-${clip.index}.srt`);

    const pctBase = 45 + Math.round((i / clips.length) * 40);
    await updateShortsStatus(projectId, "clipping", pctBase);

    let smartEndTime = clip.end_time + 3.0;

    const overlappingSegs = segments.filter(
      (seg) => seg.start < (clip.end_time + 6) && seg.end > (clip.end_time - 3)
    );

    let targetSegEnd = clip.end_time;
    if (overlappingSegs.length > 0) {
      const activeAtEnd = overlappingSegs.find(
        (seg) => seg.start <= clip.end_time && seg.end > clip.end_time
      );

      if (activeAtEnd) {
        targetSegEnd = activeAtEnd.end;
        console.log(`[shorts]   #${clip.index}: active segment ends@${activeAtEnd.end.toFixed(1)}s: "${(activeAtEnd.text || "").trim().slice(-40)}"`);
      } else {
        const nextSeg = overlappingSegs.find((seg) => seg.start > clip.end_time && seg.start < clip.end_time + 2);
        if (nextSeg) {
          targetSegEnd = nextSeg.end;
          console.log(`[shorts]   #${clip.index}: next segment (${nextSeg.start.toFixed(1)}→${nextSeg.end.toFixed(1)}s): "${(nextSeg.text || "").trim().slice(-40)}"`);
        }
      }
    }

    if (Array.isArray(words) && words.length > 0) {
      const segWords = words.filter(
        (w) => w.start >= (clip.start_time - 1) && w.start < (targetSegEnd + 1)
      );
      if (segWords.length > 0) {
        const lastWord = segWords[segWords.length - 1];
        const preciseEnd = lastWord.end || (lastWord.start + 0.5);
        targetSegEnd = Math.max(targetSegEnd, preciseEnd);
        console.log(`[shorts]   #${clip.index}: lastWord="${(lastWord.word || "").trim()}" preciseEnd=${preciseEnd.toFixed(2)}s`);
      }
    }

    smartEndTime = Math.max(smartEndTime, targetSegEnd + POST_SENTENCE_PAD);

    const MAX_TOTAL_DURATION = (clip.duration || 60) + 8;
    const ffmpegStartRaw = Math.max(0, clip.start_time - PRE_START_PAD);
    if ((smartEndTime - ffmpegStartRaw) > MAX_TOTAL_DURATION) {
      smartEndTime = ffmpegStartRaw + MAX_TOTAL_DURATION;
      console.log(`[shorts]   #${clip.index}: CAPPED total duration to ${MAX_TOTAL_DURATION.toFixed(0)}s`);
    }

    console.log(`[shorts]   #${clip.index}: GPT=${clip.end_time}s → segEnd=${targetSegEnd.toFixed(1)}s → smartEnd=${smartEndTime.toFixed(1)}s (+${POST_SENTENCE_PAD}s pad)`);

    const ffmpegStart = ffmpegStartRaw;
    const ffmpegDuration = smartEndTime - ffmpegStart;

    console.log(`[shorts] clip #${clip.index}: ${ffmpegStart.toFixed(2)}→${smartEndTime.toFixed(2)}s (${ffmpegDuration.toFixed(1)}s total)`);

    if (captionStyle !== "none") {
      let srtContent = "";
      let idx = 1;

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

    const barHeight = Math.round(outHeight * 0.12);

    let filter = `crop=${cropW}:${cropH}:${cropX}:0,scale=${outWidth}:${outHeight}:flags=lanczos`;
    filter += `,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black:t=fill`;

    if (captionStyle !== "none" && fs.existsSync(srtFile)) {
      let srtPath;

      if (process.platform === "win32") {
        srtPath = srtFile.replace(/\\/g, "/");
        srtPath = srtPath.replace(/:/g, "\\\\:");
      } else {
        srtPath = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");
      }

      console.log(`[shorts]   #${clip.index}: SRT path: ${srtPath}`);
      console.log(`[shorts]   #${clip.index}: SRT exists: ${fs.existsSync(srtFile)}, size: ${fs.statSync(srtFile).size} bytes`);

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

/* ── [STEP 1] Download ── */
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

/* ── [STEP 2] Transcribe ── */
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

/* ── [STEP 3] Enhanced AI viral moment detection ── */
async function repurposeStep3_Analyze(projectId, segments, durationSec, options) {
  await updateRepurposeStatus(projectId, "analyzing", 30);
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const { maxClips, clipMinSeconds, clipMaxSeconds } = options;

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
2. The clip duration (from start of first segment to end of last segment) should be between ${clipMinSeconds} and ${Math.max(clipMinSeconds, clipMaxSeconds - 8)} seconds
3. Each clip must tell a COMPLETE STORY
4. The LAST SEGMENT of each clip must be a COMPLETE SENTENCE that concludes the thought
5. No overlapping segment ranges between clips
6. Prefer moments with: strong opening hook, emotional peaks, surprising statements
7. Each clip must work STANDALONE

FOR EACH CLIP, RETURN:
- start_segment, end_segment, hook_score (0-100), reason, suggested_title (max 60 chars, 1 emoji), suggested_description, suggested_hashtags (array of 5-7), emotional_hook

Return ONLY a JSON array. No markdown.`;

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

  const videoDur = durationSec || 9999;
  let clips = rawClips.map((clip, i) => {
    let startSeg = Math.max(0, Math.min(segments.length - 1, Number(clip.start_segment) || 0));
    let endSeg = Math.max(startSeg, Math.min(segments.length - 1, Number(clip.end_segment) || startSeg));

    const startTime = segments[startSeg].start;
    const endTime = segments[endSeg].end;
    let dur = endTime - startTime;

    const effectiveMax = Math.max(clipMinSeconds, clipMaxSeconds - 8);

    if (dur < clipMinSeconds) {
      while (endSeg < segments.length - 1 && dur < clipMinSeconds) {
        endSeg++;
        dur = segments[endSeg].end - startTime;
      }
      console.log(`[repurpose]   #${i+1}: SHORT → extended to seg ${endSeg} (${dur.toFixed(0)}s)`);
    }
    if (dur > effectiveMax) {
      while (endSeg > startSeg + 1 && (segments[endSeg].end - startTime) > effectiveMax) {
        endSeg--;
      }
      dur = segments[endSeg].end - startTime;
      console.log(`[repurpose]   #${i+1}: LONG → trimmed to seg ${endSeg} (${dur.toFixed(0)}s)`);
    }

    const finalStart = Math.max(0, segments[startSeg].start);
    const finalEnd = Math.min(videoDur, segments[endSeg].end);
    const finalDur = finalEnd - finalStart;

    const firstSentence = (segments[startSeg].text || "").trim().slice(0, 50);
    const lastSentence = (segments[endSeg].text || "").trim().slice(-50);
    console.log(`[repurpose]   #${i+1}: segs ${startSeg}→${endSeg} | ${finalStart.toFixed(1)}→${finalEnd.toFixed(1)}s (${finalDur.toFixed(0)}s)`);
    console.log(`[repurpose]     STARTS: "${firstSentence}..."`);
    console.log(`[repurpose]     ENDS:   "...${lastSentence}"`);

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

/* ── [STEP 7] Upload to repurpose bucket ── */
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
    const { videoFile, audioFile, durationSec } =
      await repurposeStep1_Download(projectId, sourceUrl, workDir);

    const { segments, words } =
      await repurposeStep2_Transcribe(projectId, audioFile);

    const clips = await repurposeStep3_Analyze(projectId, segments, durationSec, {
      maxClips: options.maxClips || 5,
      clipMinSeconds: options.clipMinSeconds || 30,
      clipMaxSeconds: options.clipMaxSeconds || 60,
    });

    const processed = await shortsStep4_ExtractAndProcess(projectId, videoFile, clips, segments, words, {
      captionStyle: options.captionStyle || "karaoke",
      cropMode: options.cropMode || "center",
      captionFontScale: options.captionFontScale || 0.5,
    }, workDir);

    const thumbed = await shortsStep6_Thumbnails(projectId, processed,
      options.generateThumbnails !== false);

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


/* ============================================================
   🆕 RECREATE PIPELINE v7 — Major improvements
   
   v7 CHANGES:
   ✅ FIX 1: Text-weighted scene durations (longer text = more screen time)
   ✅ FIX 2: Whisper re-transcription for PERFECT caption sync
   ✅ FIX 3: Media deduplication (no repeated stock clips)
   ✅ FIX 4: Pick from top 3-5 results randomly (visual diversity)
   ✅ FIX 5: Cross-fade transitions between scenes (professional look)
   ✅ FIX 6: 2s fade-out at end for clean finish
============================================================ */

const PEXELS_API_KEY = (process.env.PEXELS_API_KEY || "").trim();
const PIXABAY_API_KEY = (process.env.PIXABAY_API_KEY || "").trim();
const RECREATE_BUCKET = (process.env.RECREATE_BUCKET || "recreated-videos").trim();

/* ── helper: update recreate project status ─────────────────── */
async function updateReCreateStatus(projectId, status, progressPct, extra = {}) {
  await admin
    .from("recreate_projects")
    .update({
      status,
      progress_pct: progressPct,
      progress_stage: status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", projectId);
  console.log(`[recreate] status → ${status} (${progressPct}%)`);
}

/* ── [RECREATE STEP 1] Download audio + Transcribe ───────────── */
async function recreateStep1_Transcribe(projectId, sourceUrl, workDir) {
  await updateReCreateStatus(projectId, "transcribing", 5);

  const audioFile = path.join(workDir, "source-audio.mp3");
  const ytdlp = (await import("youtube-dl-exec")).default;

  console.log("[recreate] downloading audio...");
  try {
    await ytdlp(sourceUrl, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 0,
      output: audioFile,
      noPlaylist: true,
    });
  } catch {
    console.log("[recreate] audio-only failed, trying video...");
    const videoFile = path.join(workDir, "source-video.mp4");
    await ytdlp(sourceUrl, {
      format: "best[height<=720][ext=mp4]/best[height<=720]/best",
      output: videoFile,
      noPlaylist: true,
    });
    await execAsync(`ffmpeg -i "${videoFile}" -q:a 0 -map a -y "${audioFile}"`);
    try { fs.unlinkSync(videoFile); } catch {}
  }

  if (!fs.existsSync(audioFile)) throw new Error("Audio download failed");

  await updateReCreateStatus(projectId, "transcribing", 10);

  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const audioBuffer = fs.readFileSync(audioFile);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");

  console.log("[recreate] transcribing with Whisper...");
  const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });

  if (!wRes.ok) {
    const errText = await wRes.text();
    throw new Error(`Whisper error (${wRes.status}): ${errText}`);
  }

  const result = await wRes.json();
  const transcript = result.text || "";

  console.log("[recreate] ✅ step 1 — transcribed:", transcript.length, "chars");

  await updateReCreateStatus(projectId, "transcribing", 15, {
    transcript_original: transcript,
  });

  try { fs.unlinkSync(audioFile); } catch {}
  return transcript;
}

/* ── [RECREATE STEP 2] AI writes original script + scenes ──── */
async function recreateStep2_GenerateScript(projectId, transcript, targetLanguage, style) {
  await updateReCreateStatus(projectId, "scripting", 20);

  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const styleGuide = {
    news: "Write as a professional news anchor. Authoritative, clear, informative. Structure: hook → details → context → analysis → conclusion.",
    documentary: "Write as a documentary narrator. Cinematic, narrative arc, vivid descriptions, thoughtful pacing.",
    casual: "Write as a friendly vlogger. Conversational, personal comments, relatable examples.",
    educational: "Write as a knowledgeable teacher. Break complex ideas into simple parts. Use examples and analogies.",
    motivational: "Write as an inspiring speaker. Powerful language, emotional appeal, calls to action.",
  };

  const isRewrite = targetLanguage.toLowerCase() === "english";

  const rewriteInstruction = isRewrite
    ? `REWRITE the content in English using COMPLETELY DIFFERENT words, sentence structures, and phrasing.
- Do NOT copy any sentences from the original. Every sentence must be freshly written.
- Keep ALL the same facts, names, dates, numbers, and key information.
- Change the narrative angle, structure, and writing style.
- Think of this as: a DIFFERENT journalist covering the SAME story.`
    : `Write a COMPLETELY ORIGINAL script in ${targetLanguage}.
- Do NOT translate word-for-word. Write ORIGINAL content about the same topics.
- Write in natural, fluent ${targetLanguage}.
- Add context and perspective for ${targetLanguage}-speaking audiences.`;

  const prompt = `You are a professional video content creator. Based on the transcript below, ${isRewrite ? "rewrite" : "create"} a script.

${rewriteInstruction}
- ${styleGuide[style] || styleGuide.news}

Return a JSON array of 10-18 scenes. Each scene = one visual shot in the video.

For each scene provide:
- "text": The narration (2-3 sentences per scene)
- "scene_query": A stock footage search query (SEE RULES BELOW)
- "duration_sec": Estimated narration time (roughly 12-15 chars per second)

═══ CRITICAL: SCENE_QUERY RULES ═══
Stock footage libraries (Pexels, Pixabay) contain GENERIC B-roll footage, NOT specific news events or people.

NEVER use queries like:
✗ "Trump speech" — no stock footage of Trump exists
✗ "Iran missile attack" — no footage of specific attacks
✗ "Khamenei biography" — no footage of specific leaders
✗ "Tel Aviv damage" — no footage of specific damage events
✗ "White House situation room" — classified, no stock footage
✗ "Dubai explosion" — no footage of specific incidents

INSTEAD, think: "What GENERIC visual would a news editor use as B-roll for this topic?"

✓ "government press conference podium" — for any political statement
✓ "military jets flying formation" — for any military action topic
✓ "missile launch smoke trail" — for any missile/weapons topic
✓ "city skyline night aerial" — for any city/urban topic
✓ "world map digital connections" — for any geopolitics topic
✓ "satellite earth orbit space" — for satellite imagery topics
✓ "hospital emergency room doctors" — for casualty/health topics
✓ "protest crowd street signs" — for civil unrest topics
✓ "stock market trading screens" — for economy topics
✓ "news studio anchor desk" — for news intro/outro
✓ "United Nations assembly hall" — for diplomacy topics
✓ "cargo ship ocean container" — for trade/sanctions topics
✓ "oil refinery industrial pipes" — for energy topics
✓ "soldiers patrol desert military" — for ground forces topics
✓ "cybersecurity code screen hacker" — for cyber/tech topics
✓ "courtroom judge gavel legal" — for legal/justice topics
✓ "family watching television home" — for audience reaction
✓ "sunset city peaceful skyline" — for closing/hope segments

IMPORTANT: Each scene_query must be DIFFERENT from every other scene. Never repeat the same query.
Each query should be 3-5 words, descriptive of a VISUAL SCENE, not a news headline.

Return ONLY a JSON array, no markdown:
[{"text":"...","scene_query":"...","duration_sec":10}]

TRANSCRIPT:
${transcript.slice(0, 12000)}`;

  console.log("[recreate] generating script with GPT-4o-mini...");
  const gRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });

  if (!gRes.ok) throw new Error(`GPT error (${gRes.status}): ${await gRes.text()}`);

  let content = (await gRes.json()).choices?.[0]?.message?.content || "[]";
  content = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  let scenes;
  try { scenes = JSON.parse(content); } catch { throw new Error("GPT returned invalid JSON"); }
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("GPT returned empty script");

  const fullScript = scenes.map((s) => s.text).join("\n\n");
  console.log("[recreate] ✅ step 2 — scenes:", scenes.length, "chars:", fullScript.length);

  await updateReCreateStatus(projectId, "scripting", 30, {
    script_translated: fullScript,
    scenes,
  });

  return scenes;
}

/* ── [RECREATE STEP 3] Fetch stock media — with dedup + diversity ── */
async function recreateStep3_FindMedia(projectId, scenes, workDir) {
  await updateReCreateStatus(projectId, "finding_media", 35);

  const mediaDir = path.join(workDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });

  console.log("[recreate] PEXELS key:", !!PEXELS_API_KEY, "| PIXABAY key:", !!PIXABAY_API_KEY);

  // ✅ FIX 3: Track used media URLs to prevent duplicate clips
  const usedMediaUrls = new Set();

  const updatedScenes = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const query = scene.scene_query || "nature landscape";
    let mediaUrl = null;
    let mediaType = "image";
    let source = "";

    console.log(`[recreate]   scene ${i + 1}/${scenes.length}: "${query}"`);

    /* ── Source 1: Pexels Videos (pick from top results, skip dupes) ── */
    if (!mediaUrl && PEXELS_API_KEY) {
      try {
        const res = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        if (res.ok) {
          const data = await res.json();
          // ✅ FIX 4: Pick randomly from top results, skip already-used
          const candidates = (data.videos || []).filter((v) => {
            const file = v?.video_files?.find((f) =>
              (f.quality === "hd" || f.quality === "sd") && f.width >= 1280
            ) || v?.video_files?.find((f) => f.quality === "hd" || f.quality === "sd") || v?.video_files?.[0];
            return file?.link && !usedMediaUrls.has(file.link);
          });
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 3))];
            const file = pick?.video_files?.find((f) =>
              (f.quality === "hd" || f.quality === "sd") && f.width >= 1280
            ) || pick?.video_files?.find((f) => f.quality === "hd" || f.quality === "sd") || pick?.video_files?.[0];
            if (file?.link) { mediaUrl = file.link; mediaType = "video"; source = "pexels-video"; usedMediaUrls.add(file.link); }
          }
        }
      } catch (e) { console.log(`[recreate]     pexels video err:`, e.message); }
    }

    /* ── Source 2: Pixabay Videos ── */
    if (!mediaUrl && PIXABAY_API_KEY) {
      try {
        const res = await fetch(
          `https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=8&safesearch=true`
        );
        if (res.ok) {
          const data = await res.json();
          const candidates = (data.hits || []).filter((v) => {
            const file = v?.videos?.medium || v?.videos?.large || v?.videos?.small;
            return file?.url && !usedMediaUrls.has(file.url);
          });
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 3))];
            const file = pick?.videos?.medium || pick?.videos?.large || pick?.videos?.small;
            if (file?.url) { mediaUrl = file.url; mediaType = "video"; source = "pixabay-video"; usedMediaUrls.add(file.url); }
          }
        }
      } catch (e) { console.log(`[recreate]     pixabay video err:`, e.message); }
    }

    /* ── Source 3: Pexels Photos ── */
    if (!mediaUrl && PEXELS_API_KEY) {
      try {
        const res = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        if (res.ok) {
          const data = await res.json();
          const candidates = (data.photos || []).filter((p) => {
            const url = p.src?.landscape || p.src?.large || p.src?.original;
            return url && !usedMediaUrls.has(url);
          });
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 3))];
            mediaUrl = pick.src?.landscape || pick.src?.large || pick.src?.original;
            mediaType = "image"; source = "pexels-photo";
            if (mediaUrl) usedMediaUrls.add(mediaUrl);
          }
        }
      } catch (e) { console.log(`[recreate]     pexels photo err:`, e.message); }
    }

    /* ── Source 4: Pixabay Photos ── */
    if (!mediaUrl && PIXABAY_API_KEY) {
      try {
        const res = await fetch(
          `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=8&orientation=horizontal&safesearch=true&image_type=photo`
        );
        if (res.ok) {
          const data = await res.json();
          const candidates = (data.hits || []).filter((p) => {
            const url = p.largeImageURL || p.webformatURL;
            return url && !usedMediaUrls.has(url);
          });
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 3))];
            mediaUrl = pick.largeImageURL || pick.webformatURL;
            mediaType = "image"; source = "pixabay-photo";
            if (mediaUrl) usedMediaUrls.add(mediaUrl);
          }
        }
      } catch (e) { console.log(`[recreate]     pixabay photo err:`, e.message); }
    }

    /* ── Fallback: simpler query (first 2 words) ── */
    if (!mediaUrl) {
      const simpleQ = query.split(" ").slice(0, 2).join(" ");
      console.log(`[recreate]     retrying: "${simpleQ}"`);

      if (PEXELS_API_KEY) {
        try {
          const res = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(simpleQ)}&per_page=5&orientation=landscape`,
            { headers: { Authorization: PEXELS_API_KEY } }
          );
          if (res.ok) {
            const photo = (await res.json()).photos?.find((p) => !usedMediaUrls.has(p.src?.landscape));
            if (photo) {
              mediaUrl = photo.src?.landscape || photo.src?.large;
              mediaType = "image"; source = "pexels-fallback";
              if (mediaUrl) usedMediaUrls.add(mediaUrl);
            }
          }
        } catch {}
      }
      if (!mediaUrl && PIXABAY_API_KEY) {
        try {
          const res = await fetch(
            `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(simpleQ)}&per_page=5&orientation=horizontal&safesearch=true`
          );
          if (res.ok) {
            const photo = (await res.json()).hits?.find((p) => !usedMediaUrls.has(p.largeImageURL));
            if (photo) {
              mediaUrl = photo.largeImageURL || photo.webformatURL;
              mediaType = "image"; source = "pixabay-fallback";
              if (mediaUrl) usedMediaUrls.add(mediaUrl);
            }
          }
        } catch {}
      }
    }

    /* ── Download media file ── */
    let localFile = null;
    if (mediaUrl) {
      try {
        const ext = mediaType === "video" ? "mp4" : "jpg";
        localFile = path.join(mediaDir, `scene-${i}.${ext}`);
        const dlRes = await fetch(mediaUrl);
        if (dlRes.ok) {
          fs.writeFileSync(localFile, Buffer.from(await dlRes.arrayBuffer()));
          console.log(`[recreate]     ✅ ${source} (${mediaType})`);
        } else { localFile = null; }
      } catch { localFile = null; }
    }

    /* ── Ultimate fallback: solid color background ── */
    if (!localFile) {
      console.log(`[recreate]     ⚠ no media, fallback bg`);
      localFile = path.join(mediaDir, `scene-${i}.png`);
      mediaType = "image"; source = "fallback-bg";
      try {
        await execAsync(`ffmpeg -f lavfi -i "color=c=#0f0b2a:s=1920x1080:d=1" -frames:v 1 -y "${localFile}"`);
        if (!fs.existsSync(localFile)) localFile = null;
      } catch { localFile = null; }
    }

    updatedScenes.push({ ...scene, media_url: mediaUrl, media_type: mediaType, local_file: localFile, source });

    const pct = 35 + Math.round(((i + 1) / scenes.length) * 15);
    await updateReCreateStatus(projectId, "finding_media", pct);

    if (i < scenes.length - 1) await new Promise((r) => setTimeout(r, 250));
  }

  const bySource = {};
  updatedScenes.forEach((s) => { bySource[s.source || "none"] = (bySource[s.source || "none"] || 0) + 1; });
  console.log(`[recreate] ✅ step 3 — ${updatedScenes.filter((s) => s.local_file).length}/${scenes.length} found:`, JSON.stringify(bySource));

  await updateReCreateStatus(projectId, "finding_media", 50, {
    scenes: updatedScenes.map(({ local_file, ...s }) => s),
  });

  return updatedScenes;
}

/* ── [RECREATE STEP 4] Generate TTS narration ─────────────── */
async function recreateStep4_TTS(projectId, scenes, voiceId, workDir, langCode) {
  await updateReCreateStatus(projectId, "generating_voice", 55);

  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");

  const finalVoiceId = voiceId || "0ggMuQ1r9f9jqBu50nJn";
  const ttsDir = path.join(workDir, "tts");
  fs.mkdirSync(ttsDir, { recursive: true });

  const paragraphs = scenes.map((s) => (s.text || "").trim()).filter((t) => t.length > 0);
  if (paragraphs.length === 0) throw new Error("No text for TTS");

  const chunks = [];
  let cur = "";
  for (const p of paragraphs) {
    if (cur.length > 0 && (cur.length + p.length + 2) > 4000) { chunks.push(cur.trim()); cur = ""; }
    cur += (cur.length > 0 ? "\n\n" : "") + p;
  }
  if (cur.trim()) chunks.push(cur.trim());

  console.log("[recreate] TTS:", chunks.length, "chunks from", paragraphs.length, "paragraphs");

  const chunkFiles = [];
  for (let i = 0; i < chunks.length; i++) {
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: chunks[i],
        model_id: "eleven_v3",
        language_code: langCode || "vi",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    });

    if (!ttsRes.ok) throw new Error(`ElevenLabs error chunk ${i}: ${await ttsRes.text()}`);

    const cf = path.join(ttsDir, `c-${i}.mp3`);
    fs.writeFileSync(cf, Buffer.from(await ttsRes.arrayBuffer()));
    chunkFiles.push(cf);

    await updateReCreateStatus(projectId, "generating_voice", 55 + Math.round(((i + 1) / chunks.length) * 10));
  }

  const narrationFile = path.join(workDir, "narration.mp3");
  if (chunkFiles.length === 1) {
    fs.copyFileSync(chunkFiles[0], narrationFile);
  } else {
    const lf = path.join(ttsDir, "list.txt");
    fs.writeFileSync(lf, chunkFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    await execAsync(`ffmpeg -f concat -safe 0 -i "${lf}" -c copy -y "${narrationFile}"`);
  }

  let durationSec = 60;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${narrationFile}"`);
    durationSec = parseFloat(stdout.trim()) || 60;
  } catch {}

  for (const f of chunkFiles) { try { fs.unlinkSync(f); } catch {} }

  console.log("[recreate] ✅ step 4 — narration:", durationSec.toFixed(1), "sec");
  await updateReCreateStatus(projectId, "generating_voice", 65);

  return { narrationFile, durationSec };
}

/* ── [RECREATE STEP 4b] Re-transcribe narration for synced captions ── */
/* ✅ FIX 2: Uses Whisper to get ACTUAL timestamps from the narration   */
/* This ensures captions match exactly what the narrator says and when   */
async function recreateStep4b_SyncCaptions(projectId, narrationFile, scenes, langCode) {
  await updateReCreateStatus(projectId, "generating_voice", 67);

  if (!OPENAI_API_KEY) {
    console.log("[recreate] no OPENAI_API_KEY — skipping caption re-sync");
    return null; // will fall back to text-weighted timing
  }

  console.log("[recreate] re-transcribing narration with Whisper for synced captions...");

  const audioBuffer = fs.readFileSync(narrationFile);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

  const fd = new FormData();
  fd.append("file", blob, "narration.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");
  if (langCode && langCode !== "en") {
    fd.append("language", langCode);
  }

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });

    if (!res.ok) {
      console.warn("[recreate] Whisper re-transcription failed:", res.status);
      return null;
    }

    const result = await res.json();
    const whisperSegs = result.segments || [];

    if (whisperSegs.length === 0) {
      console.log("[recreate] Whisper returned 0 segments");
      return null;
    }

    // Build SRT from Whisper's detected segments (perfect timing)
    const syncedCaptions = whisperSegs.map((ws, i) => ({
      text: ws.text?.trim() || "",
      start: ws.start,
      end: ws.end,
      index: i,
    }));

    console.log("[recreate] ✅ step 4b — got", syncedCaptions.length, "Whisper-synced caption segments");
    return syncedCaptions;
  } catch (e) {
    console.warn("[recreate] Whisper re-transcription error:", e?.message);
    return null;
  }
}

/* ── [RECREATE STEP 5] Assemble video — v7 improvements ────── */
async function recreateStep5_Render(projectId, scenes, narrationFile, durationSec, workDir, includeCaptions, syncedCaptions) {
  await updateReCreateStatus(projectId, "rendering", 70);

  const W = 1920, H = 1080, FPS = 30;
  const validScenes = scenes.filter((s) => s.local_file && fs.existsSync(s.local_file));
  if (validScenes.length === 0) throw new Error("No media found for any scene");

  // ✅ FIX 1: Text-WEIGHTED scene durations
  // Longer text = more screen time. This is WAY better than equal distribution
  // because ElevenLabs speaks more text = takes more time = scene should be longer
  const textLengths = validScenes.map((s) => (s.text || "").length);
  const totalTextLen = textLengths.reduce((a, b) => a + b, 0) || 1;
  const sceneDurations = textLengths.map((len) => {
    const weight = len / totalTextLen;
    // Minimum 5s per scene, distribute rest proportionally
    return Math.max(5, weight * durationSec);
  });

  // Normalize to exactly match narration duration
  const rawTotal = sceneDurations.reduce((a, b) => a + b, 0);
  const scaleFactor = durationSec / rawTotal;
  const finalDurations = sceneDurations.map((d) => d * scaleFactor);

  console.log(`[recreate] rendering ${validScenes.length} scenes, text-weighted durations:`);
  finalDurations.forEach((d, i) => {
    console.log(`[recreate]   scene ${i + 1}: ${d.toFixed(1)}s (${textLengths[i]} chars)`);
  });
  console.log(`[recreate]   total: ${finalDurations.reduce((a, b) => a + b, 0).toFixed(1)}s vs narration: ${durationSec.toFixed(1)}s`);

  const segDir = path.join(workDir, "segs");
  fs.mkdirSync(segDir, { recursive: true });

  // ✅ FIX 5: Add crossfade overlap duration
  const XFADE_DUR = 0.5; // 0.5s crossfade between scenes

  const segFiles = [];
  for (let i = 0; i < validScenes.length; i++) {
    const sc = validScenes[i];
    // Add extra time to account for crossfade overlap (except last scene)
    const dur = finalDurations[i] + (i < validScenes.length - 1 ? XFADE_DUR : 0);
    const sf = path.join(segDir, `s-${String(i).padStart(3, "0")}.mp4`);

    if (sc.media_type === "video") {
      await execAsync(
        `ffmpeg -stream_loop -1 -i "${sc.local_file}" -t ${dur} ` +
        `-vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" ` +
        `-an -c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p -r ${FPS} -y "${sf}"`
      );
    } else {
      const zd = Math.random() > 0.5;
      const frames = Math.ceil(dur * FPS);
      const zf = zd
        ? `zoompan=z='min(zoom+0.0008,1.25)':d=${frames}:s=${W}x${H}:fps=${FPS}`
        : `zoompan=z='if(eq(on,0),1.25,max(zoom-0.0008,1))':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      await execAsync(
        `ffmpeg -loop 1 -i "${sc.local_file}" -t ${dur} -vf "${zf},setsar=1" ` +
        `-c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p -r ${FPS} -y "${sf}"`
      );
    }

    if (fs.existsSync(sf)) segFiles.push(sf);
    await updateReCreateStatus(projectId, "rendering", 70 + Math.round(((i + 1) / validScenes.length) * 8));
  }

  // ✅ FIX 5: Use xfade filter for smooth crossfade transitions
  let rawVideo;
  if (segFiles.length === 1) {
    rawVideo = segFiles[0];
  } else if (segFiles.length <= 3) {
    // For 2-3 segments, use xfade chain directly
    rawVideo = path.join(workDir, "raw.mp4");
    let filterComplex = "";
    let lastStream = "[0:v]";
    for (let i = 1; i < segFiles.length; i++) {
      const offset = finalDurations.slice(0, i).reduce((a, b) => a + b, 0) - (XFADE_DUR * (i - 1));
      const outLabel = i < segFiles.length - 1 ? `[v${i}]` : `[vout]`;
      filterComplex += `${lastStream}[${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)}${outLabel};`;
      lastStream = outLabel;
    }
    filterComplex = filterComplex.slice(0, -1); // remove trailing semicolon

    const inputs = segFiles.map((f) => `-i "${f}"`).join(" ");
    try {
      await execAsync(
        `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[vout]" ` +
        `-c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p -r ${FPS} -y "${rawVideo}"`
      );
    } catch (xfadeErr) {
      // Fallback to simple concat if xfade fails
      console.log("[recreate] xfade failed, falling back to concat:", xfadeErr?.message?.slice(0, 100));
      const cl = path.join(segDir, "list.txt");
      fs.writeFileSync(cl, segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
      await execAsync(`ffmpeg -f concat -safe 0 -i "${cl}" -c copy -y "${rawVideo}"`);
    }
  } else {
    // For many segments, concat is more reliable (xfade chains get complex)
    rawVideo = path.join(workDir, "raw.mp4");
    const cl = path.join(segDir, "list.txt");
    fs.writeFileSync(cl, segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    await execAsync(`ffmpeg -f concat -safe 0 -i "${cl}" -c copy -y "${rawVideo}"`);
  }

  // Verify raw video duration
  let rawDuration = 0;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawVideo}"`);
    rawDuration = parseFloat(stdout.trim()) || 0;
  } catch {}
  console.log(`[recreate] raw video: ${rawDuration.toFixed(1)}s, narration: ${durationSec.toFixed(1)}s`);

  await updateReCreateStatus(projectId, "rendering", 85);

  // Combine video + audio + optional captions
  const finalFile = path.join(workDir, "final.mp4");

  if (includeCaptions) {
    const srtFile = path.join(workDir, "subs.srt");
    let srt = "";

    if (syncedCaptions && syncedCaptions.length > 0) {
      // ✅ FIX 2: Use Whisper-synced captions (PERFECT timing)
      console.log("[recreate] using Whisper-synced captions:", syncedCaptions.length, "segments");
      for (let i = 0; i < syncedCaptions.length; i++) {
        const cap = syncedCaptions[i];
        srt += `${i + 1}\n${fmtSRT(cap.start)} --> ${fmtSRT(cap.end)}\n${cap.text}\n\n`;
      }
    } else {
      // Fallback: text-weighted timing (better than equal distribution)
      console.log("[recreate] using text-weighted caption timing (Whisper sync unavailable)");
      let timeOffset = 0;
      for (let i = 0; i < scenes.length; i++) {
        const dur = finalDurations[i] || (durationSec / scenes.length);
        srt += `${i + 1}\n${fmtSRT(timeOffset)} --> ${fmtSRT(timeOffset + dur)}\n${scenes[i].text || ""}\n\n`;
        timeOffset += dur;
      }
    }

    fs.writeFileSync(srtFile, srt);

    // ffmpeg subtitles path escaping
    let srtEscaped;
    if (process.platform === "win32") {
      srtEscaped = srtFile.replace(/\\/g, "/").replace(/:/g, "\\\\:");
    } else {
      srtEscaped = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");
    }

    try {
      // ✅ FIX 6: Add 2s audio fade-out at end for clean finish
      const fadeStart = Math.max(0, durationSec - 2);
      await execAsync(
        `ffmpeg -i "${rawVideo}" -i "${narrationFile}" ` +
        `-vf "subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=30'" ` +
        `-af "afade=t=out:st=${fadeStart.toFixed(2)}:d=2" ` +
        `-c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 192k -y "${finalFile}"`
      );
    } catch (subErr) {
      console.log("[recreate] ⚠ subtitle burn failed, rendering without captions:", subErr.message?.slice(0, 100));
      await execAsync(
        `ffmpeg -i "${rawVideo}" -i "${narrationFile}" ` +
        `-af "afade=t=out:st=${Math.max(0, durationSec - 2).toFixed(2)}:d=2" ` +
        `-c:v copy -c:a aac -b:a 192k -y "${finalFile}"`
      );
    }
  } else {
    const fadeStart = Math.max(0, durationSec - 2);
    await execAsync(
      `ffmpeg -i "${rawVideo}" -i "${narrationFile}" ` +
      `-af "afade=t=out:st=${fadeStart.toFixed(2)}:d=2" ` +
      `-c:v copy -c:a aac -b:a 192k -y "${finalFile}"`
    );
  }

  if (!fs.existsSync(finalFile)) throw new Error("Final assembly failed");

  // Verify final duration
  let finalDuration = 0;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalFile}"`);
    finalDuration = parseFloat(stdout.trim()) || 0;
  } catch {}
  console.log(`[recreate] ✅ step 5 — final video: ${finalDuration.toFixed(1)}s (narration: ${durationSec.toFixed(1)}s)`);

  await updateReCreateStatus(projectId, "rendering", 90);
  return finalFile;
}

/* SRT timestamp */
function fmtSRT(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/* Language code mapper */
function getReCreateLangCode(name) {
  const m = { English: "en", Vietnamese: "vi", Spanish: "es", Chinese: "zh", Korean: "ko", Japanese: "ja", Hindi: "hi", French: "fr", Portuguese: "pt", Arabic: "ar", Thai: "th", Indonesian: "id", German: "de", Russian: "ru", Turkish: "tr", Filipino: "tl" };
  return m[name] || "en";
}

/* ── MAIN RECREATE PIPELINE v7 ────────────────────────────── */
async function runReCreate(projectId, sourceUrl, opts = {}) {
  const { targetLanguage = "Vietnamese", style = "news", voiceId = null, includeCaptions = true } = opts;
  const langCode = getReCreateLangCode(targetLanguage);
  const workDir = path.join(os.tmpdir(), `recreate-${projectId}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const { data: proj } = await admin.from("recreate_projects").select("user_id").eq("id", projectId).single();
    const userId = proj?.user_id;

    const transcript = await recreateStep1_Transcribe(projectId, sourceUrl, workDir);
    const scenes = await recreateStep2_GenerateScript(projectId, transcript, targetLanguage, style);
    const scenesMedia = await recreateStep3_FindMedia(projectId, scenes, workDir);
    const { narrationFile, durationSec } = await recreateStep4_TTS(projectId, scenesMedia, voiceId, workDir, langCode);

    // ✅ NEW: Get Whisper-synced captions for perfect timing
    let syncedCaptions = null;
    if (includeCaptions) {
      syncedCaptions = await recreateStep4b_SyncCaptions(projectId, narrationFile, scenesMedia, langCode);
    }

    const finalFile = await recreateStep5_Render(projectId, scenesMedia, narrationFile, durationSec, workDir, includeCaptions, syncedCaptions);

    // Upload
    await updateReCreateStatus(projectId, "uploading", 92);
    const fileBuffer = fs.readFileSync(finalFile);
    const objPath = `${userId}/${projectId}/recreated.mp4`;

    try {
      const { data: buckets } = await admin.storage.listBuckets();
      if (!buckets?.find((b) => b.name === RECREATE_BUCKET)) {
        await admin.storage.createBucket(RECREATE_BUCKET, { public: true });
      }
    } catch {}

    const { error: upErr } = await admin.storage.from(RECREATE_BUCKET).upload(objPath, fileBuffer, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: urlData } = admin.storage.from(RECREATE_BUCKET).getPublicUrl(objPath);

    await updateReCreateStatus(projectId, "done", 100, { final_video_url: urlData?.publicUrl });
    console.log("[recreate] 🎉 COMPLETE:", urlData?.publicUrl);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

/* ── POST /recreate ───────────────────────────────────────── */
app.post("/recreate", async (req, res) => {
  const { project_id, source_url, target_language, style, voice_id, include_captions } = req.body || {};

  if (!project_id) return jsonError(res, 400, "Missing project_id");
  if (!source_url) return jsonError(res, 400, "Missing source_url");

  console.log("[recreate] POST — project:", project_id, "lang:", target_language, "style:", style);
  res.status(202).json({ ok: true, accepted: true, project_id });

  setImmediate(async () => {
    try {
      await runReCreate(project_id, source_url, {
        targetLanguage: target_language || "Vietnamese",
        style: style || "news",
        voiceId: voice_id || null,
        includeCaptions: include_captions !== false,
      });
    } catch (e) {
      console.error("[recreate] ❌ FAILED:", e?.message || e);
      try {
        await admin.from("recreate_projects").update({
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
  console.log(`[render-webhook] endpoints: GET / | POST /render | POST /dub | POST /shorts | POST /repurpose | POST /recreate`);
});
