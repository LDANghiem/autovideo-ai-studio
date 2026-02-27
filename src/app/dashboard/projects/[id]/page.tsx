// ============================================================
// FILE: src/app/dashboard/projects/[id]/page.tsx
//
// PURPOSE: Project detail page — shows project info, render
//          progress, script, video player, and action buttons.
//
// CHANGES (Feb 2026):
//   1. Progress dots now GREEN instead of black
//      - Active step pulses (animate-pulse) for visual feedback
//      - Green connector lines between completed steps
//   2. Script section is now COLLAPSIBLE
//      - Shows ~4-5 lines by default with fade-out gradient
//      - "Show full script ▼" / "Show less ▲" toggle button
//      - Prevents user from scrolling past long scripts to see video
//   3. Added useCallback import for future optimization
//
// COPY TO: src/app/dashboard/projects/[id]/page.tsx
//          (replace existing file)
// ============================================================

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ──────────────────────────────────────────────
// TYPE: Project row from Supabase "projects" table
// ──────────────────────────────────────────────
type Project = {
  id: string;
  user_id: string;
  topic: string | null;
  status: string | null;        // "queued" | "processing" | "rendering" | "done" | "error"

  style: string | null;
  voice: string | null;
  length: string | null;
  resolution: string | null;
  language: string | null;
  tone: string | null;
  music: string | null;

  script: string | null;        // AI-generated narration script
  video_url: string | null;     // Supabase storage URL of rendered video
  error_message: string | null; // Error message if render failed

  created_at?: string | null;
  updated_at?: string | null;
};

// ──────────────────────────────────────────────
// HELPER: Convert status code to human-readable label
// Supports both "processing" (old) and "rendering" (new)
// ──────────────────────────────────────────────
function statusLabel(status?: string | null) {
  if (!status) return "Unknown";
  if (status === "queued") return "Queued";
  if (status === "processing" || status === "rendering") return "Rendering"; // ✅ tolerate old value
  if (status === "done") return "Done";
  if (status === "error") return "Error";
  return status;
}

// ──────────────────────────────────────────────
// COMPONENT: ProgressDots
//
// Shows a visual pipeline: Queued → Rendering → Done
// - GREEN filled dots for completed/active steps
// - Gray dots for future steps
// - Active step PULSES (animate-pulse) so user knows it's working
// - Green connector lines between completed steps
//
// CHANGE: Was black dots, now green with animation
// ──────────────────────────────────────────────
function ProgressDots({ status }: { status?: string | null }) {
  const s = status ?? "unknown";
  const isProcessing = s === "processing" || s === "rendering";

  // Determine which steps are "on" (completed or active)
  const queuedOn = s === "queued" || isProcessing || s === "done";
  const renderingOn = isProcessing || s === "done";
  const doneOn = s === "done";

  // Determine which step is currently active (for pulse animation)
  const isQueuedActive = s === "queued";
  const isRenderingActive = isProcessing;

  // Dot styling: green when on, pulse when active, gray when off
  const dotStyle = (on: boolean, active: boolean) =>
    `h-3 w-3 rounded-full border ${
      on
        ? active
          ? "bg-green-500 border-green-500 animate-pulse"  // Active: green + pulse
          : "bg-green-500 border-green-500"                 // Completed: solid green
        : "bg-gray-200 border-gray-300"                     // Future: gray
    }`;

  // Label styling: green text when on, gray when off
  const labelStyle = (on: boolean) =>
    on ? "text-green-700 font-medium" : "text-gray-400";

  // Connector line between dots: green when the NEXT step is reached
  const lineStyle = (on: boolean) =>
    `w-8 h-0.5 ${on ? "bg-green-500" : "bg-gray-300"}`;

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">Progress</h3>
      <div className="flex items-center gap-2 text-sm">
        {/* Step 1: Queued */}
        <span className="flex items-center gap-1.5">
          <span className={dotStyle(queuedOn, isQueuedActive)} />
          <span className={labelStyle(queuedOn)}>Queued</span>
        </span>

        {/* Connector line: Queued → Rendering */}
        <span className={lineStyle(renderingOn)} />

        {/* Step 2: Rendering */}
        <span className="flex items-center gap-1.5">
          <span className={dotStyle(renderingOn, isRenderingActive)} />
          <span className={labelStyle(renderingOn)}>Rendering</span>
        </span>

        {/* Connector line: Rendering → Done */}
        <span className={lineStyle(doneOn)} />

        {/* Step 3: Done */}
        <span className="flex items-center gap-1.5">
          <span className={dotStyle(doneOn, false)} />
          <span className={labelStyle(doneOn)}>Done</span>
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// COMPONENT: ScriptSection (collapsible)
//
// Shows the AI-generated narration script.
// For long scripts (5+ min videos), shows only ~4-5 lines
// with a fade-out gradient and "Show full script ▼" button.
//
// CHANGE: Was always fully expanded (long scroll).
//         Now collapsed by default for long scripts.
// ──────────────────────────────────────────────
function ScriptSection({ script, hasScript }: { script?: string | null; hasScript: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // No script yet — show placeholder
  if (!hasScript) {
    return (
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-2">Script</h3>
        <div className="text-sm text-gray-500">No script yet. Click "Generate Video".</div>
      </div>
    );
  }

  // Check if script is "long" (more than 6 lines or 400 chars)
  const lines = (script || "").split("\n");
  const isLong = lines.length > 6 || (script || "").length > 400;

  // Preview: show first 5 lines when collapsed
  const preview = isLong && !expanded
    ? lines.slice(0, 5).join("\n") + (lines.length > 5 ? "\n..." : "")
    : script;

  return (
    <div className="border rounded-lg p-4">
      {/* Header with expand/collapse toggle */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Script</h3>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {expanded ? "Show less ▲" : "Show full script ▼"}
          </button>
        )}
      </div>

      {/* Script text — max-h-28 (~4-5 lines) when collapsed */}
      <div
        className={`text-sm whitespace-pre-wrap leading-relaxed transition-all duration-300 ${
          !expanded && isLong ? "max-h-28 overflow-hidden relative" : ""
        }`}
      >
        {preview}

        {/* Fade-out gradient overlay when collapsed */}
        {!expanded && isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// HELPER: Trigger render via API
//
// Tries two endpoint URLs (for backward compatibility):
//   1. /api/projects/start-render (current)
//   2. /api/start-render (legacy)
//
// Handles 409 (already rendering) gracefully.
// ──────────────────────────────────────────────
async function postStartRender(projectId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error("Not logged in");

  const payload = { project_id: projectId };

  // Try both endpoint paths (in case one isn't deployed)
  const urls = ["/api/projects/start-render", "/api/start-render"];

  let lastErr = "Failed to start render";

  for (const url of urls) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    // 404 = this route doesn't exist, try next
    if (res.status === 404) {
      lastErr = `Route not found: ${url}`;
      continue;
    }

    const json = await res.json().catch(() => ({}));

    // ✅ 409 = render already in progress — show friendly message
    if (res.status === 409) {
      throw new Error(json?.error || "Render already in progress");
    }

    if (!res.ok) {
      throw new Error(json?.error || `Start render failed (${res.status})`);
    }

    return json;
  }

  throw new Error(lastErr);
}

// ──────────────────────────────────────────────
// MAIN PAGE: ProjectDetailPage
//
// Shows:
//   - Project title + status badge
//   - Progress dots (Queued → Rendering → Done)
//   - Settings grid (style, voice, length, etc.)
//   - Collapsible script section
//   - Video player (when done) with Open/Download/Copy URL
//   - Action buttons: Back, Generate Video, Retry Render, Refresh
//
// Auto-refreshes every 2.5s while rendering.
// ──────────────────────────────────────────────
export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();

  // Extract project ID from URL params
  const projectId = useMemo(() => {
    const raw = (params as any)?.id ?? (params as any)?.projectId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  // ── State ──
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // Button loading state
  const [uiError, setUiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Fetch project data from Supabase ──
  async function fetchProject() {
    if (!projectId) return;

    setUiError(null);
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,user_id,topic,status,style,voice,length,resolution,language,tone,music,script,video_url,error_message,created_at,updated_at"
      )
      .eq("id", projectId)
      .single();

    if (error) {
      setUiError(error.message);
      setProject(null);
    } else {
      setProject(data as Project);
    }
  }

  // ── Initial load ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) return;
      setLoading(true);
      await fetchProject();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── Auto-refresh every 2.5s while render is in progress ──
  // Stops polling once status changes to "done" or "error"
  useEffect(() => {
    if (!projectId) return;

    const s = project?.status ?? null;
    const running = s === "queued" || s === "processing" || s === "rendering";
    if (!running) return;

    let mounted = true;

    const t = setInterval(async () => {
      try {
        if (!mounted) return;
        await fetchProject();
      } catch {
        // ignore polling errors
      }
    }, 2500);

    return () => {
      mounted = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status, projectId]);

  // ── Generate Video button handler ──
  // Generates script (if missing) + triggers render
  async function generateVideo() {
    if (!projectId) return;

    setBusy(true);
    setUiError(null);
    setToast(null);

    try {
      const json = await postStartRender(projectId);

      if (json?.scriptGenerated) {
        setToast("Script generated ✅ Starting render…");
      } else {
        setToast("Starting render…");
      }

      await fetchProject();
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      // ✅ If render is already in progress, show friendly toast (not scary red error)
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("in progress")) {
        setToast("Already rendering… ✅");
        await fetchProject();
      } else {
        setUiError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Retry Render button handler ──
  // Calls Supabase Edge Function to retry a failed render
  async function retryRender() {
    if (!projectId) return;

    setBusy(true);
    setUiError(null);
    setToast(null);

    try {
      const { data, error } = await supabase.functions.invoke("retry-render", {
        body: { project_id: projectId },
      });

      if (error) {
        setUiError(error.message);
      } else if ((data as any)?.error) {
        setUiError((data as any).error);
      } else {
        setToast("Retry queued ✅");
        await fetchProject();
      }
    } catch (e: any) {
      setUiError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Copy to clipboard helper ──
  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setToast("Copied ✅");
    setTimeout(() => setToast(null), 1500);
  }

  // ── Guard: no project ID in URL ──
  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-red-600">Missing project ID in route.</p>
        <p className="text-sm text-gray-500 mt-2">
          Make sure the URL looks like: <code>/dashboard/projects/&lt;uuid&gt;</code>
        </p>
      </div>
    );
  }

  // ── Derived state ──
  const isDone = project?.status === "done";
  const hasVideo = Boolean(project?.video_url);
  const hasScript = Boolean(project?.script && project.script.trim().length > 0);

  // Disable "Generate Video" button while render is running
  const isRunning =
    project?.status === "queued" || project?.status === "processing" || project?.status === "rendering";

  // ──────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* ── Header: Title + Status Badge ── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{project?.topic ?? "Project"}</h1>
          <p className="text-sm text-gray-500">Project ID: {projectId}</p>
        </div>

        <div className="text-sm border rounded-full px-3 py-1">
          {statusLabel(project?.status)}
        </div>
      </div>

      {/* ── Loading indicator ── */}
      {loading ? (
        <div className="border rounded-lg p-4 text-sm text-gray-600">Loading…</div>
      ) : null}

      {/* ── Toast notification (success messages) ── */}
      {toast ? (
        <div className="border rounded-lg p-3 text-sm mb-4">{toast}</div>
      ) : null}

      {/* ── Error notification (client-side errors) ── */}
      {uiError ? (
        <div className="border rounded-lg p-4 text-sm text-red-600 mb-4">{uiError}</div>
      ) : null}

      {/* ── Server error message (render failures) ── */}
      {project?.error_message ? (
        <div className="border rounded-lg p-4 text-sm text-red-600 mb-4">
          <div className="font-semibold mb-1">Render failed</div>
          <div>{project.error_message}</div>
        </div>
      ) : null}

      <div className="space-y-4">

        {/* ── Progress: Queued → Rendering → Done (GREEN dots) ── */}
        <ProgressDots status={project?.status} />

        {/* ── Settings Grid ── */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Settings</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Style</div>
              <div className="font-medium">{project?.style ?? "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">Voice</div>
              <div className="font-medium">{project?.voice ?? "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">Length</div>
              <div className="font-medium">{project?.length ?? "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">Resolution</div>
              <div className="font-medium">{project?.resolution ?? "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">Language</div>
              <div className="font-medium">{project?.language ?? "-"}</div>
            </div>
            <div>
              <div className="text-gray-500">Tone</div>
              <div className="font-medium">{project?.tone ?? "-"}</div>
            </div>
            <div className="col-span-2">
              <div className="text-gray-500">Music</div>
              <div className="font-medium">{project?.music ?? "-"}</div>
            </div>
          </div>
        </div>

        {/* ── Script (collapsible for long scripts) ── */}
        <ScriptSection script={project?.script} hasScript={hasScript} />

        {/* ── Video Player + Download/Open/Copy buttons ── */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Video</h3>

            {/* Action buttons — only show when video exists */}
            {hasVideo ? (
              <div className="flex gap-2">
                <button
                  className="border rounded-md px-3 py-1 text-sm"
                  onClick={() => window.open(project!.video_url!, "_blank")}
                >
                  Open
                </button>

                <a className="border rounded-md px-3 py-1 text-sm" href={project!.video_url!} download>
                  Download
                </a>

                <button
                  className="border rounded-md px-3 py-1 text-sm"
                  onClick={() => copy(project!.video_url!)}
                >
                  Copy URL
                </button>
              </div>
            ) : null}
          </div>

          {/* Video player (when done) or status message */}
          {isDone && hasVideo ? (
            <video src={project!.video_url!} controls className="w-full rounded-md border" />
          ) : (
            <div className="text-sm text-gray-500">
              {isRunning
                ? "Rendering\u2026 the video will appear here when complete."
                : "No video yet. Click \u201cGenerate Video\u201d."
              }
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex gap-3 flex-wrap">
          {/* Back — navigate to previous page */}
          <button className="border rounded-md px-4 py-2" onClick={() => router.back()}>
            Back
          </button>

          {/* Generate Video — disabled while rendering */}
          <button
            className="border rounded-md px-4 py-2 font-medium"
            onClick={generateVideo}
            disabled={busy || isRunning}
            title={
              isRunning
                ? "Render already in progress"
                : "Generate script (if missing) and trigger render"
            }
          >
            {isRunning ? "Rendering..." : busy ? "Working..." : "Generate Video"}
          </button>

          {/* Retry Render — calls Supabase edge function */}
          <button
            className="border rounded-md px-4 py-2"
            onClick={retryRender}
            disabled={busy}
            title="Retry render via Supabase Edge Function"
          >
            {busy ? "Retrying..." : "Retry Render"}
          </button>

          {/* Refresh — manually re-fetch project data */}
          <button className="border rounded-md px-4 py-2" onClick={fetchProject} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
