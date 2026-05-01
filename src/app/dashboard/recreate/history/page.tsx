// ============================================================
// FILE: src/app/dashboard/recreate/history/page.tsx
// ============================================================
// Ripple — ReCreate History
// Brand pass: cyan progress + status (matches main ReCreate page),
// coral CTAs, semantic status badges, Ripple ink surface.
//
// All Supabase fetch, auto-refresh polling, expand/collapse, and
// delete logic preserved.
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const CYAN = "#5DD3E0";

interface ReCreateProject {
  id: string;
  status: string;
  progress_pct: number;
  progress_stage: string | null;
  source_url: string;
  source_title: string | null;
  source_thumbnail: string | null;
  source_channel: string | null;
  target_language: string;
  style: string;
  final_video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_BADGE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  done:  { bg: "rgba(93,211,158,0.10)", border: "rgba(93,211,158,0.3)",  text: "#5DD39E", label: "Complete" },
  error: { bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.3)", text: "#FF6B6B", label: "Failed" },
  draft: { bg: "rgba(139,135,148,0.10)", border: "rgba(139,135,148,0.25)", text: "#8B8794", label: "Draft" },
};

const PROCESSING_STATUSES = ["processing", "transcribing", "scripting", "finding_media", "generating_voice", "rendering", "uploading"];

export default function ReCreateHistoryPage() {
  const [projects, setProjects] = useState<ReCreateProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("recreate_projects")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProjects(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(() => {
      setProjects((prev) => {
        const hasActive = prev.some((p) => PROCESSING_STATUSES.includes(p.status));
        if (hasActive) fetchProjects();
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  async function handleDelete(projectId: string) {
    if (!confirm("Delete this recreation? This cannot be undone.")) return;
    try {
      await supabase.from("recreate_projects").delete().eq("id", projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch {}
  }

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

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    } catch { return iso; }
  }

  function getStatusInfo(status: string) {
    if (PROCESSING_STATUSES.includes(status)) {
      return {
        bg: "rgba(93,211,224,0.10)",
        border: "rgba(93,211,224,0.3)",
        text: CYAN,
        label: "Processing...",
      };
    }
    return STATUS_BADGE[status] || STATUS_BADGE.draft;
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Header ───────────────────────────────────────── */}
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
              ReCreate History
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
              <span
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {projects.length}
              </span>{" "}
              recreation{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/dashboard/recreate"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
              color: "#0F0E1A",
              boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            + New ReCreate
          </Link>
        </div>

        {/* ── Loading ──────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-20">
            <div
              className="inline-block w-8 h-8 rounded-full animate-spin"
              style={{
                border: "2px solid rgba(255,107,90,0.2)",
                borderTopColor: CORAL,
              }}
            />
            <p className="text-sm mt-3" style={{ color: "#8B8794" }}>Loading history...</p>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────── */}
        {!loading && projects.length === 0 && (
          <div
            className="text-center py-20 rounded-2xl"
            style={{
              background: "#16151F",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-4xl mb-3 opacity-40">🎬</div>
            <p className="text-sm mb-4" style={{ color: "#8B8794" }}>No recreations yet</p>
            <Link
              href="/dashboard/recreate"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Create Your First Video
            </Link>
          </div>
        )}

        {/* ── Project list ─────────────────────────────────── */}
        <div className="space-y-3">
          {projects.map((project) => {
            const statusInfo = getStatusInfo(project.status);
            const isProcessing = PROCESSING_STATUSES.includes(project.status);
            const isDone = project.status === "done";
            const isExpanded = expandedId === project.id;

            return (
              <div
                key={project.id}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  background: "#16151F",
                  border: `1px solid ${isProcessing ? "rgba(93,211,224,0.2)" : "rgba(255,255,255,0.06)"}`,
                  boxShadow: "0 2px 8px -2px rgba(0,0,0,0.4)",
                }}
              >
                {/* Main row (clickable) */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer transition-all"
                  onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  onMouseEnter={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.parentElement!.style.borderColor = "rgba(255,107,90,0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.parentElement!.style.borderColor = "rgba(255,255,255,0.06)";
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="w-20 h-12 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    {project.source_thumbnail ? (
                      <img src={project.source_thumbnail} alt="" className="w-full h-full object-cover opacity-70" />
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
                    <p
                      className="text-sm font-semibold truncate"
                      style={{
                        color: "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {project.source_title || "Untitled"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px]" style={{ color: "#8B8794" }}>
                        {project.source_channel || "Unknown"}
                      </span>
                      <span className="text-[10px]" style={{ color: "#3A3845" }}>→</span>
                      <span className="text-[10px] font-semibold" style={{ color: CYAN }}>
                        {project.target_language}
                      </span>
                      <span className="text-[10px]" style={{ color: "#3A3845" }}>·</span>
                      <span className="text-[10px]" style={{ color: "#8B8794" }}>{project.style}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0"
                    style={{
                      background: statusInfo.bg,
                      border: `1px solid ${statusInfo.border}`,
                      color: statusInfo.text,
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    {isProcessing && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1 animate-pulse"
                        style={{ background: statusInfo.text }}
                      />
                    )}
                    {isProcessing ? `${project.progress_pct || 0}%` : statusInfo.label}
                  </div>

                  {/* Date */}
                  <span
                    className="text-[10px] flex-shrink-0 hidden sm:block"
                    style={{
                      color: "#5A5762",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {formatDate(project.created_at)}
                  </span>

                  {/* Expand arrow */}
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    style={{ color: "#5A5762" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Progress bar for processing (cyan — matches main ReCreate page) */}
                {isProcessing && (
                  <div className="px-4 pb-2">
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: "rgba(93,211,224,0.10)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${project.progress_pct || 0}%`,
                          background: `linear-gradient(90deg, ${CYAN}, #5DD3E0)`,
                          boxShadow: "0 0 8px rgba(93,211,224,0.4)",
                        }}
                      />
                    </div>
                    <p
                      className="text-[10px] mt-1"
                      style={{
                        color: "rgba(93,211,224,0.7)",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {project.progress_stage || project.status}
                    </p>
                  </div>
                )}

                {/* Expanded content */}
                {isExpanded && (
                  <div
                    className="px-4 pb-4"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    {/* Video preview */}
                    {isDone && project.final_video_url && (
                      <div
                        className="mt-3 rounded-xl overflow-hidden mb-3"
                        style={{ border: "1px solid rgba(93,211,158,0.2)" }}
                      >
                        <video
                          src={project.final_video_url}
                          controls
                          className="w-full max-h-[360px]"
                          style={{ background: "#000" }}
                        />
                      </div>
                    )}

                    {/* Error message */}
                    {project.status === "error" && project.error_message && (
                      <div
                        className="mt-3 p-3 rounded-lg text-xs"
                        style={{
                          background: "rgba(255,107,107,0.08)",
                          border: "1px solid rgba(255,107,107,0.25)",
                          color: "#FF6B6B",
                        }}
                      >
                        {project.error_message}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {isDone && project.final_video_url && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadVideo(
                                project.final_video_url!,
                                `recreate-${project.target_language}-${project.id.slice(0, 8)}.mp4`
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:scale-[1.02]"
                            style={{
                              background: "rgba(255,107,90,0.10)",
                              border: "1px solid rgba(255,107,90,0.3)",
                              color: CORAL_SOFT,
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
                            }}
                          >
                            ⬇️ Download
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(project.final_video_url!);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#8B8794",
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
                            }}
                          >
                            🔗 Copy URL
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(project.final_video_url!, "_blank");
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#8B8794",
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
                            }}
                          >
                            ↗ Open
                          </button>
                        </>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition ml-auto"
                        style={{
                          background: "rgba(255,107,107,0.06)",
                          border: "1px solid rgba(255,107,107,0.15)",
                          color: "rgba(255,107,107,0.7)",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#FF6B6B";
                          e.currentTarget.style.borderColor = "rgba(255,107,107,0.3)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "rgba(255,107,107,0.7)";
                          e.currentTarget.style.borderColor = "rgba(255,107,107,0.15)";
                        }}
                      >
                        🗑 Delete
                      </button>
                    </div>

                    {/* Meta info */}
                    <div
                      className="mt-3 flex flex-wrap gap-3 text-[10px]"
                      style={{
                        color: "#5A5762",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      <span>ID: {project.id.slice(0, 8)}</span>
                      <span>Created: {formatDate(project.created_at)}</span>
                      {project.updated_at && <span>Updated: {formatDate(project.updated_at)}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}