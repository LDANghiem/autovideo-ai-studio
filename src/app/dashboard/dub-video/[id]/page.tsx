// ============================================================
// FILE: src/app/dashboard/dub-video/[id]/page.tsx
// ============================================================
// Ripple — Dub Video status + result page (HERO feature)
//
// Brand pass: coral progress + step indicators (Dub IS coral),
// green-checked when steps complete (semantic), coral primary
// Download CTA, Ripple ink surfaces.
//
// Polls /api/dub-video/status/[id] every 3 seconds while the
// pipeline is running, shows progress steps, and displays the
// video player + download button when done.
//
// All polling, auth (Bearer token), and download logic preserved.
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";

/* ============================================================
   [S1] Pipeline Steps
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E1A" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{
              border: "2px solid rgba(255,107,90,0.2)",
              borderTopColor: CORAL,
            }}
          />
          <div style={{ color: "#8B8794" }}>Loading...</div>
        </div>
      </div>
    );
  }

  /* ── Error / not found ─────────────────────────────────── */
  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E1A" }}>
        <div className="text-center">
          <p
            className="mb-4"
            style={{
              color: "#FF6B6B",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            {error || "Project not found"}
          </p>
          <Link
            href="/dashboard"
            className="font-semibold transition"
            style={{
              color: CORAL_SOFT,
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A", color: "#F5F2ED" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* ── Header ─────────────────────────────────────── */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm mb-6 transition"
          style={{ color: "#8B8794", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = CORAL_SOFT; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#8B8794"; }}
        >
          ← Back
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, rgba(255,107,90,0.2) 0%, rgba(255,169,77,0.12) 100%)`,
              border: "1px solid rgba(255,107,90,0.4)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CORAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{
              color: "#F5F2ED",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            Dub Video
          </h1>
        </div>

        {/* ── Video Info Card ────────────────────────────── */}
        <div
          className="mb-8 p-4 rounded-xl"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex gap-4 flex-wrap sm:flex-nowrap">
            {project.source_thumbnail && (
              <img
                src={project.source_thumbnail}
                alt=""
                className="w-40 h-24 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2
                className="font-semibold text-lg truncate"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                {project.source_title || "Untitled Video"}
              </h2>
              <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: "#8B8794" }}>
                {project.source_language && (
                  <span>Original: {project.source_language}</span>
                )}
                <span style={{ color: CORAL_SOFT, fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600 }}>
                  → {project.target_language}
                </span>
                {project.voice_name && <span>Voice: {project.voice_name}</span>}
                {project.caption_style && (
                  <span>Captions: {project.caption_style}</span>
                )}
                {project.source_duration_sec && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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
          <div
            className="mb-8 p-4 rounded-xl"
            style={{
              background: "rgba(255,107,107,0.10)",
              border: "1px solid rgba(255,107,107,0.3)",
            }}
          >
            <div
              className="font-bold mb-1"
              style={{
                color: "#FF6B6B",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              ❌ Error
            </div>
            <p className="text-sm" style={{ color: "#FF8B8B" }}>
              {project.error_message || "An unknown error occurred."}
            </p>
            <Link
              href="/dashboard/dub-video/new"
              className="inline-block mt-3 text-sm font-semibold transition"
              style={{
                color: CORAL_SOFT,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = CORAL; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = CORAL_SOFT; }}
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
            {/* Header row with percentage */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-sm font-semibold"
                style={{
                  color: CORAL_SOFT,
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Dubbing in progress
              </span>
              <span
                className="text-sm font-bold"
                style={{
                  color: CORAL_SOFT,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {progressPct}%
              </span>
            </div>

            {/* Progress bar (coral-amber gradient) */}
            <div
              className="h-2 rounded-full overflow-hidden mb-6"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${CORAL}, ${AMBER})`,
                  boxShadow: "0 0 12px rgba(255,107,90,0.4)",
                }}
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
                    className="flex items-center gap-3 p-3 rounded-lg transition"
                    style={{
                      background: isActive
                        ? "rgba(255,107,90,0.10)"
                        : isDone
                          ? "rgba(93,211,158,0.05)"
                          : "rgba(255,255,255,0.02)",
                      border: isActive
                        ? "1px solid rgba(255,107,90,0.3)"
                        : isDone
                          ? "1px solid rgba(93,211,158,0.20)"
                          : "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span className="text-xl w-8 text-center flex-shrink-0">
                      {isDone ? "✅" : step.icon}
                    </span>
                    <span
                      className="text-sm font-semibold flex-1"
                      style={{
                        color: isActive
                          ? CORAL_SOFT
                          : isDone
                            ? "#5DD39E"
                            : "#5A5762",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {step.label}
                    </span>
                    {isActive && (
                      <span
                        className="inline-block w-4 h-4 rounded-full animate-spin flex-shrink-0"
                        style={{
                          border: `2px solid rgba(255,107,90,0.3)`,
                          borderTopColor: CORAL,
                        }}
                      />
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
            <div
              className="rounded-xl overflow-hidden mb-4"
              style={{
                background: "#000",
                border: "1px solid rgba(93,211,158,0.25)",
                boxShadow: "0 8px 30px -8px rgba(93,211,158,0.15)",
              }}
            >
              <video
                src={project.video_url}
                controls
                className="w-full aspect-video"
                poster={project.source_thumbnail || undefined}
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(project.video_url!);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
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
                className="flex-1 min-w-[200px] py-3 rounded-xl font-semibold text-center transition cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                  color: "#0F0E1A",
                  boxShadow: "0 8px 24px -6px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                ⬇️ Download Video
              </button>
              {project.srt_url && (
                <a
                  href={project.srt_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-6 rounded-xl font-semibold text-center transition"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  📄 SRT
                </a>
              )}
              <Link
                href="/dashboard/dub-video/new"
                className="py-3 px-6 rounded-xl font-semibold text-center transition"
                style={{
                  background: "rgba(255,107,90,0.10)",
                  border: "1px solid rgba(255,107,90,0.3)",
                  color: CORAL_SOFT,
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,107,90,0.15)";
                  e.currentTarget.style.borderColor = "rgba(255,107,90,0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,107,90,0.10)";
                  e.currentTarget.style.borderColor = "rgba(255,107,90,0.3)";
                }}
              >
                + New Dub
              </Link>
            </div>
          </div>
        )}

        {/* ── Draft State (shouldn't normally be seen) ───── */}
        {project.status === "draft" && (
          <div className="text-center py-12">
            <p style={{ color: "#8B8794" }}>This project hasn&apos;t been started yet.</p>
            <Link
              href="/dashboard"
              className="inline-block mt-2 font-semibold transition"
              style={{
                color: CORAL_SOFT,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}