// ============================================================
// FILE: src/app/dashboard/recreate/page.tsx
// ============================================================
// Ripple — ReCreate pipeline
// Brand pass: cyan pipeline cue in header + cyan progress bars
// (so in-flight renders match the cyan ReCreate cards in Library),
// coral throughout for forms, CTAs, and selections.
//
// Pipeline:
//   [1] User pastes YouTube URL + picks language/style
//   [2] AI transcribes → writes original script → finds stock footage
//   [3] Generates TTS narration → renders with captions
//   [4] User previews, downloads, or publishes to YouTube
// ============================================================

"use client";

import UsageBanner from "@/components/UsageBanner";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import CaptionStylePicker, { type CaptionConfig } from "@/components/CaptionStylePicker";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";
const CYAN = "#5DD3E0";        // ReCreate pipeline color (header + progress)
const CYAN_BG = "rgba(93,211,224,0.10)";
const CYAN_BORDER = "rgba(93,211,224,0.3)";

/* ── Types ──────────────────────────────────────────────────── */
interface ReCreateProject {
  id: string;
  status: string;
  progress_pct: number;
  progress_stage: string | null;
  source_url: string;
  source_title: string | null;
  source_thumbnail: string | null;
  source_channel: string | null;
  source_duration_sec: number | null;
  target_language: string;
  style: string;
  transcript_original: string | null;
  script_translated: string | null;
  scenes: Array<{
    text: string;
    scene_query: string;
    media_url?: string;
    media_type?: string;
  }>;
  tts_url: string | null;
  final_video_url: string | null;
  error_message: string | null;
  created_at: string;
}

interface VideoPreview {
  title: string;
  thumbnail: string;
  channel: string;
}

/* ── Languages with ElevenLabs Voice Database ───────────────── */
const LANGUAGES: {
  code: string;
  name: string;
  flag: string;
  voices: { id: string; name: string; gender: string }[];
}[] = [
  {
    code: "en", name: "English", flag: "🇺🇸",
    voices: [
      { id: "ZF6FPAbjXT4488VcRRnw", name: "Amelia", gender: "Female" },
      { id: "kPzsL2i3teMYv0FxEYQ6", name: "Brittney", gender: "Female" },
      { id: "tnSpp4vdxKPjI9w0GnoV", name: "Hope", gender: "Female" },
      { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", gender: "Male" },
      { id: "1SM7GgM6IMuvQlz2BwM3", name: "Mark C.", gender: "Male" },
      { id: "j9jfwdrw7BRfcR43Qohk", name: "Frederick", gender: "Male" },
    ],
  },
  {
    code: "vi", name: "Vietnamese", flag: "🇻🇳",
    voices: [
      { id: "DvG3I1kDzdBY3u4EzYh6", name: "Ngân Nguyễn", gender: "Female" },
      { id: "0ggMuQ1r9f9jqBu50nJn", name: "Thảm", gender: "Female" },
      { id: "N0Z0aL8qHhzwUHwRBcVo", name: "Thanh", gender: "Female" },
      { id: "DVQIYWzpAqd5qcoIlirg", name: "Duyên", gender: "Female" },
      { id: "jdlxsPOZOHdGEfcItXVu", name: "Hiền", gender: "Female" },
      { id: "ArosID24mP18TEiQpNhs", name: "Trang", gender: "Female" },
      { id: "UsgbMVmY3U59ijwK5mdh", name: "Triệu Dương", gender: "Male" },
      { id: "ywBZEqUhld86Jeajq94o", name: "Anh", gender: "Male" },
      { id: "kPNz4WRTiKDplS7jAwHu", name: "Trấn Thành", gender: "Male" },
      { id: "ipTvfDXAg1zowfF1rv9w", name: "Hoàng Đăng", gender: "Male" },
      { id: "6adFm46eyy74snVn6YrT", name: "Nhật", gender: "Male" },
      { id: "3VnrjnYrskPMDsapTr8X", name: "Tùng", gender: "Male" },
    ],
  },
  {
    code: "es", name: "Spanish", flag: "🇪🇸",
    voices: [
      { id: "CaJslL1xziwefCeTNzHv", name: "Cristina", gender: "Female" },
      { id: "kcQkGnn0HAT2JRDQ4Ljp", name: "Norah", gender: "Female" },
      { id: "qHkrJuifPpn95wK3rm2A", name: "Andrea", gender: "Female" },
      { id: "dlGxemPxFMTY7iXagmOj", name: "Fernando", gender: "Male" },
      { id: "l1zE9xgNpUTaQCZzpNJa", name: "Alberto", gender: "Male" },
      { id: "9F4C8ztpNUmXkdDDbz3J", name: "Dan", gender: "Male" },
    ],
  },
  {
    code: "zh", name: "Chinese", flag: "🇨🇳",
    voices: [
      { id: "ByhETIclHirOlWnWKhHc", name: "Shan Shan", gender: "Female" },
      { id: "hkfHEbBvdQFNX4uWHqRF", name: "Stacy", gender: "Female" },
      { id: "9lHjugDhwqoxA5MhX0az", name: "Anna Su", gender: "Female" },
      { id: "4VZIsMPtgggwNg7OXbPY", name: "James Gao", gender: "Male" },
      { id: "WuLq5z7nEcrhppO0ZQJw", name: "Martin Li", gender: "Male" },
      { id: "BrbEfHMQu0fyclQR7lfh", name: "Kevin Tu", gender: "Male" },
    ],
  },
  {
    code: "ko", name: "Korean", flag: "🇰🇷",
    voices: [
      { id: "uyVNoMrnUku1dZyVEXwD", name: "Anna Kim", gender: "Female" },
      { id: "z6Kj0hecH20CdetSElRT", name: "Jennie", gender: "Female" },
      { id: "ksaI0TCD9BstzEzlxj4q", name: "Seulki", gender: "Female" },
      { id: "ZJCNdZEjYwkOElxugmW2", name: "Hyuk", gender: "Male" },
      { id: "jB1Cifc2UQbq1gR3wnb0", name: "Bin", gender: "Male" },
      { id: "PDoCXqBQFGsvfO0hNkEs", name: "Chris", gender: "Male" },
    ],
  },
  {
    code: "ja", name: "Japanese", flag: "🇯🇵",
    voices: [
      { id: "8EkOjt4xTPGMclNlh1pk", name: "Morioki", gender: "Female" },
      { id: "RBnMinrYKeccY3vaUxlZ", name: "Sakura", gender: "Female" },
      { id: "4lOQ7A2l7HPuG7UIHiKA", name: "Kyoko", gender: "Female" },
      { id: "3JDquces8E8bkmvbh6Bc", name: "Otani", gender: "Male" },
      { id: "j210dv0vWm7fCknyQpbA", name: "Hinata", gender: "Male" },
      { id: "Mv8AjrYZCBkdsmDHNwcB", name: "Ishibashi", gender: "Male" },
    ],
  },
  {
    code: "hi", name: "Hindi", flag: "🇮🇳",
    voices: [
      { id: "KYiVPerWcenyBTIvWbfY", name: "Sia", gender: "Female" },
      { id: "gHu9GtaHOXcSqFTK06ux", name: "Anjali", gender: "Female" },
      { id: "2bNrEsM0omyhLiEyOwqY", name: "Monika", gender: "Female" },
      { id: "zT03pEAEi0VHKciJODfn", name: "Raju", gender: "Male" },
      { id: "zgqefOY5FPQ3bB7OZTVR", name: "Niraj", gender: "Male" },
      { id: "iWNf11sz1GrUE4ppxTOL", name: "Viraj", gender: "Male" },
    ],
  },
  {
    code: "fr", name: "French", flag: "🇫🇷",
    voices: [
      { id: "McVZB9hVxVSk3Equu8EH", name: "Audrey", gender: "Female" },
      { id: "6vTyAgAT8PncODBcLjRf", name: "Claire", gender: "Female" },
      { id: "txtf1EDouKke753vN8SL", name: "Jeanne", gender: "Female" },
      { id: "aQROLel5sQbj1vuIVi6B", name: "Nicolas", gender: "Male" },
      { id: "NyxenPOqNyllHIzSoPbJ", name: "Theo", gender: "Male" },
      { id: "ohItIVrXTBI80RrUECOD", name: "Guillaume", gender: "Male" },
    ],
  },
  {
    code: "pt", name: "Portuguese", flag: "🇧🇷",
    voices: [
      { id: "33B4UnXyTNbgLmdEDh5P", name: "Keren", gender: "Female" },
      { id: "MZxV5lN3cv7hi1376O0m", name: "Ana Dias", gender: "Female" },
      { id: "r2fkFV8WAqXq2AqBpgJT", name: "Amandoca", gender: "Female" },
      { id: "WFSxKvz27RguNRD3Phoq", name: "Wesley", gender: "Male" },
      { id: "NGS0ZsC7j4t4dCWbPdgO", name: "Dhyogo", gender: "Male" },
      { id: "CstacWqMhJQlnfLPxRG4", name: "Will", gender: "Male" },
    ],
  },
  {
    code: "ar", name: "Arabic", flag: "🇸🇦",
    voices: [
      { id: "u0TsaWvt0v8migutHM3M", name: "Ghizlane", gender: "Female" },
      { id: "mRdG9GYEjJmIzqbYTidv", name: "Sana", gender: "Female" },
      { id: "a1KZUXKFVFDOb33I1uqr", name: "Salma", gender: "Female" },
      { id: "LXrTqFIgiubkrMkwvOUr", name: "Masry", gender: "Male" },
      { id: "A9ATTqUUQ6GHu0coCz8t", name: "Hamid", gender: "Male" },
    ],
  },
  {
    code: "th", name: "Thai", flag: "🇹🇭",
    voices: [
      { id: "OYTbf65OHHFELVut7v2H", name: "Somchai", gender: "Male" },
      { id: "G1sDKAEfGkCNkHRv0xwE", name: "Niran", gender: "Male" },
    ],
  },
  {
    code: "id", name: "Indonesian", flag: "🇮🇩",
    voices: [
      { id: "iWydkXKoiVtvdn4vLKp9", name: "Cahaya", gender: "Female" },
      { id: "I7sakys8pBZ1Z5f0UhT9", name: "Putri", gender: "Female" },
      { id: "gmnazjXOFoOcWA59sd5m", name: "Kira", gender: "Female" },
      { id: "X8n8hOy3e8VLQnHTUcc5", name: "Bram", gender: "Male" },
      { id: "RWiGLY9uXI70QL540WNd", name: "Putra", gender: "Male" },
      { id: "TMvmhlKUioQA4U7LOoko", name: "Andi", gender: "Male" },
    ],
  },
  {
    code: "de", name: "German", flag: "🇩🇪",
    voices: [
      { id: "v3V1d2rk6528UrLKRuy8", name: "Susi", gender: "Female" },
      { id: "7eVMgwCnXydb3CikjV7a", name: "Lea", gender: "Female" },
      { id: "FTNCalFNG5bRnkkaP5Ug", name: "Otto", gender: "Male" },
      { id: "r8MyP4qUsq5WFFSkPdfV", name: "Johannes", gender: "Male" },
    ],
  },
  {
    code: "ru", name: "Russian", flag: "🇷🇺",
    voices: [
      { id: "ymDCYd8puC7gYjxIamPt", name: "Marina", gender: "Female" },
      { id: "EDpEYNf6XIeKYRzYcx4I", name: "Mariia", gender: "Female" },
      { id: "gJEfHTTiifXEDmO687lC", name: "Prince Nur", gender: "Male" },
      { id: "3EuKHIEZbSzrHGNmdYsx", name: "Nikolay", gender: "Male" },
    ],
  },
  {
    code: "tr", name: "Turkish", flag: "🇹🇷",
    voices: [
      { id: "KbaseEXyT9EE0CQLEfbB", name: "Belma", gender: "Female" },
      { id: "PdYVUd1CAGSXsTvZZTNn", name: "Mia", gender: "Female" },
      { id: "IuRRIAcbQK5AQk1XevPj", name: "Doga", gender: "Male" },
      { id: "7VqWGAWwo2HMrylfKrcm", name: "Fatih", gender: "Male" },
    ],
  },
  {
    code: "tl", name: "Filipino", flag: "🇵🇭",
    voices: [
      { id: "ZF6FPAbjXT4488VcRRnw", name: "Amelia", gender: "Female" },
      { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", gender: "Male" },
    ],
  },
];

/* ── Styles ─────────────────────────────────────────────────── */
const STYLES = [
  { id: "news", label: "📰 News Report", desc: "Professional news anchor style" },
  { id: "documentary", label: "🎬 Documentary", desc: "Cinematic narration with depth" },
  { id: "casual", label: "💬 Casual", desc: "Friendly vlog-style storytelling" },
  { id: "educational", label: "📚 Educational", desc: "Clear teaching with examples" },
  { id: "motivational", label: "🔥 Motivational", desc: "Inspiring and energetic" },
];

/* ── Stage Labels ───────────────────────────────────────────── */
const STAGE_LABELS: Record<string, string> = {
  processing: "Starting pipeline...",
  transcribing: "🎧 Transcribing original audio...",
  scripting: "✍️ AI writing original script...",
  finding_media: "🖼️ Finding stock footage & images...",
  generating_voice: "🗣️ Generating narration...",
  rendering: "🎬 Rendering final video...",
  uploading: "☁️ Uploading...",
  done: "✅ Complete!",
  error: "❌ Error",
};

export default function ReCreatePage() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [selectedStyle, setSelectedStyle] = useState("news");
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({ style: "classic", position: "bottom" });
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [targetLength, setTargetLength] = useState(90);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [voiceId, setVoiceId] = useState(LANGUAGES[0].voices[0]?.id || "");
  const [music, setMusic] = useState("none");
  const [urlFocused, setUrlFocused] = useState(false);

  const voices = selectedLang.voices;

  useEffect(() => {
    if (voices.length > 0 && !voices.find((v) => v.id === voiceId)) {
      setVoiceId(voices[0].id);
    }
  }, [selectedLang, voices, voiceId]);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ReCreateProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // YouTube publish state
  const [ytConnected, setYtConnected] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Auth helper ─────────────────────────────────────────── */
  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  /* ── Check YouTube connection on mount ───────────────────── */
  useEffect(() => {
    async function checkYT() {
      try {
        const res = await fetch("/api/auth/youtube/status");
        if (res.ok) {
          const data = await res.json();
          setYtConnected(data.connected === true);
        }
      } catch {}
    }
    checkYT();
  }, []);

  /* ── Fetch video preview ─────────────────────────────────── */
  const fetchPreview = useCallback(async (inputUrl: string) => {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(inputUrl)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        setPreview({
          title: data.title,
          thumbnail: data.thumbnail_url,
          channel: data.author_name,
        });
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    if (!url) { setPreview(null); return; }
    const t = setTimeout(() => fetchPreview(url), 500);
    return () => clearTimeout(t);
  }, [url, fetchPreview]);

  /* ── Poll project status ─────────────────────────────────── */
  const pollStatus = useCallback(async (pid: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/recreate/status?id=${pid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { project: proj } = await res.json();
      if (proj) {
        setProject(proj);
        if (proj.status === "done" || proj.status === "error") {
          setGenerating(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!projectId || !generating) return;
    pollStatus(projectId);
    pollRef.current = setInterval(() => pollStatus(projectId), 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [projectId, generating, pollStatus]);

  /* ── Handle Generate ─────────────────────────────────────── */
  async function handleGenerate() {
    setError(null);
    setProject(null);
    setPublishResult(null);

    const token = await getToken();
    if (!token) { setError("Not logged in. Please log in again."); return; }
    if (!url) { setError("Please paste a YouTube URL."); return; }

    setGenerating(true);

    try {
      const createRes = await fetch("/api/recreate/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source_url: url,
          target_language: selectedLang.name,
          style: selectedStyle,
          voice_id: voiceId,
          include_captions: includeCaptions,
          caption_style: includeCaptions ? captionConfig.style : "none",
          caption_position: captionConfig.position,
          music,
          target_length: targetLength,
          orientation,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Failed to create project");
      }

      const { project: newProject } = await createRes.json();
      setProject(newProject);
      setProjectId(newProject.id);

      const startRes = await fetch("/api/recreate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: newProject.id }),
      });

      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start pipeline");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setGenerating(false);
    }
  }

  /* ── Download helper ─────────────────────────────────────── */
  async function downloadVideo(videoUrl: string, name: string) {
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {}
  }

  /* ── Publish to YouTube ──────────────────────────────────── */
  async function handlePublishToYouTube() {
    if (!project?.final_video_url) return;
    setPublishing(true);
    setPublishResult(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      const title = project.source_title
        ? `${project.source_title} — ReCreated in ${selectedLang.name}`
        : `ReCreated Video — ${selectedLang.name} ${new Date().toLocaleDateString()}`;

      const description = [
        `AI-recreated version of "${project.source_title || "original video"}"`,
        `Language: ${selectedLang.name}`,
        `Style: ${selectedStyle}`,
        "",
        "Created with Ripple — One video. Infinite reach.",
        "Original content rewritten with fresh narration and stock footage.",
        "",
        "#shorts #AI #Ripple",
      ].join("\n");

      const res = await fetch("/api/publish/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          video_url: project.final_video_url,
          title: title.slice(0, 100),
          description,
          tags: ["AI", "Ripple", "ReCreate", selectedLang.name, selectedStyle],
          privacy: "public",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Publish failed");
      }

      const result = await res.json();
      setPublishResult({ url: result.youtube_url || result.url });
    } catch (err: any) {
      setPublishResult({ error: err?.message || "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }

  /* ── Derived state ───────────────────────────────────────── */
  const isProcessing = generating || (project?.status !== "done" && project?.status !== "error" && project?.status !== "draft" && project?.status !== undefined && project !== null);
  const progressPct = project?.progress_pct || 0;
  const progressText = STAGE_LABELS[project?.status || ""] || project?.progress_stage || "";
  const isDone = project?.status === "done";
  const hasError = project?.status === "error";

  // Shared label style helper
  const labelStyle: React.CSSProperties = {
    color: "#8B8794",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Header (cyan pipeline cue) ──────────────────── */}
        <div className="flex items-center gap-4 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: CYAN_BG,
              border: `1px solid ${CYAN_BORDER}`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </div>
          <div>
            <h1
              className="text-3xl font-bold"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              ReCreate
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#8B8794" }}>
              Reimagine any video in your language with fresh stock footage. Zero copyright issues.
            </p>
          </div>
        </div>

        <UsageBanner pipeline="recreate" className="mb-6 mt-6" />

        {/* ── Main Card ─────────────────────────────────────── */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* URL Input */}
          <div className="mb-5">
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Source Video URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setUrlFocused(true)}
              onBlur={() => setUrlFocused(false)}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={generating}
              className="w-full px-4 py-3.5 rounded-xl text-sm transition outline-none disabled:opacity-50"
              style={{
                background: "#0F0E1A",
                border: urlFocused
                  ? "1px solid rgba(255,107,90,0.5)"
                  : "1px solid rgba(255,255,255,0.1)",
                color: "#F5F2ED",
                boxShadow: urlFocused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
              }}
            />
          </div>

          {/* Video Preview */}
          {preview && (
            <div
              className="flex items-center gap-4 p-3 rounded-xl mb-5"
              style={{
                background: "rgba(255,107,90,0.05)",
                border: "1px solid rgba(255,107,90,0.15)",
              }}
            >
              <img src={preview.thumbnail} alt="" className="w-28 h-16 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                >
                  {preview.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#8B8794" }}>{preview.channel}</p>
              </div>
            </div>
          )}

          {/* Target Language */}
          <div className="mb-5">
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              ReCreate In
            </label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const active = selectedLang.code === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLang(lang)}
                    disabled={generating}
                    className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                      border: active ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      color: active ? CORAL_SOFT : "#8B8794",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    {lang.flag} {lang.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Style */}
          <div className="mb-5">
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Content Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLES.map((style) => {
                const active = selectedStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    disabled={generating}
                    className="px-3 py-2.5 rounded-lg text-left transition-all disabled:opacity-50"
                    style={{
                      background: active ? "rgba(255,107,90,0.12)" : "rgba(255,255,255,0.03)",
                      border: active ? "1px solid rgba(255,107,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      className="text-xs font-semibold"
                      style={{
                        color: active ? CORAL_SOFT : "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {style.label}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>
                      {style.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice */}
          <div className="mb-5">
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Voice — {selectedLang.flag} {voices.length} {selectedLang.name} narrator{voices.length > 1 ? "s" : ""}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {voices.map((voice) => {
                const active = voiceId === voice.id;
                return (
                  <button
                    key={voice.id}
                    onClick={() => setVoiceId(voice.id)}
                    disabled={generating}
                    className="p-2.5 rounded-lg text-left transition-all disabled:opacity-50"
                    style={active ? {
                      border: "1px solid rgba(255,107,90,0.5)",
                      background: "rgba(255,107,90,0.12)",
                      boxShadow: "0 0 14px rgba(255,107,90,0.15)",
                    } : {
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      className="text-xs font-semibold"
                      style={{
                        color: active ? CORAL_SOFT : "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {voice.name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>
                      {voice.gender === "Female" ? "♀" : "♂"} {voice.gender}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Video Length */}
          <div className="mb-6">
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Video Length
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { val: 30,   label: "30s",    desc: "Shorts" },
                { val: 60,   label: "1 min",  desc: "Quick" },
                { val: 90,   label: "90s",    desc: "Standard" },
                { val: 180,  label: "3 min",  desc: "In-depth" },
                { val: 300,  label: "5 min",  desc: "Deep dive" },
                { val: 480,  label: "8 min",  desc: "Extended" },
                { val: 720,  label: "12 min", desc: "Long-form" },
                { val: 960,  label: "16 min", desc: "Detailed" },
                { val: 1200, label: "20 min", desc: "Podcast" },
                { val: 1440, label: "24 min", desc: "Series ep." },
                { val: 1800, label: "30 min", desc: "Full ep." },
              ] as const).map((opt) => {
                const active = targetLength === opt.val;
                return (
                  <button
                    key={opt.val}
                    onClick={() => setTargetLength(opt.val)}
                    className="flex flex-col items-center py-2.5 px-3 rounded-lg transition-all w-[calc(25%-6px)]"
                    style={{
                      background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                      border: active ? "1.5px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <span
                      className="text-sm font-bold"
                      style={{
                        color: active ? CORAL_SOFT : "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[10px] mt-0.5" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Output Format */}
          <div className="mb-6">
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Output Format
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { val: "landscape", label: "16:9 Landscape", desc: "YouTube / standard" },
                { val: "portrait",  label: "9:16 Portrait",  desc: "Shorts / TikTok" },
              ] as const).map((opt) => {
                const active = orientation === opt.val;
                return (
                  <button
                    key={opt.val}
                    onClick={() => setOrientation(opt.val)}
                    className="flex flex-col items-center py-2.5 rounded-lg transition-all"
                    style={{
                      background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                      border: active ? "1.5px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: active ? CORAL_SOFT : "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[10px] mt-0.5" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Captions toggle + style picker */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIncludeCaptions(!includeCaptions)}
                className="w-10 h-5 rounded-full transition-all relative"
                style={{
                  background: includeCaptions ? "rgba(255,107,90,0.5)" : "rgba(255,255,255,0.1)",
                  border: `1px solid ${includeCaptions ? "rgba(255,107,90,0.6)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
                  style={{
                    background: includeCaptions ? "#F5F2ED" : "#8B8794",
                    left: includeCaptions ? "22px" : "2px",
                  }}
                />
              </button>
              <span className="text-xs" style={{ color: "#8B8794" }}>Include captions in video</span>
            </div>
            {includeCaptions && (
              <CaptionStylePicker
                value={captionConfig}
                onChange={setCaptionConfig}
                accent={CORAL}
              />
            )}
          </div>

          {/* Background Music */}
          <div className="mb-5">
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wider"
              style={labelStyle}
            >
              Background Music
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "none", label: "None", desc: "Voice only" },
                { id: "cinematic", label: "Cinematic", desc: "News & drama" },
                { id: "ambient", label: "Ambient", desc: "Subtle & calm" },
                { id: "uplifting", label: "Uplifting", desc: "Energetic & bright" },
              ].map((m) => {
                const active = music === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMusic(m.id)}
                    disabled={generating}
                    className="px-3 py-2.5 rounded-lg text-left transition-all disabled:opacity-50"
                    style={{
                      background: active ? "rgba(255,107,90,0.12)" : "rgba(255,255,255,0.03)",
                      border: active ? "1px solid rgba(255,107,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      className="text-xs font-semibold"
                      style={{
                        color: active ? CORAL_SOFT : "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {m.label}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>
                      {m.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                background: "rgba(255,107,107,0.10)",
                border: "1px solid rgba(255,107,107,0.3)",
                color: "#FF6B6B",
              }}
            >
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!url || generating}
            className="w-full py-4 rounded-xl text-base font-bold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: !url || generating
                ? "rgba(255,107,90,0.3)"
                : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
              color: "#0F0E1A",
              boxShadow: !url || generating ? "none" : "0 8px 30px -8px rgba(255,107,90,0.5)",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            {generating
              ? "🔄 ReCreating..."
              : selectedLang.code === "en"
                ? `🔄 Rewrite in ${selectedLang.flag} English (New Voice + Stock Footage)`
                : `🚀 ReCreate in ${selectedLang.flag} ${selectedLang.name}`}
          </button>

          {/* How it works note */}
          <div
            className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span className="text-xs mt-0.5">💡</span>
            <p className="text-[11px] leading-relaxed" style={{ color: "#8B8794" }}>
              <strong style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                How it works:
              </strong>{" "}
              AI transcribes the source video,
              {selectedLang.code === "en"
                ? " rewrites the content using completely different words while keeping the same facts,"
                : ` writes a completely original script in ${selectedLang.name},`}
              {" "}finds matching stock footage from Pexels + Pixabay, generates
              voiceover narration, and renders a brand new video. The output contains zero original footage
              — fully original and safe to monetize.
            </p>
          </div>
        </div>

        {/* ── Progress Section ──────────────────────────────── */}
        {(isProcessing || isDone || hasError) && project && (
          <div
            className="rounded-2xl p-6"
            style={{
              background: "#16151F",
              border: isDone
                ? "1px solid rgba(93,211,158,0.25)"
                : hasError
                  ? "1px solid rgba(255,107,107,0.25)"
                  : `1px solid ${CYAN_BORDER}`,
            }}
          >
            {/* Source info */}
            {project.source_title && (
              <div className="flex items-center gap-3 mb-4">
                {project.source_thumbnail && (
                  <img src={project.source_thumbnail} alt="" className="w-16 h-10 rounded-lg object-cover opacity-60" />
                )}
                <div className="min-w-0">
                  <p className="text-xs truncate" style={{ color: "#F5F2ED" }}>{project.source_title}</p>
                  <p className="text-[10px]" style={{ color: "#5A5762" }}>
                    {project.source_channel} → {selectedLang.flag} {selectedLang.name}
                  </p>
                </div>
              </div>
            )}

            {/* Progress bar (cyan — pipeline cue for in-flight) */}
            {isProcessing && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: CYAN, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                    {progressText}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: CYAN,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {progressPct}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${progressPct}%`,
                      background: `linear-gradient(90deg, ${CYAN}, #5DD3E0)`,
                      boxShadow: "0 0 12px rgba(93,211,224,0.4)",
                    }}
                  />
                </div>

                {/* Pipeline steps */}
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {[
                    { key: "transcribing", icon: "🎧", label: "Transcribe" },
                    { key: "scripting", icon: "✍️", label: "Script" },
                    { key: "finding_media", icon: "🖼️", label: "Media" },
                    { key: "generating_voice", icon: "🗣️", label: "Voice" },
                    { key: "rendering", icon: "🎬", label: "Render" },
                    { key: "done", icon: "✅", label: "Done" },
                  ].map((step) => {
                    const current = project.status === step.key;
                    const completed = getStepOrder(project.status || "") > getStepOrder(step.key);
                    return (
                      <div
                        key={step.key}
                        className="text-center py-2 rounded-lg"
                        style={{
                          background: current
                            ? CYAN_BG
                            : completed
                              ? "rgba(93,211,158,0.08)"
                              : "rgba(255,255,255,0.02)",
                          border: current
                            ? `1px solid ${CYAN_BORDER}`
                            : "1px solid transparent",
                        }}
                      >
                        <div className="text-sm">{completed ? "✅" : step.icon}</div>
                        <div
                          className="text-[9px] mt-0.5 font-semibold"
                          style={{
                            color: current ? CYAN : completed ? "#5DD39E" : "#5A5762",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error */}
            {hasError && (
              <div
                className="p-3 rounded-lg mb-4"
                style={{
                  background: "rgba(255,107,107,0.10)",
                  border: "1px solid rgba(255,107,107,0.3)",
                }}
              >
                <p className="text-sm" style={{ color: "#FF6B6B" }}>
                  {project.error_message || "Something went wrong"}
                </p>
                <button
                  onClick={handleGenerate}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{
                    background: "rgba(255,107,90,0.10)",
                    border: "1px solid rgba(255,107,90,0.3)",
                    color: CORAL_SOFT,
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  🔄 Try Again
                </button>
              </div>
            )}

            {/* Done — Show result */}
            {isDone && project.final_video_url && (
              <div>
                <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(93,211,158,0.25)" }}>
                  <video
                    src={project.final_video_url}
                    controls
                    className="w-full max-h-[500px]"
                    style={{ background: "#000" }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      const name = `recreate-${selectedLang.code}-${Date.now()}`;
                      downloadVideo(project.final_video_url!, `${name}.mp4`);
                    }}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
                    style={{
                      background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                      color: "#0F0E1A",
                      boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    ⬇️ Download Video
                  </button>

                  {/* YouTube Publish Button (kept YouTube red — brand identity) */}
                  {ytConnected && !publishResult?.url && (
                    <button
                      onClick={handlePublishToYouTube}
                      disabled={publishing}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:scale-[1.02] disabled:opacity-50"
                      style={{
                        background: publishing
                          ? "rgba(220,38,38,0.3)"
                          : "linear-gradient(135deg, #FF0000 0%, #CC0000 100%)",
                        boxShadow: publishing ? "none" : "0 4px 16px -4px rgba(255,0,0,0.4)",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {publishing ? "⏳ Publishing..." : "▶ Publish to YouTube"}
                    </button>
                  )}

                  {/* YouTube Published Success */}
                  {publishResult?.url && (
                    <a
                      href={publishResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
                      style={{
                        background: "rgba(93,211,158,0.10)",
                        border: "1px solid rgba(93,211,158,0.3)",
                        color: "#5DD39E",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      ✅ Live on YouTube ↗
                    </a>
                  )}

                  {/* YouTube Publish Error */}
                  {publishResult?.error && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "#FF6B6B" }}>⚠ {publishResult.error}</span>
                      <button
                        onClick={handlePublishToYouTube}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                        style={{
                          background: "rgba(255,107,107,0.10)",
                          border: "1px solid rgba(255,107,107,0.3)",
                          color: "#FF6B6B",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Not connected hint */}
                  {!ytConnected && (
                    <a
                      href="/dashboard/settings"
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#8B8794",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      🔗 Connect YouTube to publish
                    </a>
                  )}

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(project.final_video_url!);
                    }}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    🔗 Copy URL
                  </button>

                  <button
                    onClick={() => window.open(project.final_video_url!, "_blank")}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    ↗ Open
                  </button>
                </div>

                {/* Script preview */}
                {project.script_translated && (
                  <div className="mt-5">
                    <button
                      onClick={() => {
                        const el = document.getElementById("script-preview");
                        if (el) el.style.display = el.style.display === "none" ? "block" : "none";
                      }}
                      className="text-xs font-semibold transition"
                      style={{
                        color: CORAL_SOFT,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      📝 Show/Hide AI Script
                    </button>
                    <div
                      id="script-preview"
                      className="mt-2 p-4 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
                      style={{
                        display: "none",
                        background: "#0F0E1A",
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "#C7C3C9",
                        maxHeight: "300px",
                        overflow: "auto",
                      }}
                    >
                      {project.script_translated}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper: step ordering for progress display ────────────── */
function getStepOrder(status: string): number {
  const order: Record<string, number> = {
    draft: 0, processing: 1, transcribing: 2, scripting: 3,
    finding_media: 4, generating_voice: 5, rendering: 6, done: 7, error: -1,
  };
  return order[status] ?? 0;
}