// src/app/dashboard/projects/page.tsx
// ------------------------------------------------------------
// AutoVideo AI Studio — Projects List Page
// ✅ Fix: Status should NEVER show "Done" instantly due to old video_url
// ✅ Fix: Live-updates projects while any project is queued/processing
// ✅ Fix: Shows Draft correctly (new projects start as draft)
// ✅ NEW: Delete button per project with confirmation
// ------------------------------------------------------------

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ============================================================
   [S1] Types
============================================================ */
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

/* ============================================================
   [S2] UI: Status Chip
============================================================ */
function StatusChip({ status }: { status: string | null }) {
  const s = (status || "unknown").toLowerCase();

  const label =
    s === "draft"
      ? "Draft"
      : s === "queued"
      ? "Queued"
      : s === "processing" || s === "rendering"
      ? "Rendering"
      : s === "done"
      ? "Done"
      : s === "error" || s === "failed"
      ? "Error"
      : "Unknown";

  const cls =
    s === "done"
      ? "border-green-200 bg-green-50 text-green-700"
      : s === "queued" || s === "processing" || s === "rendering"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : s === "draft"
      ? "border-gray-200 bg-gray-50 text-gray-700"
      : s === "error" || s === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-gray-200 bg-gray-50 text-gray-700";

  return <span className={`text-sm px-3 py-1 rounded-full border ${cls}`}>{label}</span>;
}

/* ============================================================
   [S3] Page Component
============================================================ */
export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* ----------------------------------------------------------
     [S3.1] Load Projects
  ---------------------------------------------------------- */
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

  /* ----------------------------------------------------------
     [S3.2] Delete Project
  ---------------------------------------------------------- */
  async function deleteProject(projectId: string, e: React.MouseEvent) {
    // Stop the click from navigating to the project page
    e.preventDefault();
    e.stopPropagation();

    const project = projects.find((p) => p.id === projectId);
    const topicName = project?.topic || "this project";

    if (!window.confirm("Delete \"" + topicName + "\"?\n\nThis will permanently remove the project, video, audio, and scene images. This cannot be undone.")) {
      return;
    }

    setDeletingId(projectId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      // Clean up storage files (best effort — don't fail if missing)
      const storagePrefixes = [
        { bucket: "audio", prefix: userId + "/" + projectId + "/" },
        { bucket: "videos", prefix: userId + "/" + projectId + "/" },
        { bucket: "scene-images", prefix: userId + "/" + projectId + "/" },
      ];

      for (const { bucket, prefix } of storagePrefixes) {
        try {
          const { data: files } = await supabase.storage.from(bucket).list(prefix.replace(/\/$/, "").split("/").slice(0, -1).join("/"), {
            search: projectId,
          });
          if (files && files.length > 0) {
            const paths = files.map((f) => userId + "/" + projectId + "/" + f.name);
            await supabase.storage.from(bucket).remove(paths);
          }
        } catch {
          // Storage cleanup is best-effort
        }
      }

      // Delete project_renders rows
      await supabase
        .from("project_renders")
        .delete()
        .eq("project_id", projectId);

      // Delete the project itself
      const { error: delErr } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("user_id", userId);

      if (delErr) throw delErr;

      // Remove from local state immediately
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: any) {
      alert("Failed to delete: " + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  }

  /* ----------------------------------------------------------
     [S3.3] Initial Load
  ---------------------------------------------------------- */
  useEffect(() => {
    setLoading(true);
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------
     [S3.4] Auto-refresh while ANY project is running
  ---------------------------------------------------------- */
  const hasRunning = useMemo(() => {
    return projects.some((p) => {
      const s = (p.status || "").toLowerCase();
      return s === "queued" || s === "processing" || s === "rendering";
    });
  }, [projects]);

  useEffect(() => {
    if (!hasRunning) return;

    const t = setInterval(() => {
      loadProjects();
    }, 2500);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunning]);

  /* ============================================================
     [S4] Render
  ============================================================ */
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link
          href="/dashboard/create"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          + Create
        </Link>
      </div>

      {/* Loading */}
      {loading && <p className="text-gray-500">Loading…</p>}

      {/* Error */}
      {!loading && error && <div className="border rounded-lg p-4 bg-white text-red-600">{error}</div>}

      {/* Empty */}
      {!loading && !error && projects.length === 0 && (
        <div className="border rounded-lg p-6 bg-white text-gray-600">
          No projects yet. Click <b>Create</b> to generate your first video.
        </div>
      )}

      {/* List */}
      {!loading && !error && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((p) => {
            const isDeleting = deletingId === p.id;
            const s = (p.status || "").toLowerCase();
            const running = s === "queued" || s === "processing" || s === "rendering";

            return (
              <div
                key={p.id}
                className={"border rounded-xl p-4 bg-white hover:shadow " + (isDeleting ? "opacity-50 pointer-events-none" : "")}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Project info — clickable link */}
                  <Link
                    href={"/dashboard/projects/" + p.id}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-semibold truncate">{p.topic || "(No topic)"}</div>
                    <div className="text-sm text-gray-500">
                      {p.style || "—"} • {p.length || "—"} • {p.resolution || "—"}
                      {typeof p.render_attempt === "number" ? <> • Attempt {p.render_attempt}</> : null}
                    </div>
                  </Link>

                  {/* Status + Delete */}
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusChip status={p.status} />

                    {/* Delete button */}
                    <button
                      onClick={(e) => deleteProject(p.id, e)}
                      disabled={isDeleting || running}
                      title={running ? "Cannot delete while rendering" : "Delete project"}
                      className={
                        "p-2 rounded-lg transition-colors " +
                        (running
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-400 hover:text-red-500 hover:bg-red-50")
                      }
                    >
                      {isDeleting ? (
                        /* Spinner */
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        /* Trash icon */
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Running indicator */}
                {running && (
                  <div className="mt-2 text-xs text-gray-500">
                    Rendering in progress… this list will auto-refresh.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}