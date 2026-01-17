"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

function statusLabel(status?: string | null) {
  if (!status) return "Unknown";
  if (status === "queued") return "Queued";
  if (status === "processing" || status === "rendering") return "Rendering"; // ✅ tolerate old value
  if (status === "done") return "Done";
  if (status === "error") return "Error";
  return status;
}


function ProgressDots({ status }: { status?: string | null }) {
  const s = status ?? "unknown";
  const isProcessing = s === "processing" || s === "rendering"; // ✅ tolerate old value

  const queuedOn = s === "queued" || isProcessing || s === "done";
  const renderingOn = isProcessing || s === "done";
  const doneOn = s === "done";

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">Progress</h3>
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full border ${queuedOn ? "bg-black" : ""}`} />
          Queued
        </span>
        <span className="text-gray-400">—</span>
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full border ${renderingOn ? "bg-black" : ""}`} />
          Rendering
        </span>
        <span className="text-gray-400">—</span>
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full border ${doneOn ? "bg-black" : ""}`} />
          Done
        </span>
      </div>
    </div>
  );
}


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

    // ✅ Special-case: 409 means "already queued/rendering" (A2)
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

  // ✅ B) Auto-refresh while queued/processing/rendering
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

      // ✅ A2: if render is already in progress, show toast instead of scary red error
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

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setToast("Copied ✅");
    setTimeout(() => setToast(null), 1500);
  }

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

  const isDone = project?.status === "done";
  const hasVideo = Boolean(project?.video_url);
  const hasScript = Boolean(project?.script && project.script.trim().length > 0);

  // ✅ A2: disable Generate while render is running
  const isRunning =
    project?.status === "queued" || project?.status === "processing" || project?.status === "rendering";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{project?.topic ?? "Project"}</h1>
          <p className="text-sm text-gray-500">Project ID: {projectId}</p>
        </div>

        <div className="text-sm border rounded-full px-3 py-1">
          {statusLabel(project?.status)}
        </div>
      </div>

      {loading ? (
        <div className="border rounded-lg p-4 text-sm text-gray-600">Loading…</div>
      ) : null}

      {toast ? (
        <div className="border rounded-lg p-3 text-sm mb-4">{toast}</div>
      ) : null}

      {uiError ? (
        <div className="border rounded-lg p-4 text-sm text-red-600 mb-4">{uiError}</div>
      ) : null}

      {project?.error_message ? (
        <div className="border rounded-lg p-4 text-sm text-red-600 mb-4">
          <div className="font-semibold mb-1">Render failed</div>
          <div>{project.error_message}</div>
        </div>
      ) : null}

      <div className="space-y-4">
        <ProgressDots status={project?.status} />

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

        {/* Script */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Script</h3>
          {hasScript ? (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{project?.script}</div>
          ) : (
            <div className="text-sm text-gray-500">No script yet. Click “Generate Video”.</div>
          )}
        </div>

        {/* Video */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Video</h3>

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

          {isDone && hasVideo ? (
            <video src={project!.video_url!} controls className="w-full rounded-md border" />
          ) : (
            <div className="text-sm text-gray-500">
              {isRunning
                ? "Rendering… the video will appear here when complete."
                : "No video yet. Click “Generate Video”."
              }
            </div>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button className="border rounded-md px-4 py-2" onClick={() => router.back()}>
            Back
          </button>

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

          <button
            className="border rounded-md px-4 py-2"
            onClick={retryRender}
            disabled={busy}
            title="Retry render via Supabase Edge Function"
          >
            {busy ? "Retrying..." : "Retry Render"}
          </button>

          <button className="border rounded-md px-4 py-2" onClick={fetchProject} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
