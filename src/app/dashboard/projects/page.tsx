// ============================================================
// FILE: src/app/dashboard/projects/page.tsx
// ============================================================
// Ripple — Projects List Page
// Brand pass: coral CTAs, Ripple ink background, Space Grotesk
// heading, refined cards. Status colors (Done/Rendering/Error)
// kept semantic so they stay readable.
// ============================================================

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
  done:       { label: "Done",      color: "#5DD39E", bg: "rgba(93,211,158,0.10)",  border: "rgba(93,211,158,0.3)" },
  rendering:  { label: "Rendering", color: "#FFA94D", bg: "rgba(255,169,77,0.10)",  border: "rgba(255,169,77,0.3)" },
  processing: { label: "Rendering", color: "#FFA94D", bg: "rgba(255,169,77,0.10)",  border: "rgba(255,169,77,0.3)" },
  queued:     { label: "Queued",    color: "#5DD3E0", bg: "rgba(93,211,224,0.10)",  border: "rgba(93,211,224,0.3)" },
  draft:      { label: "Draft",     color: "#8B8794", bg: "rgba(139,135,148,0.10)", border: "rgba(139,135,148,0.25)" },
  error:      { label: "Error",     color: "#FF6B6B", bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.3)" },
  failed:     { label: "Failed",    color: "#FF6B6B", bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.3)" },
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
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {/* Folder icon in coral tint */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,107,90,0.12)",
                border: "1px solid rgba(255,107,90,0.2)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
                Projects
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
                All your AI-generated videos
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/create"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
              color: "#0F0E1A",
              boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            + Create
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total", value: totalProjects, color: "#FF8B7A", bg: "rgba(255,107,90,0.10)", iconColor: "#FF8B7A" },
            { label: "Completed", value: doneCount, color: "#5DD39E", bg: "rgba(93,211,158,0.10)", iconColor: "#5DD39E" },
            { label: "Rendering", value: renderingCount, color: "#FFA94D", bg: "rgba(255,169,77,0.10)", iconColor: "#FFA94D" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: stat.bg }}
                >
                  {stat.label === "Total" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stat.iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                  {stat.label === "Completed" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stat.iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {stat.label === "Rendering" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={stat.iconColor} stroke="none">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: "#8B8794", letterSpacing: "0.03em" }}>
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

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div
              className="animate-spin w-8 h-8 border-2 rounded-full mx-auto mb-4"
              style={{
                borderColor: "rgba(255,107,90,0.2)",
                borderTopColor: "#FF6B5A",
              }}
            />
            <p className="text-sm" style={{ color: "#8B8794" }}>Loading projects...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.25)",
            }}
          >
            <p className="text-sm" style={{ color: "#FF6B6B" }}>{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && projects.length === 0 && (
          <div
            className="text-center py-20 rounded-xl"
            style={{
              background: "#16151F",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-5xl mb-4 opacity-40">📹</div>
            <h3
              className="text-lg font-semibold mb-2"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              No projects yet
            </h3>
            <p className="text-sm mb-6" style={{ color: "#8B8794" }}>
              Create your first AI-generated video
            </p>
            <Link
              href="/dashboard/create"
              className="px-6 py-2 rounded-lg text-sm font-semibold inline-block transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
                color: "#0F0E1A",
                boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
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
                  className={`rounded-xl transition-all ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                  style={{
                    background: "#16151F",
                    border: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "0 2px 8px -2px rgba(0,0,0,0.4)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.currentTarget.style.borderColor = "rgba(255,107,90,0.25)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px -8px rgba(255,107,90,0.25)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDeleting) {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 2px 8px -2px rgba(0,0,0,0.4)";
                    }
                  }}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Project info — clickable */}
                    <Link
                      href={"/dashboard/projects/" + p.id}
                      className="flex-1 min-w-0 group"
                    >
                      <div
                        className="font-semibold truncate transition-colors"
                        style={{
                          color: "#F5F2ED",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#FF8B7A"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#F5F2ED"; }}
                      >
                        {p.topic || "(No topic)"}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "#8B8794" }}>
                        <span>{p.style || "—"}</span>
                        <span style={{ color: "#3A3845" }}>•</span>
                        <span>{p.length || "—"}</span>
                        <span style={{ color: "#3A3845" }}>•</span>
                        <span>{p.resolution || "—"}</span>
                        {typeof p.render_attempt === "number" && (
                          <>
                            <span style={{ color: "#3A3845" }}>•</span>
                            <span>Attempt {p.render_attempt}</span>
                          </>
                        )}
                        {p.created_at && (
                          <>
                            <span style={{ color: "#3A3845" }}>•</span>
                            <span style={{ color: "#5A5762" }}>{timeAgo(p.created_at)}</span>
                          </>
                        )}
                      </div>
                    </Link>

                    {/* Status badge */}
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
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
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                      style={{
                        background: "rgba(255,107,90,0.10)",
                        border: "1px solid rgba(255,107,90,0.25)",
                        color: "#FF8B7A",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,107,90,0.18)";
                        e.currentTarget.style.borderColor = "rgba(255,107,90,0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,107,90,0.10)";
                        e.currentTarget.style.borderColor = "rgba(255,107,90,0.25)";
                      }}
                    >
                      Open →
                    </Link>

                    {/* Delete */}
                    {deleteConfirm === p.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => deleteProject(p.id)}
                          className="px-2 py-1 rounded text-[11px] font-semibold transition-colors"
                          style={{
                            background: "rgba(255,107,107,0.15)",
                            color: "#FF6B6B",
                            border: "1px solid rgba(255,107,107,0.35)",
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded text-[11px] font-medium"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            color: "#8B8794",
                            border: "1px solid rgba(255,255,255,0.08)",
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
                        className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                        style={{
                          color: running ? "#3A3845" : "#5A5762",
                          cursor: running ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!running) {
                            e.currentTarget.style.color = "#FF6B6B";
                            e.currentTarget.style.background = "rgba(255,107,107,0.10)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!running) {
                            e.currentTarget.style.color = "#5A5762";
                            e.currentTarget.style.background = "transparent";
                          }
                        }}
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
                      <div
                        className="h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full rounded-full animate-pulse"
                          style={{
                            width: "60%",
                            background: "linear-gradient(90deg, #FFA94D, #FF6B5A)",
                          }}
                        />
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: "#5A5762" }}>
                        Rendering in progress — auto-refreshing...
                      </p>
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