// ============================================================
// FILE: src/app/api/projects/generate-dub/route.ts
// ============================================================
// REPLACES your existing generate-dub/route.ts
//
// WHAT CHANGED (search for "🆕 VOICE PROVIDER" to see changes):
//   1. Added VOICE_PROVIDERS config with OpenAI, ElevenLabs, Google
//   2. New helper: generateTtsElevenLabs()
//   3. New helper: generateTtsGoogle()
//   4. Updated POST handler to accept voice_provider param
//   5. TTS dispatch based on selected provider
//   6. Saves voice_provider, voice_model, tts_cost_usd to DB
//   7. GET endpoint now also returns available providers
//
// ENV VARS NEEDED:
//   OPENAI_API_KEY=...         (already have)
//   ELEVENLABS_API_KEY=...     (new — get from elevenlabs.io)
//   GOOGLE_TTS_API_KEY=...     (new — get from Google Cloud Console)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ──────────────────────────────────────────────
// 🆕 VOICE PROVIDER: Provider configurations
// ──────────────────────────────────────────────
const VOICE_PROVIDERS: Record<string, {
  name: string;
  icon: string;
  quality: number;        // 1-5 stars
  costPer1kChars: number; // USD
  speed: string;
  description: string;
  bestFor: string;
  requiresKey: string;    // env var name
}> = {
  openai: {
    name: "OpenAI TTS",
    icon: "🤖",
    quality: 3,
    costPer1kChars: 0.015,
    speed: "Fast",
    description: "Good for English, decent for other languages",
    bestFor: "English content, fast generation",
    requiresKey: "OPENAI_API_KEY",
  },
  elevenlabs: {
    name: "ElevenLabs",
    icon: "🎭",
    quality: 5,
    costPer1kChars: 0.30,
    speed: "Medium",
    description: "Best multilingual voices, most natural and expressive",
    bestFor: "Non-English dubbing, Vietnamese, Spanish, all languages",
    requiresKey: "ELEVENLABS_API_KEY",
  },
  google: {
    name: "Google Cloud TTS",
    icon: "🔊",
    quality: 4,
    costPer1kChars: 0.016,
    speed: "Fast",
    description: "Good quality Neural2 voices, very affordable",
    bestFor: "Budget-friendly dubbing, good quality at low cost",
    requiresKey: "GOOGLE_TTS_API_KEY",
  },
};

// ──────────────────────────────────────────────
// 🆕 VOICE PROVIDER: ElevenLabs voice mapping
// Maps language codes to recommended ElevenLabs voice IDs
// These are from ElevenLabs' multilingual voice library
// ──────────────────────────────────────────────
// DEFAULT VOICES — available to ALL ElevenLabs tiers (including free)
// These are ElevenLabs' built-in default voices optimized for multilingual use.
// 🔄 SWAP LATER: Replace voice IDs with Vietnamese community voices once on paid plan.
//    Go to: elevenlabs.io → Voice Library → filter "Vietnamese" → copy voice ID
//
// ⚠️ IMPORTANT MODEL NOTES:
//   - Vietnamese, Hungarian, Norwegian ONLY work on flash_v2_5 or turbo_v2_5
//   - eleven_multilingual_v2 does NOT support Vietnamese (will output wrong language!)
//   - All other languages work on eleven_multilingual_v2 (best quality)
const ELEVENLABS_VOICES: Record<string, {
  voiceId: string;
  voiceName: string;
  model: string;
  languageCode: string;  // ISO 639-1 — REQUIRED to force correct language
}> = {
  // ⚡ Vietnamese: MUST use flash_v2_5 (multilingual_v2 does NOT support Vietnamese)
  vi: { voiceId: "0ggMuQ1r9f9jqBu50nJn", voiceName: "Tham", model: "eleven_v3", languageCode: "vi" },
  // ⚡ Thai: also better on flash_v2_5
  th: { voiceId: "JBFqnCBsd6RMkjVDRZzb", voiceName: "George",  model: "eleven_flash_v2_5",     languageCode: "th" },

  // Warm male narrator — multilingual_v2 (best quality for these languages)
  zh: { voiceId: "JBFqnCBsd6RMkjVDRZzb", voiceName: "George",  model: "eleven_multilingual_v2", languageCode: "zh" },
  hi: { voiceId: "JBFqnCBsd6RMkjVDRZzb", voiceName: "George",  model: "eleven_multilingual_v2", languageCode: "hi" },
  ar: { voiceId: "JBFqnCBsd6RMkjVDRZzb", voiceName: "George",  model: "eleven_multilingual_v2", languageCode: "ar" },

  // Warm expressive female — great for Romance languages
  es: { voiceId: "pFZP5JQG7iQjIQuC4Bku", voiceName: "Lily",    model: "eleven_multilingual_v2", languageCode: "es" },
  pt: { voiceId: "pFZP5JQG7iQjIQuC4Bku", voiceName: "Lily",    model: "eleven_multilingual_v2", languageCode: "pt" },
  fr: { voiceId: "pFZP5JQG7iQjIQuC4Bku", voiceName: "Lily",    model: "eleven_multilingual_v2", languageCode: "fr" },
  id: { voiceId: "pFZP5JQG7iQjIQuC4Bku", voiceName: "Lily",    model: "eleven_multilingual_v2", languageCode: "id" },

  // Clear professional female — suits structured languages
  de: { voiceId: "9BWtsMINqrJLrRacOk9x", voiceName: "Aria",    model: "eleven_multilingual_v2", languageCode: "de" },
  ja: { voiceId: "9BWtsMINqrJLrRacOk9x", voiceName: "Aria",    model: "eleven_multilingual_v2", languageCode: "ja" },
  ko: { voiceId: "9BWtsMINqrJLrRacOk9x", voiceName: "Aria",    model: "eleven_multilingual_v2", languageCode: "ko" },
};

// 🆕 VOICE PROVIDER: Google Cloud TTS voice mapping
const GOOGLE_VOICES: Record<string, {
  languageCode: string;
  voiceName: string;
  ssmlGender: string;
}> = {
  es: { languageCode: "es-US", voiceName: "es-US-Neural2-A", ssmlGender: "FEMALE" },
  pt: { languageCode: "pt-BR", voiceName: "pt-BR-Neural2-A", ssmlGender: "FEMALE" },
  vi: { languageCode: "vi-VN", voiceName: "vi-VN-Neural2-A", ssmlGender: "FEMALE" },
  hi: { languageCode: "hi-IN", voiceName: "hi-IN-Neural2-A", ssmlGender: "FEMALE" },
  fr: { languageCode: "fr-FR", voiceName: "fr-FR-Neural2-A", ssmlGender: "FEMALE" },
  de: { languageCode: "de-DE", voiceName: "de-DE-Neural2-A", ssmlGender: "FEMALE" },
  ja: { languageCode: "ja-JP", voiceName: "ja-JP-Neural2-B", ssmlGender: "FEMALE" },
  ko: { languageCode: "ko-KR", voiceName: "ko-KR-Neural2-A", ssmlGender: "FEMALE" },
  ar: { languageCode: "ar-XA", voiceName: "ar-XA-Neural2-A", ssmlGender: "FEMALE" },
  zh: { languageCode: "cmn-CN", voiceName: "cmn-CN-Neural2-A", ssmlGender: "FEMALE" },
  id: { languageCode: "id-ID", voiceName: "id-ID-Neural2-A", ssmlGender: "FEMALE" },
  th: { languageCode: "th-TH", voiceName: "th-TH-Neural2-C", ssmlGender: "FEMALE" },
};

// ──────────────────────────────────────────────
// SUPPORTED LANGUAGES
// ──────────────────────────────────────────────
const SUPPORTED_LANGUAGES: Record<string, {
  name: string;
  nativeName: string;
  flag: string;
  ttsInstructions: string;
  youtubeAudience: string;
}> = {
  es: {
    name: "Spanish",
    nativeName: "Español",
    flag: "🇪🇸",
    ttsInstructions: "Speak in natural Latin American Spanish with clear pronunciation. Use a warm, engaging tone suitable for YouTube content.",
    youtubeAudience: "570M+ speakers, 2nd largest YouTube audience",
  },
  pt: {
    name: "Portuguese",
    nativeName: "Português",
    flag: "🇧🇷",
    ttsInstructions: "Speak in natural Brazilian Portuguese with clear pronunciation. Use an energetic, friendly tone suitable for YouTube content.",
    youtubeAudience: "260M+ speakers, Brazil is #3 YouTube market",
  },
  vi: {
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    flag: "🇻🇳",
    ttsInstructions: "Speak in natural Vietnamese with proper tones and clear pronunciation. Use a friendly, conversational tone suitable for YouTube content.",
    youtubeAudience: "85M+ speakers, fast-growing YouTube market",
  },
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    flag: "🇮🇳",
    ttsInstructions: "Speak in natural Hindi with clear pronunciation. Use a warm, engaging tone suitable for YouTube content. Avoid mixing English words unless they are commonly used.",
    youtubeAudience: "600M+ speakers, India is #2 YouTube market",
  },
  fr: {
    name: "French",
    nativeName: "Français",
    flag: "🇫🇷",
    ttsInstructions: "Speak in natural French with clear pronunciation. Use an elegant, engaging tone suitable for YouTube content.",
    youtubeAudience: "280M+ speakers across 29 countries",
  },
  de: {
    name: "German",
    nativeName: "Deutsch",
    flag: "🇩🇪",
    ttsInstructions: "Speak in natural German with clear pronunciation. Use a professional yet friendly tone suitable for YouTube content.",
    youtubeAudience: "130M+ speakers, high ad revenue market",
  },
  ja: {
    name: "Japanese",
    nativeName: "日本語",
    flag: "🇯🇵",
    ttsInstructions: "Speak in natural Japanese with proper politeness level (desu/masu form). Use a clear, engaging tone suitable for YouTube content.",
    youtubeAudience: "125M+ speakers, Japan is #4 YouTube market",
  },
  ko: {
    name: "Korean",
    nativeName: "한국어",
    flag: "🇰🇷",
    ttsInstructions: "Speak in natural Korean with proper politeness level. Use a clear, engaging tone suitable for YouTube content.",
    youtubeAudience: "80M+ speakers, high engagement market",
  },
  ar: {
    name: "Arabic",
    nativeName: "العربية",
    flag: "🇸🇦",
    ttsInstructions: "Speak in Modern Standard Arabic with clear pronunciation. Use a professional, engaging tone suitable for YouTube content.",
    youtubeAudience: "400M+ speakers, growing creator economy",
  },
  zh: {
    name: "Chinese (Mandarin)",
    nativeName: "中文",
    flag: "🇨🇳",
    ttsInstructions: "Speak in natural Mandarin Chinese with proper tones and clear pronunciation. Use a friendly, engaging tone suitable for video content.",
    youtubeAudience: "1.1B+ speakers, massive potential audience",
  },
  id: {
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    flag: "🇮🇩",
    ttsInstructions: "Speak in natural Indonesian with clear pronunciation. Use a friendly, conversational tone suitable for YouTube content.",
    youtubeAudience: "200M+ speakers, Indonesia is #5 YouTube market",
  },
  th: {
    name: "Thai",
    nativeName: "ภาษาไทย",
    flag: "🇹🇭",
    ttsInstructions: "Speak in natural Thai with proper tones and clear pronunciation. Use a friendly, engaging tone suitable for YouTube content.",
    youtubeAudience: "60M+ speakers, high YouTube engagement",
  },
};

// ──────────────────────────────────────────────
// HELPER: Translate script using GPT-4o-mini
// ──────────────────────────────────────────────
async function translateScript(
  script: string,
  targetLang: string,
  targetLangName: string,
  originalLanguage: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a professional video script translator. Translate the following ${originalLanguage} YouTube video script into natural, conversational ${targetLangName}.

RULES:
- Maintain the SAME structure (title, hook, body, recap, CTA)
- Keep the same energy and tone — this is a YouTube video, not a textbook
- Adapt cultural references if needed (don't just translate literally)
- Keep proper nouns (names, brands, places) in their original form unless they have a well-known localized name
- The translation should sound like it was ORIGINALLY WRITTEN in ${targetLangName}, not translated
- Maintain similar word count (±15%) to keep video timing similar
- Do NOT add translator notes or explanations — just output the translated script`,
        },
        { role: "user", content: script },
      ],
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Translation failed (" + resp.status + ")");
  }

  const translated = json?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("Translation returned empty result");
  return translated;
}

// ──────────────────────────────────────────────
// TTS PROVIDER 1: OpenAI (existing)
// ──────────────────────────────────────────────
async function generateTtsOpenAI(
  text: string,
  voiceId: string,
  languageInstructions: string,
  toneInstruction: string
): Promise<{ mp3: Buffer; model: string; cost: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const fullInstructions = languageInstructions + " " + toneInstruction;

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: voiceId,
      format: "mp3",
      input: text,
      instructions: fullInstructions,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("OpenAI TTS failed (" + resp.status + "): " + (t || "No body"));
  }

  const mp3 = Buffer.from(await resp.arrayBuffer());
  const cost = (text.length / 1000) * 0.015;

  return { mp3, model, cost };
}

// ──────────────────────────────────────────────
// 🆕 VOICE PROVIDER: TTS PROVIDER 2 — ElevenLabs
// Best quality for non-English languages
// ──────────────────────────────────────────────
async function generateTtsElevenLabs(
  text: string,
  langCode: string,
  customVoiceId?: string | null //
): Promise<{ mp3: Buffer; model: string; cost: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY — add it to .env.local");

  const voiceConfig = ELEVENLABS_VOICES[langCode] || ELEVENLABS_VOICES["es"];
  const voiceId = customVoiceId || voiceConfig.voiceId;
  const { model, languageCode } = voiceConfig;

  console.log(`[elevenlabs] voice=${voiceConfig.voiceName}, model=${model}, lang=${languageCode}`);

  // ElevenLabs TTS API — with language_code to FORCE correct language
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      language_code: languageCode,  // ✅ FIX: Forces correct language (prevents Cambodian/wrong language)
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw new Error("ElevenLabs TTS failed (" + resp.status + "): " + (errorText || "No body"));
  }

  const mp3 = Buffer.from(await resp.arrayBuffer());
  // flash_v2_5 costs 0.5 credits/char, multilingual_v2 costs 1 credit/char
  const isFlash = model.includes("flash");
  const cost = (text.length / 1000) * (isFlash ? 0.15 : 0.30);

  return { mp3, model, cost };
}

// ──────────────────────────────────────────────
// 🆕 VOICE PROVIDER: TTS PROVIDER 3 — Google Cloud TTS
// Good quality at very low cost
// ──────────────────────────────────────────────
async function generateTtsGoogle(
  text: string,
  langCode: string
): Promise<{ mp3: Buffer; model: string; cost: number }> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_TTS_API_KEY — add it to .env.local");

  const voiceConfig = GOOGLE_VOICES[langCode] || GOOGLE_VOICES["es"];

  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: voiceConfig.languageCode,
          name: voiceConfig.voiceName,
          ssmlGender: voiceConfig.ssmlGender,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0,
          effectsProfileId: ["large-home-entertainment-class-device"],
        },
      }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    throw new Error("Google TTS failed (" + resp.status + "): " + (errorText || "No body"));
  }

  const json: any = await resp.json();
  if (!json.audioContent) {
    throw new Error("Google TTS returned no audio content");
  }

  const mp3 = Buffer.from(json.audioContent, "base64");
  const cost = (text.length / 1000) * 0.016;

  return { mp3, model: voiceConfig.voiceName, cost };
}

// ──────────────────────────────────────────────
// HELPER: Transcribe audio for captions (Whisper)
// ──────────────────────────────────────────────
async function transcribeAudio(mp3: Buffer, language: string): Promise<{
  words: { word: string; start: number; end: number }[];
  text: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const fd = new FormData();
  const blob = new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" });
  fd.append("file", blob, "narration.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("language", language);

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: fd,
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Transcription failed (" + resp.status + ")");
  }

  const words = Array.isArray(json?.words)
    ? (json.words as any[])
        .map((w: any) => ({
          word: String(w.word ?? "").trim(),
          start: Number(w.start ?? 0),
          end: Number(w.end ?? 0),
        }))
        .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    : [];

  return { words, text: json?.text || "" };
}

// ──────────────────────────────────────────────
// POST /api/projects/generate-dub
//
// Request body:
//   {
//     project_id: "uuid",
//     target_language: "vi",
//     voice_provider: "elevenlabs",   // 🆕 "openai" | "elevenlabs" | "google"
//     voice_id: "coral"               // Optional: override voice (OpenAI only)
//   }
// ──────────────────────────────────────────────
export async function POST(req: Request) {
  const now = new Date().toISOString();

  try {
    const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const AUDIO_BUCKET = (process.env.AUDIO_BUCKET || "audio").trim();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    // ── Auth ──
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

    // ── Parse request ──
    const body = await req.json().catch(() => ({}));
    const projectId = body?.project_id;
    const targetLang = body?.target_language;
    const voiceOverride = body?.voice_id;

    // 🆕 VOICE PROVIDER: Read provider from request (default: openai)
    const providerKey = (body?.voice_provider || "openai").toLowerCase();
    if (!VOICE_PROVIDERS[providerKey]) {
      return NextResponse.json({
        error: "Invalid voice_provider. Supported: " + Object.keys(VOICE_PROVIDERS).join(", "),
      }, { status: 400 });
    }

    // 🆕 VOICE PROVIDER: Check if the required API key is configured
    const requiredEnvVar = VOICE_PROVIDERS[providerKey].requiresKey;
    if (!process.env[requiredEnvVar]) {
      return NextResponse.json({
        error: `${VOICE_PROVIDERS[providerKey].name} is not configured. Add ${requiredEnvVar} to your .env.local`,
      }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    if (!targetLang || !SUPPORTED_LANGUAGES[targetLang]) {
      return NextResponse.json({
        error: "Invalid target_language. Supported: " + Object.keys(SUPPORTED_LANGUAGES).join(", "),
      }, { status: 400 });
    }

    const langConfig = SUPPORTED_LANGUAGES[targetLang];

    // ── Load project ──
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id,user_id,topic,script,language,voice,tone,render_attempt")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.script || project.script.trim().length === 0) {
      return NextResponse.json({
        error: "Project has no script. Generate a video first, then dub it.",
      }, { status: 400 });
    }

    // ── Check if dub already exists for this language ──
    const { data: existingDub } = await admin
      .from("project_dubs")
      .select("id")
      .eq("project_id", projectId)
      .eq("language_code", targetLang)
      .single();

    if (existingDub) {
      return NextResponse.json({
        error: `A ${langConfig.name} dub already exists for this project. Delete it first to regenerate.`,
      }, { status: 409 });
    }

    console.log(`[dub] Starting ${langConfig.name} dub for project ${projectId} (provider: ${providerKey})`);

    // ══════════════════════════════════════════════
    // STEP 1: Translate the script
    // ══════════════════════════════════════════════
    console.log(`[dub] Step 1: Translating to ${langConfig.name}...`);
    const translatedScript = await translateScript(
      project.script,
      targetLang,
      langConfig.name,
      project.language || "English"
    );
    console.log(`[dub] Translation done: ${translatedScript.length} chars`);

    // ══════════════════════════════════════════════
    // STEP 2: Generate TTS — dispatch to selected provider
    // 🆕 VOICE PROVIDER: Provider-specific TTS generation
    // ══════════════════════════════════════════════
    console.log(`[dub] Step 2: Generating TTS with ${VOICE_PROVIDERS[providerKey].name}...`);

    let mp3: Buffer;
    let ttsModel: string;
    let ttsCost: number;

     if (providerKey === "elevenlabs") {
      // ── ElevenLabs ──
      // 🆕 VOICE SELECT: Use custom voice ID if provided by the UI
      const customVoiceId = body?.elevenlabs_voice_id || null;
      const customVoiceName = body?.elevenlabs_voice_name || null;
      const result = await generateTtsElevenLabs(translatedScript, targetLang, customVoiceId);
      mp3 = result.mp3;
      ttsModel = result.model;
      ttsCost = result.cost;
      if (customVoiceName) {
        console.log(`[dub] Using custom voice: ${customVoiceName} (${customVoiceId})`);
      } 

    } else if (providerKey === "google") {
      // ── Google Cloud TTS ──
      const result = await generateTtsGoogle(translatedScript, targetLang);
      mp3 = result.mp3;
      ttsModel = result.model;
      ttsCost = result.cost;

    } else {
      // ── OpenAI (default) ──
      const voiceLabel = (voiceOverride || project.voice || "coral").toLowerCase();
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
      };
      const voiceId = voiceMap[voiceLabel] || voiceLabel || "coral";

      const toneLabel = (project.tone || "friendly").toLowerCase();
      const toneInstructions: Record<string, string> = {
        friendly: "Be engaging and approachable, like talking to a good friend.",
        professional: "Be measured and confident, like a news anchor.",
        excited: "Be upbeat and dynamic, like a passionate presenter.",
        calm: "Be gentle and relaxed, like a meditation guide.",
      };
      const toneInstruction = toneInstructions[toneLabel] || toneInstructions["friendly"];

      const result = await generateTtsOpenAI(translatedScript, voiceId, langConfig.ttsInstructions, toneInstruction);
      mp3 = result.mp3;
      ttsModel = result.model;
      ttsCost = result.cost;
    }

    console.log(`[dub] TTS done: ${(mp3.length / 1024).toFixed(0)}KB, cost: $${ttsCost.toFixed(4)}`);

    // ══════════════════════════════════════════════
    // STEP 3: Upload audio to Supabase Storage
    // ══════════════════════════════════════════════
    console.log(`[dub] Step 3: Uploading audio...`);
    const attempt = project.render_attempt || 1;
    const objectPath = `${user.id}/${projectId}/dub-${targetLang}-${providerKey}-attempt-${attempt}.mp3`;

    const { error: uploadErr } = await admin.storage.from(AUDIO_BUCKET).upload(objectPath, mp3, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "3600",
    });

    if (uploadErr) {
      throw new Error("Audio upload failed: " + uploadErr.message);
    }

    const audioUrl = `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${objectPath}`;
    console.log(`[dub] Audio uploaded: ${audioUrl}`);

    // ══════════════════════════════════════════════
    // STEP 4: Transcribe for captions (Whisper)
    // ══════════════════════════════════════════════
    console.log(`[dub] Step 4: Transcribing for captions...`);
    const transcription = await transcribeAudio(mp3, targetLang);
    console.log(`[dub] Transcription done: ${transcription.words.length} words`);

    // ══════════════════════════════════════════════
    // STEP 5: Save dub record to database
    // 🆕 VOICE PROVIDER: Now saves provider + model + cost
    // ══════════════════════════════════════════════
    console.log(`[dub] Step 5: Saving to database...`);
    const { data: dubRow, error: dubErr } = await admin
      .from("project_dubs")
      .insert({
        project_id: projectId,
        user_id: user.id,
        language_code: targetLang,
        language_name: langConfig.name,
        language_flag: langConfig.flag,
        translated_script: translatedScript,
        audio_url: audioUrl,
        audio_object_path: objectPath,
        caption_words: transcription.words,
        voice_id: providerKey === "openai" ? (voiceOverride || "coral") : providerKey,
        voice_provider: providerKey,       // 🆕 VOICE PROVIDER
        voice_model: ttsModel,             // 🆕 VOICE PROVIDER
        tts_cost_usd: ttsCost,             // 🆕 VOICE PROVIDER
        status: "completed",
        created_at: now,
        updated_at: now,
      })
      .select("id,language_code,language_name,language_flag,audio_url,status,voice_provider,tts_cost_usd")
      .single();

    if (dubErr) {
      throw new Error("Failed to save dub: " + dubErr.message);
    }

    console.log(`[dub] ✅ ${langConfig.flag} ${langConfig.name} dub complete! (${VOICE_PROVIDERS[providerKey].name}, $${ttsCost.toFixed(4)})`);

    return NextResponse.json({
      success: true,
      dub: {
        id: dubRow.id,
        language_code: dubRow.language_code,
        language_name: dubRow.language_name,
        language_flag: dubRow.language_flag,
        audio_url: dubRow.audio_url,
        voice_provider: providerKey,       // 🆕 VOICE PROVIDER
        tts_cost_usd: ttsCost,             // 🆕 VOICE PROVIDER
        translated_script_length: translatedScript.length,
        caption_words_count: transcription.words.length,
      },
    });
  } catch (error: any) {
    console.error("[dub] ERROR:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Dubbing failed" },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// GET: Return supported languages AND providers
// 🆕 VOICE PROVIDER: Now also returns provider list
// ──────────────────────────────────────────────
export async function GET() {
  // 🆕 VOICE PROVIDER: Check which providers are configured
  const availableProviders = Object.entries(VOICE_PROVIDERS).map(([key, config]) => ({
    key,
    ...config,
    available: !!process.env[config.requiresKey],
  }));

  return NextResponse.json({
    languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, config]) => ({
      code,
      ...config,
    })),
    providers: availableProviders, // 🆕 VOICE PROVIDER
  });
}
