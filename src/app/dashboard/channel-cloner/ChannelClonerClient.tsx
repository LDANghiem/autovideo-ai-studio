// ============================================================
// FILE: src/app/dashboard/channel-cloner/ChannelClonerClient.tsx
// ============================================================
// Ripple — Channel Cloner (Studio exclusive)
// Brand pass: magenta pipeline cue in header (matches sidebar),
// coral CTAs and selection states, semantic status colors.
//
// Pipeline:
//   Step 1: Paste YouTube channel URL or @handle
//   Step 2: Filter + select up to 10 videos
//   Step 3: Confirm + queue all selections through ReCreate
//
// All logic preserved: scrape API, queue API, filter calculations,
// selection cap enforcement, yt-dlp date parsing.
// ============================================================

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_SELECTION = 10;

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";
const MAGENTA = "#E879A6";          // Channel Cloner pipeline color
const MAGENTA_BG = "rgba(232,121,166,0.12)";
const MAGENTA_BORDER = "rgba(232,121,166,0.3)";

type ScrapedVideo = {
  video_id: string;
  title: string;
  url: string;
  views: number;
  duration_seconds: number;
  upload_date: string | null;
  thumbnail: string;
};

type ScrapeResult = {
  channel_handle: string;
  channel_url: string;
  channel_title: string;
  videos: ScrapedVideo[];
  scraped_at: string;
  cached?: boolean;
};

export default function ChannelClonerClient() {
  const router = useRouter();

  // Wizard step: 1 = input, 2 = preview/select, 3 = confirm
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [channelInput, setChannelInput] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [channelInputFocused, setChannelInputFocused] = useState(false);

  // Step 2 state
  const [minViews, setMinViews] = useState<number>(0);
  const [minDuration, setMinDuration] = useState<number>(0);
  const [maxDuration, setMaxDuration] = useState<number>(0);
  const [postedWithinDays, setPostedWithinDays] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Step 3 state
  const [queuing, setQueuing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  // ─── Helpers ────────────────────────────────────────────────
  async function getAuthHeader(): Promise<Record<string, string> | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }

  function formatViews(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  }

  function formatDuration(sec: number): string {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function daysSinceUpload(uploadDate: string | null): number | null {
    if (!uploadDate) return null;
    // yt-dlp returns YYYYMMDD
    const y = parseInt(uploadDate.slice(0, 4));
    const mo = parseInt(uploadDate.slice(4, 6)) - 1;
    const d = parseInt(uploadDate.slice(6, 8));
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    const uploaded = new Date(y, mo, d);
    const diffMs = Date.now() - uploaded.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // ─── Step 1: Scrape channel ─────────────────────────────────
  async function handleScrape() {
    if (!channelInput.trim()) {
      setScrapeError("Please enter a channel URL or handle");
      return;
    }
    setScraping(true);
    setScrapeError(null);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) throw new Error("Not logged in");

      const res = await fetch("/api/channel-cloner/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Scrape failed");
      }

      setScrapeResult(data);

      // Pre-select top 10 by views
      const top10 = [...data.videos]
        .sort((a: ScrapedVideo, b: ScrapedVideo) => b.views - a.views)
        .slice(0, MAX_SELECTION)
        .map((v: ScrapedVideo) => v.video_id);
      setSelectedIds(new Set(top10));

      setStep(2);
    } catch (err: any) {
      setScrapeError(err?.message || "Something went wrong");
    } finally {
      setScraping(false);
    }
  }

  // ─── Step 2: Filtered + ranked video list ───────────────────
  const filteredVideos = useMemo(() => {
    if (!scrapeResult) return [];
    let list = [...scrapeResult.videos];

    if (minViews > 0) list = list.filter(v => v.views >= minViews);
    if (minDuration > 0) list = list.filter(v => v.duration_seconds >= minDuration);
    if (maxDuration > 0) list = list.filter(v => v.duration_seconds <= maxDuration);
    if (postedWithinDays > 0) {
      list = list.filter(v => {
        const days = daysSinceUpload(v.upload_date);
        return days !== null && days <= postedWithinDays;
      });
    }

    list.sort((a, b) => b.views - a.views);
    return list;
  }, [scrapeResult, minViews, minDuration, maxDuration, postedWithinDays]);

  function toggleSelect(videoId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        if (next.size >= MAX_SELECTION) return prev;
        next.add(videoId);
      }
      return next;
    });
  }

  function selectTopN(n: number) {
    const top = filteredVideos.slice(0, Math.min(n, MAX_SELECTION)).map(v => v.video_id);
    setSelectedIds(new Set(top));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedVideos = useMemo(() => {
    if (!scrapeResult) return [];
    return scrapeResult.videos.filter(v => selectedIds.has(v.video_id));
  }, [scrapeResult, selectedIds]);

  // ─── Step 3: Queue for cloning ──────────────────────────────
  async function handleQueue() {
    if (!scrapeResult) return;
    if (selectedIds.size === 0) {
      setQueueError("Select at least one video");
      return;
    }
    setQueuing(true);
    setQueueError(null);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) throw new Error("Not logged in");

      const res = await fetch("/api/channel-cloner/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          channelHandle: scrapeResult.channel_handle,
          videoIds: Array.from(selectedIds),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Queue failed");
      }

      router.push("/dashboard/library");
    } catch (err: any) {
      setQueueError(err?.message || "Something went wrong");
    } finally {
      setQueuing(false);
    }
  }

  /* ── Reusable input style for filter inputs ── */
  const filterInputStyle: React.CSSProperties = {
    background: "#0F0E1A",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#F5F2ED",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const labelStyle: React.CSSProperties = {
    color: "#8B8794",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "#0F0E1A", color: "#F5F2ED" }}>
      <div className="max-w-6xl mx-auto">

        {/* ── Header (magenta pipeline cue) ─────────────────── */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: MAGENTA_BG,
              border: `1px solid ${MAGENTA_BORDER}`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MAGENTA} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0z" />
              <path d="M10 8l6 4-6 4V8z" fill={MAGENTA} />
            </svg>
          </div>
          <div>
            <h1
              className="text-3xl md:text-4xl font-bold"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              Channel Cloner
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
              Scrape a YouTube channel, pick top videos, and batch ReCreate them — all at once.
            </p>
          </div>
        </div>

        {/* ── Step indicator ─────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          {[1, 2, 3].map(n => {
            const isCurrent = step === n;
            const isCompleted = step > n;
            return (
              <div key={n} className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition"
                  style={{
                    background: isCurrent
                      ? CORAL
                      : isCompleted
                        ? "rgba(255,107,90,0.20)"
                        : "rgba(255,255,255,0.06)",
                    color: isCurrent
                      ? "#0F0E1A"
                      : isCompleted
                        ? CORAL_SOFT
                        : "#5A5762",
                    boxShadow: isCurrent ? "0 4px 12px -2px rgba(255,107,90,0.5)" : "none",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {isCompleted ? "✓" : n}
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{
                    color: isCurrent ? "#F5F2ED" : isCompleted ? "#8B8794" : "#5A5762",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {n === 1 ? "Enter channel" : n === 2 ? "Pick videos" : "Confirm"}
                </span>
                {n < 3 && (
                  <div
                    className="w-8 h-px mx-2"
                    style={{
                      background: step > n ? "rgba(255,107,90,0.3)" : "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Input ──────────────────────────────────── */}
        {step === 1 && (
          <div
            className="rounded-2xl p-6 md:p-8"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <h2
              className="text-xl font-semibold mb-4"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              Paste a YouTube channel URL or handle
            </h2>
            <p className="text-sm mb-6" style={{ color: "#8B8794" }}>
              We&apos;ll pull up to 50 most recent videos. Try{" "}
              <code
                className="px-1.5 py-0.5 rounded"
                style={{
                  color: MAGENTA,
                  background: MAGENTA_BG,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.9em",
                }}
              >
                @mkbhd
              </code>{" "}
              or{" "}
              <code
                className="px-1.5 py-0.5 rounded"
                style={{
                  color: MAGENTA,
                  background: MAGENTA_BG,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.9em",
                }}
              >
                youtube.com/@veritasium
              </code>
              .
            </p>

            <input
              type="text"
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleScrape()}
              onFocus={() => setChannelInputFocused(true)}
              onBlur={() => setChannelInputFocused(false)}
              placeholder="@channelhandle or https://youtube.com/@..."
              disabled={scraping}
              className="w-full rounded-xl px-4 py-3 text-sm transition mb-4 outline-none disabled:opacity-50"
              style={{
                background: "#0F0E1A",
                border: channelInputFocused
                  ? "1px solid rgba(255,107,90,0.5)"
                  : "1px solid rgba(255,255,255,0.1)",
                color: "#F5F2ED",
                boxShadow: channelInputFocused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
              }}
            />

            {scrapeError && (
              <div
                className="rounded-xl px-4 py-3 mb-4 text-sm"
                style={{
                  background: "rgba(255,107,107,0.10)",
                  border: "1px solid rgba(255,107,107,0.3)",
                  color: "#FF6B6B",
                }}
              >
                {scrapeError}
              </div>
            )}

            <button
              onClick={handleScrape}
              disabled={scraping || !channelInput.trim()}
              className="w-full md:w-auto rounded-xl px-6 py-3 font-semibold transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: (scraping || !channelInput.trim())
                  ? "rgba(255,107,90,0.3)"
                  : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: (scraping || !channelInput.trim()) ? "none" : "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              {scraping ? "Scraping channel..." : "Scrape channel"}
            </button>

            {scraping && (
              <p className="text-xs mt-4" style={{ color: "#5A5762" }}>
                This can take 10–30 seconds on first scrape.
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Preview + Select ───────────────────────── */}
        {step === 2 && scrapeResult && (
          <div className="space-y-6">
            <div
              className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div>
                <div
                  className="text-lg font-semibold"
                  style={{
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {scrapeResult.channel_title}
                </div>
                <div className="text-sm" style={{ color: "#8B8794" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F5F2ED" }}>
                    {scrapeResult.videos.length}
                  </span>{" "}
                  videos scraped
                  {scrapeResult.cached && (
                    <span className="ml-2 font-semibold" style={{ color: MAGENTA }}>
                      • cached
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setStep(1);
                  setScrapeResult(null);
                  setSelectedIds(new Set());
                }}
                className="text-sm transition"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = CORAL_SOFT; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#8B8794"; }}
              >
                ← Try another channel
              </button>
            </div>

            {/* Filters */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                className="text-xs font-bold mb-4 uppercase tracking-wider"
                style={labelStyle}
              >
                Filters
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#5A5762" }}>
                    Min views
                  </label>
                  <input
                    type="number"
                    value={minViews || ""}
                    onChange={e => setMinViews(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[rgba(255,107,90,0.5)]"
                    style={filterInputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#5A5762" }}>
                    Min duration (sec)
                  </label>
                  <input
                    type="number"
                    value={minDuration || ""}
                    onChange={e => setMinDuration(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[rgba(255,107,90,0.5)]"
                    style={filterInputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#5A5762" }}>
                    Max duration (sec)
                  </label>
                  <input
                    type="number"
                    value={maxDuration || ""}
                    onChange={e => setMaxDuration(Number(e.target.value) || 0)}
                    placeholder="0 = any"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[rgba(255,107,90,0.5)]"
                    style={filterInputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#5A5762" }}>
                    Posted within (days)
                  </label>
                  <input
                    type="number"
                    value={postedWithinDays || ""}
                    onChange={e => setPostedWithinDays(Number(e.target.value) || 0)}
                    placeholder="0 = any"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[rgba(255,107,90,0.5)]"
                    style={filterInputStyle}
                  />
                </div>
              </div>

              <div
                className="flex flex-wrap items-center gap-3 mt-4 pt-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <button
                  onClick={() => selectTopN(10)}
                  className="text-xs rounded-lg px-3 py-1.5 transition font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,107,90,0.10)";
                    e.currentTarget.style.borderColor = "rgba(255,107,90,0.3)";
                    e.currentTarget.style.color = CORAL_SOFT;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = "#F5F2ED";
                  }}
                >
                  Select top 10
                </button>
                <button
                  onClick={() => selectTopN(5)}
                  className="text-xs rounded-lg px-3 py-1.5 transition font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,107,90,0.10)";
                    e.currentTarget.style.borderColor = "rgba(255,107,90,0.3)";
                    e.currentTarget.style.color = CORAL_SOFT;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = "#F5F2ED";
                  }}
                >
                  Select top 5
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs rounded-lg px-3 py-1.5 transition font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#8B8794",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "#F5F2ED";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "#8B8794";
                  }}
                >
                  Clear
                </button>
                <div className="ml-auto text-sm">
                  <span
                    className="font-bold"
                    style={{
                      color: selectedIds.size >= MAX_SELECTION ? AMBER : CORAL_SOFT,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {selectedIds.size} / {MAX_SELECTION}
                  </span>{" "}
                  <span style={{ color: "#5A5762" }}>selected</span>
                </div>
              </div>
            </div>

            {/* Video grid */}
            {filteredVideos.length === 0 ? (
              <div
                className="rounded-2xl p-10 text-center"
                style={{
                  background: "#16151F",
                  border: "1px dashed rgba(255,255,255,0.08)",
                  color: "#8B8794",
                }}
              >
                No videos match your filters. Try widening the criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map(v => {
                  const selected = selectedIds.has(v.video_id);
                  const atCap = !selected && selectedIds.size >= MAX_SELECTION;
                  const daysAgo = daysSinceUpload(v.upload_date);
                  return (
                    <button
                      key={v.video_id}
                      onClick={() => toggleSelect(v.video_id)}
                      disabled={atCap}
                      className="text-left rounded-xl overflow-hidden transition relative disabled:cursor-not-allowed"
                      style={{
                        background: selected ? "rgba(255,107,90,0.08)" : "#16151F",
                        border: selected
                          ? `1px solid rgba(255,107,90,0.5)`
                          : atCap
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "1px solid rgba(255,255,255,0.06)",
                        opacity: atCap ? 0.4 : 1,
                        boxShadow: selected ? "0 4px 16px -4px rgba(255,107,90,0.3)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!selected && !atCap) {
                          e.currentTarget.style.borderColor = "rgba(255,107,90,0.25)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected && !atCap) {
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        }
                      }}
                    >
                      <div className="aspect-video relative" style={{ background: "#0F0E1A" }}>
                        {v.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div
                          className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded"
                          style={{
                            background: "rgba(15,14,26,0.85)",
                            color: "#F5F2ED",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {formatDuration(v.duration_seconds)}
                        </div>
                        {selected && (
                          <div
                            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              background: CORAL,
                              color: "#0F0E1A",
                              boxShadow: "0 4px 12px -2px rgba(255,107,90,0.5)",
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div
                          className="text-sm font-semibold line-clamp-2 mb-2"
                          style={{
                            color: "#F5F2ED",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          {v.title}
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: "#5A5762" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatViews(v.views)} views
                          </span>
                          {daysAgo !== null && (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {daysAgo}d ago
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Proceed button */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep(3)}
                disabled={selectedIds.size === 0}
                className="rounded-xl px-6 py-3 font-semibold transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: selectedIds.size === 0
                    ? "rgba(255,107,90,0.3)"
                    : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                  color: "#0F0E1A",
                  boxShadow: selectedIds.size === 0 ? "none" : "0 4px 16px -4px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Proceed to confirm ({selectedIds.size}) →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ────────────────────────────────── */}
        {step === 3 && scrapeResult && (
          <div className="space-y-6">
            <div
              className="rounded-2xl p-6"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-2"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                Ready to clone
              </h2>
              <p className="text-sm mb-6" style={{ color: "#8B8794" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F5F2ED" }}>
                  {selectedVideos.length}
                </span>{" "}
                videos from{" "}
                <span style={{ color: "#F5F2ED", fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600 }}>
                  {scrapeResult.channel_title}
                </span>{" "}
                will be queued through the ReCreate pipeline.
              </p>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {selectedVideos.map(v => (
                  <div
                    key={v.video_id}
                    className="flex items-center gap-3 rounded-lg p-2"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-20 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-semibold truncate"
                        style={{
                          color: "#F5F2ED",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        {v.title}
                      </div>
                      <div
                        className="text-xs"
                        style={{
                          color: "#5A5762",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {formatViews(v.views)} views · {formatDuration(v.duration_seconds)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {queueError && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(255,107,107,0.10)",
                  border: "1px solid rgba(255,107,107,0.3)",
                  color: "#FF6B6B",
                }}
              >
                {queueError}
              </div>
            )}

            <div className="flex justify-between flex-wrap gap-3">
              <button
                onClick={() => setStep(2)}
                disabled={queuing}
                className="text-sm transition disabled:opacity-50"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (!queuing) e.currentTarget.style.color = CORAL_SOFT;
                }}
                onMouseLeave={(e) => {
                  if (!queuing) e.currentTarget.style.color = "#8B8794";
                }}
              >
                ← Back to selection
              </button>
              <button
                onClick={handleQueue}
                disabled={queuing || selectedIds.size === 0}
                className="rounded-xl px-6 py-3 font-semibold transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: (queuing || selectedIds.size === 0)
                    ? "rgba(255,107,90,0.3)"
                    : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                  color: "#0F0E1A",
                  boxShadow: (queuing || selectedIds.size === 0) ? "none" : "0 4px 16px -4px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {queuing
                  ? "Queuing videos..."
                  : `Start cloning ${selectedIds.size} video${selectedIds.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}