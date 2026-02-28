// ============================================================
// FILE: src/app/dashboard/repurpose/history/page.tsx
// ============================================================
// Repurpose History — View all past repurpose projects,
// see clips, download, and re-open results.
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ──────────────────────────────────────────────────── */
interface RepurposeClip {
  id: string;
  index: number;
  title?: string;
  suggested_title?: string;
  suggested_hashtags?: string[];
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  hook_score?: number;
  status: string;
}

interface RepurposeProject {
  id: string;
  source_url: string;
  youtube_video_id: string | null;
  source_title: string | null;
  source_channel: string | null;
  source_thumbnail: string | null;
  source_duration_sec: number | null;
  max_clips: number;
  clip_min_seconds: number;
  clip_max_seconds: number;
  caption_style: string;
  target_platforms: string[];
  status: string;
  progress_pct: number;
  progress_stage: string | null;
  error_message: string | null;
  clips: RepurposeClip[] | null;
  created_at: string;
  updated_at: string;
}

/* ── Helpers ────────────────────────────────────────────────── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDuration(sec: number | null): string {
  if (!sec) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  done: { label: "Complete", color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  processing: { label: "Processing", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  analyzing: { label: "Analyzing", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  clipping: { label: "Clipping", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  downloading: { label: "Downloading", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  transcribing: { label: "Transcribing", color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
  uploading: { label: "Uploading", color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  error: { label: "Failed", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  draft: { label: "Draft", color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
};

/* ── Main Component ─────────────────────────────────────────── */
export default function RepurposeHistoryPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<RepurposeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  /* ── Fetch projects ──────────────────────────────────────── */
  const fetchProjects = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("repurpose_projects")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setProjects(data as RepurposeProject[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  /* ── Download clip ───────────────────────────────────────── */
  async function downloadClip(url: string, name: string) {
    try {
      const res = await fetch(url);
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

  /* ── Download all clips ──────────────────────────────────── */
  async function downloadAllClips(project: RepurposeProject) {
    const clips = project.clips || [];
    const doneClips = clips.filter((c) => c.video_url);
    if (doneClips.length === 0) return;

    setDownloading(project.id);
    for (const clip of doneClips) {
      const name = (clip.suggested_title || clip.title || `clip-${clip.index}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      await downloadClip(clip.video_url!, `${name}.mp4`);
    }
    setDownloading(null);
  }

  /* ── Delete project ──────────────────────────────────────── */
  async function deleteProject(projectId: string) {
    await supabase.from("repurpose_clips").delete().eq("project_id", projectId);
    await supabase.from("repurpose_projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setDeleteConfirm(null);
  }

  /* ── Stats ───────────────────────────────────────────────── */
  const totalProjects = projects.length;
  const doneProjects = projects.filter((p) => p.status === "done").length;
  const totalClips = projects.reduce((sum, p) => sum + (p.clips?.length || 0), 0);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-2xl">📋</span>
              Repurpose History
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              View and manage all your repurposed videos
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard/repurpose")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(168,85,247,0.3))",
              border: "1px solid rgba(139,92,246,0.4)",
            }}
          >
            + New Repurpose
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Projects", value: totalProjects, icon: "📁", color: "#a78bfa" },
            { label: "Completed", value: doneProjects, icon: "✅", color: "#4ade80" },
            { label: "Clips Created", value: totalClips, icon: "🎬", color: "#fbbf24" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4"
              style={{
                background: "rgba(20,17,35,0.6)",
                border: "1px solid rgba(74,66,96,0.3)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{stat.icon}</span>
                <span className="text-xs text-gray-400">{stat.label}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading your projects...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && projects.length === 0 && (
          <div
            className="text-center py-20 rounded-xl"
            style={{
              background: "rgba(20,17,35,0.6)",
              border: "1px solid rgba(74,66,96,0.3)",
            }}
          >
            <div className="text-5xl mb-4">🔄</div>
            <h3 className="text-lg font-medium text-white mb-2">No repurpose projects yet</h3>
            <p className="text-gray-400 text-sm mb-6">
              Turn any long YouTube video into viral shorts
            </p>
            <button
              onClick={() => router.push("/dashboard/repurpose")}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
              }}
            >
              Create Your First Repurpose
            </button>
          </div>
        )}

        {/* Project List */}
        {!loading && projects.length > 0 && (
          <div className="space-y-4">
            {projects.map((project) => {
              const statusCfg = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
              const clips = project.clips || [];
              const doneClips = clips.filter((c) => c.video_url);
              const isExpanded = expandedId === project.id;

              return (
                <div
                  key={project.id}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{
                    background: "rgba(20,17,35,0.6)",
                    border: isExpanded
                      ? "1px solid rgba(139,92,246,0.4)"
                      : "1px solid rgba(74,66,96,0.3)",
                  }}
                >
                  {/* Project Header (clickable) */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : project.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="w-20 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                      {project.source_thumbnail ? (
                        <img
                          src={project.source_thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">
                          🎬
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">
                        {project.source_title || "Untitled Video"}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        {project.source_channel && (
                          <span className="text-xs text-gray-500">{project.source_channel}</span>
                        )}
                        {project.source_duration_sec && (
                          <span className="text-xs text-gray-500">
                            {formatDuration(project.source_duration_sec)}
                          </span>
                        )}
                        <span className="text-xs text-gray-600">{timeAgo(project.created_at)}</span>
                      </div>
                    </div>

                    {/* Clips count */}
                    <div className="text-center flex-shrink-0 px-3">
                      <div className="text-lg font-bold text-white">{doneClips.length}</div>
                      <div className="text-[10px] text-gray-500">clips</div>
                    </div>

                    {/* Status badge */}
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        border: `1px solid ${statusCfg.color}30`,
                      }}
                    >
                      {statusCfg.label}
                    </span>

                    {/* Expand arrow */}
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded: Clips Grid */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-800/50">
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 py-3">
                        {doneClips.length > 0 && (
                          <button
                            onClick={() => downloadAllClips(project)}
                            disabled={downloading === project.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all flex items-center gap-1.5"
                            style={{
                              background: "rgba(139,92,246,0.2)",
                              border: "1px solid rgba(139,92,246,0.3)",
                            }}
                          >
                            {downloading === project.id ? (
                              <>
                                <span className="animate-spin">⏳</span> Downloading...
                              </>
                            ) : (
                              <>⬇️ Download All ({doneClips.length})</>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const url = `https://www.youtube.com/watch?v=${project.youtube_video_id}`;
                            window.open(url, "_blank");
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 transition-all"
                          style={{
                            background: "rgba(20,17,35,0.8)",
                            border: "1px solid rgba(74,66,96,0.3)",
                          }}
                        >
                          📺 Source Video
                        </button>
                        {deleteConfirm === project.id ? (
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-xs text-red-400 mr-1">Delete forever?</span>
                            <button
                              onClick={() => deleteProject(project.id)}
                              className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded text-xs bg-gray-700/30 text-gray-400 border border-gray-600/30"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(project.id)}
                            className="ml-auto px-2 py-1 rounded text-xs text-gray-500 hover:text-red-400 transition-colors"
                          >
                            🗑️
                          </button>
                        )}
                      </div>

                      {/* Error message */}
                      {project.error_message && (
                        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <p className="text-xs text-red-400">{project.error_message}</p>
                        </div>
                      )}

                      {/* Processing indicator */}
                      {project.status !== "done" && project.status !== "error" && project.status !== "draft" && (
                        <div className="mb-3 p-3 rounded-lg" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="animate-spin text-sm">⏳</span>
                            <span className="text-xs text-yellow-300">{project.progress_stage || "Processing"}...</span>
                            <span className="text-xs text-yellow-400/70 ml-auto">{project.progress_pct}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-gray-700 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${project.progress_pct}%`,
                                background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Clips grid */}
                      {doneClips.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {doneClips.map((clip) => (
                            <div
                              key={clip.id}
                              className="rounded-lg overflow-hidden group"
                              style={{
                                background: "rgba(15,12,26,0.8)",
                                border: "1px solid rgba(74,66,96,0.25)",
                              }}
                            >
                              {/* Video preview */}
                              <div className="relative aspect-[9/16] bg-gray-900">
                                {clip.thumbnail_url ? (
                                  <img
                                    src={clip.thumbnail_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : clip.video_url ? (
                                  <video
                                    src={clip.video_url}
                                    className="w-full h-full object-cover"
                                    muted
                                    preload="metadata"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-700 text-2xl">
                                    🎬
                                  </div>
                                )}

                                {/* Overlay on hover */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  {clip.video_url && (
                                    <>
                                      <button
                                        onClick={() => window.open(clip.video_url, "_blank")}
                                        className="px-2 py-1 rounded bg-white/20 text-white text-xs backdrop-blur-sm"
                                      >
                                        ▶ Play
                                      </button>
                                      <button
                                        onClick={() => downloadClip(
                                          clip.video_url!,
                                          `${(clip.suggested_title || `clip-${clip.index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)}.mp4`
                                        )}
                                        className="px-2 py-1 rounded bg-white/20 text-white text-xs backdrop-blur-sm"
                                      >
                                        ⬇️
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* Duration badge */}
                                {clip.duration && (
                                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium">
                                    {formatDuration(clip.duration)}
                                  </span>
                                )}

                                {/* Hook score */}
                                {clip.hook_score && (
                                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[9px] font-bold border border-orange-500/30">
                                    🔥 {clip.hook_score}
                                  </span>
                                )}
                              </div>

                              {/* Clip info */}
                              <div className="p-2">
                                <p className="text-[11px] text-gray-300 font-medium truncate">
                                  {clip.suggested_title || clip.title || `Clip ${clip.index}`}
                                </p>
                                {clip.suggested_hashtags && clip.suggested_hashtags.length > 0 && (
                                  <p className="text-[9px] text-purple-400/60 mt-0.5 truncate">
                                    {clip.suggested_hashtags.slice(0, 3).join(" ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : project.status === "done" ? (
                        <p className="text-xs text-gray-500 text-center py-4">
                          No clips were generated for this project.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}