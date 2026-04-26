"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PIPELINE_COLORS = {
  create: { hex: "#7F77DD", name: "Create", glow: "rgba(127,119,221,0.35)" },
  recreate: { hex: "#22d3ee", name: "ReCreate", glow: "rgba(34,211,238,0.35)" },
  channel_cloner: { hex: "#fb7185", name: "Channel Cloner", glow: "rgba(251,113,133,0.35)" },
  article: { hex: "#a78bfa", name: "Article", glow: "rgba(167,139,250,0.35)" },
  shorts: { hex: "#fbbf24", name: "Shorts", glow: "rgba(251,191,36,0.35)" },
  repurpose: { hex: "#fb923c", name: "Repurpose", glow: "rgba(251,146,60,0.35)" },
  dub: { hex: "#60a5fa", name: "Dub", glow: "rgba(96,165,250,0.35)" },
};

type LibraryVideo = {
  id: string;
  pipeline: keyof typeof PIPELINE_COLORS;
  title: string;
  status: string;
  progress_pct: number | null;
  progress_stage: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  language?: string | null;
  orientation?: string | null;
  target_length?: number | null;
  source_channel_handle?: string | null;
  source_channel_title?: string | null;
  duration_sec?: number | null;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = (searchParams?.get("view") === "list" ? "list" : "grid") as "grid" | "list";
  const [view, setView] = useState<"grid" | "list">(initialView);
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const setViewMode = (mode: "grid" | "list") => {
    setView(mode);
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("view", mode);
    router.replace(`/dashboard/library?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [createRes, recreateRes, shortsRes, dubRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, topic, status, video_url, thumbnail_url, created_at, language, video_type, length")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("recreate_projects")
          .select("id, source_title, source_video_title, source_channel_handle, source_channel_title, status, progress_pct, progress_stage, final_video_url, thumbnail_url, created_at, target_language, orientation, target_length, article_text")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("shorts_projects")
          .select("id, source_title, status, progress_pct, progress_stage, clips, source_thumbnail, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("dub_projects")
          .select("id, source_title, status, progress_pct, video_url, created_at, target_language, source_duration_sec")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const allVideos: LibraryVideo[] = [];

      (createRes.data || []).forEach((p: any) => {
        allVideos.push({
          id: p.id,
          pipeline: "create",
          title: p.topic || "Untitled",
          status: p.status || "unknown",
          progress_pct: null,
          progress_stage: null,
          video_url: p.video_url || null,
          thumbnail_url: p.thumbnail_url || null,
          created_at: p.created_at,
          language: p.language || null,
          orientation: p.video_type === "youtube_shorts" || p.video_type === "tiktok" ? "portrait" : "landscape",
          target_length: null,
        });
      });

      (recreateRes.data || []).forEach((p: any) => {
        const isChannelClone = !!p.source_channel_handle;
        const isArticle = !!p.article_text;
        const pipeline: keyof typeof PIPELINE_COLORS = isChannelClone
          ? "channel_cloner"
          : isArticle
          ? "article"
          : "recreate";
        const title = p.source_video_title || p.source_title || "Untitled";

        allVideos.push({
          id: p.id,
          pipeline,
          title,
          status: p.status || "unknown",
          progress_pct: p.progress_pct || null,
          progress_stage: p.progress_stage || null,
          video_url: p.final_video_url || null,
          thumbnail_url: p.thumbnail_url || null,
          created_at: p.created_at,
          language: p.target_language || null,
          orientation: p.orientation || "landscape",
          target_length: p.target_length || null,
          source_channel_handle: p.source_channel_handle || null,
          source_channel_title: p.source_channel_title || null,
        });
      });

      (shortsRes.data || []).forEach((p: any) => {
        const clips = Array.isArray(p.clips) ? p.clips : [];
        if (clips.length === 0) {
          allVideos.push({
            id: p.id,
            pipeline: "shorts",
            title: p.source_title || "Shorts (processing)",
            status: p.status || "unknown",
            progress_pct: p.progress_pct || null,
            progress_stage: p.progress_stage || null,
            video_url: null,
            thumbnail_url: p.source_thumbnail || null,
            created_at: p.created_at,
            orientation: "portrait",
          });
        } else {
          clips.forEach((clip: any) => {
            allVideos.push({
              id: `${p.id}-${clip.index}`,
              pipeline: "shorts",
              title: clip.title || `Clip ${clip.index}`,
              status: "done",
              progress_pct: 100,
              progress_stage: null,
              video_url: clip.video_url || null,
              thumbnail_url: clip.thumbnail_url || null,
              created_at: p.created_at,
              orientation: "portrait",
              duration_sec: clip.duration || null,
            });
          });
        }
      });

      (dubRes.data || []).forEach((p: any) => {
        allVideos.push({
          id: p.id,
          pipeline: "dub",
          title: p.source_title || "Dubbed Video",
          status: p.status || "unknown",
          progress_pct: p.progress_pct || null,
          progress_stage: null,
          video_url: p.video_url || null,
          thumbnail_url: null,
          created_at: p.created_at,
          language: p.target_language || null,
          duration_sec: p.source_duration_sec || null,
        });
      });

      allVideos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setVideos(allVideos);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const filtered = useMemo(() => {
    if (filterPipeline === "all") return videos;
    return videos.filter((v) => v.pipeline === filterPipeline);
  }, [videos, filterPipeline]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: videos.length };
    videos.forEach((v) => { c[v.pipeline] = (c[v.pipeline] || 0) + 1; });
    return c;
  }, [videos]);

  async function handleDelete(video: LibraryVideo) {
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
    setDeletingId(video.id);
    try {
      const tableMap: Record<string, string> = {
        create: "projects",
        recreate: "recreate_projects",
        channel_cloner: "recreate_projects",
        article: "recreate_projects",
        shorts: "shorts_projects",
        dub: "dub_projects",
      };
      const table = tableMap[video.pipeline];
      const realId = video.pipeline === "shorts" && video.id.includes("-")
        ? video.id.split("-").slice(0, -1).join("-")
        : video.id;

      const { error } = await supabase.from(table).delete().eq("id", realId);
      if (error) throw error;
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (e: any) {
      alert("Delete failed: " + (e?.message || "unknown"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0a14 0%, #0f0f1f 100%)", color: "#e7e5f5", fontFamily: "Inter, system-ui, sans-serif" }}>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lib-card {
          animation: fadeIn 0.35s ease-out backwards;
        }
        .lib-card:hover .lib-thumb-overlay {
          opacity: 1;
        }
        .lib-card:hover .lib-thumb-image {
          transform: scale(1.04);
        }
        .lib-thumb-image {
          transition: transform 0.5s ease-out;
        }
        .lib-thumb-overlay {
          opacity: 0;
          transition: opacity 0.2s ease-out;
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, marginBottom: 6, background: "linear-gradient(135deg, #fff 0%, #c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Library
          </h1>
          <p style={{ fontSize: 14, color: "#8b8aa0", margin: 0 }}>
            All your videos across every pipeline
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { id: "all", label: "All", color: "#a78bfa" },
              { id: "create", label: "Create", color: PIPELINE_COLORS.create.hex },
              { id: "recreate", label: "ReCreate", color: PIPELINE_COLORS.recreate.hex },
              { id: "channel_cloner", label: "Channel Cloner", color: PIPELINE_COLORS.channel_cloner.hex },
              { id: "article", label: "Article", color: PIPELINE_COLORS.article.hex },
              { id: "shorts", label: "Shorts", color: PIPELINE_COLORS.shorts.hex },
              { id: "dub", label: "Dub", color: PIPELINE_COLORS.dub.hex },
            ].filter((c) => c.id === "all" || (counts[c.id] || 0) > 0).map((chip) => {
              const active = filterPipeline === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setFilterPipeline(chip.id)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: active ? `1px solid ${chip.color}` : "1px solid rgba(255,255,255,0.08)",
                    background: active ? `${chip.color}20` : "rgba(255,255,255,0.03)",
                    color: active ? chip.color : "#b4b3c8",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: chip.color, opacity: active ? 1 : 0.7 }} />
                  {chip.label}
                  <span style={{ fontSize: 11, color: active ? chip.color : "#666", opacity: 0.8 }}>
                    {counts[chip.id] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 4, padding: 4, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setViewMode("grid")}
              title="Grid view"
              style={{
                padding: "6px 10px",
                borderRadius: 7,
                border: "none",
                background: view === "grid" ? "rgba(127,119,221,0.2)" : "transparent",
                color: view === "grid" ? "#c4b5fd" : "#8b8aa0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              style={{
                padding: "6px 10px",
                borderRadius: 7,
                border: "none",
                background: view === "list" ? "rgba(127,119,221,0.2)" : "transparent",
                color: view === "list" ? "#c4b5fd" : "#8b8aa0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              List
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 80, color: "#8b8aa0", fontSize: 14 }}>
            Loading your videos...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "80px 24px",
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.08)",
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📹</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>
              {filterPipeline === "all" ? "No videos yet" : `No ${filterPipeline.replace("_", " ")} videos`}
            </h3>
            <p style={{ fontSize: 14, color: "#8b8aa0", margin: 0 }}>
              {filterPipeline === "all"
                ? "Create your first video to see it here"
                : "Try a different pipeline filter"}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && view === "grid" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 20,
          }}>
            {filtered.map((v, idx) => (
              <VideoCardGrid key={v.id} video={v} index={idx} onDelete={handleDelete} deleting={deletingId === v.id} />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && view === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((v, idx) => (
              <VideoCardList key={v.id} video={v} index={idx} onDelete={handleDelete} deleting={deletingId === v.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoCardGrid(props: {
  video: LibraryVideo;
  index: number;
  onDelete: (v: LibraryVideo) => void;
  deleting: boolean;
}) {
  const { video, index, onDelete, deleting } = props;
  const color = PIPELINE_COLORS[video.pipeline];
  const isProcessing = video.status !== "done" && video.status !== "error";
  const isError = video.status === "error";
  const orientation = video.orientation || "landscape";
  const aspectRatio = orientation === "portrait" ? "9 / 16" : "16 / 9";

  return (
    <div
      className="lib-card"
      style={{
        animationDelay: `${Math.min(index * 30, 600)}ms`,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: `3px solid ${color.hex}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "all 0.2s ease",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        e.currentTarget.style.borderLeft = `3px solid ${color.hex}`;
        e.currentTarget.style.boxShadow = `0 8px 24px -8px ${color.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.025)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
        e.currentTarget.style.borderLeft = `3px solid ${color.hex}`;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{
        position: "relative",
        aspectRatio,
        background: video.thumbnail_url ? "#000" : `linear-gradient(135deg, ${color.hex}22 0%, #1a0f2e 70%)`,
        overflow: "hidden",
      }}>
        {video.thumbnail_url ? (
          <img
            className="lib-thumb-image"
            src={video.thumbnail_url}
            alt={video.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        ) : (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
            color: `${color.hex}66`,
          }}>
            {isProcessing ? "⏳" : isError ? "⚠️" : "🎬"}
          </div>
        )}

        {isProcessing && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,10,20,0.8)",
            backdropFilter: "blur(2px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}>
            <div style={{ fontSize: 11, color: color.hex, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {video.progress_stage || video.status}
            </div>
            <div style={{ width: "70%", height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${video.progress_pct || 0}%`,
                height: "100%",
                background: color.hex,
                transition: "width 0.4s ease",
                boxShadow: `0 0 8px ${color.glow}`,
              }} />
            </div>
            <div style={{ fontSize: 12, color: "#b4b3c8", fontWeight: 500 }}>
              {video.progress_pct || 0}%
            </div>
          </div>
        )}

        <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          padding: "3px 8px",
          background: `${color.hex}cc`,
          color: "#0a0a14",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          borderRadius: 4,
          backdropFilter: "blur(4px)",
        }}>
          {color.name}
        </div>

        {video.duration_sec && (
          <div style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            padding: "2px 7px",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 3,
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatDuration(video.duration_sec)}
          </div>
        )}

        {video.video_url && !isProcessing && (
          <div className="lib-thumb-overlay" style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,10,20,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: color.hex,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 24px ${color.glow}`,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#0a0a14"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 14px 12px" }}>
        <h3 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
          marginBottom: 8,
          color: "#e7e5f5",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: 1.35,
          minHeight: 38,
        } as React.CSSProperties}>
          {video.title}
        </h3>

        {video.source_channel_handle && (
          <div style={{ fontSize: 11, color: color.hex, marginBottom: 6, fontWeight: 500 }}>
            @{video.source_channel_handle}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, fontSize: 11, color: "#7a7990" }}>
          {video.language && (
            <span style={{ padding: "1px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>
              {video.language}
            </span>
          )}
          {video.target_length && (
            <span style={{ padding: "1px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>
              {video.target_length}s
            </span>
          )}
          {video.orientation && video.pipeline !== "shorts" && (
            <span style={{ padding: "1px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>
              {video.orientation === "portrait" ? "9:16" : "16:9"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#5d5c75" }}>
            {timeAgo(video.created_at)}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {video.video_url && (
              <a
                href={video.video_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: color.hex,
                  background: `${color.hex}15`,
                  border: `1px solid ${color.hex}30`,
                  borderRadius: 5,
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                Open
              </a>
            )}
            <button
              onClick={() => onDelete(video)}
              disabled={deleting}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                color: "#7a7990",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 5,
                cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.4 : 1,
                transition: "all 0.15s",
              }}
            >
              {deleting ? "..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoCardList(props: {
  video: LibraryVideo;
  index: number;
  onDelete: (v: LibraryVideo) => void;
  deleting: boolean;
}) {
  const { video, index, onDelete, deleting } = props;
  const color = PIPELINE_COLORS[video.pipeline];
  const isProcessing = video.status !== "done" && video.status !== "error";

  return (
    <div
      className="lib-card"
      style={{
        animationDelay: `${Math.min(index * 20, 400)}ms`,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px 10px 11px",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: `3px solid ${color.hex}`,
        borderRadius: 10,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        e.currentTarget.style.borderLeft = `3px solid ${color.hex}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.025)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
        e.currentTarget.style.borderLeft = `3px solid ${color.hex}`;
      }}
    >
      <div style={{
        flex: "0 0 auto",
        width: 96,
        height: 54,
        borderRadius: 6,
        overflow: "hidden",
        background: video.thumbnail_url ? "#000" : `linear-gradient(135deg, ${color.hex}33, #1a0f2e)`,
        position: "relative",
      }}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: 0.5 }}>
            🎬
          </div>
        )}
        {isProcessing && (
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            height: 3,
            background: "rgba(0,0,0,0.5)",
          }}>
            <div style={{ width: `${video.progress_pct || 0}%`, height: "100%", background: color.hex }} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{
            padding: "1px 6px",
            background: `${color.hex}20`,
            color: color.hex,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            borderRadius: 3,
          }}>
            {color.name}
          </span>
          {video.source_channel_handle && (
            <span style={{ fontSize: 11, color: color.hex, fontWeight: 500 }}>
              @{video.source_channel_handle}
            </span>
          )}
        </div>
        <h3 style={{
          fontSize: 13,
          fontWeight: 600,
          margin: 0,
          color: "#e7e5f5",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {video.title}
        </h3>
        <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: "#7a7990" }}>
          <span>{timeAgo(video.created_at)}</span>
          {video.language && <span>{video.language}</span>}
          {video.target_length && <span>{video.target_length}s</span>}
          {isProcessing && (
            <span style={{ color: color.hex, fontWeight: 500 }}>
              {video.progress_stage || video.status} • {video.progress_pct || 0}%
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: "0 0 auto", display: "flex", gap: 6 }}>
        {video.video_url && (
          <a
            href={video.video_url}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: color.hex,
              background: `${color.hex}15`,
              border: `1px solid ${color.hex}30`,
              borderRadius: 5,
              textDecoration: "none",
            }}
          >
            Open
          </a>
        )}
        <button
          onClick={() => onDelete(video)}
          disabled={deleting}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            color: "#7a7990",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 5,
            cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.4 : 1,
          }}
        >
          {deleting ? "..." : "Delete"}
        </button>
      </div>
    </div>
  );
}