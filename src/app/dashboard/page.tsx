"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  topic: string | null;
  status: "queued" | "processing" | "done" | "error" | string | null;
  created_at: string | null;
  updated_at: string | null;

  // optional (nice to show)
  style?: string | null;
  length?: string | null;
  language?: string | null;
  resolution?: string | null;
};

function StatusBadge({ status }: { status: Project["status"] }) {
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

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function loadProjects() {
    setErr(null);
    setLoading(true);

    // Ensure user is logged in
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setErr(userErr.message);
      setLoading(false);
      return;
    }
    if (!userData?.user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id, topic, status, created_at, updated_at, style, length, language, resolution")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setProjects([]);
    } else {
      setProjects((data ?? []) as Project[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional: live-refresh the list when ANY of your projects change
  // (If you don’t want this, delete this effect.)
  useEffect(() => {
    const channel = supabase
      .channel("projects:dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => {
          // safest approach: re-fetch list (avoids edge cases)
          loadProjects();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-semibold">Dashboard</div>
          <div className="text-sm opacity-70">Your AutoVideo projects</div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => loadProjects()}
            disabled={loading}
          >
            Refresh
          </button>

          <Link
            href="/dashboard/create"
            className="rounded-lg border px-4 py-2"
          >
            + New Project
          </Link>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border p-4">
          <div className="font-semibold">Something went wrong</div>
          <div className="text-sm opacity-80">{err}</div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border p-4">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border p-6 space-y-2">
          <div className="font-semibold">No projects yet</div>
          <div className="text-sm opacity-70">
            Create your first video project to see it here.
          </div>
          <Link href="/dashboard/create" className="underline text-sm">
            Create a project →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="block rounded-xl border p-4 hover:bg-black/5 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-semibold">
                    {p.topic || "Untitled project"}
                  </div>

                  <div className="text-sm opacity-70">
                    {[
                      p.style ? `Style: ${p.style}` : null,
                      p.length ? `Length: ${p.length}` : null,
                      p.resolution ? `Res: ${p.resolution}` : null,
                      p.language ? `Lang: ${p.language}` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>

                  <div className="text-xs opacity-60">
                    Updated: {p.updated_at || p.created_at || "-"}
                  </div>
                </div>

                <StatusBadge status={p.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
