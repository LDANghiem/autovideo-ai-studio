// ============================================================
// FILE: src/app/api/projects/start-render/route.ts
// ============================================================
// ALL PATCHES APPLIED:
//   🆕 PEXELS: Pexels real-photo support
//   🆕 VOICE PICKER: ElevenLabs for non-English + native Vietnamese voice
//   🆕 PEXELS QUERY: Improved search query generation for accurate photos
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type AnySupabaseClient = SupabaseClient<any, any, any>;
export const runtime = "nodejs";

type CaptionWord = { word: string; start: number; end: number };

type Scene = {
  index: number;
  title: string;
  narrationText: string;
  imagePrompt: string;
  imageUrl: string | null;
  imageObjectPath: string | null;
  startSec: number;
  endSec: number;
  transition: "crossfade" | "fade-black" | "slide-left" | "zoom-in";
  imageSource?: "pexels" | "dalle";
};

type SceneSplitResult = {
  index: number;
  title: string;
  narrationText: string;
  imagePrompt: string;
  startWordIndex: number;
  endWordIndex: number;
  transition: string;
};

type ProjectRow = {
  id: string;
  user_id: string;
  status: string | null;
  topic: string | null;
  topic_instructions: string | null;
  style: string | null;
  voice: string | null;
  length: string | null;
  resolution: string | null;
  language: string | null;
  tone: string | null;
  music: string | null;
  script: string | null;
  video_url: string | null;
  pending_video_url: string | null;
  active_job_id: string | null;
  render_attempt: number | null;
  voice_provider: string | null;
  voice_id: string | null;
  audio_url: string | null;
  audio_object_path: string | null;
  caption_words: CaptionWord[] | null;
  scenes: Scene[] | null;
  image_source: string | null;
  elevenlabs_voice_id: string | null;  // 🆕 VOICE PICKER
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function lengthToSeconds(lengthStr: string | null): number {
  if (!lengthStr) return 60;
  const s = String(lengthStr).toLowerCase().trim();
  const secMatch = s.match(/(\d+)\s*(sec|secs|second|seconds)\b/);
  if (secMatch) return clamp(Number(secMatch[1]), 10, 1800);
  const minMatch = s.match(/(\d+)\s*(min|mins|minute|minutes)\b/);
  if (minMatch) return clamp(Number(minMatch[1]) * 60, 10, 1800);
  if (s.includes("5")) return 300;
  if (s.includes("8")) return 480;
  if (s.includes("12")) return 720;
  if (s.includes("16")) return 960;
  if (s.includes("20")) return 1200;
  if (s.includes("24")) return 1440;
  if (s.includes("30")) return 1800;
  return 60;
}

function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

/* ============================================================
   Script Generation
============================================================ */

function buildPrompt(p: ProjectRow) {
  const topic = p.topic ?? "Untitled video";
  const style = p.style ?? "modern";
  const tone = p.tone ?? "friendly";
  const language = p.language ?? "English";
  const seconds = lengthToSeconds(p.length);
  const targetWords = Math.round(seconds * 2.2);
  const minWords = Math.round(targetWords * 0.92);
  const instructions = p.topic_instructions;
  const hasInstructions = typeof instructions === "string" && instructions.trim().length > 0;

  return `
Write a YouTube-style narration script.

Constraints:
- Language: ${language}
- Tone: ${tone}
- Style: ${style}
- Topic: "${topic}"
- Target duration: ${seconds} seconds (~${targetWords} words)
- Minimum length: ${minWords} words (DO NOT be shorter)

${hasInstructions ? "Additional topic instructions:\n" + instructions!.trim() + "\n" : ""}

Output format (plain text, no markdown):
1) Title (1 line)
2) Hook (1-2 lines)
3) Main script (multiple short paragraphs; detailed)
4) Quick recap (1-2 lines)
5) Call to action (1 line)

Important:
- If the topic says a specific number (e.g. "5 tips", "10 places", "3 reasons"), you MUST cover EXACTLY that many items. Do not skip any.
- If the script is short, expand with substance (steps, examples, mini-story, details).
- Avoid filler and repetition, but do not be brief.
`.trim();
}

async function generateScriptWithOpenAI(p: ProjectRow) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const seconds = lengthToSeconds(p.length);
  const targetWords = Math.round(seconds * 2.2);
  const minWords = Math.round(targetWords * 0.92);
  const basePrompt = buildPrompt(p);

  async function runOnce(extra?: string) {
    const prompt = extra ? basePrompt + "\n\n" + extra : basePrompt;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You write scripts that match the requested duration." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error?.message || "OpenAI error (" + resp.status + ")");
    }
    const text: string = json?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("OpenAI returned empty script");
    return text;
  }

  let script = await runOnce();
  let words = countWords(script);

  if (words < minWords) {
    script = await runOnce(
      "Too short (" + words + " words). Rewrite the FULL script to be at least " + minWords + " words (target ~" + targetWords + "). Add substance, not filler."
    );
    words = countWords(script);
  }

  if (words < minWords) {
    console.warn("[start-render] script still short: " + words + " (min " + minWords + ")");
  }

  return script;
}

/* ============================================================
   TTS — OpenAI
============================================================ */

async function generateTtsMp3(script: string, voiceId: string, voiceInstructions?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const body: any = {
    model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    voice: (voiceId || "coral").trim(),
    format: "mp3",
    input: script,
  };

  if (voiceInstructions) {
    body.instructions = voiceInstructions;
  }

  console.log("[tts] voice:", body.voice, "instructions:", voiceInstructions ? voiceInstructions.slice(0, 60) + "..." : "(none)");

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("OpenAI TTS failed (" + resp.status + "): " + (t || "No body"));
  }
  return Buffer.from(await resp.arrayBuffer());
}

/* ============================================================
   TTS — ElevenLabs (for non-English)
   🆕 VOICE PICKER: Native Vietnamese voice + eleven_v3 model
============================================================ */

const ELEVENLABS_RENDER_VOICES: Record<string, {
  voiceId: string; model: string; languageCode: string;
}> = {
  // 🆕 Vietnamese uses native voice + v3 model for best tonal accuracy
  vi: { voiceId: "0ggMuQ1r9f9jqBu50nJn", model: "eleven_v3",             languageCode: "vi" },
  th: { voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_flash_v2_5",     languageCode: "th" },
  es: { voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2", languageCode: "es" },
  pt: { voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2", languageCode: "pt" },
  fr: { voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2", languageCode: "fr" },
  id: { voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2", languageCode: "id" },
  de: { voiceId: "9BWtsMINqrJLrRacOk9x", model: "eleven_multilingual_v2", languageCode: "de" },
  ja: { voiceId: "9BWtsMINqrJLrRacOk9x", model: "eleven_multilingual_v2", languageCode: "ja" },
  ko: { voiceId: "9BWtsMINqrJLrRacOk9x", model: "eleven_multilingual_v2", languageCode: "ko" },
  hi: { voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_multilingual_v2", languageCode: "hi" },
  ar: { voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_multilingual_v2", languageCode: "ar" },
  zh: { voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_multilingual_v2", languageCode: "zh" },
};

const LANG_NAME_TO_CODE: Record<string, string> = {
  vietnamese: "vi", spanish: "es", portuguese: "pt", french: "fr",
  german: "de", japanese: "ja", korean: "ko", hindi: "hi",
  arabic: "ar", chinese: "zh", "chinese (mandarin)": "zh",
  indonesian: "id", thai: "th",
};

async function generateTtsElevenLabsRender(
  text: string,
  langCode: string,
  customVoiceId?: string | null
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

  const config = ELEVENLABS_RENDER_VOICES[langCode] || ELEVENLABS_RENDER_VOICES["es"];
  const voiceId = customVoiceId || config.voiceId;

  console.log("[tts-elevenlabs] voice=" + voiceId + " model=" + config.model + " lang=" + config.languageCode);

  const resp = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voiceId, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: config.model,
      language_code: config.languageCode,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error("ElevenLabs TTS failed (" + resp.status + "): " + errText);
  }

  return Buffer.from(await resp.arrayBuffer());
}

/* ============================================================
   Audio Upload
============================================================ */

async function uploadAudioAndGetPublicUrl(opts: {
  supabaseUrl: string;
  admin: AnySupabaseClient;
  bucket: string;
  userId: string;
  projectId: string;
  attempt: number;
  mp3: Buffer;
}) {
  const { supabaseUrl, admin, bucket, userId, projectId, attempt, mp3 } = opts;
  const objectPath = userId + "/" + projectId + "/attempt-" + attempt + ".mp3";

  const { error } = await admin.storage.from(bucket).upload(objectPath, mp3, {
    contentType: "audio/mpeg",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);

  return {
    publicUrl: supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + objectPath,
    objectPath,
  };
}

/* ============================================================
   Whisper Captions
============================================================ */

async function transcribeWordsFromMp3(mp3: Buffer): Promise<CaptionWord[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const fd = new FormData();
  const blob = new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" });
  fd.append("file", blob, "narration.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: fd,
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Transcription failed (" + resp.status + ")");
  }

  const words = Array.isArray(json?.words) ? (json.words as any[]) : [];
  return words
    .map((w: any) => ({
      word: String(w.word ?? "").trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
    }))
    .filter(
      (w: CaptionWord) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start
    );
}

/* ============================================================
   Scene Splitting (GPT)
============================================================ */

async function splitScriptIntoScenes(opts: {
  script: string;
  captionWords: CaptionWord[];
  topic: string;
  style: string;
  tone: string;
  durationSec: number;
  videoType: string;
}): Promise<Scene[]> {
  const { script, captionWords, topic, style, tone, durationSec, videoType } = opts;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const isVertical = videoType === "youtube_shorts" || videoType === "tiktok";
  const aspectRatio = isVertical ? "9:16 portrait (vertical)" : "16:9 landscape";

  const targetScenes = durationSec <= 60
    ? Math.max(4, Math.min(8, Math.round(durationSec / 8)))
    : Math.max(5, Math.min(15, Math.round(durationSec / 15)));

  const prompt = [
    "You are a professional video director creating scene breakdowns for a YouTube video.",
    "",
    "Topic: \"" + topic + "\"",
    "Style: " + style,
    "Tone: " + tone,
    "Duration: " + durationSec + " seconds",
    "Total words: " + captionWords.length,
    "Target scenes: " + targetScenes,
    "",
    "SCRIPT:",
    "\"\"\"",
    script,
    "\"\"\"",
    "",
    "Split this into exactly " + targetScenes + " visual scenes. For each provide:",
    "1. \"title\": short label (2-4 words)",
    "2. \"narrationText\": the exact script portion for this scene",
    "3. \"imagePrompt\": a SPECIFIC image generation prompt",
    "4. \"startWordIndex\": starting word index (0-based)",
    "5. \"endWordIndex\": ending word index (0-based, inclusive)",
    "6. \"transition\": one of \"crossfade\", \"fade-black\", \"slide-left\", \"zoom-in\"",
    "",
    "CRITICAL IMAGE PROMPT RULES:",
    "- NEVER combine two subjects in one scene.",
    "- Each scene MUST show ONE specific subject, location, or moment",
    "- If the script lists items, create a SEPARATE scene for EACH item",
    "- Each image must be VISUALLY DISTINCT from every other scene",
    "- Describe a SINGLE camera shot: wide establishing shot, close-up, aerial view, etc.",
    "- Include specific details: time of day, weather, lighting, colors, textures, architecture",
    "- If the narration mentions a specific place, describe THAT EXACT place",
    "- NO text, watermarks, labels, numbers, or writing in the image",
    "- Style: " + style + ", cinematic, high quality, " + aspectRatio + " aspect ratio, photorealistic",
    "",
    "SCENE RULES:",
    "- Create exactly " + targetScenes + " scenes (or close to it)",
    "- Cover the ENTIRE script with no gaps",
    "- Each scene: 5-15 seconds of narration",
    "- NEVER combine two different topics into one scene",
    "- Match scene breaks to natural topic transitions",
    "- First and last scene transition: \"fade-black\"",
    "- Vary other transitions for visual interest",
    "",
    "Respond with ONLY a valid JSON array. No markdown, no explanation.",
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: "You are a professional video director. Always respond with valid JSON arrays only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI scene split error");
  }

  let rawText: string = json?.choices?.[0]?.message?.content?.trim() || "";
  rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  let rawScenes: SceneSplitResult[];
  try {
    rawScenes = JSON.parse(rawText);
  } catch {
    throw new Error("Failed to parse scene JSON from GPT");
  }

  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error("GPT returned empty scene array");
  }

  const validTransitions = ["crossfade", "fade-black", "slide-left", "zoom-in"];

  const wordTexts = captionWords.map((w) =>
    w.word.toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  function findPhraseStart(text: string, searchAfter: number): number {
    if (!text) return -1;
    const phraseWords = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (phraseWords.length < 3) return -1;

    const seqLen = 3;
    for (let offset = 0; offset < Math.min(phraseWords.length - seqLen + 1, 8); offset++) {
      const seq = phraseWords.slice(offset, offset + seqLen);
      for (let i = Math.max(0, searchAfter); i <= wordTexts.length - seqLen; i++) {
        let match = true;
        for (let j = 0; j < seqLen; j++) {
          if (!wordTexts[i + j].includes(seq[j])) {
            match = false;
            break;
          }
        }
        if (match) return i;
      }
    }

    for (let offset = 0; offset < Math.min(phraseWords.length - 1, 6); offset++) {
      const w1 = phraseWords[offset];
      const w2 = phraseWords[offset + 1];
      if (w1.length < 5 && w2.length < 5) continue;
      for (let i = Math.max(0, searchAfter); i <= wordTexts.length - 2; i++) {
        if (wordTexts[i].includes(w1) && wordTexts[i + 1].includes(w2)) {
          return i;
        }
      }
    }

    return -1;
  }

  let lastMatchedIdx = 0;

  const scenes: Scene[] = rawScenes.map((raw, i) => {
    const gptStartIdx = Math.max(0, Math.min(raw.startWordIndex ?? 0, captionWords.length - 1));

    let smartIdx = findPhraseStart(raw.narrationText || "", lastMatchedIdx);
    if (smartIdx < 0) {
      smartIdx = findPhraseStart(raw.title || "", lastMatchedIdx);
    }

    let finalIdx: number;
    if (smartIdx >= 0) {
      finalIdx = smartIdx;
    } else {
      finalIdx = Math.max(gptStartIdx, lastMatchedIdx);
    }

    if (i === 0) finalIdx = 0;

    const startSec = i === 0
      ? 0
      : Math.max(0, (captionWords[finalIdx]?.start ?? (i * (durationSec / rawScenes.length))) - 1.0);

    console.log(
      "[scenes] timing scene-" + i + " (" + (raw.title || "?") + "):" +
      " gptIdx=" + gptStartIdx +
      " smartIdx=" + smartIdx +
      " finalIdx=" + finalIdx +
      " startSec=" + startSec.toFixed(1) + "s"
    );

    lastMatchedIdx = finalIdx + 1;

    const transition = validTransitions.includes(raw.transition)
      ? (raw.transition as Scene["transition"])
      : "crossfade";

    return {
      index: i,
      title: raw.title || "Scene " + (i + 1),
      narrationText: raw.narrationText || "",
      imagePrompt: raw.imagePrompt || "",
      imageUrl: null,
      imageObjectPath: null,
      startSec,
      endSec: 0,
      transition,
    };
  });

  for (let i = 0; i < scenes.length - 1; i++) {
    scenes[i].endSec = scenes[i + 1].startSec;
  }
  scenes[scenes.length - 1].endSec = durationSec;

  for (let i = 0; i < scenes.length; i++) {
    if (scenes[i].endSec <= scenes[i].startSec) {
      scenes[i].endSec = scenes[i].startSec + (durationSec / scenes.length);
    }
  }

  for (const s of scenes) {
    console.log(
      "[scenes] FINAL scene-" + s.index +
      " (" + s.title + "): " +
      s.startSec.toFixed(1) + "s - " +
      s.endSec.toFixed(1) + "s (" +
      (s.endSec - s.startSec).toFixed(1) + "s)"
    );
  }

  return scenes;
}

/* ============================================================
   Image Generation (DALL-E) — with retry + fallback prompt
============================================================ */

async function callImageApi(imagePrompt: string, imageSize?: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.IMAGE_MODEL || "dall-e-3";
  const quality = process.env.IMAGE_QUALITY || "standard";
  const size = imageSize || process.env.IMAGE_SIZE || "1792x1024";

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: imagePrompt,
      n: 1,
      size,
      quality,
      response_format: "b64_json",
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Image gen failed (" + resp.status + ")");
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");

  return Buffer.from(b64, "base64");
}

async function generateOneImage(imagePrompt: string, sceneTitle: string, imageSize?: string): Promise<Buffer> {
  try {
    return await callImageApi(imagePrompt, imageSize);
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    console.warn("[scenes]   attempt 1 failed: " + err?.message);

    if (msg.includes("rate") || msg.includes("429") || msg.includes("too many")) {
      console.log("[scenes]   rate limited, waiting 8 seconds...");
      await new Promise((r) => setTimeout(r, 8000));
      try {
        return await callImageApi(imagePrompt, imageSize);
      } catch (err2: any) {
        console.warn("[scenes]   retry after rate limit also failed: " + err2?.message);
      }
    }

    if (msg.includes("safety") || msg.includes("policy") || msg.includes("content") || msg.includes("refused")) {
      const safePrompt = "A beautiful cinematic landscape photograph of " + sceneTitle + ". Golden hour lighting, dramatic clouds, photorealistic, no text, no people, no religious symbols. High quality professional photography.";
      console.log("[scenes]   retrying with safe prompt for: " + sceneTitle);
      try {
        return await callImageApi(safePrompt, imageSize);
      } catch (err3: any) {
        console.warn("[scenes]   safe prompt also failed: " + err3?.message);
      }
    }

    const fallbackPrompt = "Beautiful cinematic wide shot of " + sceneTitle + ". Dramatic lighting, vivid colors, photorealistic landscape, no text or watermarks.";
    console.log("[scenes]   retrying with fallback prompt for: " + sceneTitle);
    return await callImageApi(fallbackPrompt, imageSize);
  }
}

/* ============================================================
   Pexels: Search for a single scene
============================================================ */

async function searchPexelsForScene(
  searchQuery: string,
  orientation: "landscape" | "portrait"
): Promise<{ url: string; photographer: string; photographerUrl: string } | null> {
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_API_KEY) {
    console.warn("[pexels] PEXELS_API_KEY not configured, skipping");
    return null;
  }

  const params = new URLSearchParams({
    query: searchQuery,
    orientation,
    per_page: "3",
    size: "large",
  });

  try {
    const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!resp.ok) {
      console.warn("[pexels] API error: " + resp.status);
      return null;
    }

    const data: any = await resp.json();
    const photos = data?.photos;

    if (!photos || photos.length === 0) {
      // 🆕 PEXELS QUERY: Keep 3 words to preserve place name + country
      const simplified = searchQuery.split(" ").slice(0, 3).join(" ");
      console.log("[pexels]   no results for '" + searchQuery + "', retrying with '" + simplified + "'");

      const retryParams = new URLSearchParams({
        query: simplified,
        orientation,
        per_page: "3",
        size: "large",
      });

      const retryResp = await fetch(`https://api.pexels.com/v1/search?${retryParams}`, {
        headers: { Authorization: PEXELS_API_KEY },
      });

      if (!retryResp.ok) return null;

      const retryData: any = await retryResp.json();
      if (!retryData?.photos?.length) return null;

      const photo = retryData.photos[Math.floor(Math.random() * retryData.photos.length)];
      return {
        url: orientation === "portrait" ? photo.src.portrait : photo.src.landscape,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
      };
    }

    // Pick a random photo from top results for variety
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return {
      url: orientation === "portrait" ? photo.src.portrait : photo.src.landscape,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
    };
  } catch (err: any) {
    console.warn("[pexels] search error: " + err?.message);
    return null;
  }
}

/* ============================================================
   🆕 PEXELS QUERY: Improved scene → Pexels search query
   Now extracts exact place names + country for accurate results
============================================================ */

async function convertSceneToSearchQuery(imagePrompt: string, topic: string, sceneTitle?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const topicWords = topic.split(" ").filter(w => w.length > 3).slice(0, 2).join(" ");
    return (sceneTitle ? (sceneTitle + " " + topicWords).trim() : imagePrompt.split(" ").slice(0, 4).join(" ")).slice(0, 50);
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `You convert video scene descriptions into Pexels stock photo search queries.

CRITICAL RULES:
1. If the scene mentions a SPECIFIC PLACE (city, landmark, beach, building), the search query MUST include that exact place name + country.
   Example: "Da Nang beach" → "Da Nang beach Vietnam"
   Example: "Eiffel Tower at sunset" → "Eiffel Tower Paris"
   Example: "Santorini white buildings" → "Santorini Greece"

2. If the scene mentions a SPECIFIC FOOD, ANIMAL, or OBJECT, name it exactly.
   Example: "a bowl of pho" → "pho Vietnamese soup"
   Example: "cherry blossoms" → "cherry blossom Japan"

3. Use 2-6 words. Be SPECIFIC, not generic.
   BAD: "beautiful beach" (too generic, could be anywhere)
   GOOD: "Phuket beach Thailand" (specific location)
   BAD: "city skyline" (too generic)
   GOOD: "Ho Chi Minh City skyline" (specific)

4. NEVER use abstract or artistic words like "cinematic", "dramatic", "stunning", "golden hour".
   Pexels searches by SUBJECT, not by style.

5. Include the country or region name when the scene is about a place.

Reply with ONLY the search query, nothing else.`,
          },
          {
            role: "user",
            content: `Video topic: "${topic}"
Scene title: "${sceneTitle || "(none)"}"
Scene image description: "${imagePrompt}"

Best Pexels search query:`,
          },
        ],
      }),
    });

    const json: any = await resp.json().catch(() => ({}));
    const query = json?.choices?.[0]?.message?.content?.trim();

    if (query && query.length > 0 && query.length < 80) {
      const cleaned = query.replace(/^["']|["']$/g, "").trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  } catch (err: any) {
    console.warn("[pexels] query conversion failed: " + err?.message);
  }

  // Improved fallback: scene title + topic keywords
  const topicWords = topic.split(" ").filter(w => w.length > 3).slice(0, 2).join(" ");
  const fallback = sceneTitle
    ? (sceneTitle + " " + topicWords).trim().slice(0, 50)
    : imagePrompt.split(" ").slice(0, 4).join(" ");

  return fallback;
}

/* ============================================================
   Scene Pipeline (split + generate images + upload)
============================================================ */

async function generateScenesWithImages(opts: {
  script: string;
  captionWords: CaptionWord[];
  topic: string;
  style: string;
  tone: string;
  durationSec: number;
  videoType: string;
  userId: string;
  projectId: string;
  attempt: number;
  supabaseUrl: string;
  admin: AnySupabaseClient;
  imageBucket: string;
  imageSource: string;
}): Promise<{ scenes: Scene[]; pexelsCredits: any[]; imageCost: number }> {
  const {
    script, captionWords, topic, style, tone, durationSec, videoType,
    userId, projectId, attempt, supabaseUrl, admin, imageBucket,
    imageSource,
  } = opts;

  const isVertical = videoType === "youtube_shorts" || videoType === "tiktok";
  const imageSize = isVertical ? "1024x1792" : "1792x1024";
  const pexelsOrientation = isVertical ? "portrait" as const : "landscape" as const;

  const useRealPhotos = imageSource === "real-photos";
  console.log("[scenes] imageSource:", imageSource, "useRealPhotos:", useRealPhotos);
  console.log("[scenes] videoType:", videoType, "imageSize:", imageSize);

  console.log("[scenes] splitting script into scenes...");

  const scenes = await splitScriptIntoScenes({
    script, captionWords, topic, style, tone, durationSec, videoType,
  });

  console.log("[scenes] got " + scenes.length + " scenes, generating images...");

  const pexelsCredits: { photographer: string; photographerUrl: string; sceneIndex: number }[] = [];
  let pexelsCount = 0;
  let dalleCount = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const label = "scene-" + String(scene.index).padStart(2, "0");

    try {
      if (useRealPhotos) {
        console.log("[scenes]   " + label + " (" + scene.title + "): searching Pexels...");

        // 🆕 PEXELS QUERY: Pass scene title for better context
        const searchQuery = await convertSceneToSearchQuery(scene.imagePrompt, topic, scene.title);
        console.log("[scenes]   " + label + ": search query = '" + searchQuery + "'");

        const pexelsResult = await searchPexelsForScene(searchQuery, pexelsOrientation);

        if (pexelsResult) {
          scene.imageUrl = pexelsResult.url;
          scene.imageSource = "pexels";
          pexelsCredits.push({
            photographer: pexelsResult.photographer,
            photographerUrl: pexelsResult.photographerUrl,
            sceneIndex: scene.index,
          });
          pexelsCount++;
          console.log("[scenes]   " + label + ": ✅ Pexels photo by " + pexelsResult.photographer);

          if (i < scenes.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
          continue;
        }

        console.log("[scenes]   " + label + ": no Pexels results, falling back to DALL-E");
      }

      console.log("[scenes]   " + label + " (" + scene.title + "): generating DALL-E image...");
      const imgBuffer = await generateOneImage(scene.imagePrompt, scene.title, imageSize);

      const objectPath = userId + "/" + projectId + "/attempt-" + attempt + "/" + label + ".png";
      const { error: upErr } = await admin.storage
        .from(imageBucket)
        .upload(objectPath, imgBuffer, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "3600",
        });

      if (upErr) {
        console.warn("[scenes]   " + label + ": upload failed: " + upErr.message);
      } else {
        scene.imageUrl = supabaseUrl + "/storage/v1/object/public/" + imageBucket + "/" + objectPath;
        scene.imageObjectPath = objectPath;
        scene.imageSource = "dalle";
        dalleCount++;
        console.log("[scenes]   " + label + ": ✅ DALL-E done");
      }
    } catch (err: any) {
      console.error("[scenes]   " + label + ": ❌ ALL attempts failed: " + (err?.message || err));
    }

    if (i < scenes.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const successCount = scenes.filter((s) => s.imageUrl).length;
  const failCount = scenes.length - successCount;
  const imageCost = dalleCount * 0.08;

  console.log(
    "[scenes] done: " + successCount + "/" + scenes.length + " images" +
    " (Pexels: " + pexelsCount + ", DALL-E: " + dalleCount + ")" +
    " cost: $" + imageCost.toFixed(2) +
    " saved: $" + (pexelsCount * 0.08).toFixed(2) +
    (failCount > 0 ? " (" + failCount + " failed)" : "")
  );

  return { scenes, pexelsCredits, imageCost };
}

/* ============================================================
   Webhook Trigger
============================================================ */

async function triggerRenderWebhook(opts: {
  projectId: string;
  attempt: number;
  secret: string;
}) {
  const url = (process.env.RENDER_WEBHOOK_URL || "").trim();
  if (!url) throw new Error("Missing RENDER_WEBHOOK_URL");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret) headers["x-webhook-secret"] = opts.secret;

  const payload: any = { project_id: opts.projectId, attempt: opts.attempt };
  if (opts.secret) payload.secret = opts.secret;

  const timeoutMs = Number(process.env.RENDER_WEBHOOK_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) {
      throw new Error("Render webhook failed (" + r.status + "): " + (text || "No body"));
    }
    console.log("[start-render] webhook ok: " + (text || "").slice(0, 300));
    return null;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Render webhook timed out after " + timeoutMs + "ms");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/* ============================================================
   POST Handler
============================================================ */

export async function POST(req: Request) {
  const now = nowIso();

  try {
    const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const secret = (process.env.RENDER_WEBHOOK_SECRET || "").trim();
    const AUDIO_BUCKET = (process.env.AUDIO_BUCKET || "audio").trim();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const projectId = body?.project_id as string | undefined;
    const force = Boolean(body?.force);

    if (!projectId) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    /* ── load project ──────────────────────────────────────── */
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select(
        "id,user_id,status,topic,topic_instructions,style,voice,length," +
        "resolution,language,tone,music,script,video_url," +
        "pending_video_url,active_job_id,render_attempt," +
        "voice_provider,voice_id,audio_url,audio_object_path," +
        "caption_words,scenes,video_type,image_source," +
        "elevenlabs_voice_id"
      )
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single<ProjectRow>();

    if (projErr || !project) {
      return NextResponse.json(
        { error: projErr?.message || "Project not found" },
        { status: 404 }
      );
    }

    /* ── guard: already running ────────────────────────────── */
    const running = new Set(["queued", "processing", "rendering"]);
    if (!force && project.status && running.has(project.status)) {
      return NextResponse.json({
        ok: true,
        reused: true,
        status: project.status,
        render_attempt: project.render_attempt ?? 0,
        audio_url: project.audio_url ?? null,
      }, { status: 200 });
    }

    /* ── script ────────────────────────────────────────────── */
    const seconds = lengthToSeconds(project.length);
    const targetWords = Math.round(seconds * 2.2);
    const minWords = Math.round(targetWords * 0.92);

    let scriptGenerated = false;
    let script = project.script;

    if (!script || script.trim().length === 0 || countWords(script) < minWords) {
      script = await generateScriptWithOpenAI(project);
      scriptGenerated = true;

      const { error } = await admin
        .from("projects")
        .update({ script, updated_at: now, error_message: null })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    /* ── bump attempt ──────────────────────────────────────── */
    const nextAttempt = (project.render_attempt ?? 0) + 1;

    /* ── TTS -> upload -> Whisper ───────────────────────────── */
    const voiceLabel = (project.voice || "").toLowerCase().trim();
    const voiceMap: Record<string, string> = {
      "coral (warm female)": "coral",
      "nova (bright female)": "nova",
      "sage (calm male)": "sage",
      "ash (deep male)": "ash",
      "alloy (neutral)": "alloy",
      "echo (soft male)": "echo",
      "onyx (deep narrator)": "onyx",
      "shimmer (gentle female)": "shimmer",
      "fable (storyteller)": "fable",
      "ballad (expressive)": "ballad",
      "verse (clear)": "verse",
      "marin (crisp female)": "marin",
      "cedar (smooth male)": "cedar",
      "ai voice": "coral",
      "narrator": "onyx",
      "friendly": "nova",
      "serious": "ash",
    };
    const voiceId = voiceMap[voiceLabel] || "coral";
    console.log("[tts] voiceLabel:", JSON.stringify(voiceLabel), "→ voiceId:", voiceId);

    const toneLabel = (project.tone || "friendly").toLowerCase();
    const toneInstructions: Record<string, string> = {
      friendly: "Speak in a warm, friendly, and conversational tone. Be engaging and approachable, like talking to a good friend.",
      professional: "Speak in a clear, professional, and authoritative tone. Be measured and confident, like a news anchor.",
      excited: "Speak with high energy and enthusiasm! Be upbeat and dynamic, like a passionate presenter. Vary your pace for emphasis.",
      calm: "Speak in a calm, soothing, and measured tone. Be gentle and relaxed, like a meditation guide. Use a slower pace.",
    };
    const voiceInstructions = toneInstructions[toneLabel] || toneInstructions["friendly"];

    // 🆕 VOICE PICKER: Use ElevenLabs for non-English, OpenAI for English
    const projectLang = (project.language || "English").toLowerCase().trim();
    const langCode = LANG_NAME_TO_CODE[projectLang] || null;
    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
    const isNonEnglish = projectLang !== "english" && langCode;

    let mp3: Buffer;
    if (isNonEnglish && hasElevenLabs && langCode) {
      const customVoiceId = project.elevenlabs_voice_id || null;
      console.log("[tts] Using ElevenLabs for " + project.language + " (code: " + langCode + ")" +
        (customVoiceId ? " customVoice: " + customVoiceId : " defaultVoice"));
      mp3 = await generateTtsElevenLabsRender(script!, langCode, customVoiceId);
    } else {
      console.log("[tts] Using OpenAI TTS for " + project.language);
      mp3 = await generateTtsMp3(script!, voiceId, voiceInstructions);
    }

    const { publicUrl: audioUrl, objectPath: audioObjectPath } =
      await uploadAudioAndGetPublicUrl({
        supabaseUrl: SUPABASE_URL,
        admin,
        bucket: AUDIO_BUCKET,
        userId: user.id,
        projectId,
        attempt: nextAttempt,
        mp3,
      });

    const captionWords = await transcribeWordsFromMp3(mp3);

    /* ── scene generation + images ─────────────────────────── */
    console.log("[start-render] starting scene generation (image_source: " + (project.image_source || "ai-art") + ")...");

    let scenes: Scene[] | null = null;
    let pexelsCredits: any[] = [];
    let imageCost = 0;

    try {
      const result = await generateScenesWithImages({
        script: script!,
        captionWords,
        topic: project.topic ?? "Untitled",
        style: project.style ?? "cinematic",
        tone: project.tone ?? "friendly",
        durationSec: seconds,
        videoType: (project as any).video_type ?? "conventional",
        userId: user.id,
        projectId,
        attempt: nextAttempt,
        supabaseUrl: SUPABASE_URL,
        admin,
        imageBucket: process.env.SCENE_IMAGE_BUCKET || "scene-images",
        imageSource: project.image_source || "ai-art",
      });

      scenes = result.scenes;
      pexelsCredits = result.pexelsCredits;
      imageCost = result.imageCost;

      const imgCount = scenes ? scenes.filter((s) => s.imageUrl).length : 0;
      console.log("[start-render] scenes: " + (scenes ? scenes.length : 0) + ", images: " + imgCount);
    } catch (err: any) {
      console.error("[start-render] SCENE GENERATION FAILED:", err?.message);
      console.error("[start-render] stack:", err?.stack);
      scenes = null;
    }

    /* ── queue the project ─────────────────────────────────── */
    const oldUrl = project.video_url;

    const { data: queuedRow, error: queueErr } = await admin
      .from("projects")
      .update({
        status: "queued",
        error_message: null,
        updated_at: now,
        queued_at: now,
        render_attempt: nextAttempt,
        active_job_id: null,
        pending_video_url: oldUrl ?? null,
        audio_url: audioUrl,
        audio_object_path: audioObjectPath,
        audio_updated_at: now,
        caption_words: captionWords,
        scenes: scenes,
        pexels_credits: pexelsCredits,
        image_cost_usd: imageCost,
      })
      .eq("id", projectId)
      .eq("user_id", user.id)
      .select("id,status,render_attempt,video_url,pending_video_url,audio_url")
      .single();

    if (queueErr) {
      return NextResponse.json({ error: queueErr.message }, { status: 400 });
    }

    /* ── project_renders row ───────────────────────────────── */
    await admin.from("project_renders").upsert(
      {
        project_id: projectId,
        user_id: user.id,
        attempt: nextAttempt,
        status: "queued",
        started_at: null,
        completed_at: null,
        render_started_at: null,
        render_completed_at: null,
      },
      { onConflict: "project_id,attempt" }
    );

    /* ── trigger webhook ───────────────────────────────────── */
    try {
      await triggerRenderWebhook({ projectId, attempt: nextAttempt, secret });
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error("[start-render] webhook trigger failed:", message);

      await admin
        .from("projects")
        .update({ status: "error", error_message: message, updated_at: nowIso() })
        .eq("id", projectId)
        .eq("user_id", user.id);

      await admin
        .from("project_renders")
        .update({ status: "error", error_message: message, updated_at: nowIso() })
        .eq("project_id", projectId)
        .eq("attempt", nextAttempt);

      return NextResponse.json({ error: message }, { status: 500 });
    }

    /* ── success ───────────────────────────────────────────── */
    return NextResponse.json({
      ok: true,
      reused: false,
      scriptGenerated,
      requested_seconds: seconds,
      target_words: targetWords,
      min_words: minWords,
      actual_words: countWords(script!),
      render_attempt: (queuedRow as any)?.render_attempt ?? nextAttempt,
      status: (queuedRow as any)?.status ?? "queued",
      audio_url: (queuedRow as any)?.audio_url ?? audioUrl,
      caption_words_count: captionWords.length,
      scene_count: scenes?.length ?? 0,
      scene_images_count: scenes?.filter((s) => s.imageUrl).length ?? 0,
      image_source: project.image_source || "ai-art",
      pexels_images: scenes?.filter((s) => s.imageSource === "pexels").length ?? 0,
      dalle_images: scenes?.filter((s) => s.imageSource === "dalle").length ?? 0,
      image_cost_usd: imageCost,
      cost_saved_usd: (scenes?.filter((s) => s.imageSource === "pexels").length ?? 0) * 0.08,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}