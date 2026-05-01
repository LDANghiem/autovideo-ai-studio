// ============================================================
// FILE: src/app/dashboard/shorts/page.tsx
// ============================================================
// Ripple — AI Shorts (formerly merged Shorts + Auto-Repurpose)
//
// Brand pass: amber pipeline cue in header (matches sidebar),
// coral CTAs, platform targeting ported from old Repurpose page.
//
// Uses the REPURPOSE pipeline endpoints (DB tables remain named
// repurpose_*; that's a backend implementation detail, the user-
// facing feature is "Shorts"):
//   POST /api/repurpose/create  → create project
//   POST /api/repurpose/start   → trigger worker
//   GET  /api/repurpose/status/[id] → poll progress
//
// Worker: localhost:10000/repurpose
//
// All logic preserved: auto-select on done, 3s polling, YouTube
// OAuth + per-clip publish, download single + bulk, copy URL/tags.
// ============================================================

"use client";

import UsageBanner from "@/components/UsageBanner";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import CaptionStylePicker, { type CaptionConfig } from "@/components/CaptionStylePicker";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";              // AI Shorts pipeline color
const AMBER_BG = "rgba(255,169,77,0.12)";
const AMBER_BORDER = "rgba(255,169,77,0.3)";

/* ── Types ──────────────────────────────────────────────────── */
interface Clip {
  id: string;
  index: number;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
  duration: number;
  hook_score: number;
  reason: string;
  suggested_title?: string;
  suggested_hashtags?: string[];
  emotional_hook?: string;
  thumbnail_url?: string;
  video_url?: string;
  status: string;
}

interface Project {
  id: string;
  status: string;
  progress_pct: number;
  progress_stage: string | null;
  source_title: string | null;
  source_thumbnail: string | null;
  source_channel: string | null;
  source_duration_sec: number | null;
  clips: Clip[];
  error_message: string | null;
}

interface VideoPreview {
  title: string;
  thumbnail: string;
  channel: string;
}

/* ── Constants ──────────────────────────────────────────────── */
const STAGE_LABELS: Record<string, string> = {
  downloading: "⬇️ Downloading video...",
  transcribing: "🎧 Transcribing audio with Whisper...",
  analyzing: "🧠 AI detecting viral moments...",
  clipping: "✂️ Extracting & cropping clips to 9:16...",
  thumbnails: "🖼️ Generating thumbnails...",
  uploading: "☁️ Uploading clips...",
  done: "✅ Done! Your shorts are ready.",
};

const TARGET_PLATFORMS = [
  { id: "youtube_shorts", label: "YouTube Shorts", icon: "📺", maxSec: 60, desc: "Max 60s" },
  { id: "tiktok", label: "TikTok", icon: "🎵", maxSec: 180, desc: "Max 3 min" },
  { id: "reels", label: "Instagram Reels", icon: "📸", maxSec: 90, desc: "Max 90s" },
];

/* ── Helpers ────────────────────────────────────────────────── */
function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#FFA94D";  // amber for hot
  if (score >= 60) return "#FF8B7A";  // coral-soft for good
  if (score >= 40) return "#5DD3E0";  // cyan for okay
  return "#5A5762";                    // muted for low
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/* ── Main Component ─────────────────────────────────────────── */
export default function AIShortsPage() {
  // Input
  const [url, setUrl] = useState("");
  const [maxClips, setMaxClips] = useState(5);
  const [clipMin, setClipMin] = useState(30);
  const [clipMax, setClipMax] = useState(60);
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({ style: "karaoke", position: "bottom" });
  const [genThumbs, setGenThumbs] = useState(true);
  const [targetPlatforms, setTargetPlatforms] = useState<Set<string>>(new Set());
  const [urlFocused, setUrlFocused] = useState(false);

  // Project
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VideoPreview | null>(null);

  // Clips
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // YouTube
  const [ytConnected, setYtConnected] = useState(false);
  const [pubStatus, setPubStatus] = useState<Record<string, string>>({});
  const [pubResults, setPubResults] = useState<Record<string, { url?: string; error?: string }>>({});

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived
  const clips = project?.clips || [];
  const hasResults = project?.status === "done" && clips.length > 0;
  const isProcessing = generating || ["processing", "analyzing", "clipping", "downloading", "transcribing", "uploading", "thumbnails"].includes(project?.status || "");
  const pct = project?.progress_pct || 0;
  const stageText = STAGE_LABELS[project?.progress_stage || project?.status || ""] || project?.progress_stage || "Processing...";

  /* ── YouTube status check ────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/youtube/status");
        if (res.ok) {
          const d = await res.json();
          setYtConnected(d.connected === true);
        }
      } catch {}
    })();
  }, []);

  /* ── YouTube preview ─────────────────────────────────────── */
  const fetchPreview = useCallback(async (v: string) => {
    try {
      const m = v.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (!m) { setPreview(null); return; }
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(v)}&format=json`);
      if (res.ok) {
        const d = await res.json();
        setPreview({ title: d.title, thumbnail: d.thumbnail_url, channel: d.author_name || "" });
      } else setPreview(null);
    } catch { setPreview(null); }
  }, []);

  useEffect(() => {
    if (!url) { setPreview(null); return; }
    const t = setTimeout(() => fetchPreview(url), 500);
    return () => clearTimeout(t);
  }, [url, fetchPreview]);

  /* ── Poll ─────────────────────────────────────────────────── */
  const poll = useCallback(async (pid: string) => {
    try {
      const tk = await getToken();
      if (!tk) return;
      const res = await fetch(`/api/repurpose/status/${pid}`, { headers: { Authorization: `Bearer ${tk}` } });
      if (!res.ok) return;
      const { project: p } = await res.json();
      if (p) {
        setProject(p);
        if (p.status === "done" || p.status === "error") {
          setGenerating(false);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          if (p.status === "done" && p.clips?.length > 0)
            setSelected(new Set(p.clips.map((c: Clip) => c.id)));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!projectId || !generating) return;
    poll(projectId);
    pollRef.current = setInterval(() => poll(projectId), 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [projectId, generating, poll]);

  /* ── Generate ────────────────────────────────────────────── */
  async function handleGenerate() {
    setError(null); setProject(null); setSelected(new Set()); setToast(null);
    const tk = await getToken();
    if (!tk) { setError("Not logged in."); return; }
    if (!url) { setError("Please paste a YouTube URL."); return; }
    setGenerating(true);

    try {
      const cr = await fetch("/api/repurpose/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          source_url: url, max_clips: maxClips,
          clip_min_seconds: clipMin, clip_max_seconds: clipMax,
          caption_style: captionConfig.style, caption_position: captionConfig.position,
          target_platforms: Array.from(targetPlatforms),
          generate_thumbnails: genThumbs,
        }),
      });
      const cd = await cr.json();
      if (!cr.ok) throw new Error(cd.error || "Failed to create project");

      const pid = cd.project?.id;
      setProjectId(pid); setProject(cd.project);

      const sr = await fetch("/api/repurpose/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ project_id: pid }),
      });
      if (!sr.ok) { const sd = await sr.json(); throw new Error(sd.error || "Failed to start"); }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setGenerating(false);
    }
  }

  /* ── Publish to YouTube ──────────────────────────────────── */
  async function publishYT(clip: Clip) {
    if (!clip.video_url) return;
    const k = clip.id;
    setPubStatus(p => ({ ...p, [k]: "uploading" }));
    try {
      const tk = await getToken();
      if (!tk) throw new Error("Not logged in");
      const title = (clip.suggested_title || clip.title).slice(0, 100);
      const tags = clip.suggested_hashtags || [];
      const desc = [clip.description || title, "", tags.join(" "), "", "Created with Ripple — One video. Infinite reach."].join("\n");

      const res = await fetch("/api/publish/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ video_url: clip.video_url, title, description: desc, tags, privacy: "public" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setPubStatus(p => ({ ...p, [k]: "done" }));
      setPubResults(p => ({ ...p, [k]: { url: d.youtube_url } }));
    } catch (e: any) {
      setPubStatus(p => ({ ...p, [k]: "error" }));
      setPubResults(p => ({ ...p, [k]: { error: e?.message || "Failed" } }));
    }
  }

  /* ── Downloads ───────────────────────────────────────────── */
  async function dlClip(url: string, name: string) {
    const r = await fetch(url); const b = await r.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }

  async function dlSelected() {
    const list = clips.filter(c => selected.has(c.id) && c.video_url);
    if (!list.length) return;
    setDownloading(true);
    for (let i = 0; i < list.length; i++) {
      setToast(`Downloading ${i + 1}/${list.length}...`);
      const n = (list[i].suggested_title || list[i].title || `clip-${list[i].index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      await dlClip(list[i].video_url!, `${n}.mp4`);
      if (i < list.length - 1) await new Promise(r => setTimeout(r, 1000));
    }
    setToast(`✓ Downloaded ${list.length} clip${list.length !== 1 ? "s" : ""}`);
    setDownloading(false);
    setTimeout(() => setToast(null), 4000);
  }

  function togglePlatform(platformId: string) {
    setTargetPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  }

  /* ── Reset ───────────────────────────────────────────────── */
  function reset() {
    setUrl(""); setProjectId(null); setProject(null); setGenerating(false);
    setError(null); setPreview(null); setSelected(new Set()); setToast(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Reusable label style
  const labelStyle: React.CSSProperties = {
    color: "#8B8794",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <UsageBanner pipeline="shorts" className="mb-6" />

        {/* ── Header (amber pipeline cue) ───────────────────── */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: AMBER_BG,
                border: `1px solid ${AMBER_BORDER}`,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={AMBER} stroke={AMBER} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
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
                AI Shorts
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "#8B8794" }}>
                Turn any long video into viral Shorts, TikToks &amp; Reels — automatically.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(project || generating) && (
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              >
                ← New Video
              </button>
            )}
            {!project && !generating && (
              <a
                href="/dashboard/repurpose/history"
                className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
                style={{
                  background: AMBER_BG,
                  border: `1px solid ${AMBER_BORDER}`,
                  color: AMBER,
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,169,77,0.20)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = AMBER_BG; }}
              >
                📋 History
              </a>
            )}
          </div>
        </div>

        {/* ── How it works ───────────────────────────────────── */}
        {!hasResults && !generating && (
          <div
            className="rounded-2xl p-6 mb-8"
            style={{
              background: `linear-gradient(135deg, rgba(255,169,77,0.06) 0%, rgba(255,107,90,0.04) 100%)`,
              border: "1px solid rgba(255,169,77,0.15)",
            }}
          >
            <h3
              className="font-semibold mb-3 flex items-center gap-2"
              style={{
                color: AMBER,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              <span>🎯</span> How It Works
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              {[
                { icon: "🔗", text: "Paste YouTube URL" },
                { icon: "🧠", text: "AI finds viral moments" },
                { icon: "✂️", text: "Auto-clips best parts" },
                { icon: "📱", text: "Crops to 9:16 vertical" },
                { icon: "📤", text: "Download or publish" },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-1.5">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-xs" style={{ color: "#C7C3C9" }}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`grid gap-6 ${(isProcessing || hasResults) ? "lg:grid-cols-3" : "lg:grid-cols-1 max-w-2xl mx-auto"}`}>

          {/* ── Left: Settings ────────────────────────────── */}
          <div className="lg:col-span-1">
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* URL */}
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={labelStyle}
                >
                  YouTube Video URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value.trim())}
                  onFocus={() => setUrlFocused(true)}
                  onBlur={() => setUrlFocused(false)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={generating}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition disabled:opacity-50"
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

              {/* Preview */}
              {preview && (
                <div
                  className="flex gap-3 p-3 rounded-xl"
                  style={{
                    background: "rgba(255,107,90,0.05)",
                    border: "1px solid rgba(255,107,90,0.20)",
                  }}
                >
                  <img src={preview.thumbnail} alt="" className="w-28 h-16 rounded-lg object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                    >
                      {preview.title}
                    </p>
                    <p className="text-xs" style={{ color: "#8B8794" }}>{preview.channel}</p>
                  </div>
                </div>
              )}

              {/* Clips count */}
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={labelStyle}
                >
                  Number of Clips:{" "}
                  <span style={{ color: CORAL_SOFT, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>
                    {maxClips}
                  </span>
                </label>
                <input
                  type="range" min={1} max={10} value={maxClips}
                  onChange={e => setMaxClips(Number(e.target.value))}
                  disabled={generating}
                  className="w-full"
                  style={{ accentColor: CORAL }}
                />
                <div className="flex justify-between text-[10px]" style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}>
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={labelStyle}
                >
                  Clip Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { min: 15, max: 30, label: "15-30s", desc: "Quick hooks" },
                    { min: 30, max: 60, label: "30-60s", desc: "Sweet spot" },
                    { min: 15, max: 60, label: "15-60s", desc: "AI decides" },
                  ].map(o => {
                    const active = clipMin === o.min && clipMax === o.max;
                    return (
                      <button
                        key={o.label}
                        onClick={() => { setClipMin(o.min); setClipMax(o.max); }}
                        disabled={generating}
                        className="px-3 py-2.5 rounded-lg text-center transition-all disabled:opacity-50"
                        style={{
                          background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                          border: active ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          color: active ? CORAL_SOFT : "#8B8794",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        <div className="text-xs font-semibold">{o.label}</div>
                        <div className="text-[9px]" style={{ color: active ? "rgba(255,139,122,0.7)" : "#5A5762" }}>{o.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Platforms (ported from Repurpose — kept real brand colors) */}
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider"
                  style={labelStyle}
                >
                  Target Platforms
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_PLATFORMS.map((p) => {
                    const isOn = targetPlatforms.has(p.id);
                    const accentColor =
                      p.id === "youtube_shorts" ? { bg: "rgba(255,0,0,0.10)", border: "rgba(255,0,0,0.5)", text: "#FF6B6B" } :
                      p.id === "tiktok" ? { bg: "rgba(0,0,0,0.4)", border: "rgba(255,255,255,0.4)", text: "#F5F2ED" } :
                      { bg: "rgba(232,121,166,0.10)", border: "rgba(232,121,166,0.5)", text: "#E879A6" };

                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        disabled={generating}
                        className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                        style={{
                          background: isOn ? accentColor.bg : "rgba(255,255,255,0.03)",
                          border: isOn
                            ? `1.5px solid ${accentColor.border}`
                            : "1px solid rgba(255,255,255,0.08)",
                          color: isOn ? accentColor.text : "#5A5762",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        <span className="text-lg" style={{ opacity: isOn ? 1 : 0.4 }}>{p.icon}</span>
                        <span>{p.label}</span>
                        <span className="text-[9px]" style={{ opacity: 0.7 }}>{p.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px]" style={{ color: "#5A5762" }}>
                  All clips are 1080×1920 (9:16). Select platforms for optimized hashtags &amp; metadata.
                </p>
              </div>

              {/* Captions */}
              <div className="space-y-2">
                <CaptionStylePicker
                  value={captionConfig}
                  onChange={setCaptionConfig}
                  disabled={generating}
                  hidePosition={true}
                  accent={CORAL}
                />
              </div>

              {/* Thumbnails toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                  >
                    Generate Thumbnails
                  </div>
                  <div className="text-xs" style={{ color: "#8B8794" }}>Auto-create thumbnail per clip</div>
                </div>
                <button
                  onClick={() => setGenThumbs(!genThumbs)}
                  disabled={generating}
                  className="relative w-11 h-6 rounded-full transition-colors duration-200"
                  style={{
                    background: genThumbs ? CORAL : "rgba(255,255,255,0.1)",
                    border: genThumbs ? `1px solid ${CORAL}` : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                    style={{
                      background: genThumbs ? "#0F0E1A" : "#8B8794",
                      transform: genThumbs ? "translateX(20px)" : "translateX(2px)",
                    }}
                  />
                </button>
              </div>

              {/* Errors */}
              {error && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    background: "rgba(255,107,107,0.10)",
                    border: "1px solid rgba(255,107,107,0.3)",
                    color: "#FF6B6B",
                  }}
                >
                  {error}
                </div>
              )}
              {project?.error_message && project.status === "error" && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    background: "rgba(255,107,107,0.10)",
                    border: "1px solid rgba(255,107,107,0.3)",
                    color: "#FF6B6B",
                  }}
                >
                  <div className="font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                    Pipeline failed
                  </div>
                  {project.error_message}
                </div>
              )}

              {/* Generate */}
              <button
                onClick={handleGenerate}
                disabled={!url || generating}
                className="w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: !url || generating
                    ? "rgba(255,107,90,0.3)"
                    : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                  color: "#0F0E1A",
                  boxShadow: !url || generating ? "none" : "0 8px 30px -8px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <>✂️ Generate {maxClips} Viral Shorts</>
                )}
              </button>
            </div>
          </div>

          {/* ── Right: Results ────────────────────────────── */}
          {(isProcessing || hasResults) && (
            <div className="lg:col-span-2">

              {/* Progress */}
              {isProcessing && (
                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{
                    background: "#16151F",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: CORAL_SOFT,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {stageText}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{
                        color: CORAL_SOFT,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${CORAL}, ${AMBER})`,
                        boxShadow: "0 0 12px rgba(255,107,90,0.4)",
                      }}
                    />
                  </div>
                  {project?.source_title && (
                    <div className="flex items-center gap-3 mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {project.source_thumbnail && (
                        <img src={project.source_thumbnail} alt="" className="w-16 h-10 rounded object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs truncate" style={{ color: "#F5F2ED" }}>{project.source_title}</p>
                        {project.source_duration_sec && (
                          <p className="text-[10px]" style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}>
                            Duration: {fmtDur(project.source_duration_sec)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results header */}
              {hasResults && (
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2
                    className="text-xl font-bold flex items-center gap-2"
                    style={{
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    <span>🎬</span> Your Shorts
                    <span className="text-sm font-normal" style={{ color: "#8B8794", fontFamily: "'JetBrains Mono', monospace" }}>
                      ({selected.size}/{clips.length} selected)
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelected(new Set(clips.map(c => c.id)))}
                      className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#8B8794",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#F5F2ED"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#8B8794"; }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={dlSelected}
                      disabled={selected.size === 0 || downloading}
                      className="px-4 py-1.5 text-sm rounded-lg font-bold transition-all disabled:opacity-40 flex items-center gap-2 hover:scale-[1.02]"
                      style={{
                        background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                        color: "#0F0E1A",
                        boxShadow: "0 4px 14px -2px rgba(255,107,90,0.4)",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {downloading ? "⏳ Downloading..." : `⬇ Download ${selected.size} Clip${selected.size !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Toast */}
              {toast && (
                <div
                  className="rounded-lg px-4 py-2.5 mb-4 text-sm"
                  style={{
                    background: toast.startsWith("✓") ? "rgba(93,211,158,0.10)" : "rgba(255,107,90,0.08)",
                    border: toast.startsWith("✓") ? "1px solid rgba(93,211,158,0.25)" : "1px solid rgba(255,107,90,0.2)",
                    color: toast.startsWith("✓") ? "#5DD39E" : CORAL_SOFT,
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {toast}
                </div>
              )}

              {/* Clip cards */}
              <div className="space-y-4">
                {clips.map(clip => {
                  const k = clip.id;
                  const ps = pubStatus[k];
                  const pr = pubResults[k];

                  return (
                    <div
                      key={k}
                      className="rounded-xl overflow-hidden transition-all"
                      style={{
                        background: selected.has(k) ? "rgba(255,107,90,0.06)" : "#16151F",
                        border: selected.has(k) ? "1px solid rgba(255,107,90,0.3)" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="p-4">
                        {/* Top row */}
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => { const n = new Set(selected); n.has(k) ? n.delete(k) : n.add(k); setSelected(n); }}
                            className="mt-1 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs transition-all"
                            style={selected.has(k) ? {
                              background: CORAL,
                              color: "#0F0E1A",
                              border: `1px solid ${CORAL}`,
                            } : {
                              background: "transparent",
                              color: "transparent",
                              border: "1px solid rgba(255,255,255,0.2)",
                            }}
                          >
                            ✓
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span
                                className="text-xs font-bold"
                                style={{ color: CORAL_SOFT, fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                #{clip.index}
                              </span>
                              <h3
                                className="text-sm font-semibold truncate"
                                style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                              >
                                {clip.suggested_title || clip.title}
                              </h3>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                style={{
                                  backgroundColor: `${scoreColor(clip.hook_score)}20`,
                                  color: scoreColor(clip.hook_score),
                                  border: `1px solid ${scoreColor(clip.hook_score)}40`,
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                🔥 {clip.hook_score}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] mb-2" style={{ color: "#8B8794" }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                ⏱ {fmt(clip.start_time)} → {fmt(clip.end_time)}
                              </span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                📐 {fmtDur(clip.duration)}
                              </span>
                            </div>

                            {/* Platform badges (if any selected) */}
                            {targetPlatforms.size > 0 && (
                              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                {targetPlatforms.has("youtube_shorts") && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{
                                      background: "rgba(255,0,0,0.10)",
                                      color: "#FF6B6B",
                                      border: "1px solid rgba(255,0,0,0.3)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    📺 Shorts
                                  </span>
                                )}
                                {targetPlatforms.has("tiktok") && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{
                                      background: "rgba(0,0,0,0.4)",
                                      color: "#F5F2ED",
                                      border: "1px solid rgba(255,255,255,0.3)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    🎵 TikTok
                                  </span>
                                )}
                                {targetPlatforms.has("reels") && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{
                                      background: "rgba(232,121,166,0.10)",
                                      color: "#E879A6",
                                      border: "1px solid rgba(232,121,166,0.3)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    📸 Reels
                                  </span>
                                )}
                                {clip.duration > 60 && targetPlatforms.has("youtube_shorts") && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                    style={{
                                      background: "rgba(255,169,77,0.10)",
                                      color: AMBER,
                                      border: "1px solid rgba(255,169,77,0.3)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    ⚠ &gt;60s — too long for Shorts
                                  </span>
                                )}
                              </div>
                            )}

                            {clip.reason && (
                              <p className="text-xs mb-2 italic" style={{ color: "#8B8794" }}>
                                &ldquo;{clip.reason}&rdquo;
                              </p>
                            )}

                            {/* Hashtags */}
                            {clip.suggested_hashtags && clip.suggested_hashtags.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                {clip.suggested_hashtags.slice(0, 5).map((tag, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                                    style={{
                                      background: "rgba(255,107,90,0.10)",
                                      color: CORAL_SOFT,
                                      border: "1px solid rgba(255,107,90,0.20)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(clip.suggested_hashtags!.join(" "));
                                    setToast("✓ Hashtags copied!");
                                    setTimeout(() => setToast(null), 2000);
                                  }}
                                  className="text-[10px] transition"
                                  style={{ color: "#5A5762" }}
                                  title="Copy all"
                                  onMouseEnter={(e) => { e.currentTarget.style.color = CORAL_SOFT; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = "#5A5762"; }}
                                >
                                  📋
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Video */}
                        {clip.video_url && (
                          <div
                            className="mt-3 rounded-lg overflow-hidden flex justify-center"
                            style={{ background: "#000", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            <video
                              src={clip.video_url}
                              controls
                              preload="metadata"
                              style={{ maxHeight: "420px", width: "auto", maxWidth: "100%" }}
                            />
                          </div>
                        )}

                        {/* Actions */}
                        {clip.video_url && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              onClick={() => dlClip(clip.video_url!, `${(clip.suggested_title || clip.title || `clip-${clip.index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}.mp4`)}
                              className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                              style={{
                                background: "rgba(255,107,90,0.10)",
                                border: "1px solid rgba(255,107,90,0.3)",
                                color: CORAL_SOFT,
                                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                              }}
                            >
                              ⬇ Download
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(clip.video_url!);
                                setToast("✓ URL copied!");
                                setTimeout(() => setToast(null), 2000);
                              }}
                              className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "#8B8794",
                                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                              }}
                            >
                              🔗 Copy URL
                            </button>

                            {/* YouTube Publish (kept YouTube red) */}
                            {ps === "done" && pr?.url ? (
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                                style={{
                                  background: "rgba(93,211,158,0.10)",
                                  color: "#5DD39E",
                                  border: "1px solid rgba(93,211,158,0.3)",
                                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                }}
                              >
                                ✅ Live on YouTube ↗
                              </a>
                            ) : ps === "uploading" ? (
                              <span
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold"
                                style={{
                                  background: "rgba(255,169,77,0.10)",
                                  color: AMBER,
                                  border: "1px solid rgba(255,169,77,0.3)",
                                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                }}
                              >
                                ⏳ Publishing...
                              </span>
                            ) : ps === "error" ? (
                              <button
                                onClick={() => publishYT(clip)}
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                                style={{
                                  background: "rgba(255,107,107,0.10)",
                                  color: "#FF6B6B",
                                  border: "1px solid rgba(255,107,107,0.3)",
                                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                }}
                              >
                                ⚠ Retry YouTube
                              </button>
                            ) : ytConnected ? (
                              <button
                                onClick={() => publishYT(clip)}
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold text-white transition hover:scale-[1.02]"
                                style={{
                                  background: "linear-gradient(135deg, #FF0000 0%, #CC0000 100%)",
                                  boxShadow: "0 2px 8px rgba(255,0,0,0.25)",
                                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                }}
                              >
                                ▶ YouTube
                              </button>
                            ) : (
                              <a
                                href="/dashboard/settings"
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold transition"
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  color: "#8B8794",
                                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                }}
                              >
                                🔗 Connect YouTube
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasResults && (
                <div className="mt-6 text-center">
                  <button
                    onClick={reset}
                    className="px-6 py-2 text-sm rounded-lg font-semibold transition"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#8B8794",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#F5F2ED"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#8B8794"; }}
                  >
                    🔄 Generate from a different video
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}