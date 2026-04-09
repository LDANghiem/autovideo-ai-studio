// ============================================================
// FILE: src/app/dashboard/shorts/page.tsx
// ============================================================
// AI Shorts — Unified feature (merged Shorts + Auto-Repurpose)
//
// Uses the REPURPOSE pipeline (superior):
//   POST /api/repurpose/create  → create project
//   POST /api/repurpose/start   → trigger worker
//   GET  /api/repurpose/status/[id] → poll progress
//
// Worker: localhost:10000/repurpose
// ============================================================

"use client";

import UsageBanner from "@/components/UsageBanner";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import CaptionStylePicker, { type CaptionConfig } from "@/components/CaptionStylePicker";

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
  if (score >= 80) return "#f59e0b";
  if (score >= 60) return "#8b5cf6";
  if (score >= 40) return "#3b82f6";
  return "#6b7280";
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
          caption_style: captionConfig.style, caption_position: captionConfig.position, generate_thumbnails: genThumbs,
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
      const desc = [clip.description || title, "", tags.join(" "), "", "Created with AutoVideo AI Studio"].join("\n");

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

  /* ── Reset ───────────────────────────────────────────────── */
  function reset() {
    setUrl(""); setProjectId(null); setProject(null); setGenerating(false);
    setError(null); setPreview(null); setSelected(new Set()); setToast(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


        <UsageBanner pipeline="shorts" className="mb-6" />

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span>✂️</span> AI Shorts
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              Turn any long YouTube video into viral Shorts, TikToks & Reels — automatically
            </p>
          </div>
          <div className="flex gap-2">
            {(project || generating) && (
              <button onClick={reset}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition">
                ← New Video
              </button>
            )}
            {!project && !generating && (
              <a href="/dashboard/repurpose/history"
                className="px-4 py-2 rounded-lg text-sm font-medium text-purple-300 transition flex items-center gap-1.5"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
                📋 History
              </a>
            )}
          </div>
        </div>

        {/* How it works */}
        {!hasResults && !generating && (
          <div className="rounded-2xl p-6 mb-8"
            style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(245,158,11,0.06) 100%)", border: "1px solid rgba(139,92,246,0.15)" }}>
            <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span>🎯</span> How It Works
            </h3>
            <div className="grid grid-cols-5 gap-4 text-sm">
              {[
                { icon: "🔗", text: "Paste YouTube URL" },
                { icon: "🧠", text: "AI finds viral moments" },
                { icon: "✂️", text: "Auto-clips best parts" },
                { icon: "📱", text: "Crops to 9:16 vertical" },
                { icon: "📤", text: "Download or publish" },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-1.5">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-gray-300 text-xs">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`grid gap-6 ${(isProcessing || hasResults) ? "lg:grid-cols-3" : "lg:grid-cols-1 max-w-2xl mx-auto"}`}>

          {/* ── Left: Settings ────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl p-6 space-y-5"
              style={{ background: "rgba(30,26,46,0.6)", border: "1px solid rgba(74,66,96,0.5)", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>

              {/* URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">YouTube Video URL</label>
                <input type="text" value={url} onChange={e => setUrl(e.target.value.trim())}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={generating}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                  style={{ background: "rgba(20,17,35,0.8)", border: "1px solid rgba(74,66,96,0.6)" }} />
              </div>

              {preview && (
                <div className="flex gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(20,17,35,0.6)", border: "1px solid rgba(74,66,96,0.4)" }}>
                  <img src={preview.thumbnail} alt="" className="w-28 h-16 rounded-lg object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{preview.title}</p>
                    <p className="text-xs text-gray-400">{preview.channel}</p>
                  </div>
                </div>
              )}

              {/* Clips count */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Number of Clips: <span className="text-purple-400">{maxClips}</span>
                </label>
                <input type="range" min={1} max={10} value={maxClips}
                  onChange={e => setMaxClips(Number(e.target.value))} disabled={generating}
                  className="w-full accent-purple-500" />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Clip Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { min: 15, max: 30, label: "15-30s", desc: "Quick hooks" },
                    { min: 30, max: 60, label: "30-60s", desc: "Sweet spot" },
                    { min: 15, max: 60, label: "15-60s", desc: "AI decides" },
                  ].map(o => {
                    const active = clipMin === o.min && clipMax === o.max;
                    return (
                      <button key={o.label}
                        onClick={() => { setClipMin(o.min); setClipMax(o.max); }}
                        disabled={generating}
                        className="px-3 py-2.5 rounded-lg text-center transition-all"
                        style={{
                          background: active ? "rgba(139,92,246,0.3)" : "rgba(20,17,35,0.6)",
                          border: active ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(74,66,96,0.4)",
                          color: active ? "#c4b5fd" : "#9ca3af",
                        }}>
                        <div className="text-xs font-medium">{o.label}</div>
                        <div className="text-[9px]" style={{ color: active ? "#a78bfa" : "#6b7280" }}>{o.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Captions */}
              <div className="space-y-2">
                <CaptionStylePicker
                  value={captionConfig}
                  onChange={setCaptionConfig}
                  disabled={generating}
                  hidePosition={true}
                  accent="#a78bfa"
                />
              </div>

              {/* Thumbnails toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-300">Generate Thumbnails</div>
                  <div className="text-xs text-gray-500">Auto-create thumbnail per clip</div>
                </div>
                <button onClick={() => setGenThumbs(!genThumbs)} disabled={generating}
                  className={`relative w-11 h-6 rounded-full transition ${genThumbs ? "bg-purple-500" : "bg-gray-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${genThumbs ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
              )}
              {project?.error_message && project.status === "error" && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <div className="font-medium mb-1">Pipeline failed</div>{project.error_message}
                </div>
              )}

              {/* Generate */}
              <button onClick={handleGenerate} disabled={!url || generating}
                className="w-full py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-medium text-lg tracking-wide transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: !url || generating ? "#252040" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  border: !url || generating ? "1px solid #3a3555" : "1px solid rgba(139,92,246,0.5)",
                  boxShadow: !url || generating ? "none" : "0 0 24px rgba(139,92,246,0.25)",
                  color: !url || generating ? "#5a5070" : "#ffffff",
                }}>
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
                <div className="rounded-2xl p-6 mb-6"
                  style={{ background: "rgba(30,26,46,0.6)", border: "1px solid rgba(74,66,96,0.5)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-300">{stageText}</span>
                    <span className="text-sm font-bold text-purple-400">{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa)", boxShadow: "0 0 8px rgba(139,92,246,0.4)" }} />
                  </div>
                  {project?.source_title && (
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-800">
                      {project.source_thumbnail && <img src={project.source_thumbnail} alt="" className="w-16 h-10 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300 truncate">{project.source_title}</p>
                        {project.source_duration_sec && <p className="text-[10px] text-gray-500">Duration: {fmtDur(project.source_duration_sec)}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results header */}
              {hasResults && (
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>🎬</span> Your Shorts
                    <span className="text-sm font-normal text-gray-400">({selected.size}/{clips.length} selected)</span>
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => setSelected(new Set(clips.map(c => c.id)))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white transition">
                      Select All
                    </button>
                    <button onClick={dlSelected} disabled={selected.size === 0 || downloading}
                      className="px-4 py-1.5 text-sm rounded-lg font-medium transition-all disabled:opacity-40 flex items-center gap-2"
                      style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", border: "1px solid rgba(139,92,246,0.5)", color: "#fff" }}>
                      {downloading ? "⏳ Downloading..." : `⬇ Download ${selected.size} Clip${selected.size !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Toast */}
              {toast && (
                <div className="rounded-lg px-4 py-2.5 mb-4 text-sm"
                  style={{
                    background: toast.startsWith("✓") ? "rgba(34,197,94,0.1)" : "rgba(139,92,246,0.08)",
                    border: toast.startsWith("✓") ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(139,92,246,0.2)",
                    color: toast.startsWith("✓") ? "#4ade80" : "#a78bfa",
                  }}>
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
                    <div key={k} className="rounded-xl overflow-hidden transition-all"
                      style={{
                        background: selected.has(k) ? "rgba(139,92,246,0.06)" : "rgba(30,26,46,0.6)",
                        border: selected.has(k) ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(74,66,96,0.4)",
                      }}>
                      <div className="p-4">
                        {/* Top row */}
                        <div className="flex items-start gap-3">
                          <button onClick={() => { const n = new Set(selected); n.has(k) ? n.delete(k) : n.add(k); setSelected(n); }}
                            className="mt-1 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs transition-all"
                            style={{
                              background: selected.has(k) ? "#7c3aed" : "transparent",
                              border: selected.has(k) ? "2px solid #7c3aed" : "2px solid #4a4260",
                              color: selected.has(k) ? "#fff" : "transparent",
                            }}>✓</button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-purple-400">#{clip.index}</span>
                              <h3 className="text-sm font-semibold text-white truncate">{clip.suggested_title || clip.title}</h3>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                style={{ backgroundColor: `${scoreColor(clip.hook_score)}20`, color: scoreColor(clip.hook_score), border: `1px solid ${scoreColor(clip.hook_score)}40` }}>
                                🔥 {clip.hook_score}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-2">
                              <span>⏱ {fmt(clip.start_time)} → {fmt(clip.end_time)}</span>
                              <span>📐 {fmtDur(clip.duration)}</span>
                            </div>

                            {clip.reason && <p className="text-xs text-gray-400 mb-2 italic">&ldquo;{clip.reason}&rdquo;</p>}

                            {/* Hashtags */}
                            {clip.suggested_hashtags && clip.suggested_hashtags.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                {clip.suggested_hashtags.slice(0, 5).map((tag, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full"
                                    style={{ background: "rgba(139,92,246,0.12)", color: "#c084fc", border: "1px solid rgba(139,92,246,0.2)" }}>
                                    {tag}
                                  </span>
                                ))}
                                <button onClick={() => { navigator.clipboard.writeText(clip.suggested_hashtags!.join(" ")); setToast("✓ Hashtags copied!"); setTimeout(() => setToast(null), 2000); }}
                                  className="text-[10px] text-gray-500 hover:text-gray-300 transition" title="Copy all">📋</button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Video */}
                        {clip.video_url && (
                          <div className="mt-3 rounded-lg overflow-hidden border border-gray-800 flex justify-center" style={{ background: "#000" }}>
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
                            <button onClick={() => dlClip(clip.video_url!, `${(clip.suggested_title || clip.title || `clip-${clip.index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}.mp4`)}
                              className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition">
                              ⬇ Download
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(clip.video_url!); setToast("✓ URL copied!"); setTimeout(() => setToast(null), 2000); }}
                              className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition">
                              🔗 Copy URL
                            </button>

                            {/* YouTube Publish */}
                            {ps === "done" && pr?.url ? (
                              <a href={pr.url} target="_blank" rel="noopener noreferrer"
                                className="px-3 py-1.5 text-xs rounded-lg font-medium transition"
                                style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                                ✅ Live on YouTube ↗
                              </a>
                            ) : ps === "uploading" ? (
                              <span className="px-3 py-1.5 text-xs rounded-lg font-medium"
                                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                                ⏳ Publishing...
                              </span>
                            ) : ps === "error" ? (
                              <button onClick={() => publishYT(clip)}
                                className="px-3 py-1.5 text-xs rounded-lg font-medium transition"
                                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                                ⚠ Retry YouTube
                              </button>
                            ) : ytConnected ? (
                              <button onClick={() => publishYT(clip)}
                                className="px-3 py-1.5 text-xs rounded-lg font-medium text-white transition hover:scale-[1.02]"
                                style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.7), rgba(220,38,38,0.5))", border: "1px solid rgba(239,68,68,0.4)", boxShadow: "0 2px 8px rgba(239,68,68,0.15)" }}>
                                ▶ YouTube
                              </button>
                            ) : (
                              <a href="/dashboard/settings"
                                className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-500 border border-gray-700 hover:text-gray-300 transition">
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
                  <button onClick={reset} className="px-6 py-2 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white transition">
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