// ============================================================
// FILE: src/app/dashboard/projects/[id]/page.tsx
// ============================================================
// Ripple — Project Detail Page
// Brand pass: coral CTAs, Ripple ink background, Space Grotesk
// headings, semantic status colors, coral primary actions.
//
// Bug fix: script fade-out gradient now fades to Ripple ink
// (was fading to white, which looked broken on dark theme).
//
// All render logic preserved: dual-endpoint fallback, 409
// handling, auto-refresh polling, retry with force=true.
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
  status: string | null;

  style: string | null;
  voice: string | null;
  length: string | null;
  resolution: string | null;
  language: string | null;
  tone: string | null;
  music: string | null;

  script: string | null;
  video_url: string | null;
  error_message: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

// ──────────────────────────────────────────────
// HELPER: Convert status code to human-readable label
// ──────────────────────────────────────────────
function statusLabel(status?: string | null) {
  if (!status) return "Unknown";
  if (status === "queued") return "Queued";
  if (status === "processing" || status === "rendering") return "Rendering";
  if (status === "done") return "Done";
  if (status === "error") return "Error";
  return status;
}

// Status → Ripple semantic color
function statusColor(status?: string | null) {
  if (status === "done") return { color: "#5DD39E", bg: "rgba(93,211,158,0.10)", border: "rgba(93,211,158,0.3)" };
  if (status === "processing" || status === "rendering") return { color: "#FFA94D", bg: "rgba(255,169,77,0.10)", border: "rgba(255,169,77,0.3)" };
  if (status === "queued") return { color: "#5DD3E0", bg: "rgba(93,211,224,0.10)", border: "rgba(93,211,224,0.3)" };
  if (status === "error") return { color: "#FF6B6B", bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.3)" };
  return { color: "#8B8794", bg: "rgba(139,135,148,0.10)", border: "rgba(139,135,148,0.25)" };
}

// ──────────────────────────────────────────────
// COMPONENT: ProgressDots
// Green dots, semantic — kept green because "completed" is
// universally green. Pulse animation on active step.
// ──────────────────────────────────────────────
function ProgressDots({ status }: { status?: string | null }) {
  const s = status ?? "unknown";
  const isProcessing = s === "processing" || s === "rendering";

  const queuedOn = s === "queued" || isProcessing || s === "done";
  const renderingOn = isProcessing || s === "done";
  const doneOn = s === "done";

  const isQueuedActive = s === "queued";
  const isRenderingActive = isProcessing;

  const dotStyle = (on: boolean, active: boolean): React.CSSProperties => ({
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: on ? "#5DD39E" : "rgba(255,255,255,0.06)",
    border: on ? "1px solid #5DD39E" : "1px solid rgba(255,255,255,0.1)",
    boxShadow: on && active ? "0 0 12px rgba(93,211,158,0.6)" : "none",
  });

  const labelStyle = (on: boolean): React.CSSProperties => ({
    color: on ? "#5DD39E" : "#5A5762",
    fontWeight: on ? 600 : 500,
    fontSize: 13,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
  });

  const lineStyle = (on: boolean): React.CSSProperties => ({
    width: 32,
    height: 2,
    background: on ? "#5DD39E" : "rgba(255,255,255,0.08)",
    borderRadius: 1,
  });

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "#16151F",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <h3
        className="font-semibold mb-3 text-sm"
        style={{
          color: "#F5F2ED",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          letterSpacing: "0.02em",
        }}
      >
        Progress
      </h3>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2">
          <span
            style={dotStyle(queuedOn, isQueuedActive)}
            className={isQueuedActive ? "animate-pulse" : ""}
          />
          <span style={labelStyle(queuedOn)}>Queued</span>
        </span>

        <span style={lineStyle(renderingOn)} />

        <span className="flex items-center gap-2">
          <span
            style={dotStyle(renderingOn, isRenderingActive)}
            className={isRenderingActive ? "animate-pulse" : ""}
          />
          <span style={labelStyle(renderingOn)}>Rendering</span>
        </span>

        <span style={lineStyle(doneOn)} />

        <span className="flex items-center gap-2">
          <span style={dotStyle(doneOn, false)} />
          <span style={labelStyle(doneOn)}>Done</span>
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// COMPONENT: ScriptSection (collapsible)
// Bug fix: gradient now fades to Ripple ink, not white
// ──────────────────────────────────────────────
function ScriptSection({ script, hasScript }: { script?: string | null; hasScript: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!hasScript) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          background: "#16151F",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3
          className="font-semibold mb-2 text-sm"
          style={{
            color: "#F5F2ED",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          Script
        </h3>
        <div className="text-sm" style={{ color: "#8B8794" }}>
          No script yet. Click "Generate Video".
        </div>
      </div>
    );
  }

  const lines = (script || "").split("\n");
  const isLong = lines.length > 6 || (script || "").length > 400;

  const preview = isLong && !expanded
    ? lines.slice(0, 5).join("\n") + (lines.length > 5 ? "\n..." : "")
    : script;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "#16151F",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          className="font-semibold text-sm"
          style={{
            color: "#F5F2ED",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          Script
        </h3>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold transition-colors"
            style={{
              color: "#FF8B7A",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#FF6B5A"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#FF8B7A"; }}
          >
            {expanded ? "Show less ▲" : "Show full script ▼"}
          </button>
        )}
      </div>

      <div
        className={`text-sm whitespace-pre-wrap leading-relaxed transition-all duration-300 ${
          !expanded && isLong ? "max-h-28 overflow-hidden relative" : ""
        }`}
        style={{ color: "#C7C3C9" }}
      >
        {preview}

        {/* Bug fix: gradient fades to Ripple ink, not white */}
        {!expanded && isLong && (
          <div
            className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(to top, #16151F 0%, transparent 100%)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// HELPER: Trigger render via API (dual endpoint fallback)
// ──────────────────────────────────────────────
async function postStartRender(projectId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error("Not logged in");

  const payload = { project_id: projectId };
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

    if (res.status === 404) {
      lastErr = `Route not found: ${url}`;
      continue;
    }

    const json = await res.json().catch(() => ({}));

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
// ──────────────────────────────────────────────
export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();

  const projectId = useMemo(() => {
    const raw = (params as any)?.id ?? (params as any)?.projectId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  async function retryRender() {
    if (!projectId) return;

    setBusy(true);
    setUiError(null);
    setToast(null);

    try {
      await supabase
        .from("projects")
        .update({ status: "draft", error_message: null })
        .eq("id", projectId);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/projects/start-render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: projectId, force: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUiError((json as any)?.error || `Retry failed (${res.status})`);
      } else {
        setToast("Retry started ✅");
        await fetchProject();
      }
    } catch (e: any) {
      setUiError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setToast("Copied ✅");
    setTimeout(() => setToast(null), 1500);
  }

  // ── Guard: no project ID in URL ──
  if (!projectId) {
    return (
      <div className="min-h-screen p-6" style={{ background: "#0F0E1A" }}>
        <div className="max-w-3xl mx-auto">
          <p style={{ color: "#FF6B6B" }}>Missing project ID in route.</p>
          <p className="text-sm mt-2" style={{ color: "#8B8794" }}>
            Make sure the URL looks like:{" "}
            <code style={{ color: "#FF8B7A", fontFamily: "'JetBrains Mono', monospace" }}>
              /dashboard/projects/&lt;uuid&gt;
            </code>
          </p>
        </div>
      </div>
    );
  }

  const isDone = project?.status === "done";
  const hasVideo = Boolean(project?.video_url);
  const hasScript = Boolean(project?.script && project.script.trim().length > 0);

  const isRunning =
    project?.status === "queued" || project?.status === "processing" || project?.status === "rendering";

  const status = statusColor(project?.status);

  // Settings rows for clean iteration
  const settings = [
    { label: "Style", value: project?.style },
    { label: "Voice", value: project?.voice },
    { label: "Length", value: project?.length },
    { label: "Resolution", value: project?.resolution },
    { label: "Language", value: project?.language },
    { label: "Tone", value: project?.tone },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="p-6 max-w-3xl mx-auto">

        {/* ── Header: Title + Status Badge ── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              {project?.topic ?? "Project"}
            </h1>
            <p
              className="text-xs mt-1.5"
              style={{
                color: "#5A5762",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {projectId}
            </p>
          </div>

          <div
            className="text-xs font-semibold rounded-full px-3 py-1 flex-shrink-0"
            style={{
              background: status.bg,
              color: status.color,
              border: `1px solid ${status.border}`,
              letterSpacing: "0.03em",
            }}
          >
            {isRunning && <span className="inline-block animate-pulse mr-1">●</span>}
            {statusLabel(project?.status)}
          </div>
        </div>

        {/* ── Loading indicator ── */}
        {loading && (
          <div
            className="rounded-xl p-4 text-sm mb-4"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#8B8794",
            }}
          >
            Loading…
          </div>
        )}

        {/* ── Toast notification (success messages) ── */}
        {toast && (
          <div
            className="rounded-xl p-3 text-sm mb-4"
            style={{
              background: "rgba(93,211,158,0.08)",
              border: "1px solid rgba(93,211,158,0.25)",
              color: "#5DD39E",
            }}
          >
            {toast}
          </div>
        )}

        {/* ── Error notification (client-side errors) ── */}
        {uiError && (
          <div
            className="rounded-xl p-4 text-sm mb-4"
            style={{
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.25)",
              color: "#FF6B6B",
            }}
          >
            {uiError}
          </div>
        )}

        {/* ── Server error message (render failures) ── */}
        {project?.error_message && (
          <div
            className="rounded-xl p-4 text-sm mb-4"
            style={{
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.25)",
              color: "#FF6B6B",
            }}
          >
            <div
              className="font-semibold mb-1"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Render failed
            </div>
            <div>{project.error_message}</div>
          </div>
        )}

        <div className="space-y-4">

          {/* ── Progress: Queued → Rendering → Done ── */}
          <ProgressDots status={project?.status} />

          {/* ── Settings Grid ── */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <h3
              className="font-semibold mb-3 text-sm"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              Settings
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {settings.map((s) => (
                <div key={s.label}>
                  <div className="text-xs mb-0.5" style={{ color: "#5A5762" }}>{s.label}</div>
                  <div className="font-medium" style={{ color: "#F5F2ED" }}>
                    {s.value ?? "—"}
                  </div>
                </div>
              ))}
              <div className="col-span-2">
                <div className="text-xs mb-0.5" style={{ color: "#5A5762" }}>Music</div>
                <div className="font-medium" style={{ color: "#F5F2ED" }}>
                  {project?.music ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* ── Script (collapsible for long scripts) ── */}
          <ScriptSection script={project?.script} hasScript={hasScript} />

          {/* ── Video Player + Download/Open/Copy buttons ── */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h3
                className="font-semibold text-sm"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "0.02em",
                }}
              >
                Video
              </h3>

              {hasVideo && (
                <div className="flex gap-2">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      background: "rgba(255,107,90,0.10)",
                      border: "1px solid rgba(255,107,90,0.25)",
                      color: "#FF8B7A",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,107,90,0.18)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,107,90,0.10)"; }}
                    onClick={() => window.open(project!.video_url!, "_blank")}
                  >
                    Open
                  </button>

                  <a
                    className="rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    href={project!.video_url!}
                    download
                  >
                    Download
                  </a>

                  <button
                    className="rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onClick={() => copy(project!.video_url!)}
                  >
                    Copy URL
                  </button>
                </div>
              )}
            </div>

            {isDone && hasVideo ? (
              <video
                src={project!.video_url!}
                controls
                className="w-full rounded-md"
                style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#000" }}
              />
            ) : (
              <div
                className="text-sm rounded-md p-8 text-center"
                style={{
                  color: "#8B8794",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed rgba(255,255,255,0.08)",
                }}
              >
                {isRunning
                  ? "Rendering… the video will appear here when complete."
                  : "No video yet. Click \u201cGenerate Video\u201d."
                }
              </div>
            )}
          </div>

          {/* ── Action Buttons ── */}
          <div className="flex gap-3 flex-wrap pt-2">
            {/* Back */}
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
              onClick={() => router.back()}
            >
              ← Back
            </button>

            {/* Generate Video — primary coral CTA */}
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: (busy || isRunning)
                  ? "rgba(255,107,90,0.4)"
                  : "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
                color: "#0F0E1A",
                boxShadow: (busy || isRunning) ? "none" : "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onClick={generateVideo}
              disabled={busy || isRunning}
              title={
                isRunning
                  ? "Render already in progress"
                  : "Generate script (if missing) and trigger render"
              }
            >
              {isRunning ? "Rendering…" : busy ? "Working…" : "Generate Video"}
            </button>

            {/* Retry Render */}
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "rgba(255,169,77,0.10)",
                border: "1px solid rgba(255,169,77,0.3)",
                color: "#FFA94D",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "rgba(255,169,77,0.18)";
                }
              }}
              onMouseLeave={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "rgba(255,169,77,0.10)";
                }
              }}
              onClick={retryRender}
              disabled={busy}
              title="Retry render via Supabase Edge Function"
            >
              {busy ? "Retrying…" : "Retry Render"}
            </button>

            {/* Refresh */}
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#8B8794",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#F5F2ED";
                }
              }}
              onMouseLeave={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.color = "#8B8794";
                }
              }}
              onClick={fetchProject}
              disabled={busy}
            >
              ↻ Refresh
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}