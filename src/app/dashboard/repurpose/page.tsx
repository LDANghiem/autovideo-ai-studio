// ============================================================
// FILE: src/app/dashboard/repurpose/page.tsx
// ============================================================
// Auto-Repurpose: Long Video → 3-5 Vertical Shorts
//
// Wired to real API routes:
//   POST /api/repurpose/create  → create project
//   POST /api/repurpose/start   → trigger worker pipeline
//   GET  /api/repurpose/status/[id] → poll progress + clips
//
// Pipeline runs on LOCAL worker: localhost:10000/repurpose
// ============================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ──────────────────────────────────────────────────── */
interface RepurposeClip {
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
  thumbnail_url?: string;
  video_url?: string;
  status: "pending" | "processing" | "done" | "error";
}

interface RepurposeProject {
  id: string;
  status: string;
  progress_pct: number;
  progress_stage: string | null;
  source_title: string | null;
  source_thumbnail: string | null;
  source_channel: string | null;
  source_duration_sec: number | null;
  clips: RepurposeClip[];
  detected_moments: any[];
  error_message: string | null;
}

interface VideoPreview {
  title: string;
  thumbnail: string;
  channel: string;
}

/* ── Constants ──────────────────────────────────────────────── */
const CAPTION_STYLES = [
  { id: "karaoke", label: "Karaoke", desc: "Word-by-word highlight", icon: "✨" },
  { id: "block", label: "Block", desc: "Bottom subtitles", icon: "📝" },
  { id: "centered", label: "Centered", desc: "Big centered text", icon: "🎯" },
  { id: "none", label: "None", desc: "No captions", icon: "🚫" },
];

const TARGET_PLATFORMS = [
  { id: "youtube_shorts", label: "YouTube Shorts", icon: "📺", maxSec: 60, desc: "Max 60s" },
  { id: "tiktok", label: "TikTok", icon: "🎵", maxSec: 180, desc: "Max 3 min" },
  { id: "reels", label: "Instagram Reels", icon: "📸", maxSec: 90, desc: "Max 90s" },
];

const STAGE_LABELS: Record<string, string> = {
  downloading: "Downloading video...",
  transcribing: "Transcribing audio with Whisper...",
  analyzing: "AI detecting viral moments...",
  generating_metadata: "Generating titles & hashtags...",
  clipping: "Extracting & cropping clips to 9:16...",
  captioning: "Burning captions...",
  thumbnails: "Generating thumbnails...",
  uploading: "Uploading clips to cloud...",
  done: "Done! Your clips are ready.",
};

/* ── Helpers ────────────────────────────────────────────────── */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
export default function RepurposePage() {
  // ── Input state ──
  const [url, setUrl] = useState("");
  const [maxClips, setMaxClips] = useState(5);
  const [clipMinSeconds, setClipMinSeconds] = useState(30);
  const [clipMaxSeconds, setClipMaxSeconds] = useState(60);
  const [captionStyle, setCaptionStyle] = useState("karaoke");
  const [generateThumbnails, setGenerateThumbnails] = useState(true);
  const [targetPlatforms, setTargetPlatforms] = useState<Set<string>>(new Set());

  // ── Project state ──
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<RepurposeProject | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VideoPreview | null>(null);

  // ── Clip selection + download state ──
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [publishing, setPublishing] = useState<Record<string, string>>({}); // clipId -> status
  const [publishResults, setPublishResults] = useState<Record<string, { url?: string; error?: string }>>({}); 

  // ── Polling ref ──
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived state ──
  const clips = project?.clips || [];
  const hasResults = project?.status === "done" && clips.length > 0;
  const isProcessing = generating || (project?.status === "processing") ||
    (project?.status === "analyzing") || (project?.status === "clipping");
  const progressPct = project?.progress_pct || 0;
  const progressText = STAGE_LABELS[project?.progress_stage || ""] || project?.progress_stage || "Processing...";

  /* ── Fetch YouTube preview via oEmbed ─────────────────────── */
  const fetchPreview = useCallback(async (videoUrl: string) => {
    try {
      const ytMatch = videoUrl.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      if (!ytMatch) { setPreview(null); return; }

      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        setPreview({
          title: data.title || "Unknown",
          thumbnail: data.thumbnail_url || "",
          channel: data.author_name || "",
        });
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    }
  }, []);

  // Debounced preview fetch
  useEffect(() => {
    if (!url) { setPreview(null); return; }
    const t = setTimeout(() => fetchPreview(url), 500);
    return () => clearTimeout(t);
  }, [url, fetchPreview]);

  /* ── Poll project status ──────────────────────────────────── */
  const pollStatus = useCallback(async (pid: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/repurpose/status/${pid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { project: proj } = await res.json();
      if (proj) {
        setProject(proj);

        // Stop polling when done or error
        if (proj.status === "done" || proj.status === "error") {
          setGenerating(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // Auto-select all clips when done
          if (proj.status === "done" && proj.clips?.length > 0) {
            setSelectedClips(new Set(proj.clips.map((c: RepurposeClip) => c.id)));
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, []);

  // Start polling when projectId is set and generating
  useEffect(() => {
    if (!projectId || !generating) return;
    // Initial fetch
    pollStatus(projectId);
    // Poll every 3 seconds
    pollRef.current = setInterval(() => pollStatus(projectId), 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [projectId, generating, pollStatus]);

  /* ── Check YouTube connection status ─────────────────────── */
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/auth/youtube/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setYoutubeConnected(data.connected === true);
        }
      } catch {}
    })();
  }, []);

  /* ── Publish clip to YouTube ─────────────────────────────── */
  async function publishToYouTube(clip: RepurposeClip) {
    if (!clip.video_url) return;
    const clipKey = clip.id || String(clip.index);

    setPublishing((prev) => ({ ...prev, [clipKey]: "uploading" }));

    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      const title = (clip.suggested_title || clip.title || `Clip ${clip.index}`).slice(0, 100);
      const tags = clip.suggested_hashtags || [];
      const description = [
        clip.description || title,
        "",
        tags.join(" "),
        "",
        "Created with AutoVideo AI Studio",
      ].join("\n");

      const res = await fetch("/api/publish/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clip_id: clip.id,
          project_id: project?.id,
          video_url: clip.video_url,
          title,
          description,
          tags,
          privacy: "public",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setPublishing((prev) => ({ ...prev, [clipKey]: "published" }));
      setPublishResults((prev) => ({ ...prev, [clipKey]: { url: data.youtube_url } }));
    } catch (err: any) {
      setPublishing((prev) => ({ ...prev, [clipKey]: "error" }));
      setPublishResults((prev) => ({ ...prev, [clipKey]: { error: err?.message || "Failed" } }));
    }
  }

  /* ── Handle Generate ──────────────────────────────────────── */
  async function handleGenerate() {
    setError(null);
    setProject(null);
    setSelectedClips(new Set());
    setDownloadProgress(null);

    const token = await getToken();
    if (!token) { setError("Not logged in. Please log in again."); return; }

    if (!url) { setError("Please paste a YouTube URL."); return; }

    setGenerating(true);

    try {
      // Step 1: Create project
      const createRes = await fetch("/api/repurpose/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source_url: url,
          max_clips: maxClips,
          clip_min_seconds: clipMinSeconds,
          clip_max_seconds: clipMaxSeconds,
          caption_style: captionStyle,
          target_platforms: Array.from(targetPlatforms),
          generate_thumbnails: generateThumbnails,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Failed to create project");
        setGenerating(false);
        return;
      }

      const pid = createData.project?.id;
      if (!pid) { setError("No project ID returned"); setGenerating(false); return; }

      setProjectId(pid);
      setProject(createData.project);

      // Step 2: Start pipeline
      const startRes = await fetch("/api/repurpose/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: pid }),
      });

      if (!startRes.ok) {
        const startData = await startRes.json();
        setError(startData.error || "Failed to start pipeline");
        setGenerating(false);
        return;
      }

      // Polling will handle the rest
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setGenerating(false);
    }
  }

  /* ── Download helpers ─────────────────────────────────────── */
  function toggleClipSelection(clipId: string) {
    setSelectedClips((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  }

  async function downloadClip(videoUrl: string, filename: string) {
    const res = await fetch(videoUrl);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  async function downloadSelected() {
    if (selectedClips.size === 0) return;
    setDownloading(true);
    setDownloadProgress(null);

    const toDownload = clips.filter((c) => selectedClips.has(c.id) && c.video_url);
    let completed = 0;

    for (const clip of toDownload) {
      completed++;
      setDownloadProgress(`Downloading clip ${completed}/${toDownload.length}...`);
      const safeName = (clip.suggested_title || clip.title || `clip-${clip.index}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 60);
      await downloadClip(clip.video_url!, `${safeName}.mp4`);
    }

    setDownloadProgress(`✓ Downloaded ${toDownload.length} clip${toDownload.length !== 1 ? "s" : ""}`);
    setDownloading(false);
    setTimeout(() => setDownloadProgress(null), 4000);
  }

  /* ── Copy hashtags helper ─────────────────────────────────── */
  function copyHashtags(tags: string[]) {
    navigator.clipboard.writeText(tags.join(" "));
    setDownloadProgress("✓ Hashtags copied!");
    setTimeout(() => setDownloadProgress(null), 2000);
  }

  /* ── Platform toggle helper ─────────────────────────────────── */
  function togglePlatform(platformId: string) {
    setTargetPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  }

  /* ── Reset ────────────────────────────────────────────────── */
  function handleReset() {
    setUrl("");
    setProjectId(null);
    setProject(null);
    setGenerating(false);
    setError(null);
    setPreview(null);
    setSelectedClips(new Set());
    setDownloadProgress(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">🔄</span>
              Auto-Repurpose
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              Turn one long YouTube video into ready-to-post vertical shorts for YouTube, TikTok & Reels
            </p>
          </div>
          {(project || generating) && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition"
            >
              ← New Video
            </button>
          )}
          {!project && !generating && (
            <a
              href="/dashboard/repurpose/history"
              className="px-4 py-2 rounded-lg text-sm font-medium text-purple-300 transition flex items-center gap-1.5"
              style={{
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              📋 My Projects
            </a>
          )}
        </div>

        {/* ── Main Grid: Left = Input, Right = Results ────────── */}
        <div className={`grid gap-6 ${(isProcessing || hasResults) ? "lg:grid-cols-3" : "lg:grid-cols-1 max-w-2xl mx-auto"}`}>

          {/* ── Left Column: Input & Settings ─────────────────── */}
          <div className="lg:col-span-1">
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{
                background: "rgba(30, 26, 46, 0.6)",
                border: "1px solid rgba(74, 66, 96, 0.5)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}
            >
              {/* URL Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">YouTube Video URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value.trim())}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={generating}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                  style={{
                    background: "rgba(20, 17, 35, 0.8)",
                    border: "1px solid rgba(74, 66, 96, 0.6)",
                  }}
                />
              </div>

              {/* Video Preview */}
              {preview && (
                <div
                  className="flex gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(20, 17, 35, 0.6)", border: "1px solid rgba(74, 66, 96, 0.4)" }}
                >
                  {preview.thumbnail && (
                    <img
                      src={preview.thumbnail}
                      alt=""
                      className="w-28 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{preview.title}</p>
                    <p className="text-xs text-gray-400">{preview.channel}</p>
                  </div>
                </div>
              )}

              {/* Number of Clips */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Number of Clips: <span className="text-purple-400">{maxClips}</span>
                </label>
                <input
                  type="range" min={1} max={10} value={maxClips}
                  onChange={(e) => setMaxClips(Number(e.target.value))}
                  disabled={generating}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </div>

              {/* Clip Duration Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Clip Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { min: 15, max: 30, label: "15-30s" },
                    { min: 30, max: 60, label: "30-60s" },
                    { min: 15, max: 60, label: "15-60s" },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => { setClipMinSeconds(opt.min); setClipMaxSeconds(opt.max); }}
                      disabled={generating}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        clipMinSeconds === opt.min && clipMaxSeconds === opt.max
                          ? "text-white"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                      style={{
                        background: clipMinSeconds === opt.min && clipMaxSeconds === opt.max
                          ? "rgba(139,92,246,0.3)" : "rgba(20, 17, 35, 0.6)",
                        border: clipMinSeconds === opt.min && clipMaxSeconds === opt.max
                          ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(74, 66, 96, 0.4)",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption Style */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Caption Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_STYLES.map((cs) => (
                    <button
                      key={cs.id}
                      onClick={() => setCaptionStyle(cs.id)}
                      disabled={generating}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                        captionStyle === cs.id ? "text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                      style={{
                        background: captionStyle === cs.id
                          ? "rgba(139,92,246,0.3)" : "rgba(20, 17, 35, 0.6)",
                        border: captionStyle === cs.id
                          ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(74, 66, 96, 0.4)",
                      }}
                    >
                      <span>{cs.icon}</span>
                      <div className="text-left">
                        <div>{cs.label}</div>
                        <div className="text-[9px] text-gray-500">{cs.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Platforms */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Target Platforms</label>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_PLATFORMS.map((p) => {
                    const isOn = targetPlatforms.has(p.id);
                    // Platform-specific accent colors (like Dub page language cards)
                    const accentColor =
                      p.id === "youtube_shorts" ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.5)", text: "#f87171" } :
                      p.id === "tiktok" ? { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.5)", text: "#22d3ee" } :
                      { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.5)", text: "#f472b6" };

                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        disabled={generating}
                        className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-xs font-medium transition-all duration-200"
                        style={{
                          background: isOn ? accentColor.bg : "rgba(20, 17, 35, 0.4)",
                          border: isOn
                            ? `2px solid ${accentColor.border}`
                            : "2px solid rgba(74, 66, 96, 0.3)",
                          color: isOn ? "#ffffff" : "#6b7280",
                        }}
                      >
                        <span className="text-lg" style={{ opacity: isOn ? 1 : 0.4 }}>{p.icon}</span>
                        <span style={{ color: isOn ? accentColor.text : "#6b7280" }}>{p.label}</span>
                        <span className="text-[9px]" style={{ color: isOn ? accentColor.text : "#4b5563", opacity: 0.7 }}>{p.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500">
                  All clips are 1080×1920 (9:16). Select target platforms for optimized hashtags & metadata.
                </p>
              </div>

              {/* Generate Thumbnails Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-300">Generate Thumbnails</div>
                  <div className="text-xs text-gray-500">Auto-create thumbnail per clip</div>
                </div>
                <button
                  onClick={() => setGenerateThumbnails(!generateThumbnails)}
                  disabled={generating}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    generateThumbnails ? "bg-purple-500" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                      generateThumbnails ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Server error from project */}
              {project?.error_message && project.status === "error" && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <div className="font-medium mb-1">Pipeline failed</div>
                  {project.error_message}
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!url || generating}
                className="w-full py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-medium text-lg tracking-wide transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: !url || generating ? "#252040" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  border: !url || generating ? "1px solid #3a3555" : "1px solid rgba(139,92,246,0.5)",
                  boxShadow: !url || generating ? "none" : "0 0 24px rgba(139,92,246,0.25)",
                  color: !url || generating ? "#5a5070" : "#ffffff",
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
                  <>🔄 Repurpose into {maxClips} Shorts{targetPlatforms.size > 0 ? ` → ${targetPlatforms.size} Platform${targetPlatforms.size !== 1 ? "s" : ""}` : ""}</>
                )}
              </button>

              {/* Project ID */}
              {projectId && (
                <p className="text-[10px] text-gray-600 text-center truncate">
                  Project: {projectId}
                </p>
              )}
            </div>
          </div>

          {/* ── Right Column: Results ─────────────────────────── */}
          {(isProcessing || hasResults) && (
            <div className="lg:col-span-2">

              {/* Progress bar */}
              {isProcessing && (
                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{ background: "rgba(30, 26, 46, 0.6)", border: "1px solid rgba(74, 66, 96, 0.5)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-300">{progressText}</span>
                    <span className="text-sm font-bold text-purple-400">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressPct}%`,
                        background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                        boxShadow: "0 0 8px rgba(139,92,246,0.4)",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    This may take a few minutes depending on video length.
                  </p>

                  {/* Source info if available */}
                  {project?.source_title && (
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-800">
                      {project.source_thumbnail && (
                        <img src={project.source_thumbnail} alt="" className="w-16 h-10 rounded object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300 truncate">{project.source_title}</p>
                        {project.source_channel && <p className="text-[10px] text-gray-500">{project.source_channel}</p>}
                        {project.source_duration_sec && (
                          <p className="text-[10px] text-gray-500">Duration: {formatDuration(project.source_duration_sec)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results header + actions */}
              {hasResults && (
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>🎬</span> Your Repurposed Clips
                    <span className="text-sm font-normal text-gray-400">
                      ({selectedClips.size} of {clips.length} selected)
                    </span>
                  </h2>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setSelectedClips(new Set(clips.map((c) => c.id)))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition"
                    >
                      Select All
                    </button>
                    <button
                      onClick={downloadSelected}
                      disabled={selectedClips.size === 0 || downloading}
                      className="px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
                      style={{
                        background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                        border: "1px solid rgba(139,92,246,0.5)",
                        color: "#ffffff",
                        boxShadow: "0 0 12px rgba(139,92,246,0.15)",
                      }}
                    >
                      {downloading ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Downloading...
                        </>
                      ) : (
                        <>⬇ Download {selectedClips.size} Clip{selectedClips.size !== 1 ? "s" : ""}</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Download progress toast */}
              {downloadProgress && (
                <div
                  className="rounded-lg px-4 py-2.5 mb-4 text-sm flex items-center gap-2"
                  style={{
                    background: downloadProgress.startsWith("✓")
                      ? "rgba(34,197,94,0.1)" : "rgba(139,92,246,0.08)",
                    border: downloadProgress.startsWith("✓")
                      ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(139,92,246,0.2)",
                    color: downloadProgress.startsWith("✓") ? "#4ade80" : "#a78bfa",
                  }}
                >
                  {!downloadProgress.startsWith("✓") && (
                    <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {downloadProgress}
                </div>
              )}

              {/* Clip cards */}
              <div className="space-y-4">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="rounded-xl overflow-hidden transition-all duration-200"
                    style={{
                      background: selectedClips.has(clip.id)
                        ? "rgba(139,92,246,0.06)" : "rgba(30, 26, 46, 0.6)",
                      border: selectedClips.has(clip.id)
                        ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(74, 66, 96, 0.4)",
                    }}
                  >
                    <div className="p-4">
                      {/* Top row: checkbox + title + score */}
                      <div className="flex items-start gap-3">
                        {/* Selection checkbox */}
                        <button
                          onClick={() => toggleClipSelection(clip.id)}
                          className={`mt-1 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs transition-all ${
                            selectedClips.has(clip.id)
                              ? "bg-purple-500 text-white" : "border border-gray-600 text-transparent hover:border-gray-400"
                          }`}
                        >
                          ✓
                        </button>

                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-purple-400">#{clip.index}</span>
                            <h3 className="text-sm font-semibold text-white truncate">
                              {clip.suggested_title || clip.title || `Clip ${clip.index}`}
                            </h3>
                          </div>

                          {/* Metadata row */}
                          <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-2">
                            <span>⏱ {formatTime(clip.start_time)} → {formatTime(clip.end_time)}</span>
                            <span>📐 {formatDuration(clip.duration)}</span>
                            <span
                              className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                              style={{
                                backgroundColor: `${scoreColor(clip.hook_score)}20`,
                                color: scoreColor(clip.hook_score),
                                border: `1px solid ${scoreColor(clip.hook_score)}40`,
                              }}
                            >
                              🔥 {clip.hook_score}
                            </span>
                          </div>

                          {/* Platform badges */}
                          <div className="flex items-center gap-1.5 mb-2">
                            {targetPlatforms.has("youtube_shorts") && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                📺 Shorts
                              </span>
                            )}
                            {targetPlatforms.has("tiktok") && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                🎵 TikTok
                              </span>
                            )}
                            {targetPlatforms.has("reels") && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                                📸 Reels
                              </span>
                            )}
                            {clip.duration > 60 && targetPlatforms.has("youtube_shorts") && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                ⚠ &gt;60s — too long for Shorts
                              </span>
                            )}
                          </div>

                          {/* AI reason */}
                          {clip.reason && (
                            <p className="text-xs text-gray-400 mb-2 italic">
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
                                    background: "rgba(139,92,246,0.12)",
                                    color: "#c084fc",
                                    border: "1px solid rgba(139,92,246,0.2)",
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                              <button
                                onClick={() => copyHashtags(clip.suggested_hashtags!)}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition"
                                title="Copy all hashtags"
                              >
                                📋
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Video player */}
                      {clip.video_url && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-gray-800">
                          <video
                            src={clip.video_url}
                            controls
                            preload="metadata"
                            className="w-full max-h-[400px]"
                            style={{ background: "#000" }}
                          />
                        </div>
                      )}

                      {/* Action buttons */}
                      {clip.video_url && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            onClick={() => {
                              const name = (clip.suggested_title || clip.title || `clip-${clip.index}`)
                                .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
                              downloadClip(clip.video_url!, `${name}.mp4`);
                            }}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition"
                          >
                            ⬇ Download
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(clip.video_url!);
                              setDownloadProgress("✓ URL copied!");
                              setTimeout(() => setDownloadProgress(null), 2000);
                            }}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition"
                          >
                            🔗 Copy URL
                          </button>
                          <button
                            onClick={() => window.open(clip.video_url!, "_blank")}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white transition"
                          >
                            ↗ Open
                          </button>

                          {/* YouTube Publish Button */}
                          {(() => {
                            const clipKey = clip.id || String(clip.index);
                            const pubStatus = publishing[clipKey];
                            const pubResult = publishResults[clipKey];

                            if (pubStatus === "published" && pubResult?.url) {
                              return (
                                <a
                                  href={pubResult.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 text-xs rounded-lg font-medium transition flex items-center gap-1"
                                  style={{
                                    background: "rgba(74,222,128,0.1)",
                                    color: "#4ade80",
                                    border: "1px solid rgba(74,222,128,0.3)",
                                  }}
                                >
                                  ✅ Live on YouTube ↗
                                </a>
                              );
                            }

                            if (pubStatus === "uploading") {
                              return (
                                <span
                                  className="px-3 py-1.5 text-xs rounded-lg font-medium flex items-center gap-1.5"
                                  style={{
                                    background: "rgba(251,191,36,0.1)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(251,191,36,0.3)",
                                  }}
                                >
                                  <span className="animate-spin text-[10px]">⏳</span> Publishing...
                                </span>
                              );
                            }

                            if (pubStatus === "error") {
                              return (
                                <button
                                  onClick={() => publishToYouTube(clip)}
                                  className="px-3 py-1.5 text-xs rounded-lg font-medium transition"
                                  style={{
                                    background: "rgba(248,113,113,0.1)",
                                    color: "#f87171",
                                    border: "1px solid rgba(248,113,113,0.3)",
                                  }}
                                  title={pubResult?.error || "Upload failed"}
                                >
                                  ⚠ Retry YouTube
                                </button>
                              );
                            }

                            if (youtubeConnected) {
                              return (
                                <button
                                  onClick={() => publishToYouTube(clip)}
                                  className="px-3 py-1.5 text-xs rounded-lg font-medium text-white transition hover:scale-[1.02] active:scale-[0.98]"
                                  style={{
                                    background: "linear-gradient(135deg, rgba(239,68,68,0.7), rgba(220,38,38,0.5))",
                                    border: "1px solid rgba(239,68,68,0.4)",
                                    boxShadow: "0 2px 8px rgba(239,68,68,0.15)",
                                  }}
                                >
                                  ▶ Publish to YouTube
                                </button>
                              );
                            }

                            return (
                              <a
                                href="/dashboard/settings?youtube=connect"
                                className="px-3 py-1.5 text-xs rounded-lg font-medium text-gray-500 border border-gray-700 hover:text-gray-300 transition"
                              >
                                🔗 Connect YouTube
                              </a>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}