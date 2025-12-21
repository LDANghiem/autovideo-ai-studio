"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  topic: string | null;
  status: string | null;
  style: string | null;
  length: string | null;
  resolution: string | null;
  created_at?: string;
};

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setError("You are not logged in. Please sign in.");
          setProjects([]);
          return;
        }

        const { data, error } = await supabase
          .from("projects")
          .select("id, topic, status, style, length, resolution, created_at")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setProjects((data as Project[]) ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load projects.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link
          href="/dashboard/create"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          + Create
        </Link>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && error && (
        <div className="border rounded-lg p-4 bg-white text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="border rounded-lg p-6 bg-white text-gray-600">
          No projects yet. Click <b>Create</b> to generate your first video.
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="block border rounded-xl p-4 bg-white hover:shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {p.topic || "(No topic)"}
                  </div>
                  <div className="text-sm text-gray-500">
                    {p.style || "—"} • {p.length || "—"} • {p.resolution || "—"}
                  </div>
                </div>

                <span className="text-sm px-3 py-1 rounded-full border">
                  {p.status || "unknown"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
