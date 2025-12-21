"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  user_id: string;
  topic: string | null;
  status: "queued" | "processing" | "done" | "error" | string | null;

  style: string | null;
  voice: string | null;
  length: string | null;
  resolution: string | null;
  language: string | null;
  tone: string | null;
  music: string | null;

  script?: string | null;
  video_url?: string | null;
  error_message?: string | null;

  created_at?: string;
  updated_at?: string;
};

function StatusBadge({ status }: { status: string | null }) {
  const label =
    status === "queued"
      ? "Queued"
      : status === "processing"
      ? "Rendering"
      : status === "done"
      ? "Done"
      : status === "error"
      ? "Error"
      : status || "Unknown";

  return (
    <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm">
      {label}
    </span>
  );
}

function StepDot({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "inline-block h-3 w-3 rounded-full border",
        active ? "bg-black" : "bg-transparent",
      ].join(" ")}
    />
  );
}

export default function ProjectDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);


  const steps = useMemo(
    () => [
      { key: "queued", label: "Queued" },
      { key: "processing", label: "Rendering" },
      { key: "done", label: "Done" },
    ],
    []
  );

  const currentStepIndex = useMemo(() => {
    const s = project?.status ?? "";
    if (s === "done") return 2;
    if (s === "processing") return 1;
    if (s === "queued") return 0;
    return -1;
  }, [project?.status]);

  async function fetchProject(projectId: string) {
    setErr(null);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      setErr(error.message);
      setProject(null);
    } else {
      setProject(data as Project);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProject(id);
  }, [id]);

    async function handleRetryRender() {
    if (!project?.id) return;

    setRetrying(true);
    setRetryError(null);

    const { error } = await supabase.functions.invoke("retry-render", {
      body: { project_id: project.id },
    });

    if (error) {
      setRetryError(error.message);
    }

    setRetrying(false);
  }


  // Realtime subscription (best UX)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`projects:detail:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `id=eq.${id}` },
        (payload) => {
          // payload.new contains updated row
          if (payload?.new) setProject(payload.new as Project);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Optional fallback polling if you want extra safety:
  // useEffect(() => {
  //   if (!id) return;
  //   const t = setInterval(() => fetchProject(id), 5000);
  //   return () => clearInterval(t);
  // }, [id]);

  if (loading) {
    return <div className="p-6">Loading project…</div>;
  }

  if (err) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-lg font-semibold">Couldn’t load project</div>
        <div className="text-sm opacity-80">{err}</div>
        <button
          className="rounded-lg border px-4 py-2"
          onClick={() => router.push("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!project) return <div className="p-6">No project found.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-semibold">
            {project.topic || "Untitled project"}
          </div>
          <div className="text-sm opacity-70">Project ID: {project.id}</div>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Progress */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Progress</div>
        {project.status === "error" ? (
          <div className="text-sm">
            <div className="font-medium">Render failed</div>
            <div className="opacity-80">{project.error_message || "Unknown error"}</div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {steps.map((s, idx) => (
              <div key={s.key} className="flex items-center gap-2">
                <StepDot active={idx <= currentStepIndex && currentStepIndex >= 0} />
                <span className="text-sm">{s.label}</span>
                {idx < steps.length - 1 && <span className="opacity-40">—</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings snapshot */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Settings</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="opacity-70">Style:</span> {project.style || "-"}</div>
          <div><span className="opacity-70">Voice:</span> {project.voice || "-"}</div>
          <div><span className="opacity-70">Length:</span> {project.length || "-"}</div>
          <div><span className="opacity-70">Resolution:</span> {project.resolution || "-"}</div>
          <div><span className="opacity-70">Language:</span> {project.language || "-"}</div>
          <div><span className="opacity-70">Tone:</span> {project.tone || "-"}</div>
          <div><span className="opacity-70">Music:</span> {project.music || "-"}</div>
        </div>
      </div>

      {/* Script */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Script</div>
        {project.script ? (
          <pre className="whitespace-pre-wrap text-sm leading-6 opacity-90">
            {project.script}
          </pre>
        ) : (
          <div className="text-sm opacity-70">
            Script will appear here once generated.
          </div>
        )}
      </div>

      {/* Video preview */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Video</div>
        {project.video_url ? (
          <div className="space-y-3">
            <video
              className="w-full rounded-lg border"
              controls
              src={project.video_url}
            />
            <a className="underline text-sm" href={project.video_url} target="_blank">
              Open video in new tab
            </a>
          </div>
        ) : (
          <div className="text-sm opacity-70">
            Video will appear here when render is complete.
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          className="rounded-lg border px-4 py-2"
          onClick={() => router.push("/dashboard")}
        >
          Back
        </button>

        {/* D21+ will wire these up */}
                <button
          className="rounded-lg border px-4 py-2"
          onClick={handleRetryRender}
          disabled={retrying || !project?.id}
          title={
            project?.status === "error"
              ? "Retry the render"
              : "You can retry anytime"
          }
        >
          {retrying ? "Retrying…" : "Retry Render"}
        </button>

          {retryError && (
          <div className="text-sm text-red-600 self-center">
            {retryError}
          </div>
        )}

      </div>
    </div>
  );
}
