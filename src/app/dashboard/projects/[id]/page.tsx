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
  if (status === "processing") return "Rendering";
  if (status === "done") return "Done";
  if (status === "error") return "Error";
  return status;
}

function ProgressDots({ status }: { status?: string | null }) {
  const s = status ?? "unknown";
  const queuedOn = s === "queued" || s === "processing" || s === "done";
  const renderingOn = s === "processing" || s === "done";
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

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();

  // ✅ Works for either folder name: [id] or [projectId]
  const projectId = useMemo(() => {
    const raw = (params as any)?.id ?? (params as any)?.projectId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Auto-refresh while queued/processing
  useEffect(() => {
    const s = project?.status;
    if (!s) return;
    if (s !== "queued" && s !== "processing") return;

    const t = setInterval(() => {
      fetchProject();
    }, 2500);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status, projectId]);

  async function retryRender() {
    if (!projectId) return;

    setBusy(true);
    setUiError(null);

    try {
      const { data, error } = await supabase.functions.invoke("retry-render", {
        body: { project_id: projectId },
      });

      if (error) {
        setUiError(error.message);
      } else if ((data as any)?.error) {
        setUiError((data as any).error);
      } else {
        await fetchProject();
      }
    } catch (e: any) {
      setUiError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setUiError("Could not copy to clipboard (browser blocked).");
    }
  }

  const videoUrl = project?.video_url ?? null;
  const isDone = project?.status === "done";
  const isRendering = project?.status === "queued" || project?.status === "processing";

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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{project?.topic ?? "Project"}</h1>
          <p className="text-sm text-gray-500">Project ID: {projectId}</p>
          <p className="text-xs text-gray-400 mt-1">
            Created: {formatDate(project?.created_at)} · Updated: {formatDate(project?.updated_at)}
          </p>
        </div>

        <div className="text-sm border rounded-full px-3 py-1">
          {statusLabel(project?.status)}
        </div>
      </div>

      {loading ? (
        <div className="border rounded-lg p-4 text-sm text-gray-600">Loading…</div>
      ) : null}

      {uiError ? (
        <div className="border rounded-lg p-4 text-sm text-red-600 mb-4">
          {uiError}
        </div>
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

        {/* ✅ Script section */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Script</h3>
          {project?.script ? (
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 border rounded-md p-3 overflow-auto">
              {project.script}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">
              {isRendering ? "Script will appear here once generated." : "No script yet."}
            </p>
          )}
        </div>

        {/* ✅ Video section (D22-B) */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Video</h3>

          {!videoUrl ? (
            <p className="text-sm text-gray-500">
              {isRendering
                ? "Video will appear here when render is complete."
                : "No video URL yet."}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <a
                  className="border rounded-md px-3 py-2 text-sm"
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>

                <a className="border rounded-md px-3 py-2 text-sm" href={videoUrl} download>
                  Download
                </a>

                <button
                  className="border rounded-md px-3 py-2 text-sm"
                  onClick={() => copyToClipboard(videoUrl)}
                  type="button"
                >
                  {copied ? "Copied ✅" : "Copy URL"}
                </button>
              </div>

              {/* Video player */}
              <div className="border rounded-lg overflow-hidden bg-black">
                <video
                  key={videoUrl} // forces refresh if url changes
                  controls
                  preload="metadata"
                  className="w-full h-auto"
                  src={videoUrl}
                />
              </div>

              {!isDone ? (
                <p className="text-xs text-gray-500">
                  Note: video_url exists, but status is <b>{project?.status}</b>. If you want,
                  click Refresh to re-check the row.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button className="border rounded-md px-4 py-2" onClick={() => router.back()}>
            Back
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
