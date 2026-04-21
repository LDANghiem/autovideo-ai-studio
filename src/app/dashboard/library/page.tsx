// ============================================================
// FILE: src/app/dashboard/library/page.tsx
// Unified Video Library — shows all videos across all pipelines
// Pipelines: Create Video, ReCreate, Dub Video, AI Shorts
// ============================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────
type Pipeline = "create" | "recreate" | "dub" | "shorts";

interface VideoItem {
  id: string;
  pipeline: Pipeline;
  title: string;
  status: string;
  created_at: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration?: number | null;
  source_url?: string | null;
}

// ── Config ───────────────────────────────────────────────────
const PIPELINE_META: Record<Pipeline, { label: string; color: string; icon: string }> = {
  create:   { label: "Create Video", color: "#7F77DD", icon: "🎬" },
  recreate: { label: "ReCreate",     color: "#10b981", icon: "♻️" },
  dub:      { label: "Dub Video",    color: "#f59e0b", icon: "🎙️" },
  shorts:   { label: "AI Shorts",    color: "#ef4444", icon: "✂️" },
};

const STATUS_COLOR: Record<string, string> = {
  done:       "#4ade80",
  completed:  "#4ade80",
  processing: "#fbbf24",
  uploading:  "#fbbf24",
  rendering:  "#fbbf24",
  error:      "#f87171",
  failed:     "#f87171",
  draft:      "#9ca3af",
};

function getStatusColor(s: string) {
  return STATUS_COLOR[s?.toLowerCase()] || "#9ca3af";
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main Component ───────────────────────────────────────────
export default function LibraryPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Pipeline | "all">("all");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (video: VideoItem) => {
    if (!confirm(`Delete "${video.title}"? This will permanently remove the video and free up storage.`)) return;
    const key = `${video.pipeline}-${video.id}`;
    setDeleting(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const uid = session.user.id;

      // 1. Delete storage files first
      const bucketMap: Record<Pipeline, string> = {
        create: "videos",
        recreate: "recreated-videos",
        dub: "dubbed-videos",
        shorts: "shorts",
      };
      const bucket = bucketMap[video.pipeline];

      // Build storage paths for this pipeline
      const storagePaths: string[] = [];
      if (video.pipeline === "create") {
        // Try common attempt numbers
        for (let a = 1; a <= 3; a++) {
          storagePaths.push(`${uid}/${video.id}/attempt-${a}.mp4`);
        }
      } else if (video.pipeline === "recreate") {
        storagePaths.push(`${uid}/${video.id}/recreated.mp4`);
      } else if (video.pipeline === "dub") {
        storagePaths.push(`${uid}/${video.id}/dubbed.mp4`);
        storagePaths.push(`${uid}/${video.id}/vietnamese.srt`);
      } else if (video.pipeline === "shorts") {
        // Shorts can have multiple clips — try up to 10
        for (let c = 1; c <= 10; c++) {
          storagePaths.push(`${uid}/${video.id}/clip-${c}.mp4`);
          storagePaths.push(`${uid}/${video.id}/clip-${c}-thumb.jpg`);
        }
      }

      // Delete storage files (best effort — don't fail if files missing)
      if (storagePaths.length > 0) {
        await supabase.storage.from(bucket).remove(storagePaths).catch(() => {});
      }

      // 2. Delete DB row
      const tableMap: Record<Pipeline, string> = {
        create: "projects",
        recreate: "recreate_projects",
        dub: "dub_projects",
        shorts: "repurpose_projects",
      };
      const table = tableMap[video.pipeline];
      await supabase.from(table).delete().eq("id", video.id).eq("user_id", uid);

      // 3. Remove from local state immediately
      setVideos(prev => prev.filter(v => !(v.id === video.id && v.pipeline === video.pipeline)));
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(null);
    }
  };

  const fetchAll = useCallback(async (uid: string) => {
    const results: VideoItem[] = [];

    // 1. Create Video (projects table)
    const { data: creates } = await supabase
      .from("projects")
      .select("id, topic, status, created_at, render_attempt")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    (creates || []).forEach((p: any) => {
      const attempt = p.render_attempt || 1;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      results.push({
        id: p.id,
        pipeline: "create",
        title: p.topic || "Untitled Video",
        status: p.status || "draft",
        created_at: p.created_at,
        video_url: p.status === "done"
          ? `${supabaseUrl}/storage/v1/object/public/videos/${uid}/${p.id}/attempt-${attempt}.mp4`
          : null,
        thumbnail_url: null,
      });
    });

    // 2. ReCreate (recreate_projects table)
    const { data: recreates } = await supabase
      .from("recreate_projects")
      .select("id, title, status, created_at, final_video_url, source_url")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    (recreates || []).forEach((p: any) => {
      results.push({
        id: p.id,
        pipeline: "recreate",
        title: p.title || p.source_url || "ReCreated Video",
        status: p.status || "draft",
        created_at: p.created_at,
        video_url: p.final_video_url || null,
        thumbnail_url: null,
        source_url: p.source_url,
      });
    });

    // 3. Dub Video (dub_projects table)
    const { data: dubs } = await supabase
      .from("dub_projects")
      .select("id, source_title, status, created_at, final_video_url, source_thumbnail")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    (dubs || []).forEach((p: any) => {
      results.push({
        id: p.id,
        pipeline: "dub",
        title: p.source_title || "Dubbed Video",
        status: p.status || "draft",
        created_at: p.created_at,
        video_url: p.final_video_url || null,
        thumbnail_url: p.source_thumbnail || null,
      });
    });

    // 4. AI Shorts (repurpose_projects table)
    const { data: shorts } = await supabase
      .from("repurpose_projects")
      .select("id, source_title, status, created_at, clips, source_url")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    (shorts || []).forEach((p: any) => {
      const clips = p.clips || [];
      const firstClip = clips[0];
      results.push({
        id: p.id,
        pipeline: "shorts",
        title: p.source_title || "AI Shorts Project",
        status: p.status || "draft",
        created_at: p.created_at,
        video_url: firstClip?.video_url || null,
        thumbnail_url: firstClip?.thumbnail_url || null,
        duration: clips.length > 0 ? clips.length : null,
      });
    });

    // Sort all by created_at descending
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setVideos(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setLoading(false); return; }
      setUserId(session.user.id);
      await fetchAll(session.user.id);
    })();
  }, [fetchAll]);

  const filtered = videos.filter(v => {
    if (filter !== "all" && v.pipeline !== filter) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: videos.length,
    create: videos.filter(v => v.pipeline === "create").length,
    recreate: videos.filter(v => v.pipeline === "recreate").length,
    dub: videos.filter(v => v.pipeline === "dub").length,
    shorts: videos.filter(v => v.pipeline === "shorts").length,
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0812" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span>📚</span> My Video Library
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              All your videos across every pipeline in one place
            </p>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-4 py-2 rounded-xl text-sm text-white placeholder-gray-500 w-64"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["all", "create", "recreate", "dub", "shorts"] as const).map(f => {
            const meta = f === "all" ? null : PIPELINE_META[f];
            const count = counts[f];
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: isActive
                    ? (meta?.color || "#7F77DD") + "22"
                    : "rgba(255,255,255,0.04)",
                  border: isActive
                    ? `1px solid ${meta?.color || "#7F77DD"}55`
                    : "1px solid rgba(255,255,255,0.08)",
                  color: isActive ? (meta?.color || "#c4b5fd") : "#9ca3af",
                }}
              >
                {meta ? `${meta.icon} ${meta.label}` : "🎥 All"} ({count})
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Loading your videos...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span style={{ fontSize: 48 }}>🎬</span>
            <p className="text-white text-lg font-medium mt-4">
              {search ? "No videos match your search" : "No videos yet"}
            </p>
            <p className="text-gray-400 text-sm mt-2">
              {search ? "Try a different search term" : "Create your first video using any pipeline"}
            </p>
            {!search && (
              <div className="flex gap-3 mt-6 flex-wrap justify-center">
                {(["create", "recreate", "dub", "shorts"] as const).map(p => (
                  <Link
                    key={p}
                    href={p === "create" ? "/dashboard/create" : p === "dub" ? "/dashboard/dub-video/new" : `/dashboard/${p}`}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                    style={{ background: PIPELINE_META[p].color + "22", border: `1px solid ${PIPELINE_META[p].color}44`, color: PIPELINE_META[p].color }}
                  >
                    {PIPELINE_META[p].icon} {PIPELINE_META[p].label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(video => {
              const meta = PIPELINE_META[video.pipeline];
              const isDone = ["done", "completed"].includes(video.status?.toLowerCase());
              return (
                <div
                  key={`${video.pipeline}-${video.id}`}
                  className="rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-gray-900 flex items-center justify-center">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <span style={{ fontSize: 36 }}>{meta.icon}</span>
                    )}

                    {/* Pipeline badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: meta.color + "33", color: meta.color, border: `1px solid ${meta.color}55` }}>
                      {meta.label}
                    </div>

                    {/* Status badge */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: "rgba(0,0,0,0.6)", color: getStatusColor(video.status) }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: getStatusColor(video.status) }} />
                      {video.status}
                    </div>

                    {/* Shorts clip count */}
                    {video.pipeline === "shorts" && video.duration && (
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
                        {video.duration} clips
                      </div>
                    )}

                    {/* Play overlay */}
                    {isDone && video.video_url && (
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.5)" }}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}>
                          <span style={{ fontSize: 20 }}>▶</span>
                        </div>
                      </a>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-3">
                    <p className="text-white text-sm font-medium truncate" title={video.title}>
                      {video.title}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">{timeAgo(video.created_at)}</p>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      {isDone && video.video_url && (
                        <a
                          href={video.video_url}
                          download
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-center transition-all hover:opacity-80"
                          style={{ background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}44` }}
                        >
                          ↓ Download
                        </a>
                      )}
                      <Link
                        href={
                          video.pipeline === "create" ? `/dashboard/projects/${video.id}` :
                          video.pipeline === "recreate" ? `/dashboard/recreate` :
                          video.pipeline === "dub" ? `/dashboard/dub-video/${video.id}` :
                          `/dashboard/shorts`
                        }
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium text-center transition-all hover:opacity-80"
                        style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        View →
                      </Link>
                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(video)}
                        disabled={deleting === `${video.pipeline}-${video.id}`}
                        className="w-8 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
                        style={{ color: "rgba(107,114,128,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
                        title="Delete"
                      >
                        {deleting === `${video.pipeline}-${video.id}` ? (
                          <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}