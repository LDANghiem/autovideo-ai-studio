// src/app/dashboard/projects/page.tsx
// ------------------------------------------------------------
// AutoVideo AI Studio — Projects List Page
// ✅ Redesigned to match dark purple theme
// ✅ Glass-morphism floating cards
// ✅ Consistent with Repurpose History styling
// ------------------------------------------------------------

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ──────────────────────────────────────────────────── */
type Project = {
  id: string;
  user_id?: string | null;
  topic: string | null;
  status: string | null;
  style: string | null;
  length: string | null;
  resolution: string | null;
  render_attempt?: number | null;
  created_at?: string | null;
};

/* ── Status Config ──────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  done:       { label: "Done",      color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)" },
  rendering:  { label: "Rendering", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)" },
  processing: { label: "Rendering", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)" },
  queued:     { label: "Queued",    color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)" },
  draft:      { label: "Draft",     color: "#9ca3af", bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.2)" },
  error:      { label: "Error",     color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)" },
  failed:     { label: "Failed",    color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)" },
};

function getStatus(s: string | null) {
  return STATUS_CONFIG[(s || "").toLowerCase()] || STATUS_CONFIG.draft;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
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

/* ── Page Component ─────────────────────────────────────────── */
export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  /* ── Load Projects ───────────────────────────────────────── */
  async function loadProjects() {
    try {
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("You are not logged in. Please sign in.");
        setProjects([]);
        return;
      }
      const { data, error } = await supabase
        .from("projects")
        .select("id, user_id, topic, status, style, length, resolution, render_attempt, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProjects((data as Project[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Delete Project ──────────────────────────────────────── */
  async function deleteProject(projectId: string) {
    setDeletingId(projectId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      const storagePrefixes = [
        { bucket: "audio", prefix: userId + "/" + projectId + "/" },
        { bucket: "videos", prefix: userId + "/" + projectId + "/" },
        { bucket: "scene-images", prefix: userId + "/" + projectId + "/" },
      ];
      for (const { bucket, prefix } of storagePrefixes) {
        try {
          const { data: files } = await supabase.storage.from(bucket).list(
            prefix.replace(/\/$/, "").split("/").slice(0, -1).join("/"),
            { search: projectId }
          );
          if (files && files.length > 0) {
            const paths = files.map((f) => userId + "/" + projectId + "/" + f.name);
            await supabase.storage.from(bucket).remove(paths);
          }
        } catch {}
      }

      await supabase.from("project_renders").delete().eq("project_id", projectId);
      const { error: delErr } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("user_id", userId);
      if (delErr) throw delErr;

      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: any) {
      alert("Failed to delete: " + (err?.message || err));
    } finally {
      setDeletingId(null);
      setDeleteConfirm(null);
    }
  }

  useEffect(() => { setLoading(true); loadProjects(); }, []);

  /* ── Auto-refresh while rendering ────────────────────────── */
  const hasRunning = useMemo(() => {
    return projects.some((p) => {
      const s = (p.status || "").toLowerCase();
      return s === "queued" || s === "processing" || s === "rendering";
    });
  }, [projects]);

  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => loadProjects(), 2500);
    return () => clearInterval(t);
  }, [hasRunning]);

  /* ── Stats ───────────────────────────────────────────────── */
  const totalProjects = projects.length;
  const doneCount = projects.filter((p) => (p.status || "").toLowerCase() === "done").length;
  const renderingCount = projects.filter((p) => {
    const s = (p.status || "").toLowerCase();
    return s === "queued" || s === "processing" || s === "rendering";
  }).length;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-2xl">🎬</span>
              Projects
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              All your AI-generated videos
            </p>
          </div>
          <Link
            href="/dashboard/create"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))",
              border: "1px solid rgba(139,92,246,0.4)",
              boxShadow: "0 4px 20px rgba(139,92,246,0.15), 0 0 40px rgba(139,92,246,0.05)",
            }}
          >
            + Create
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total", value: totalProjects, icon: "📁", color: "#a78bfa" },
            { label: "Completed", value: doneCount, icon: "✅", color: "#4ade80" },
            { label: "Rendering", value: renderingCount, icon: "⚡", color: "#fbbf24" },
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
            <p className="text-gray-400">Loading projects...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
          >
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && projects.length === 0 && (
          <div
            className="text-center py-20 rounded-xl"
            style={{
              background: "rgba(20,17,35,0.6)",
              border: "1px solid rgba(74,66,96,0.3)",
            }}
          >
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
            <p className="text-gray-400 text-sm mb-6">Create your first AI-generated video</p>
            <Link
              href="/dashboard/create"
              className="px-6 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              Create Project
            </Link>
          </div>
        )}

        {/* Project List */}
        {!loading && !error && projects.length > 0 && (
          <div className="space-y-3">
            {projects.map((p) => {
              const isDeleting = deletingId === p.id;
              const s = (p.status || "").toLowerCase();
              const running = s === "queued" || s === "processing" || s === "rendering";
              const statusCfg = getStatus(p.status);

              return (
                <div
                  key={p.id}
                  className={`rounded-xl transition-all hover:translate-y-[-1px] ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                  style={{
                    background: "rgba(20,17,35,0.5)",
                    border: "1px solid rgba(74,66,96,0.3)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                  }}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Project info — clickable */}
                    <Link
                      href={"/dashboard/projects/" + p.id}
                      className="flex-1 min-w-0 group"
                    >
                      <div className="font-medium text-white truncate group-hover:text-purple-300 transition-colors">
                        {p.topic || "(No topic)"}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{p.style || "—"}</span>
                        <span className="text-gray-700">•</span>
                        <span>{p.length || "—"}</span>
                        <span className="text-gray-700">•</span>
                        <span>{p.resolution || "—"}</span>
                        {typeof p.render_attempt === "number" && (
                          <>
                            <span className="text-gray-700">•</span>
                            <span>Attempt {p.render_attempt}</span>
                          </>
                        )}
                        {p.created_at && (
                          <>
                            <span className="text-gray-700">•</span>
                            <span className="text-gray-600">{timeAgo(p.created_at)}</span>
                          </>
                        )}
                      </div>
                    </Link>

                    {/* Status badge */}
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        border: `1px solid ${statusCfg.border}`,
                      }}
                    >
                      {running && <span className="inline-block animate-pulse mr-1">●</span>}
                      {statusCfg.label}
                    </span>

                    {/* Open button */}
                    <Link
                      href={"/dashboard/projects/" + p.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 transition-all hover:text-white flex-shrink-0"
                      style={{
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.2)",
                      }}
                    >
                      Open →
                    </Link>

                    {/* Delete */}
                    {deleteConfirm === p.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => deleteProject(p.id)}
                          className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
                          style={{
                            background: "rgba(248,113,113,0.15)",
                            color: "#f87171",
                            border: "1px solid rgba(248,113,113,0.3)",
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded text-[11px] text-gray-500"
                          style={{
                            background: "rgba(74,66,96,0.2)",
                            border: "1px solid rgba(74,66,96,0.3)",
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (running) return;
                          setDeleteConfirm(p.id);
                        }}
                        disabled={running}
                        title={running ? "Cannot delete while rendering" : "Delete"}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          running
                            ? "text-gray-700 cursor-not-allowed"
                            : "text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                        }`}
                      >
                        {isDeleting ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Rendering progress indicator */}
                  {running && (
                    <div className="px-4 pb-3">
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(74,66,96,0.3)" }}>
                        <div
                          className="h-full rounded-full animate-pulse"
                          style={{
                            width: "60%",
                            background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">Rendering in progress — auto-refreshing...</p>
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
