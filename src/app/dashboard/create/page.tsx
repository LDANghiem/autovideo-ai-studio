// ============================================================
// FILE: src/app/dashboard/create/page.tsx
// ============================================================
// ALL PATCHES APPLIED:
//   🆕 VOICE PICKER: Language-aware voice selector
//   🆕 12 Native Vietnamese voices from ElevenLabs Voice Library
//   🆕 Language flags and ElevenLabs indicator
// ============================================================

"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { useImageSource } from "@/lib/useImageSource";
import ImageSourceToggle from "@/components/ImageSourceToggle";

/* ============================================================
   [S1] Types
============================================================ */
type CreatePayload = {
  topic: string;
  topic_instructions: string;
  video_type: string;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
  caption_style: string;         // "none" | "block" | "karaoke" | "centered"
  image_source: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
};

/* ============================================================
   [S2] Constants
============================================================ */
const TOPIC_MAX_CHARS = 300;

type VideoTypeConfig = {
  label: string;
  description: string;
  icon: string;
  lengthOptions: string[];
  defaultLength: string;
  defaultResolution: string;
  resolutionOptions: string[];
  aspectRatio: string;
};

const VIDEO_TYPES: Record<string, VideoTypeConfig> = {
  conventional: {
    label: "Conventional",
    description: "Standard YouTube video (16:9 landscape)",
    icon: "🎬",
    lengthOptions: ["60 seconds", "5 minutes", "8 minutes", "12 minutes", "16 minutes", "20 minutes", "24 minutes", "30 minutes"],
    defaultLength: "5 minutes",
    defaultResolution: "1080p",
    resolutionOptions: ["720p", "1080p"],
    aspectRatio: "16:9",
  },
  youtube_shorts: {
    label: "YouTube Shorts",
    description: "Vertical short-form video (9:16, max 60 sec)",
    icon: "📱",
    lengthOptions: ["15 seconds", "30 seconds", "45 seconds", "60 seconds"],
    defaultLength: "60 seconds",
    defaultResolution: "1080p",
    resolutionOptions: ["720p", "1080p"],
    aspectRatio: "9:16",
  },
  tiktok: {
    label: "TikTok",
    description: "Vertical short-form video (9:16, max 3 min)",
    icon: "🎵",
    lengthOptions: ["15 seconds", "30 seconds", "60 seconds", "2 minutes", "3 minutes"],
    defaultLength: "60 seconds",
    defaultResolution: "1080p",
    resolutionOptions: ["720p", "1080p"],
    aspectRatio: "9:16",
  },
};

// ──────────────────────────────────────────────
// Voice options per TTS provider
// ──────────────────────────────────────────────
type VoiceOption = {
  id: string;
  label: string;
  description: string;
  gender: string;
  provider: "openai" | "elevenlabs";
  voiceId: string;
};

// OpenAI voices — best for English
const OPENAI_VOICES: VoiceOption[] = [
  { id: "coral",   label: "Coral",   description: "Warm female",     gender: "Female", provider: "openai", voiceId: "coral" },
  { id: "nova",    label: "Nova",    description: "Bright female",   gender: "Female", provider: "openai", voiceId: "nova" },
  { id: "sage",    label: "Sage",    description: "Calm male",       gender: "Male",   provider: "openai", voiceId: "sage" },
  { id: "ash",     label: "Ash",     description: "Deep male",       gender: "Male",   provider: "openai", voiceId: "ash" },
  { id: "alloy",   label: "Alloy",   description: "Neutral",         gender: "Neutral",provider: "openai", voiceId: "alloy" },
  { id: "echo",    label: "Echo",    description: "Soft male",       gender: "Male",   provider: "openai", voiceId: "echo" },
  { id: "onyx",    label: "Onyx",    description: "Deep narrator",   gender: "Male",   provider: "openai", voiceId: "onyx" },
  { id: "shimmer", label: "Shimmer", description: "Gentle female",   gender: "Female", provider: "openai", voiceId: "shimmer" },
  { id: "fable",   label: "Fable",   description: "Storyteller",     gender: "Neutral",provider: "openai", voiceId: "fable" },
  { id: "ballad",  label: "Ballad",  description: "Expressive",      gender: "Neutral",provider: "openai", voiceId: "ballad" },
  { id: "verse",   label: "Verse",   description: "Clear",           gender: "Neutral",provider: "openai", voiceId: "verse" },
  { id: "marin",   label: "Marin",   description: "Crisp female",    gender: "Female", provider: "openai", voiceId: "marin" },
  { id: "cedar",   label: "Cedar",   description: "Smooth male",     gender: "Male",   provider: "openai", voiceId: "cedar" },
];

// 🆕 12 Native Vietnamese voices from ElevenLabs Voice Library
const ELEVENLABS_VIETNAMESE_VOICES: VoiceOption[] = [
  // Female voices
  { id: "el-tham",        label: "Tham",        description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "0ggMuQ1r9f9jqBu50nJn" },
  { id: "el-thanh-f",     label: "Thanh",        description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "N0Z0aL8qHhzwUHwRBcVo" },
  { id: "el-duyen",       label: "Duyên",        description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "DVQIYWzpAqd5qcoIlirg" },
  { id: "el-ngan",        label: "Ngân Nguyễn",  description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "DvG3I1kDzdBY3u4EzYh6" },
  { id: "el-hien",        label: "Hiền",         description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "jdlxsPOZOHdGEfcItXVu" },
  { id: "el-trang",       label: "Trang",        description: "Native Vietnamese female",      gender: "Female", provider: "elevenlabs", voiceId: "ArosID24mP18TEiQpNhs" },
  // Male voices
  { id: "el-tranthanh",   label: "Trấn Thành",   description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "kPNz4WRTiKDplS7jAwHu" },
  { id: "el-anh",         label: "Anh",          description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "ywBZEqUhld86Jeajq94o" },
  { id: "el-trieuduong",  label: "Triệu Dương",  description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "UsgbMVmY3U59ijwK5mdh" },
  { id: "el-hoangdang",   label: "Hoàng Đăng",   description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "ipTvfDXAg1zowfF1rv9w" },
  { id: "el-nhat",        label: "Nhật",         description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "6adFm46eyy74snVn6YrT" },
  { id: "el-tung",        label: "Tùng",         description: "Native Vietnamese male",        gender: "Male",   provider: "elevenlabs", voiceId: "3VnrjnYrskPMDsapTr8X" },
];

// ElevenLabs voices for other non-English languages (default voices)
const ELEVENLABS_OTHER_VOICES: VoiceOption[] = [
  { id: "el-george",  label: "George",  description: "Warm male narrator",         gender: "Male",   provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "el-roger",   label: "Roger",   description: "Confident, persuasive male", gender: "Male",   provider: "elevenlabs", voiceId: "CwhRBWXzGAHq8TQ4Fs17" },
  { id: "el-charlie", label: "Charlie", description: "Casual friendly male",       gender: "Male",   provider: "elevenlabs", voiceId: "IKne3meq5aSn9XLyUdCD" },
  { id: "el-lily",    label: "Lily",    description: "Warm expressive female",     gender: "Female", provider: "elevenlabs", voiceId: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "el-aria",    label: "Aria",    description: "Clear professional female",  gender: "Female", provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x" },
  { id: "el-sarah",   label: "Sarah",   description: "Soft, young female",         gender: "Female", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
];

// Map language display names to codes
const LANGUAGE_OPTIONS: { value: string; label: string; flag: string; code: string; useElevenLabs: boolean }[] = [
  { value: "English",    label: "English",           flag: "🇺🇸", code: "en", useElevenLabs: false },
  { value: "Vietnamese", label: "Vietnamese",        flag: "🇻🇳", code: "vi", useElevenLabs: true },
  { value: "Spanish",    label: "Spanish",           flag: "🇪🇸", code: "es", useElevenLabs: true },
  { value: "Portuguese", label: "Portuguese",        flag: "🇧🇷", code: "pt", useElevenLabs: true },
  { value: "French",     label: "French",            flag: "🇫🇷", code: "fr", useElevenLabs: true },
  { value: "German",     label: "German",            flag: "🇩🇪", code: "de", useElevenLabs: true },
  { value: "Hindi",      label: "Hindi",             flag: "🇮🇳", code: "hi", useElevenLabs: true },
  { value: "Japanese",   label: "Japanese",          flag: "🇯🇵", code: "ja", useElevenLabs: true },
  { value: "Korean",     label: "Korean",            flag: "🇰🇷", code: "ko", useElevenLabs: true },
  { value: "Chinese",    label: "Chinese (Mandarin)",flag: "🇨🇳", code: "zh", useElevenLabs: true },
  { value: "Arabic",     label: "Arabic",            flag: "🇸🇦", code: "ar", useElevenLabs: true },
  { value: "Indonesian", label: "Indonesian",        flag: "🇮🇩", code: "id", useElevenLabs: true },
  { value: "Thai",       label: "Thai",              flag: "🇹🇭", code: "th", useElevenLabs: true },
];

/* ============================================================
   [S3] Page Component
============================================================ */
export default function CreateProjectPage() {
  const router = useRouter();

  const [videoType, setVideoType] = useState("conventional");
  const [topic, setTopic] = useState("");
  const [topicInstructions, setTopicInstructions] = useState("");
  const [style, setStyle] = useState("modern");
  const [voice, setVoice] = useState("Coral (warm female)");
  const [length, setLength] = useState("5 minutes");
  const [resolution, setResolution] = useState("1080p");
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState("friendly");
  const [music, setMusic] = useState("ambient");
  const [captionStyle, setCaptionStyle] = useState("none"); // 🆕 Caption style: none, block, karaoke, centered

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { imageSource, setImageSource } = useImageSource("ai-art");

  // Track selected ElevenLabs voice separately
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState<VoiceOption>(ELEVENLABS_VIETNAMESE_VOICES[0]);

  // Determine which voice set to show
  const currentLangConfig = LANGUAGE_OPTIONS.find((l) => l.value === language);
  const isElevenLabsLanguage = currentLangConfig?.useElevenLabs ?? false;
  const isVietnamese = language === "Vietnamese";

  // Vietnamese gets 12 native voices; other non-English gets default ElevenLabs voices
  const elevenLabsVoices = isVietnamese ? ELEVENLABS_VIETNAMESE_VOICES : ELEVENLABS_OTHER_VOICES;

  /* ----------------------------------------------------------
     Auto-adjust settings when video type changes
  ---------------------------------------------------------- */
  useEffect(() => {
    const config = VIDEO_TYPES[videoType];
    if (!config) return;
    setLength(config.defaultLength);
    setResolution(config.defaultResolution);
    if (videoType === "tiktok") { setStyle("energetic"); setTone("excited"); }
    else if (videoType === "youtube_shorts") { setStyle("modern"); setTone("friendly"); }
    else { setStyle("modern"); setTone("friendly"); }
  }, [videoType]);

  // Auto-switch voice when language changes
  useEffect(() => {
    if (isElevenLabsLanguage) {
      const voices = language === "Vietnamese" ? ELEVENLABS_VIETNAMESE_VOICES : ELEVENLABS_OTHER_VOICES;
      setSelectedElevenLabsVoice(voices[0]);
      setVoice(voices[0].label);
    } else {
      setVoice("Coral (warm female)");
    }
  }, [language, isElevenLabsLanguage]);

  const activeConfig = VIDEO_TYPES[videoType];

  /* ----------------------------------------------------------
     Payload
  ---------------------------------------------------------- */
  const payload: CreatePayload = useMemo(() => {
    const base: CreatePayload = {
      topic,
      topic_instructions: topicInstructions,
      video_type: videoType,
      style,
      voice: isElevenLabsLanguage ? selectedElevenLabsVoice.label : voice,
      length,
      resolution,
      language,
      tone,
      music,
      caption_style: captionStyle,
      image_source: imageSource,
    };

    if (isElevenLabsLanguage) {
      base.elevenlabs_voice_id = selectedElevenLabsVoice.voiceId;
      base.elevenlabs_voice_name = selectedElevenLabsVoice.label;
    }

    return base;
  }, [topic, topicInstructions, videoType, style, voice, length, resolution, language, tone, music, captionStyle, imageSource, isElevenLabsLanguage, selectedElevenLabsVoice]);

  /* ----------------------------------------------------------
     Submit
  ---------------------------------------------------------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("You are not logged in. Please log in again.");
        setBusy(false);
        return;
      }

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to create project.");
        setBusy(false);
        return;
      }

      router.push(`/dashboard/projects/${json.id}`);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     [S4] Render
  ============================================================ */
  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create Project</h1>
        <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2" type="button">
          Back
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Video Type Selector */}
        <div className="space-y-2">
          <label className="font-medium">Video Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(VIDEO_TYPES).map(([key, config]) => {
              const isActive = videoType === key;
              return (
                <button key={key} type="button" onClick={() => setVideoType(key)}
                  className={"flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all " +
                    (isActive ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50")}>
                  <span className="text-2xl">{config.icon}</span>
                  <span className={"font-semibold text-sm " + (isActive ? "text-blue-700" : "text-gray-800")}>{config.label}</span>
                  <span className="text-xs text-gray-500 text-center">{config.description}</span>
                  <span className={"text-xs mt-1 px-2 py-0.5 rounded-full " + (isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>{config.aspectRatio}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Topic */}
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <label className="font-medium">Topic</label>
            <div className="text-xs text-gray-500">{topic.length}/{TOPIC_MAX_CHARS}</div>
          </div>
          <input value={topic} onChange={(e) => setTopic(e.target.value.slice(0, TOPIC_MAX_CHARS))}
            className="w-full border rounded px-3 py-2" placeholder="e.g. 5 most beautiful places on Earth" maxLength={TOPIC_MAX_CHARS} required />
          <div className="text-xs text-gray-500">Tip: keep Topic short. Put detailed instructions below.</div>
        </div>

        {/* Topic Instructions */}
        <div className="space-y-2">
          <label className="font-medium">Topic Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea value={topicInstructions} onChange={(e) => setTopicInstructions(e.target.value)}
            className="w-full border rounded px-3 py-2 min-h-[100px]"
            placeholder={"Add extra instructions here, e.g.\n- Target audience\n- Key points to cover\n- What to avoid\n- Structure preferences"} />
          <div className="text-xs text-gray-500">Optional instructions to shape the script and video content.</div>
        </div>

        {/* Image Source Toggle */}
        <ImageSourceToggle imageSource={imageSource} onChange={setImageSource} disabled={busy} />

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Style */}
          <div className="space-y-2">
            <label className="font-medium">Style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="modern">modern</option>
              <option value="cinematic">cinematic</option>
              <option value="minimal">minimal</option>
              <option value="energetic">energetic</option>
            </select>
          </div>

          {/* ══════════════════════════════════════════
              Voice selector — language-aware
          ══════════════════════════════════════════ */}
          <div className="space-y-2">
            <label className="font-medium">
              Voice
              {isElevenLabsLanguage && (
                <span className="text-xs font-normal text-purple-600 ml-2">
                  🎭 ElevenLabs {isVietnamese ? "(12 native voices)" : ""}
                </span>
              )}
              {!isElevenLabsLanguage && (
                <span className="text-xs font-normal text-gray-400 ml-2">🤖 OpenAI</span>
              )}
            </label>

            {isElevenLabsLanguage ? (
              /* ElevenLabs voice picker for non-English */
              <div className="space-y-2">
                <select
                  value={selectedElevenLabsVoice.id}
                  onChange={(e) => {
                    const v = elevenLabsVoices.find((v) => v.id === e.target.value);
                    if (v) { setSelectedElevenLabsVoice(v); setVoice(v.label); }
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <optgroup label="👩 Female Voices">
                    {elevenLabsVoices.filter((v) => v.gender === "Female").map((v) => (
                      <option key={v.id} value={v.id}>{v.label} — {v.description}</option>
                    ))}
                  </optgroup>
                  <optgroup label="👨 Male Voices">
                    {elevenLabsVoices.filter((v) => v.gender === "Male").map((v) => (
                      <option key={v.id} value={v.id}>{v.label} — {v.description}</option>
                    ))}
                  </optgroup>
                </select>
                <div className="text-xs text-purple-600 bg-purple-50 rounded px-2 py-1.5 border border-purple-200">
                  🎭 {isVietnamese
                    ? "12 native Vietnamese voices — authentic pronunciation with proper tonal accents."
                    : `Using ElevenLabs for natural ${language} pronunciation.`
                  }
                </div>
              </div>
            ) : (
              /* OpenAI voice picker for English */
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full border rounded px-3 py-2">
                <optgroup label="Recommended">
                  <option value="Coral (warm female)">Coral — warm female</option>
                  <option value="Nova (bright female)">Nova — bright female</option>
                  <option value="Sage (calm male)">Sage — calm male</option>
                  <option value="Ash (deep male)">Ash — deep male</option>
                </optgroup>
                <optgroup label="More voices">
                  <option value="Alloy (neutral)">Alloy — neutral</option>
                  <option value="Echo (soft male)">Echo — soft male</option>
                  <option value="Onyx (deep narrator)">Onyx — deep narrator</option>
                  <option value="Shimmer (gentle female)">Shimmer — gentle female</option>
                  <option value="Fable (storyteller)">Fable — storyteller</option>
                  <option value="Ballad (expressive)">Ballad — expressive</option>
                  <option value="Verse (clear)">Verse — clear</option>
                  <option value="Marin (crisp female)">Marin — crisp female</option>
                  <option value="Cedar (smooth male)">Cedar — smooth male</option>
                </optgroup>
              </select>
            )}
          </div>

          {/* Video Length */}
          <div className="space-y-2">
            <label className="font-medium">Video Length</label>
            <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full border rounded px-3 py-2">
              {activeConfig.lengthOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
            </select>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <label className="font-medium">Resolution</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full border rounded px-3 py-2">
              {activeConfig.resolutionOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
            </select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.flag} {lang.label}
                  {lang.value === "Vietnamese" ? " (12 native voices)" : lang.useElevenLabs ? " (ElevenLabs)" : ""}
                </option>
              ))}
            </select>
            {isVietnamese && (
              <div className="text-xs text-gray-500">
                Script in Vietnamese + native voice + Vietnamese captions.
              </div>
            )}
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="font-medium">Tone</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="friendly">friendly</option>
              <option value="professional">professional</option>
              <option value="excited">excited</option>
              <option value="calm">calm</option>
            </select>
          </div>

          {/* Music */}
          <div className="space-y-2">
            <label className="font-medium">Music</label>
            <select value={music} onChange={(e) => setMusic(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="ambient">ambient</option>
              <option value="uplifting">uplifting</option>
              <option value="dramatic">dramatic</option>
              <option value="none">none</option>
            </select>
          </div>

          {/* 🆕 Caption Style — burned-in subtitle style */}
          <div className="space-y-2">
            <label className="font-medium">Caption Style</label>
            <select value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="none">None</option>
              <option value="block">Block (Netflix-style)</option>
              <option value="karaoke">Karaoke (word highlight)</option>
              <option value="centered">Centered</option>
            </select>
            {captionStyle !== "none" && (
              <div className="text-xs text-gray-500">
                {captionStyle === "block" && "Semi-transparent background box with clean white text."}
                {captionStyle === "karaoke" && "Words highlight one-by-one as the narrator speaks."}
                {captionStyle === "centered" && "Simple centered white text at the bottom."}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className="bg-black text-white rounded px-4 py-2 disabled:opacity-60">
            {busy ? "Creating..." : "Create Project"}
          </button>
          <button type="button" onClick={() => {
            setVideoType("conventional"); setTopic(""); setTopicInstructions("");
            setStyle("modern"); setVoice("Coral (warm female)"); setLength("5 minutes");
            setResolution("1080p"); setLanguage("English"); setTone("friendly");
            setMusic("ambient"); setImageSource("ai-art"); setError(null);
            setCaptionStyle("none");
            setSelectedElevenLabsVoice(ELEVENLABS_VIETNAMESE_VOICES[0]);
          }} className="border rounded px-4 py-2" disabled={busy}>
            Reset
          </button>
        </div>
      </form>

      {/* Summary */}
      <div className="mt-8 rounded border p-4 bg-gray-50">
        <h2 className="font-semibold mb-2">Project Summary</h2>
        <div className="text-sm space-y-1">
          <div><b>Video Type:</b> {activeConfig.icon} {activeConfig.label} ({activeConfig.aspectRatio})</div>
          <div><b>Topic:</b> {topic || "(not set)"}</div>
          {topicInstructions && <div><b>Instructions:</b> <span className="whitespace-pre-wrap text-gray-600">{topicInstructions}</span></div>}
          <div><b>Style:</b> {style} • <b>Tone:</b> {tone}</div>
          <div>
            <b>Voice:</b>{" "}
            {isElevenLabsLanguage
              ? `🎭 ${selectedElevenLabsVoice.label} (${selectedElevenLabsVoice.gender}) — ElevenLabs Native`
              : `🤖 ${voice} — OpenAI`
            }
          </div>
          <div>
            <b>Language:</b> {currentLangConfig?.flag} {language}
            {isVietnamese && " • 12 native Vietnamese voices"}
          </div>
          <div><b>Length:</b> {length} • <b>Resolution:</b> {resolution}</div>
          <div>
            <b>Images:</b>{" "}
            {imageSource === "real-photos" ? "📸 Real Photos (Pexels — free)" : "🎨 AI Art (DALL-E — $0.08/image)"}
          </div>
          <div><b>Music:</b> {music}</div>
          <div><b>Captions:</b> {captionStyle === "none" ? "None" : captionStyle === "block" ? "📺 Block (Netflix-style)" : captionStyle === "karaoke" ? "🎤 Karaoke (word highlight)" : "📝 Centered"}</div>
        </div>
      </div>
    </div>
  );
}
