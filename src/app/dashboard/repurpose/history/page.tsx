// ============================================================
// FILE: src/app/dashboard/repurpose/history/page.tsx
// ============================================================
// Ripple — Shorts History (DB tables stay named repurpose_*,
// user-facing this is now called "Shorts History").
//
// Brand pass: amber pipeline cue for in-flight (matches main
// /dashboard/shorts page), coral CTAs, semantic status colors.
//
// All Supabase fetch, expand/collapse, download, and delete
// logic preserved.
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";

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
  done:         { label: "Complete",     color: "#5DD39E", bg: "rgba(93,211,158,0.10)" },
  processing:   { label: "Processing",   color: "#FFA94D", bg: "rgba(255,169,77,0.10)" },
  analyzing:    { label: "Analyzing",    color: "#FFA94D", bg: "rgba(255,169,77,0.10)" },
  clipping:     { label: "Clipping",     color: "#FFA94D", bg: "rgba(255,169,77,0.10)" },
  downloading:  { label: "Downloading",  color: "#FFA94D", bg: "rgba(255,169,77,0.10)" },
  transcribing: { label: "Transcribing", color: "#5DD3E0", bg: "rgba(93,211,224,0.10)" },
  uploading:    { label: "Uploading",    color: "#FFA94D", bg: "rgba(255,169,77,0.10)" },
  error:        { label: "Failed",       color: "#FF6B6B", bg: "rgba(255,107,107,0.10)" },
  draft:        { label: "Draft",        color: "#8B8794", bg: "rgba(139,135,148,0.10)" },
};

/* ── Main Component ─────────────────────────────────────────── */
export default function ShortsHistoryPage() {
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

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              Shorts History
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
              View and manage all your repurposed videos
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard/shorts")}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
              color: "#0F0E1A",
              boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            + New Shorts
          </button>
        </div>

        {/* ── Stats Row ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Projects", value: totalProjects, icon: "📁", color: CORAL_SOFT },
            { label: "Completed", value: doneProjects, icon: "✅", color: "#5DD39E" },
            { label: "Clips Created", value: totalClips, icon: "🎬", color: AMBER },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{stat.icon}</span>
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{
                    color: "#8B8794",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    letterSpacing: "0.05em",
                  }}
                >
                  {stat.label}
                </span>
              </div>
              <div
                className="text-2xl font-bold"
                style={{
                  color: stat.color,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-20">
            <div
              className="w-8 h-8 rounded-full animate-spin mx-auto mb-4"
              style={{
                border: "2px solid rgba(255,107,90,0.2)",
                borderTopColor: CORAL,
              }}
            />
            <p style={{ color: "#8B8794" }}>Loading your projects...</p>
          </div>
        )}

        {/* ── Empty State ────────────────────────────────────── */}
        {!loading && projects.length === 0 && (
          <div
            className="text-center py-20 rounded-xl"
            style={{
              background: "#16151F",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-5xl mb-4 opacity-40">✂️</div>
            <h3
              className="text-lg font-semibold mb-2"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              No shorts created yet
            </h3>
            <p className="text-sm mb-6" style={{ color: "#8B8794" }}>
              Turn any long YouTube video into viral shorts
            </p>
            <button
              onClick={() => router.push("/dashboard/shorts")}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Create Your First Shorts
            </button>
          </div>
        )}

        {/* ── Project List ───────────────────────────────────── */}
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
                    background: "#16151F",
                    border: isExpanded
                      ? "1px solid rgba(255,107,90,0.4)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Project Header (clickable) */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : project.id)}
                    className="w-full flex items-center gap-4 p-4 text-left transition-colors"
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      className="w-20 h-12 rounded-lg overflow-hidden flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                    >
                      {project.source_thumbnail ? (
                        <img
                          src={project.source_thumbnail}
                          alt=""
                          className="w-full h-full object-cover opacity-70"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-lg"
                          style={{ color: "#3A3845" }}
                        >
                          🎬
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-sm font-semibold truncate"
                        style={{
                          color: "#F5F2ED",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        {project.source_title || "Untitled Video"}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {project.source_channel && (
                          <span className="text-xs" style={{ color: "#8B8794" }}>
                            {project.source_channel}
                          </span>
                        )}
                        {project.source_duration_sec && (
                          <span className="text-xs" style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatDuration(project.source_duration_sec)}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}>
                          {timeAgo(project.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Clips count */}
                    <div className="text-center flex-shrink-0 px-3">
                      <div
                        className="text-lg font-bold"
                        style={{
                          color: "#F5F2ED",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {doneClips.length}
                      </div>
                      <div
                        className="text-[10px] uppercase tracking-wider"
                        style={{
                          color: "#5A5762",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        clips
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        border: `1px solid ${statusCfg.color}30`,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {statusCfg.label}
                    </span>

                    {/* Expand arrow */}
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      style={{ color: "#5A5762" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded: Clips Grid */}
                  {isExpanded && (
                    <div className="px-4 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 py-3 flex-wrap">
                        {doneClips.length > 0 && (
                          <button
                            onClick={() => downloadAllClips(project)}
                            disabled={downloading === project.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 hover:scale-[1.02]"
                            style={{
                              background: "rgba(255,107,90,0.10)",
                              border: "1px solid rgba(255,107,90,0.3)",
                              color: CORAL_SOFT,
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
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
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#8B8794",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          📺 Source Video
                        </button>
                        {deleteConfirm === project.id ? (
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-xs mr-1" style={{ color: "#FF6B6B" }}>Delete forever?</span>
                            <button
                              onClick={() => deleteProject(project.id)}
                              className="px-2 py-1 rounded text-xs font-semibold"
                              style={{
                                background: "rgba(255,107,107,0.15)",
                                color: "#FF6B6B",
                                border: "1px solid rgba(255,107,107,0.3)",
                                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                              }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded text-xs font-semibold"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                color: "#8B8794",
                                border: "1px solid rgba(255,255,255,0.1)",
                                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                              }}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(project.id)}
                            className="ml-auto px-2 py-1 rounded text-xs transition"
                            style={{ color: "#5A5762" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#FF6B6B"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "#5A5762"; }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>

                      {/* Error message */}
                      {project.error_message && (
                        <div
                          className="mb-3 p-3 rounded-lg"
                          style={{
                            background: "rgba(255,107,107,0.08)",
                            border: "1px solid rgba(255,107,107,0.2)",
                          }}
                        >
                          <p className="text-xs" style={{ color: "#FF6B6B" }}>{project.error_message}</p>
                        </div>
                      )}

                      {/* Processing indicator (amber — matches main page) */}
                      {project.status !== "done" && project.status !== "error" && project.status !== "draft" && (
                        <div
                          className="mb-3 p-3 rounded-lg"
                          style={{
                            background: "rgba(255,169,77,0.06)",
                            border: "1px solid rgba(255,169,77,0.20)",
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="animate-spin text-sm">⏳</span>
                            <span
                              className="text-xs font-semibold"
                              style={{
                                color: AMBER,
                                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                              }}
                            >
                              {project.progress_stage || "Processing"}...
                            </span>
                            <span
                              className="text-xs ml-auto"
                              style={{
                                color: AMBER,
                                fontFamily: "'JetBrains Mono', monospace",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {project.progress_pct}%
                            </span>
                          </div>
                          <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${project.progress_pct}%`,
                                background: `linear-gradient(90deg, ${CORAL}, ${AMBER})`,
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
                                background: "#0F0E1A",
                                border: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {/* Video preview */}
                              <div className="relative aspect-[9/16]" style={{ background: "#000" }}>
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
                                  <div
                                    className="w-full h-full flex items-center justify-center text-2xl"
                                    style={{ color: "#3A3845" }}
                                  >
                                    🎬
                                  </div>
                                )}

                                {/* Overlay on hover */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  {clip.video_url && (
                                    <>
                                      <button
                                        onClick={() => window.open(clip.video_url, "_blank")}
                                        className="px-2 py-1 rounded text-white text-xs backdrop-blur-sm font-semibold"
                                        style={{
                                          background: "rgba(255,107,90,0.8)",
                                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                        }}
                                      >
                                        ▶ Play
                                      </button>
                                      <button
                                        onClick={() => downloadClip(
                                          clip.video_url!,
                                          `${(clip.suggested_title || `clip-${clip.index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)}.mp4`
                                        )}
                                        className="px-2 py-1 rounded text-white text-xs backdrop-blur-sm font-semibold"
                                        style={{
                                          background: "rgba(255,255,255,0.2)",
                                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                        }}
                                      >
                                        ⬇️
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* Duration badge */}
                                {clip.duration && (
                                  <span
                                    className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-white text-[10px] font-semibold"
                                    style={{
                                      background: "rgba(0,0,0,0.7)",
                                      fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    {formatDuration(clip.duration)}
                                  </span>
                                )}

                                {/* Hook score */}
                                {clip.hook_score && (
                                  <span
                                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                                    style={{
                                      background: "rgba(255,169,77,0.20)",
                                      color: AMBER,
                                      border: "1px solid rgba(255,169,77,0.4)",
                                      fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    🔥 {clip.hook_score}
                                  </span>
                                )}
                              </div>

                              {/* Clip info */}
                              <div className="p-2">
                                <p
                                  className="text-[11px] font-semibold truncate"
                                  style={{
                                    color: "#F5F2ED",
                                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                  }}
                                >
                                  {clip.suggested_title || clip.title || `Clip ${clip.index}`}
                                </p>
                                {clip.suggested_hashtags && clip.suggested_hashtags.length > 0 && (
                                  <p
                                    className="text-[9px] mt-0.5 truncate"
                                    style={{
                                      color: "rgba(255,139,122,0.7)",
                                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                                    }}
                                  >
                                    {clip.suggested_hashtags.slice(0, 3).join(" ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : project.status === "done" ? (
                        <p className="text-xs text-center py-4" style={{ color: "#5A5762" }}>
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