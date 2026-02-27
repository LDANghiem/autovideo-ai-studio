// ============================================================
// FILE: src/app/dashboard/dub-video/[id]/page.tsx
// ============================================================
// Dub Video status + result page.
// Polls /api/dub-video/status/[id] every 3 seconds while
// the pipeline is running, shows progress steps, and displays
// the video player + download button when done.
//
// AUTH: Uses supabase from @/lib/supabaseClient to get session
//       token, sends as Bearer in API calls.
//       Same pattern as your existing dashboard pages.
//
// SECTIONS:
//   [S1] Pipeline step definitions (7 steps)
//   [S2] Types
//   [S3] Page component + polling logic
//   [S4] Render — info card, progress tracker, video player
//
// POLLS: GET /api/dub-video/status/[id] every 3 seconds
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

/* ============================================================
   [S1] Pipeline Steps — maps to status values in dub_projects
============================================================ */
const PIPELINE_STEPS = [
  { key: "downloading",     label: "Downloading video",            icon: "⬇️",  pct: 10 },
  { key: "transcribing",    label: "Transcribing original audio",  icon: "🎤",  pct: 25 },
  { key: "translating",     label: "Translating to target language",icon: "🌐", pct: 45 },
  { key: "generating_tts",  label: "Generating narration",         icon: "🗣️",  pct: 65 },
  { key: "assembling",      label: "Assembling final video",       icon: "🎬",  pct: 85 },
  { key: "uploading",       label: "Uploading",                    icon: "☁️",  pct: 95 },
  { key: "done",            label: "Done!",                        icon: "✅",  pct: 100 },
];

/* ============================================================
   [S2] Types
============================================================ */
type DubProject = {
  id: string;
  status: string;
  progress_pct: number;
  source_title: string | null;
  source_thumbnail: string | null;
  source_duration_sec: number | null;
  source_language: string | null;
  target_language: string;
  voice_name: string | null;
  caption_style: string | null;
  video_url: string | null;
  srt_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/* ============================================================
   [S3] Page Component
============================================================ */
export default function DubVideoStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<DubProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ── Fetch status from API (with auth token) ───────────── */
  const fetchStatus = useCallback(async () => {
    try {
      // Get auth token (same pattern as create/page.tsx)
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("Not logged in");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/dub-video/status/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setProject(json.project);
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* ── Poll every 3 seconds ─────────────────────────────── */
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  /* ── Derived values ────────────────────────────────────── */
  const currentStepIdx = PIPELINE_STEPS.findIndex(
    (s) => s.key === project?.status
  );
  const progressPct = project?.progress_pct ?? 0;

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  /* ── Error / not found ─────────────────────────────────── */
  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Project not found"}</p>
          <Link href="/dashboard" className="text-blue-400 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  /* ============================================================
     [S4] Render
  ============================================================ */
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-white transition"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">🎬 Dub Video</h1>
        </div>

        {/* ── Video Info Card ────────────────────────────── */}
        <div className="mb-8 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
          <div className="flex gap-4">
            {project.source_thumbnail && (
              <img
                src={project.source_thumbnail}
                alt=""
                className="w-40 h-24 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg truncate">
                {project.source_title || "Untitled Video"}
              </h2>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                {project.source_language && (
                  <span>Original: {project.source_language}</span>
                )}
                <span>→ {project.target_language}</span>
                {project.voice_name && <span>Voice: {project.voice_name}</span>}
                {project.caption_style && (
                  <span>Captions: {project.caption_style}</span>
                )}
                {project.source_duration_sec && (
                  <span>
                    {Math.floor(project.source_duration_sec / 60)}:
                    {String(
                      Math.floor(project.source_duration_sec % 60)
                    ).padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Error State ────────────────────────────────── */}
        {project.status === "error" && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="font-semibold text-red-400 mb-1">❌ Error</div>
            <p className="text-sm text-red-300">
              {project.error_message || "An unknown error occurred."}
            </p>
            <Link
              href="/dashboard/dub-video/new"
              className="inline-block mt-3 text-sm text-blue-400 hover:underline"
            >
              Try again →
            </Link>
          </div>
        )}

        {/* ── Progress Tracker (visible while processing) ── */}
        {project.status !== "draft" &&
         project.status !== "done" &&
         project.status !== "error" && (
          <div className="mb-8">
            {/* Progress bar */}
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-6">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Pipeline steps */}
            <div className="space-y-3">
              {PIPELINE_STEPS.map((step, idx) => {
                const isActive = step.key === project.status;
                const isDone = currentStepIdx > idx;

                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 p-3 rounded-lg transition ${
                      isActive
                        ? "bg-blue-500/10 border border-blue-500/30"
                        : isDone
                        ? "bg-green-500/5 border border-green-500/20"
                        : "bg-gray-800/30 border border-gray-800"
                    }`}
                  >
                    <span className="text-xl w-8 text-center">
                      {isDone ? "✅" : step.icon}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        isActive
                          ? "text-blue-300"
                          : isDone
                          ? "text-green-400"
                          : "text-gray-500"
                      }`}
                    >
                      {step.label}
                    </span>
                    {isActive && (
                      <span className="ml-auto">
                        <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Done — Video Player + Download ─────────────── */}
        {project.status === "done" && project.video_url && (
          <div className="mb-8">
            <div className="bg-black rounded-xl overflow-hidden mb-4">
              <video
                src={project.video_url}
                controls
                className="w-full aspect-video"
                poster={project.source_thumbnail || undefined}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(project.video_url!);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    // Custom filename from source title, e.g. "Spirituality-in-Daily-Life-Vietnamese.mp4"
                    const safeName = (project.source_title || "dubbed-video")
                      .replace(/[^a-zA-Z0-9\s\u00C0-\u024F\u1E00-\u1EFF]/g, "")
                      .replace(/\s+/g, "-")
                      .slice(0, 60);
                    a.download = `${safeName}-${project.target_language || "Vietnamese"}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {
                    window.open(project.video_url!, "_blank");
                  }
                }}
                className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 font-semibold text-center transition cursor-pointer"
              >
                ⬇️ Download Video
              </button>
              {project.srt_url && (
                <a
                  href={project.srt_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-6 rounded-lg bg-gray-700 hover:bg-gray-600 font-medium text-center transition"
                >
                  📄 SRT
                </a>
              )}
              <Link
                href="/dashboard/dub-video/new"
                className="py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium text-center transition"
              >
                + New Dub
              </Link>
            </div>
          </div>
        )}

        {/* ── Draft State (shouldn't normally be seen) ───── */}
        {project.status === "draft" && (
          <div className="text-center text-gray-400 py-12">
            <p>This project hasn&apos;t been started yet.</p>
            <Link
              href="/dashboard"
              className="text-blue-400 hover:underline mt-2 inline-block"
            >
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
