// ============================================================
// FILE: src/app/dashboard/recreate/history/page.tsx
// ============================================================
// ReCreate History — View all past recreated videos with
// status, preview, and actions (download, re-run, delete)
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

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
  done: { bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.3)", text: "#4ade80", label: "Complete" },
  error: { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", text: "#f87171", label: "Failed" },
  draft: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.3)", text: "#94a3b8", label: "Draft" },
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
    // Auto-refresh every 5s if any projects are in-progress
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
      return { bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.3)", text: "#22d3ee", label: "Processing..." };
    }
    return STATUS_BADGE[status] || STATUS_BADGE.draft;
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0714" }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              ReCreate History
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {projects.length} recreation{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/dashboard/recreate"
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, rgba(6,182,212,0.4), rgba(59,130,246,0.3))",
              border: "1px solid rgba(6,182,212,0.3)",
            }}
          >
            + New ReCreate
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-3">Loading history...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="text-center py-20 rounded-2xl" style={{
            background: "rgba(15,12,28,0.5)",
            border: "1px solid rgba(6,182,212,0.1)",
          }}>
            <div className="text-4xl mb-3">🎬</div>
            <p className="text-gray-400 text-sm mb-4">No recreations yet</p>
            <Link
              href="/dashboard/recreate"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-medium text-cyan-300 transition"
              style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}
            >
              Create Your First Video
            </Link>
          </div>
        )}

        {/* Project list */}
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
                  background: "rgba(15,12,28,0.7)",
                  border: `1px solid ${isProcessing ? "rgba(6,182,212,0.2)" : "rgba(74,66,96,0.15)"}`,
                }}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/[0.02] transition"
                  onClick={() => setExpandedId(isExpanded ? null : project.id)}
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "rgba(30,25,50,0.5)" }}>
                    {project.source_thumbnail ? (
                      <img src={project.source_thumbnail} alt="" className="w-full h-full object-cover opacity-60" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">🎬</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {project.source_title || "Untitled"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500">{project.source_channel || "Unknown"}</span>
                      <span className="text-[10px] text-gray-600">→</span>
                      <span className="text-[10px] text-cyan-400/70">{project.target_language}</span>
                      <span className="text-[10px] text-gray-600">·</span>
                      <span className="text-[10px] text-gray-500">{project.style}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium flex-shrink-0"
                    style={{
                      background: statusInfo.bg,
                      border: `1px solid ${statusInfo.border}`,
                      color: statusInfo.text,
                    }}
                  >
                    {isProcessing && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 animate-pulse"
                        style={{ background: statusInfo.text }} />
                    )}
                    {isProcessing ? `${project.progress_pct || 0}%` : statusInfo.label}
                  </div>

                  {/* Date */}
                  <span className="text-[10px] text-gray-600 flex-shrink-0 hidden sm:block">
                    {formatDate(project.created_at)}
                  </span>

                  {/* Expand arrow */}
                  <svg
                    className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Progress bar for processing */}
                {isProcessing && (
                  <div className="px-4 pb-2">
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(6,182,212,0.1)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${project.progress_pct || 0}%`,
                          background: "linear-gradient(90deg, #06b6d4, #3b82f6)",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-cyan-400/50 mt-1">
                      {project.progress_stage || project.status}
                    </p>
                  </div>
                )}

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(74,66,96,0.15)" }}>
                    {/* Video preview */}
                    {isDone && project.final_video_url && (
                      <div className="mt-3 rounded-xl overflow-hidden mb-3" style={{ border: "1px solid rgba(74,222,128,0.15)" }}>
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
                      <div className="mt-3 p-3 rounded-lg text-xs text-red-400" style={{
                        background: "rgba(248,113,113,0.06)",
                        border: "1px solid rgba(248,113,113,0.15)",
                      }}>
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
                              downloadVideo(project.final_video_url!, `recreate-${project.target_language}-${project.id.slice(0, 8)}.mp4`);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 transition"
                            style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}
                          >
                            ⬇️ Download
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(project.final_video_url!);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 transition"
                            style={{ background: "rgba(30,25,50,0.5)", border: "1px solid rgba(74,66,96,0.2)" }}
                          >
                            🔗 Copy URL
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(project.final_video_url!, "_blank");
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 transition"
                            style={{ background: "rgba(30,25,50,0.5)", border: "1px solid rgba(74,66,96,0.2)" }}
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
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400/60 hover:text-red-400 transition ml-auto"
                        style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}
                      >
                        🗑 Delete
                      </button>
                    </div>

                    {/* Meta info */}
                    <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-600">
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
