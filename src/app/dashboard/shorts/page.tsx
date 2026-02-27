// src/app/dashboard/shorts/page.tsx
// ─────────────────────────────────────────────────────────
// AI Shorts Generator — Extract viral clips from long videos
// Wired to real API routes:
//   POST /api/shorts/create  → create project
//   POST /api/shorts/start   → trigger worker pipeline
//   GET  /api/shorts/status/[id] → poll for progress + clips
// ─────────────────────────────────────────────────────────

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ──────────────────────────────────────────────── */
interface ShortClip {
  id: string;
  index: number;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
  duration: number;
  hook_score: number;
  reason: string;
  thumbnail_url?: string;
  video_url?: string;
  status: "pending" | "processing" | "done" | "error";
}

interface ShortsProject {
  id: string;
  status: "draft" | "processing" | "done" | "error";
  progress_pct: number;
  progress_stage: string | null;
  source_title: string | null;
  source_thumbnail: string | null;
  source_channel: string | null;
  clips: ShortClip[];
  error_message: string | null;
}

interface VideoPreview {
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
}

/* ── Session storage key ────────────────────────────────── */
const SESSION_KEY = "shorts_generator_state";

/* ── Caption style options ──────────────────────────────── */
const CAPTION_STYLES = [
  { id: "karaoke", label: "Karaoke", desc: "Word-by-word highlight", icon: "✨" },
  { id: "block", label: "Block", desc: "Bottom subtitles", icon: "📝" },
  { id: "centered", label: "Centered", desc: "Big centered text", icon: "🎯" },
  { id: "none", label: "None", desc: "No captions", icon: "🚫" },
];

/* ── Crop mode options ──────────────────────────────────── */
const CROP_MODES = [
  { id: "face-track", label: "Face Tracking", desc: "AI follows the speaker", icon: "👤" },
  { id: "center", label: "Center Crop", desc: "Fixed center frame", icon: "⬜" },
  { id: "dynamic", label: "Dynamic", desc: "AI picks best framing", icon: "🎬" },
];

/* ── Stage display names ────────────────────────────────── */
const STAGE_LABELS: Record<string, string> = {
  downloading: "Downloading video...",
  transcribing: "Transcribing audio with Whisper...",
  analyzing: "AI analyzing transcript for viral moments...",
  clipping: "Extracting & cropping clips to 9:16...",
  captioning: "Adding captions to clips...",
  thumbnails: "Generating thumbnails...",
  uploading: "Uploading clips to cloud...",
  done: "Done! Your shorts are ready.",
};

/* ── Format time helper ────────────────────────────────── */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Virality score badge color ────────────────────────── */
function scoreColor(score: number): string {
  if (score >= 80) return "#f59e0b";
  if (score >= 60) return "#8b5cf6";
  if (score >= 40) return "#3b82f6";
  return "#6b7280";
}

/* ── Get auth token helper ─────────────────────────────── */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/* ── Clip length range helper ──────────────────────────── */
function clipLengthRange(clipLength: string): { min: number; max: number } {
  switch (clipLength) {
    case "15-30": return { min: 15, max: 30 };
    case "30-60": return { min: 30, max: 60 };
    case "15-60": return { min: 15, max: 60 };
    default: return { min: 15, max: 60 };
  }
}

/* ── Session storage helpers ───────────────────────────── */
function saveSessionState(data: {
  projectId: string | null;
  project: ShortsProject | null;
  url: string;
  clipLength: string;
  preview: VideoPreview | null;
}) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function loadSessionState(): {
  projectId: string | null;
  project: ShortsProject | null;
  url: string;
  clipLength: string;
  preview: VideoPreview | null;
} | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSessionState() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

/* ── Page Component ────────────────────────────────────── */
export default function ShortsGeneratorPage() {
  // Form state
  const [url, setUrl] = useState("");
  const [maxClips, setMaxClips] = useState(5);
  const [clipLength, setClipLength] = useState<"15-30" | "30-60" | "15-60">("30-60");
  const [captionStyle, setCaptionStyle] = useState("karaoke");
  const [cropMode, setCropMode] = useState("face-track");
  const [generateThumbnails, setGenerateThumbnails] = useState(true);

  // UI state
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ShortsProject | null>(null);
  const [error, setError] = useState("");
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [restoredFromSession, setRestoredFromSession] = useState(false);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Derived state ───────────────────────────────────── */
  const clips = project?.clips || [];
  const hasResults = clips.length > 0 && !generating;
  const progressPct = project?.progress_pct || 0;
  const progressText = project?.progress_stage
    ? STAGE_LABELS[project.progress_stage] || project.progress_stage
    : "Starting...";

  // Check if any clips are shorter than requested range
  const { min: minLen } = clipLengthRange(clipLength);
  const shortClips = clips.filter((c) => c.duration < minLen);

  /* ── Restore session state on mount ──────────────────── */
  useEffect(() => {
    const saved = loadSessionState();
    if (saved && saved.project && saved.project.status === "done" && saved.project.clips?.length > 0) {
      setProjectId(saved.projectId);
      setProject(saved.project);
      setUrl(saved.url);
      setClipLength(saved.clipLength as any);
      setPreview(saved.preview);
      setSelectedClips(new Set(saved.project.clips.map((c: ShortClip) => c.id)));
      setRestoredFromSession(true);
    }
    // If project was still processing, resume polling
    if (saved && saved.projectId && saved.project && saved.project.status === "processing") {
      setProjectId(saved.projectId);
      setProject(saved.project);
      setUrl(saved.url);
      setClipLength(saved.clipLength as any);
      setPreview(saved.preview);
      setGenerating(true);
      startPolling(saved.projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Save session state whenever project changes ─────── */
  useEffect(() => {
    if (project && projectId) {
      saveSessionState({
        projectId,
        project,
        url,
        clipLength,
        preview,
      });
    }
  }, [project, projectId, url, clipLength, preview]);

  /* ── Cleanup polling on unmount ──────────────────────── */
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  /* ── YouTube URL preview ─────────────────────────────── */
  function handleUrlChange(val: string) {
    setUrl(val);
    setPreview(null);
    setProject(null);
    setProjectId(null);
    setError("");
    setRestoredFromSession(false);
    clearSessionState();

    const ytMatch = val.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!ytMatch) return;

    setLoadingPreview(true);
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(val)}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPreview({
            title: data.title,
            thumbnail: data.thumbnail_url,
            duration: "",
            channel: data.author_name || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  }

  /* ── Poll for project status ─────────────────────────── */
  const startPolling = useCallback((pid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(`/api/shorts/status/${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) return;

        const data = await res.json();
        const proj = data.project as ShortsProject;
        setProject(proj);

        // Stop polling when done or error
        if (proj.status === "done" || proj.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setGenerating(false);

          if (proj.status === "done" && proj.clips?.length > 0) {
            setSelectedClips(new Set(proj.clips.map((c: ShortClip) => c.id)));
          }

          if (proj.status === "error") {
            setError(proj.error_message || "Something went wrong during processing.");
          }
        }
      } catch (err) {
        console.error("[shorts] Polling error:", err);
      }
    }, 3000); // Poll every 3 seconds
  }, []);

  /* ── Generate Shorts — real API calls ────────────────── */
  async function handleGenerate() {
    setError("");
    setGenerating(true);
    setProject(null);
    setSelectedClips(new Set());
    setRestoredFromSession(false);
    clearSessionState();

    try {
      const token = await getToken();
      if (!token) {
        setError("Not logged in. Please log in again.");
        setGenerating(false);
        return;
      }

      const { min, max } = clipLengthRange(clipLength);

      /* Step 1: Create project */
      const createRes = await fetch("/api/shorts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source_url: url,
          max_clips: maxClips,
          clip_length: clipLength,
          // Send explicit min/max so the worker can enforce duration
          clip_min_seconds: min,
          clip_max_seconds: max,
          caption_style: captionStyle,
          // Tell backend to use smaller caption font
          // 0.5 = 50% of current size, adjust as needed
          caption_font_scale: 0.5,
          crop_mode: cropMode,
          generate_thumbnails: generateThumbnails,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create project");
      }

      const pid = createData.project.id;
      setProjectId(pid);
      setProject({
        ...createData.project,
        clips: [],
      });

      /* Step 2: Start processing */
      const startRes = await fetch("/api/shorts/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: pid }),
      });

      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData.error || "Failed to start processing");
      }

      /* Step 3: Start polling for status */
      startPolling(pid);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setGenerating(false);
    }
  }

  /* ── Toggle clip selection ───────────────────────────── */
  function toggleClip(id: string) {
    setSelectedClips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ── Download clip (fetch as blob → triggers Save dialog) */
  async function downloadClip(clip: ShortClip): Promise<boolean> {
    if (!clip.video_url) return false;
    try {
      const response = await fetch(clip.video_url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `Short_${clip.index}_${clip.title.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after delay to ensure download starts
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      return true;
    } catch (err) {
      console.error("[shorts] Download error:", err);
      return false;
    }
  }

  /* ── Download all selected (sequential with progress) ── */
  async function downloadSelected() {
    const toDownload = clips.filter((c) => selectedClips.has(c.id) && c.video_url);
    if (toDownload.length === 0) return;

    setDownloading(true);
    let successCount = 0;
    for (let i = 0; i < toDownload.length; i++) {
      setDownloadProgress(`Downloading ${i + 1} of ${toDownload.length}...`);
      const ok = await downloadClip(toDownload[i]);
      if (ok) successCount++;
      // Delay between downloads so browser doesn't block them
      if (i < toDownload.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    setDownloadProgress(
      successCount === toDownload.length
        ? `✓ ${successCount} clip${successCount !== 1 ? "s" : ""} saved to Downloads`
        : `Downloaded ${successCount} of ${toDownload.length} clips`
    );
    setDownloading(false);
    // Clear message after 4 seconds
    setTimeout(() => setDownloadProgress(null), 4000);
  }

  /* ── Copy description ────────────────────────────────── */
  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  /* ── Start fresh / new video ─────────────────────────── */
  function handleStartFresh() {
    setProject(null);
    setProjectId(null);
    setSelectedClips(new Set());
    setRestoredFromSession(false);
    setUrl("");
    setPreview(null);
    setError("");
    clearSessionState();
  }

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ── Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚡</span>
              <h1 className="text-3xl font-bold">AI Shorts Generator</h1>
            </div>
            <p className="text-gray-400 mt-2 ml-12">
              Turn any long YouTube video into viral Shorts, TikToks &amp; Reels — automatically
            </p>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition"
          >
            ← Back
          </Link>
        </div>

        {/* ── Restored session banner ───────────────────── */}
        {restoredFromSession && hasResults && (
          <div
            className="rounded-xl p-3.5 mb-6 flex items-center justify-between"
            style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.2)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span className="text-sm text-green-300">
                Restored your previous session — your generated shorts are still here.
              </span>
            </div>
            <button
              onClick={handleStartFresh}
              className="text-xs text-gray-400 hover:text-white px-3 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition"
            >
              Start Fresh
            </button>
          </div>
        )}

        {/* ── How it Works Banner ───────────────────────── */}
        {!hasResults && !generating && (
          <div
            className="rounded-2xl p-6 mb-8"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(139,92,246,0.06) 100%)",
              border: "1px solid rgba(245,158,11,0.15)",
            }}
          >
            <h3 className="font-semibold text-amber-300 mb-3 flex items-center gap-2">
              <span>🎯</span> How It Works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-sm">
              {[
                { icon: "🔗", text: "Paste YouTube URL" },
                { icon: "🧠", text: "AI finds viral moments" },
                { icon: "✂️", text: "Auto-clips best parts" },
                { icon: "📱", text: "Crops to 9:16 vertical" },
                { icon: "📤", text: "Download & post" },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-1.5">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-gray-300 text-xs">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={hasResults || generating ? "grid grid-cols-1 lg:grid-cols-3 gap-8" : ""}>
          {/* ── Left Column: Form ───────────────────────── */}
          <div className={hasResults || generating ? "lg:col-span-1" : ""}>
            <div
              className="rounded-2xl p-6 space-y-6"
              style={{
                background: "rgba(30, 26, 46, 0.6)",
                border: "1px solid rgba(74, 66, 96, 0.5)",
              }}
            >
              {/* YouTube URL */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  YouTube URL
                </label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  disabled={generating}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 disabled:opacity-50"
                />

                {loadingPreview && (
                  <div className="mt-3 p-3 bg-gray-800/50 rounded-lg text-gray-400 text-sm animate-pulse">
                    Loading preview...
                  </div>
                )}

                {preview && (
                  <div className="mt-3 flex gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                    <img src={preview.thumbnail} alt="" className="w-28 h-16 object-cover rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{preview.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{preview.channel}</p>
                      <p className="text-xs text-green-400 mt-1">✓ Video found</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Number of clips */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Number of Clips
                  <span className="ml-2 text-amber-400 font-bold">{maxClips}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={maxClips}
                  onChange={(e) => setMaxClips(Number(e.target.value))}
                  disabled={generating}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1 clip</span>
                  <span>5 clips</span>
                  <span>10 clips</span>
                </div>
              </div>

              {/* Clip length preference */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Clip Length</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "15-30" as const, label: "15-30s", desc: "Quick hooks" },
                    { id: "30-60" as const, label: "30-60s", desc: "Sweet spot" },
                    { id: "15-60" as const, label: "15-60s", desc: "AI decides" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setClipLength(opt.id)}
                      disabled={generating}
                      className="p-2.5 rounded-lg text-center transition-all duration-200 disabled:opacity-50"
                      style={
                        clipLength === opt.id
                          ? {
                              background: "rgba(245,158,11,0.12)",
                              border: "2px solid #f59e0b",
                              boxShadow: "0 0 14px rgba(245,158,11,0.25)",
                              color: "#ffffff",
                            }
                          : {
                              background: "rgba(31,28,46,0.5)",
                              border: "2px solid #3a3555",
                              boxShadow: "none",
                              color: "#ffffff",
                            }
                      }
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div style={{ fontSize: "10px", color: clipLength === opt.id ? "#fbbf24" : "#8a84a0" }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption Style */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Caption Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setCaptionStyle(style.id)}
                      disabled={generating}
                      className="p-2.5 rounded-lg text-center transition-all duration-200 disabled:opacity-50"
                      style={
                        captionStyle === style.id
                          ? {
                              background: "rgba(245,158,11,0.12)",
                              border: "2px solid #f59e0b",
                              boxShadow: "0 0 14px rgba(245,158,11,0.25)",
                              color: "#ffffff",
                            }
                          : {
                              background: "rgba(31,28,46,0.5)",
                              border: "2px solid #3a3555",
                              boxShadow: "none",
                              color: "#ffffff",
                            }
                      }
                    >
                      <span className="text-lg">{style.icon}</span>
                      <div style={{ fontSize: "12px", fontWeight: 500, color: "#ffffff", marginTop: "2px" }}>{style.label}</div>
                      <div style={{ fontSize: "9px", color: captionStyle === style.id ? "#fbbf24" : "#8a84a0" }}>{style.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Crop Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">9:16 Crop Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {CROP_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setCropMode(mode.id)}
                      disabled={generating}
                      className="p-2.5 rounded-lg text-center transition-all duration-200 disabled:opacity-50"
                      style={
                        cropMode === mode.id
                          ? {
                              background: "rgba(245,158,11,0.12)",
                              border: "2px solid #f59e0b",
                              boxShadow: "0 0 14px rgba(245,158,11,0.25)",
                              color: "#ffffff",
                            }
                          : {
                              background: "rgba(31,28,46,0.5)",
                              border: "2px solid #3a3555",
                              boxShadow: "none",
                              color: "#ffffff",
                            }
                      }
                    >
                      <span className="text-lg">{mode.icon}</span>
                      <div style={{ fontSize: "12px", fontWeight: 500, color: "#ffffff", marginTop: "2px" }}>{mode.label}</div>
                      <div style={{ fontSize: "9px", color: cropMode === mode.id ? "#fbbf24" : "#8a84a0" }}>{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate thumbnails toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-300">Generate Thumbnails</div>
                  <div className="text-xs text-gray-500">Auto-create thumbnail for each Short</div>
                </div>
                <button
                  onClick={() => setGenerateThumbnails(!generateThumbnails)}
                  disabled={generating}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    generateThumbnails ? "bg-amber-500" : "bg-gray-700"
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

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!url || generating}
                className="w-full py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-medium text-lg tracking-wide transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: !url || generating ? "#252040" : "#92400e",
                  border: !url || generating ? "1px solid #3a3555" : "1px solid rgba(251,191,36,0.5)",
                  boxShadow: !url || generating ? "none" : "0 0 24px rgba(245,158,11,0.25)",
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
                  <>⚡ Generate {maxClips} Viral Shorts</>
                )}
              </button>

              {/* Project ID reference */}
              {projectId && (
                <p className="text-[10px] text-gray-600 text-center truncate">
                  Project: {projectId}
                </p>
              )}
            </div>
          </div>

          {/* ── Right Column: Results ───────────────────── */}
          {(generating || hasResults) && (
            <div className="lg:col-span-2">
              {/* Progress bar */}
              {generating && (
                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{
                    background: "rgba(30, 26, 46, 0.6)",
                    border: "1px solid rgba(74, 66, 96, 0.5)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-300">{progressText}</span>
                    <span className="text-sm font-bold text-amber-400">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressPct}%`,
                        background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
                        boxShadow: "0 0 8px rgba(245,158,11,0.4)",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    This may take a few minutes depending on video length.
                  </p>
                </div>
              )}

              {/* Duration warning banner */}
              {hasResults && shortClips.length > 0 && (
                <div
                  className="rounded-xl p-4 mb-4"
                  style={{
                    background: "rgba(234,179,8,0.06)",
                    border: "1px solid rgba(234,179,8,0.2)",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
                    <div>
                      <p className="text-sm text-amber-300 font-medium">
                        {shortClips.length} clip{shortClips.length !== 1 ? "s" : ""} outside your {clipLength}s range
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Clips #{shortClips.map((c) => c.index).join(", #")} didn&apos;t meet the requested duration.
                        The worker pipeline needs to enforce clip_min_seconds / clip_max_seconds during FFmpeg clipping.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Results header */}
              {hasResults && (
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <span>🎬</span> Your Shorts
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
                        background: "#92400e",
                        border: "1px solid rgba(251,191,36,0.5)",
                        color: "#ffffff",
                        boxShadow: "0 0 12px rgba(245,158,11,0.15)",
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
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(245,158,11,0.08)",
                    border: downloadProgress.startsWith("✓")
                      ? "1px solid rgba(34,197,94,0.25)"
                      : "1px solid rgba(245,158,11,0.2)",
                    color: downloadProgress.startsWith("✓") ? "#4ade80" : "#fbbf24",
                  }}
                >
                  {!downloadProgress.startsWith("✓") && !downloadProgress.startsWith("Downloaded") && (
                    <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {downloadProgress}
                  {downloadProgress.startsWith("✓") && (
                    <span className="text-xs text-gray-400 ml-1">(saved to your Downloads folder)</span>
                  )}
                </div>
              )}

              {/* Clip cards */}
              <div className="space-y-4">
                {clips.map((clip) => {
                  const isTooShort = clip.duration < minLen;
                  const isTooLong = clip.duration > clipLengthRange(clipLength).max + 10; // 10s grace

                  return (
                    <div
                      key={clip.id}
                      className="rounded-xl overflow-hidden transition-all duration-200"
                      style={{
                        background: selectedClips.has(clip.id)
                          ? "rgba(245,158,11,0.06)"
                          : "rgba(30, 26, 46, 0.6)",
                        border: selectedClips.has(clip.id)
                          ? "1px solid rgba(245,158,11,0.25)"
                          : "1px solid rgba(74, 66, 96, 0.5)",
                        boxShadow: selectedClips.has(clip.id)
                          ? "0 0 16px rgba(245,158,11,0.08)"
                          : "none",
                      }}
                    >
                      <div className="flex gap-4 p-4">
                        {/* Thumbnail / preview */}
                        <div className="flex-shrink-0">
                          {clip.thumbnail_url ? (
                            <img
                              src={clip.thumbnail_url}
                              alt={clip.title}
                              className="w-20 h-36 object-cover rounded-lg"
                            />
                          ) : (
                            <div
                              className="w-20 h-36 rounded-lg flex flex-col items-center justify-center gap-1"
                              style={{
                                background: "linear-gradient(180deg, #1e1a2e 0%, #15112a 100%)",
                                border: "1px solid rgba(74,66,96,0.5)",
                              }}
                            >
                              <span className="text-2xl">📱</span>
                              <span className="text-[9px] text-gray-500">9:16</span>
                              <span className="text-[10px] text-amber-500 font-medium">
                                {Math.round(clip.duration)}s
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: `${scoreColor(clip.hook_score)}22`,
                                    color: scoreColor(clip.hook_score),
                                    border: `1px solid ${scoreColor(clip.hook_score)}44`,
                                  }}
                                >
                                  🔥 {clip.hook_score}
                                </span>
                                <span className="text-[10px] text-gray-500">Clip #{clip.index}</span>
                                <span className="text-[10px] text-gray-600">
                                  {formatTime(clip.start_time)} → {formatTime(clip.end_time)}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  ({Math.round(clip.duration)}s)
                                </span>
                                {/* Duration warning badges */}
                                {isTooShort && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                                    style={{
                                      backgroundColor: "rgba(239,68,68,0.12)",
                                      color: "#f87171",
                                      border: "1px solid rgba(239,68,68,0.3)",
                                    }}
                                  >
                                    ⚠ Too short
                                  </span>
                                )}
                                {isTooLong && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                                    style={{
                                      backgroundColor: "rgba(239,68,68,0.12)",
                                      color: "#f87171",
                                      border: "1px solid rgba(239,68,68,0.3)",
                                    }}
                                  >
                                    ⚠ Too long
                                  </span>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm text-white truncate">{clip.title}</h3>
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{clip.reason}</p>
                            </div>

                            {/* Select checkbox */}
                            <button
                              onClick={() => toggleClip(clip.id)}
                              className="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all duration-200"
                              style={{
                                borderColor: selectedClips.has(clip.id) ? "#f59e0b" : "#4a4260",
                                backgroundColor: selectedClips.has(clip.id) ? "#f59e0b" : "transparent",
                              }}
                            >
                              {selectedClips.has(clip.id) && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          </div>

                          {/* Description */}
                          <div className="mt-2 p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/30">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                                Auto-Generated Description
                              </span>
                              <button
                                onClick={() => copyText(clip.description)}
                                className="text-[10px] text-amber-500 hover:text-amber-400 transition"
                              >
                                Copy
                              </button>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed">{clip.description}</p>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2 mt-2">
                            {clip.video_url && (
                              <a
                                href={clip.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 text-[11px] rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-amber-500/40 transition"
                              >
                                ▶ Preview
                              </a>
                            )}
                            <button
                              onClick={() => copyText(clip.title)}
                              className="px-3 py-1 text-[11px] rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-amber-500/40 transition"
                            >
                              📋 Copy Title
                            </button>
                            {clip.video_url && (
                              <button
                                onClick={() => downloadClip(clip)}
                                className="px-3 py-1 text-[11px] rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-amber-500/40 transition"
                              >
                                ⬇ Download
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Generate again */}
              {hasResults && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handleStartFresh}
                    className="px-6 py-2 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition"
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