// ============================================================
// FILE: src/app/dashboard/create/page.tsx
// ============================================================
// COMMIT 12 — News-event detection warning
//
// What's new in Commit 12:
//   - Before submitting in real-photos mode, classify the topic/script
//   - If classified as current_events or conflict_disaster, show a
//     warning modal explaining stock photos handle these poorly
//   - User can choose: switch to AI Art, or proceed anyway
//   - Soft fail: classifier errors don't block submission
//
// Preserved from Commit 10:
//   - Topic Mode / Script Mode toggle
//   - Editor's notes feedback panel (Script Mode only)
//   - 12 native Vietnamese ElevenLabs voices
//   - Word-count limits and live counter
//   - Show advanced collapsible
// ============================================================

"use client";

import UsageBanner from "@/components/UsageBanner";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { useImageSource } from "@/lib/useImageSource";
import ImageSourceToggle from "@/components/ImageSourceToggle";
import UpgradeModal from "@/components/UpgradeModal";
import StaticImagePicker, { StaticImageSelection } from "@/components/StaticImagePicker";
import TranslateScriptModal, { TranslationResult } from "@/components/TranslateScriptModal";

/* ============================================================
   [S1] Types
============================================================ */
type CreatePayload = {
  topic?: string;
  topic_instructions?: string | null;
  script?: string;
  video_type: string;
  style: string;
  voice: string;
  length?: string;
  resolution: string;
  language: string;
  tone?: string;
  music: string;
  caption_style: string;
  image_source: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
  // 🆕 Commit 16d — audio_static
  static_image_url?: string | null;
  static_image_source?: string | null;
};

type Mode = "topic" | "script";

type FeedbackCategory = {
  name: "HOOK" | "PACING" | "SPECIFICITY" | "STRUCTURE" | "CTA" | "LENGTH";
  status: "pass" | "improve";
  note: string;
};

type ScriptFeedback = {
  categories: FeedbackCategory[];
  overall: string;
};

const CATEGORY_LABELS: Record<FeedbackCategory["name"], string> = {
  HOOK: "Hook",
  PACING: "Pacing",
  SPECIFICITY: "Specificity",
  STRUCTURE: "Structure",
  CTA: "Call to action",
  LENGTH: "Length fit",
};

// 🆕 Commit 12: classification result
type ClassifyCategory = "evergreen" | "current_events" | "conflict_disaster";

/* ============================================================
   [S2] Constants
============================================================ */
const TOPIC_MAX_CHARS = 300;
const SCRIPT_HARD_LIMIT = 6000;
const SCRIPT_SOFT_LIMIT = 4500;
const SCRIPT_MIN_WORDS = 20;
const WPM = 140;

type VideoTypeConfig = {
  label: string;
  description: string;
  icon: string;
  lengthOptions: string[];
  defaultLength: string;
  defaultResolution: string;
  resolutionOptions: string[];
  aspectRatio: string;
  // 🆕 Commit 16c — tier gating + length cap
  minTier?: "free" | "creator" | "studio";
  maxMinutesByTier?: { creator?: number; studio?: number };
};

type Plan = "free" | "creator" | "studio";

const VIDEO_TYPES: Record<string, VideoTypeConfig> = {
  conventional: {
    label: "Conventional",
    description: "Standard YouTube video (16:9 landscape)",
    icon: "🎬",
    lengthOptions: ["60 seconds", "2 minutes", "3 minutes", "4 minutes", "5 minutes", "8 minutes", "12 minutes", "16 minutes", "20 minutes", "24 minutes", "30 minutes"],
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
  // 🆕 Commit 16c — audio over a single static image
  audio_static: {
    label: "Audio + Image",
    description: "Long-form audio over a static image. Great for podcasts, voiceover, music.",
    icon: "🎙️",
    lengthOptions: [
      "60 seconds", "2 minutes", "3 minutes", "5 minutes", "8 minutes",
      "10 minutes", "12 minutes", "16 minutes", "20 minutes", "24 minutes", "30 minutes",
    ],
    defaultLength: "5 minutes",
    defaultResolution: "1080p",
    resolutionOptions: ["720p", "1080p"],
    aspectRatio: "16:9",
    minTier: "creator",
    maxMinutesByTier: { creator: 10, studio: 30 },
  },
};

type VoiceOption = {
  id: string;
  label: string;
  description: string;
  gender: string;
  provider: "openai" | "elevenlabs";
  voiceId: string;
};

const ELEVENLABS_VIETNAMESE_VOICES: VoiceOption[] = [
  { id: "el-tham",       label: "Tham",          description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "0ggMuQ1r9f9jqBu50nJn" },
  { id: "el-thanh-f",    label: "Thanh",         description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "N0Z0aL8qHhzwUHwRBcVo" },
  { id: "el-duyen",      label: "Duyên",         description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "DVQIYWzpAqd5qcoIlirg" },
  { id: "el-ngan",       label: "Ngân Nguyễn",   description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "DvG3I1kDzdBY3u4EzYh6" },
  { id: "el-hien",       label: "Hiền",          description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "jdlxsPOZOHdGEfcItXVu" },
  { id: "el-trang",      label: "Trang",         description: "Native Vietnamese female", gender: "Female", provider: "elevenlabs", voiceId: "ArosID24mP18TEiQpNhs" },
  { id: "el-tranthanh",  label: "Trấn Thành",    description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "kPNz4WRTiKDplS7jAwHu" },
  { id: "el-anh",        label: "Anh",           description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "ywBZEqUhld86Jeajq94o" },
  { id: "el-trieuduong", label: "Triệu Dương",   description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "UsgbMVmY3U59ijwK5mdh" },
  { id: "el-hoangdang",  label: "Hoàng Đăng",    description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "ipTvfDXAg1zowfF1rv9w" },
  { id: "el-nhat",       label: "Nhật",          description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "6adFm46eyy74snVn6YrT" },
  { id: "el-tung",       label: "Tùng",          description: "Native Vietnamese male",   gender: "Male",   provider: "elevenlabs", voiceId: "3VnrjnYrskPMDsapTr8X" },
];

const ELEVENLABS_OTHER_VOICES: VoiceOption[] = [
  { id: "el-george",  label: "George",  description: "Warm male narrator",         gender: "Male",   provider: "elevenlabs", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "el-roger",   label: "Roger",   description: "Confident, persuasive male", gender: "Male",   provider: "elevenlabs", voiceId: "CwhRBWXzGAHq8TQ4Fs17" },
  { id: "el-charlie", label: "Charlie", description: "Casual friendly male",       gender: "Male",   provider: "elevenlabs", voiceId: "IKne3meq5aSn9XLyUdCD" },
  { id: "el-lily",    label: "Lily",    description: "Warm expressive female",     gender: "Female", provider: "elevenlabs", voiceId: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "el-aria",    label: "Aria",    description: "Clear professional female",  gender: "Female", provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x" },
  { id: "el-sarah",   label: "Sarah",   description: "Soft, young female",         gender: "Female", provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
];

const LANGUAGE_OPTIONS: { value: string; label: string; flag: string; code: string; useElevenLabs: boolean }[] = [
  { value: "English",    label: "English",            flag: "🇺🇸", code: "en", useElevenLabs: false },
  { value: "Vietnamese", label: "Vietnamese",         flag: "🇻🇳", code: "vi", useElevenLabs: true },
  { value: "Spanish",    label: "Spanish",            flag: "🇪🇸", code: "es", useElevenLabs: true },
  { value: "Portuguese", label: "Portuguese",         flag: "🇧🇷", code: "pt", useElevenLabs: true },
  { value: "French",     label: "French",             flag: "🇫🇷", code: "fr", useElevenLabs: true },
  { value: "German",     label: "German",             flag: "🇩🇪", code: "de", useElevenLabs: true },
  { value: "Hindi",      label: "Hindi",              flag: "🇮🇳", code: "hi", useElevenLabs: true },
  { value: "Japanese",   label: "Japanese",           flag: "🇯🇵", code: "ja", useElevenLabs: true },
  { value: "Korean",     label: "Korean",             flag: "🇰🇷", code: "ko", useElevenLabs: true },
  { value: "Chinese",    label: "Chinese (Mandarin)", flag: "🇨🇳", code: "zh", useElevenLabs: true },
  { value: "Arabic",     label: "Arabic",             flag: "🇸🇦", code: "ar", useElevenLabs: true },
  { value: "Indonesian", label: "Indonesian",         flag: "🇮🇩", code: "id", useElevenLabs: true },
  { value: "Thai",       label: "Thai",               flag: "🇹🇭", code: "th", useElevenLabs: true },
];

/* ============================================================
   Helpers
============================================================ */

function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds} sec`;
  const min = Math.round(seconds / 60);
  return `~${min} min`;
}

/* ============================================================
   [S3] Page Component
============================================================ */
export default function CreateProjectPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("topic");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [topic, setTopic] = useState("");
  const [topicInstructions, setTopicInstructions] = useState("");
  const [length, setLength] = useState("5 minutes");
  const [tone, setTone] = useState("friendly");

  const [script, setScript] = useState("");

  const [videoType, setVideoType] = useState("conventional");
  const [style, setStyle] = useState("modern");
  const [voice, setVoice] = useState("Coral (warm female)");
  const [resolution, setResolution] = useState("1080p");
  const [language, setLanguage] = useState("English");
  const [music, setMusic] = useState("ambient");
  const [captionStyle, setCaptionStyle] = useState("karaoke");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🆕 Commit 16c — user plan + upgrade modal
  const [plan, setPlan] = useState<Plan>("free");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeTargetTier, setUpgradeTargetTier] = useState<"creator" | "studio">("creator");

  // 🆕 Commit 16d — audio_static image selection
  const [staticImage, setStaticImage] = useState<StaticImageSelection | null>(null);

  // 🆕 Commit 17b — Translate script modal
  const [translateModalOpen, setTranslateModalOpen] = useState(false);

  // 🆕 Commit 17c — Translation state for Undo + warning banner
  type TranslationState = {
    originalText: string;
    originalLanguage: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
  const [activeTranslation, setActiveTranslation] = useState<TranslationState | null>(null);

  function handleTranslated(result: TranslationResult) {
    // Save the pre-translation state so user can Undo
    setActiveTranslation({
      originalText: result.originalText,
      originalLanguage: language, // current language before we change it
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
    });
    setScript(result.translatedText);
    setLanguage(result.targetLanguage); // 🆕 17b: auto-switch language silently
  }

  function handleUndoTranslation() {
    if (!activeTranslation) return;
    setScript(activeTranslation.originalText);
    setLanguage(activeTranslation.originalLanguage);
    setActiveTranslation(null);
  }

  const [feedback, setFeedback] = useState<ScriptFeedback | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(true);

  // 🆕 Commit 12 — news-event warning state
  const [classifying, setClassifying] = useState(false);
  const [warningCategory, setWarningCategory] = useState<ClassifyCategory | null>(null);
  const [warningReason, setWarningReason] = useState<string>("");
  const [warningProceed, setWarningProceed] = useState(false); // user has clicked "continue anyway"

  const { imageSource, setImageSource } = useImageSource("ai-art");

  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState<VoiceOption>(ELEVENLABS_VIETNAMESE_VOICES[0]);

  const currentLangConfig = LANGUAGE_OPTIONS.find((l) => l.value === language);
  const isElevenLabsLanguage = currentLangConfig?.useElevenLabs ?? false;
  const isVietnamese = language === "Vietnamese";
  const elevenLabsVoices = isVietnamese ? ELEVENLABS_VIETNAMESE_VOICES : ELEVENLABS_OTHER_VOICES;

  // 🆕 Commit 16c — fetch user plan
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("plan")
        .eq("id", userId)
        .single();
      if (cancelled) return;
      const p = (profile?.plan as Plan) || "free";
      setPlan(p);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const config = VIDEO_TYPES[videoType];
    if (!config) return;
    if (mode === "topic") {
      setLength(config.defaultLength);
    }
    setResolution(config.defaultResolution);
    if (videoType === "tiktok") { setStyle("energetic"); setTone("excited"); }
    else if (videoType === "youtube_shorts") { setStyle("modern"); setTone("friendly"); }
    else if (videoType === "audio_static") {
      // 🆕 Commit 16d — audio_static forces Centered captions
      setStyle("modern");
      setTone("friendly");
      setCaptionStyle("centered");
    }
    else { setStyle("modern"); setTone("friendly"); }
  }, [videoType, mode]);

  useEffect(() => {
    if (isElevenLabsLanguage) {
      const voices = language === "Vietnamese" ? ELEVENLABS_VIETNAMESE_VOICES : ELEVENLABS_OTHER_VOICES;
      setSelectedElevenLabsVoice(voices[0]);
      setVoice(voices[0].label);
    } else {
      setVoice("Coral (warm female)");
    }
  }, [language, isElevenLabsLanguage]);

  useEffect(() => {
    if (feedback) {
      setFeedback(null);
      setFeedbackError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  // 🆕 Commit 12 — invalidate warning when content/source changes
  useEffect(() => {
    setWarningCategory(null);
    setWarningProceed(false);
  }, [topic, topicInstructions, script, imageSource, mode]);

  const activeConfig = VIDEO_TYPES[videoType];

  const scriptWordCount = useMemo(() => countWords(script), [script]);
  const estimatedSeconds = useMemo(() => Math.ceil(scriptWordCount / (WPM / 60)), [scriptWordCount]);
  const scriptOverHard = scriptWordCount > SCRIPT_HARD_LIMIT;
  const scriptOverSoft = scriptWordCount > SCRIPT_SOFT_LIMIT && !scriptOverHard;
  const scriptUnderMin = script.length > 0 && scriptWordCount < SCRIPT_MIN_WORDS;

  const payload: CreatePayload = useMemo(() => {
    const base: CreatePayload = {
      video_type: videoType,
      style,
      voice: isElevenLabsLanguage ? selectedElevenLabsVoice.label : voice,
      resolution,
      language,
      music,
      caption_style: captionStyle,
      image_source: imageSource,
    };

    if (mode === "topic") {
      base.topic = topic;
      base.topic_instructions = topicInstructions || null;
      base.length = length;
      base.tone = tone;
    } else {
      base.script = script;
    }

    if (isElevenLabsLanguage) {
      base.elevenlabs_voice_id = selectedElevenLabsVoice.voiceId;
      base.elevenlabs_voice_name = selectedElevenLabsVoice.label;
    }

    // 🆕 Commit 16d — audio_static fields
    if (videoType === "audio_static" && staticImage) {
      base.static_image_url = staticImage.url;
      base.static_image_source = staticImage.source;
    }

    return base;
  }, [mode, topic, topicInstructions, script, videoType, style, voice, length, resolution, language, tone, music, captionStyle, imageSource, isElevenLabsLanguage, selectedElevenLabsVoice, staticImage]);

  /* ----------------------------------------------------------
     Get script feedback (unchanged)
  ---------------------------------------------------------- */
  async function handleGetFeedback() {
    setFeedbackError(null);
    setFeedback(null);
    setFeedbackBusy(true);
    setFeedbackOpen(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setFeedbackError("You are not logged in. Please log in again.");
        setFeedbackBusy(false);
        return;
      }

      const res = await fetch("/api/projects/script-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          script,
          video_type: videoType,
          language,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedbackError(json?.error || "Failed to get feedback.");
        setFeedbackBusy(false);
        return;
      }

      setFeedback(json.feedback as ScriptFeedback);
    } catch (err: any) {
      setFeedbackError(err?.message || "Something went wrong.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  /* ----------------------------------------------------------
     🆕 Commit 12 — Classify before submit
  ---------------------------------------------------------- */
  async function classifyContent(): Promise<ClassifyCategory> {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return "evergreen"; // soft-fail

      // Build text to classify based on mode
      const text = mode === "topic"
        ? [topic, topicInstructions].filter(Boolean).join(". ")
        : script;

      if (!text || text.trim().length < 10) return "evergreen";

      const res = await fetch("/api/projects/script-classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      const json = await res.json();
      if (!res.ok) return "evergreen";

      setWarningReason(json?.reason || "");
      return (json?.category || "evergreen") as ClassifyCategory;
    } catch {
      return "evergreen";
    }
  }

  /* ----------------------------------------------------------
     Submit
  ---------------------------------------------------------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "topic" && !topic.trim()) {
      setError("Topic is required.");
      return;
    }
    if (mode === "script") {
      if (scriptUnderMin) {
        setError(`Script too short: ${scriptWordCount} words (min ${SCRIPT_MIN_WORDS}).`);
        return;
      }
      if (scriptOverHard) {
        setError(`Script too long: ${scriptWordCount} words (max ${SCRIPT_HARD_LIMIT}).`);
        return;
      }
    }

    // 🆕 Commit 12 — classify if real-photos mode AND not yet acknowledged
    if (imageSource === "real-photos" && !warningProceed) {
      setClassifying(true);
      const category = await classifyContent();
      setClassifying(false);

      if (category !== "evergreen") {
        // Show warning, don't submit yet
        setWarningCategory(category);
        return;
      }
    }

    // Proceed with submission
    await submitProject();
  }

  async function submitProject() {
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

  /* ----------------------------------------------------------
     Warning modal handlers
  ---------------------------------------------------------- */
  function handleSwitchToAiArt() {
    setImageSource("ai-art");
    setWarningCategory(null);
    setWarningProceed(false);
    // Note: we do NOT auto-submit. User reviews the change and clicks Create again.
  }

  async function handleProceedAnyway() {
    setWarningProceed(true);
    setWarningCategory(null);
    await submitProject();
  }

  function handleReset() {
    setMode("topic");
    setShowAdvanced(false);
    setVideoType("conventional");
    setTopic("");
    setTopicInstructions("");
    setScript("");
    setStyle("modern");
    setVoice("Coral (warm female)");
    setLength("5 minutes");
    setResolution("1080p");
    setLanguage("English");
    setTone("friendly");
    setMusic("ambient");
    setImageSource("ai-art");
    setError(null);
    setCaptionStyle("karaoke");
    setSelectedElevenLabsVoice(ELEVENLABS_VIETNAMESE_VOICES[0]);
    setFeedback(null);
    setFeedbackError(null);
    setWarningCategory(null);
    setWarningProceed(false);
  }

  const canGetFeedback = mode === "script" &&
                         !feedbackBusy &&
                         !scriptUnderMin &&
                         !scriptOverHard &&
                         scriptWordCount >= SCRIPT_MIN_WORDS;

  // 🆕 Commit 16d — audio_static helpers
  const isAudioStatic = videoType === "audio_static";

  // What's the user's max minutes for audio_static, given their tier?
  const audioStaticMaxMin =
    isAudioStatic && activeConfig.maxMinutesByTier
      ? (plan === "studio"
          ? activeConfig.maxMinutesByTier.studio ?? 30
          : activeConfig.maxMinutesByTier.creator ?? 10)
      : 30;

  // Parse selected length string ("10 minutes" / "60 seconds") into minutes
  function parseLengthToMinutes(s: string): number {
    const lower = s.toLowerCase();
    const sec = lower.match(/(\d+)\s*sec/);
    if (sec) return Number(sec[1]) / 60;
    const min = lower.match(/(\d+)\s*min/);
    if (min) return Number(min[1]);
    return 0;
  }

  const selectedMinutes = parseLengthToMinutes(length);
  const overTierCap = isAudioStatic && selectedMinutes > audioStaticMaxMin;
  const missingStaticImage = isAudioStatic && !staticImage;

  // Can the form be submitted?
  const submitBlocked =
    busy ||
    classifying ||
    (mode === "script" && (scriptUnderMin || scriptOverHard)) ||
    overTierCap ||
    missingStaticImage;

  /* ============================================================
     [S4] Render
  ============================================================ */
  return (
    <div className="max-w-3xl mx-auto p-6">

      <UsageBanner pipeline="create" className="mb-6" />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create Project</h1>
        <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2" type="button">
          Back
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</div>
      )}

      {/* MODE TOGGLE */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setMode("topic")}
            className={
              "px-4 py-2 rounded-md text-sm font-medium transition-all " +
              (mode === "topic"
                ? "bg-white shadow-sm text-gray-900 border border-gray-200"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            ✨ Topic Mode
          </button>
          <button
            type="button"
            onClick={() => setMode("script")}
            className={
              "px-4 py-2 rounded-md text-sm font-medium transition-all " +
              (mode === "script"
                ? "bg-white shadow-sm text-gray-900 border border-gray-200"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            📝 Script Mode
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {mode === "topic"
            ? "Give us a topic. We'll write the script and produce the video."
            : "Paste your own script. We'll produce the video — your words, untouched."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Video Type Selector */}
        <div className="space-y-2">
          <label className="font-medium">Video Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(VIDEO_TYPES).map(([key, config]) => {
              const isActive = videoType === key;

              // 🆕 Commit 16c — tier gate logic
              const requiredTier = config.minTier;
              const isLocked =
                (requiredTier === "creator" && plan === "free") ||
                (requiredTier === "studio" && plan !== "studio");

              const handleClick = () => {
                if (isLocked) {
                  setUpgradeTargetTier(requiredTier === "studio" ? "studio" : "creator");
                  setUpgradeModalOpen(true);
                  return;
                }
                setVideoType(key);
              };

              return (
                <button
                  key={key}
                  type="button"
                  onClick={handleClick}
                  className={
                    "relative flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all " +
                    (isLocked
                      ? "border-gray-200 bg-gray-50 opacity-75 hover:opacity-100 hover:border-purple-300"
                      : isActive
                        ? "border-blue-500 bg-blue-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50")
                  }
                >
                  {requiredTier && (
                    <span className={
                      "absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm " +
                      (requiredTier === "studio"
                        ? "bg-amber-400 text-amber-950 border border-amber-300"
                        : "bg-purple-500 text-white border border-purple-400")
                    }>
                      {isLocked ? "🔒 " : ""}{requiredTier === "studio" ? "Studio" : "Creator"}
                    </span>
                  )}
                  <span className="text-2xl">{config.icon}</span>
                  <span className={"font-semibold text-sm " + (isActive ? "text-blue-700" : "text-gray-800")}>{config.label}</span>
                  <span className="text-xs text-gray-500 text-center">{config.description}</span>
                  <span className={"text-xs mt-1 px-2 py-0.5 rounded-full " + (isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>{config.aspectRatio}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TOPIC MODE FIELDS */}
        {mode === "topic" && (
          <>
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <label className="font-medium">Topic</label>
                <div className="text-xs text-gray-500">{topic.length}/{TOPIC_MAX_CHARS}</div>
              </div>
              <input value={topic} onChange={(e) => setTopic(e.target.value.slice(0, TOPIC_MAX_CHARS))}
                className="w-full border rounded px-3 py-2" placeholder="e.g. 5 most beautiful places on Earth" maxLength={TOPIC_MAX_CHARS} required={mode === "topic"} />
              <div className="text-xs text-gray-500">Tip: keep Topic short. Put detailed instructions below.</div>
            </div>

            <div className="space-y-2">
              <label className="font-medium">Topic Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={topicInstructions} onChange={(e) => setTopicInstructions(e.target.value)}
                className="w-full border rounded px-3 py-2 min-h-[100px]"
                placeholder={"Add extra instructions here, e.g.\n- Target audience\n- Key points to cover\n- What to avoid\n- Structure preferences"} />
              <div className="text-xs text-gray-500">Optional instructions to shape the script and video content.</div>
            </div>
          </>
        )}

        {/* SCRIPT MODE FIELD */}
        {mode === "script" && (
          <div className="space-y-2">

            {/* 🆕 Commit 17c — Translation warning banner with Undo */}
            {activeTranslation && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex items-start gap-3">
                <span className="text-lg flex-shrink-0">🤖</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-amber-900">
                    AI-translated from {activeTranslation.sourceLanguage} to {activeTranslation.targetLanguage}
                  </div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    Always review before rendering — especially proper nouns, idioms, and cultural references.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUndoTranslation}
                  className="flex-shrink-0 text-xs font-medium text-amber-900 hover:text-amber-950 underline whitespace-nowrap"
                >
                  Undo translation
                </button>
              </div>
            )}

            <div className="flex items-end justify-between gap-3">
              <label className="font-medium">Your Script</label>
              <div className={
                "text-xs " +
                (scriptOverHard ? "text-red-600 font-medium" :
                 scriptOverSoft ? "text-amber-600 font-medium" :
                 scriptUnderMin ? "text-amber-600" :
                 scriptWordCount > 0 ? "text-gray-600" : "text-gray-400")
              }>
                {scriptWordCount} {scriptWordCount === 1 ? "word" : "words"}
                {scriptWordCount >= SCRIPT_MIN_WORDS && (
                  <span className="ml-2 text-gray-500">· estimated {formatDuration(estimatedSeconds)} video</span>
                )}
              </div>
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full border rounded px-3 py-2 font-mono text-sm leading-relaxed min-h-[300px]"
              placeholder={"Paste your script here.\n\nWrite in natural paragraphs. Ripple will narrate it word-for-word in the voice you pick — your script, untouched.\n\nMinimum 20 words. Soft warning above 4,500 words. Hard limit at 6,000 words."}
              required={mode === "script"}
            />
            {scriptUnderMin && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-200">
                Script too short — at least {SCRIPT_MIN_WORDS} words needed.
              </div>
            )}
            {scriptOverSoft && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-200">
                Heads up: scripts over {SCRIPT_SOFT_LIMIT.toLocaleString()} words may take longer to render and may exceed your tier&rsquo;s limits.
              </div>
            )}
            {scriptOverHard && (
              <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5 border border-red-200">
                Script exceeds the {SCRIPT_HARD_LIMIT.toLocaleString()}-word limit. Trim it down or split into multiple videos.
              </div>
            )}
            <div className="text-xs text-gray-500">
              Your script is never rewritten. Ripple narrates it verbatim and produces visuals to match.
            </div>

            {/* Get feedback + Translate buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGetFeedback}
                disabled={!canGetFeedback}
                className={
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all " +
                  (canGetFeedback
                    ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-400"
                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed")
                }
              >
                {feedbackBusy ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                    Reading your script…
                  </>
                ) : feedback ? (
                  <>🔁 Refresh feedback</>
                ) : (
                  <>📋 Get editor&rsquo;s notes</>
                )}
              </button>

              {/* 🆕 Commit 17b — Translate button */}
              <button
                type="button"
                onClick={() => setTranslateModalOpen(true)}
                disabled={scriptUnderMin || scriptOverHard || script.trim().length < 50}
                className={
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all " +
                  (!scriptUnderMin && !scriptOverHard && script.trim().length >= 50
                    ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400"
                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed")
                }
              >
                🌍 Translate this
              </button>

              <span className="ml-1 text-xs text-gray-500">
                Optional. Suggestions only — your script is never rewritten.
              </span>
            </div>

            {feedbackError && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {feedbackError}
              </div>
            )}

            {feedback && feedbackOpen && (
              <FeedbackPanel feedback={feedback} onDismiss={() => setFeedbackOpen(false)} />
            )}

            {feedback && !feedbackOpen && (
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="text-xs text-purple-600 underline hover:text-purple-800"
              >
                Show feedback panel
              </button>
            )}
          </div>
        )}

        {/* Image Source Toggle — hidden for audio_static */}
        {!isAudioStatic && (
          <ImageSourceToggle imageSource={imageSource} onChange={setImageSource} disabled={busy} />
        )}

        {/* 🆕 Commit 16d — Static Image Picker (audio_static only) */}
        {isAudioStatic && (
          <StaticImagePicker
            selected={staticImage}
            onChange={setStaticImage}
            disabled={busy}
          />
        )}

        {/* CORE SETTINGS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="font-medium">Style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="modern">modern</option>
              <option value="cinematic">cinematic</option>
              <option value="minimal">minimal</option>
              <option value="energetic">energetic</option>
            </select>
          </div>

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

          {mode === "topic" && (
            <>
              <div className="space-y-2">
                <label className="font-medium">
                  Video Length
                  {isAudioStatic && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      (your {plan === "studio" ? "Studio" : "Creator"} cap: {audioStaticMaxMin} min)
                    </span>
                  )}
                </label>
                <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full border rounded px-3 py-2">
                  {activeConfig.lengthOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
                {overTierCap && (
                  <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5 border border-red-200">
                    Exceeds your {plan === "studio" ? "Studio" : "Creator"} cap of {audioStaticMaxMin} min.{" "}
                    {plan !== "studio" && (
                      <button
                        type="button"
                        onClick={() => {
                          setUpgradeTargetTier("studio");
                          setUpgradeModalOpen(true);
                        }}
                        className="underline font-medium text-red-800 hover:text-red-900"
                      >
                        Upgrade to Studio for 30 min
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="font-medium">Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="friendly">friendly</option>
                  <option value="professional">professional</option>
                  <option value="excited">excited</option>
                  <option value="calm">calm</option>
                </select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="font-medium">
              Caption Style
              {isAudioStatic && (
                <span className="ml-2 text-xs font-normal text-amber-600">
                  🔒 Locked to Centered for Audio + Image
                </span>
              )}
            </label>
            <select
              value={captionStyle}
              onChange={(e) => setCaptionStyle(e.target.value)}
              disabled={isAudioStatic}
              className={
                "w-full border rounded px-3 py-2 " +
                (isAudioStatic ? "bg-gray-100 cursor-not-allowed text-gray-500" : "")
              }
            >
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

        {/* ADVANCED OPTIONS */}
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span className={"transition-transform inline-block " + (showAdvanced ? "rotate-90" : "")}>▶</span>
            {showAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>

          {showAdvanced && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="font-medium">Music</label>
                <select value={music} onChange={(e) => setMusic(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="ambient">ambient</option>
                  <option value="uplifting">uplifting</option>
                  <option value="dramatic">dramatic</option>
                  <option value="none">none</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-medium">Resolution</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full border rounded px-3 py-2">
                  {activeConfig.resolutionOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
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
            </div>
          )}
        </div>

        {/* 🆕 Commit 16d — Missing image inline error */}
        {missingStaticImage && (
          <div className="text-sm text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200">
            Please upload an image or select one from Pexels above before creating your video.
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitBlocked}
            className="bg-black text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {classifying ? "Checking topic…" : busy ? "Creating..." : "Create Project"}
          </button>
          <button type="button" onClick={handleReset} className="border rounded px-4 py-2" disabled={busy || classifying}>
            Reset
          </button>
        </div>
      </form>
      {/* 🆕 Commit 17b — Translate modal */}
      <TranslateScriptModal
        open={translateModalOpen}
        onClose={() => setTranslateModalOpen(false)}
        scriptText={script}
        currentLanguage={language}
        onTranslated={handleTranslated}
      />
      {/* 🆕 Commit 16c — Upgrade modal */}
      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        feature={
          upgradeTargetTier === "studio"
            ? "Studio features"
            : "Audio + Image"
        }
        requiredTier={upgradeTargetTier}
      />

      {/* 🆕 Commit 12 — News-event warning modal */}
      {warningCategory && (
        <NewsEventWarningModal
          category={warningCategory}
          reason={warningReason}
          onSwitchToAiArt={handleSwitchToAiArt}
          onProceedAnyway={handleProceedAnyway}
          onClose={() => setWarningCategory(null)}
        />
      )}

      {/* Project Summary */}
      <div className="mt-8 rounded border p-4 bg-gray-50">
        <h2 className="font-semibold mb-2">Project Summary</h2>
        <div className="text-sm space-y-1">
          <div><b>Mode:</b> {mode === "topic" ? "✨ Topic Mode (AI writes script)" : "📝 Script Mode (your script)"}</div>
          <div><b>Video Type:</b> {activeConfig.icon} {activeConfig.label} ({activeConfig.aspectRatio})</div>

          {mode === "topic" ? (
            <>
              <div><b>Topic:</b> {topic || "(not set)"}</div>
              {topicInstructions && (
                <div><b>Instructions:</b> <span className="whitespace-pre-wrap text-gray-600">{topicInstructions}</span></div>
              )}
              <div><b>Length:</b> {length} · <b>Tone:</b> {tone}</div>
            </>
          ) : (
            <div>
              <b>Script:</b>{" "}
              {scriptWordCount === 0
                ? "(not set)"
                : `${scriptWordCount} words · ~${formatDuration(estimatedSeconds)} video`}
            </div>
          )}

          <div><b>Style:</b> {style}</div>
          <div>
            <b>Voice:</b>{" "}
            {isElevenLabsLanguage
              ? `🎭 ${selectedElevenLabsVoice.label} (${selectedElevenLabsVoice.gender}) — ElevenLabs Native`
              : `🤖 ${voice} — OpenAI`
            }
          </div>
          <div>
            <b>Language:</b> {currentLangConfig?.flag} {language}
            {isVietnamese && " · 12 native Vietnamese voices"}
          </div>
          <div><b>Resolution:</b> {resolution}</div>
          <div>
            <b>Images:</b>{" "}
            {imageSource === "real-photos" ? "📸 Real Photos (stock libraries — free)" : "🎨 AI Art (DALL-E — $0.08/image)"}
          </div>
          <div><b>Music:</b> {music}</div>
          <div><b>Captions:</b> {captionStyle === "none" ? "None" : captionStyle === "block" ? "📺 Block (Netflix-style)" : captionStyle === "karaoke" ? "🎤 Karaoke (word highlight)" : "📝 Centered"}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FeedbackPanel component (unchanged from Commit 10)
============================================================ */
function FeedbackPanel({
  feedback,
  onDismiss,
}: {
  feedback: ScriptFeedback;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3.5 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-purple-300 uppercase tracking-wider">Editor&rsquo;s notes</h3>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-purple-300 hover:text-purple-200 underline"
        >
          Hide
        </button>
      </div>

      <ul className="space-y-2.5">
        {feedback.categories.map((cat) => {
          const isPass = cat.status === "pass";
          return (
            <li key={cat.name} className="flex gap-3">
              <span
                className={
                  "flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mt-0.5 " +
                  (isPass
                    ? "bg-green-200 text-green-800 ring-1 ring-green-300"
                    : "bg-amber-200 text-amber-800 ring-1 ring-amber-300")
                }
                title={isPass ? "Solid" : "Could improve"}
              >
                {isPass ? "✓" : "⚠"}
              </span>
              <div className="flex-1 min-w-0">
                <div>
                  <span className={
                    "inline-block text-xs font-extrabold uppercase tracking-wide px-2 py-0.5 rounded " +
                    (isPass
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700")
                  }>
                    {CATEGORY_LABELS[cat.name]}
                  </span>
                </div>
                <div className="text-sm text-slate-200 mt-0.5 leading-relaxed">
                  {cat.note}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {feedback.overall && (
        <div className="pt-3 border-t border-slate-700">
          <div className="text-xs font-extrabold uppercase tracking-wider text-purple-400 mb-1.5">
            Overall
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            {feedback.overall}
          </p>
        </div>
      )}

      <div className="pt-1 text-xs text-slate-500 italic">
        Suggestions only. Your script is never edited automatically.
      </div>
    </div>
  );
}

/* ============================================================
   🆕 Commit 12 — News-event warning modal
============================================================ */
function NewsEventWarningModal({
  category,
  reason,
  onSwitchToAiArt,
  onProceedAnyway,
  onClose,
}: {
  category: ClassifyCategory;
  reason: string;
  onSwitchToAiArt: () => void;
  onProceedAnyway: () => void;
  onClose: () => void;
}) {
  const isConflict = category === "conflict_disaster";

  const headline = isConflict
    ? "Heads up — these topics are hard for stock photos"
    : "Heads up — current events are hard for stock photos";

  const body = isConflict
    ? "Your content mentions conflict, war, or disaster. Stock libraries don't have photos of specific real-world events like missile strikes, casualties, or recent disasters — they tend to return generic or even celebratory imagery instead (e.g. fireworks for explosions). AI Art mode handles these topics much better."
    : "Your content mentions current events, named real people, or recent news. Stock libraries can't represent these specifically — they'll return generic substitutes that may not match what you're saying. AI Art mode generates context-aware imagery that matches your script.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-700 text-xl">
            ⚠
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">{headline}</h2>
            {reason && (
              <p className="text-xs text-gray-500 mt-0.5">Detected: {reason}</p>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed">{body}</p>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="font-medium text-sm text-purple-900 mb-1">
            🎨 Recommended: Switch to AI Art
          </div>
          <p className="text-xs text-purple-800 leading-relaxed">
            DALL-E generates images from your scene descriptions, so you&rsquo;ll
            get visuals that match what you&rsquo;re saying. Costs $0.08 per image.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onSwitchToAiArt}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2.5 font-medium text-sm transition-colors"
          >
            Switch to AI Art
          </button>
          <button
            type="button"
            onClick={onProceedAnyway}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            Continue with stock photos anyway
          </button>
        </div>
      </div>
    </div>
  );
}