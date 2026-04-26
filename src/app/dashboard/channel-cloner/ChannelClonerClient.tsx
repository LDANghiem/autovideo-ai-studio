"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_SELECTION = 10;

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

    // Rank by views desc
    list.sort((a, b) => b.views - a.views);
    return list;
  }, [scrapeResult, minViews, minDuration, maxDuration, postedWithinDays]);

  function toggleSelect(videoId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        if (next.size >= MAX_SELECTION) return prev; // enforce cap
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

      // Success — go to library
      router.push("/dashboard/library");
    } catch (err: any) {
      setQueueError(err?.message || "Something went wrong");
    } finally {
      setQueuing(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Channel Cloner</h1>
          <p className="text-gray-400">
            Scrape a YouTube channel, pick top videos, and batch ReCreate them — all at once.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                  step === n
                    ? "bg-violet-500 text-white"
                    : step > n
                    ? "bg-violet-500/30 text-violet-300"
                    : "bg-white/10 text-gray-500"
                }`}
              >
                {step > n ? "✓" : n}
              </div>
              <span
                className={`text-sm ${
                  step === n ? "text-white" : "text-gray-500"
                }`}
              >
                {n === 1 ? "Enter channel" : n === 2 ? "Pick videos" : "Confirm"}
              </span>
              {n < 3 && <div className="w-8 h-px bg-white/10 mx-2" />}
            </div>
          ))}
        </div>

        {/* Step 1: Input */}
        {step === 1 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold mb-4">
              Paste a YouTube channel URL or handle
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              We&apos;ll pull up to 50 most recent videos. Try{" "}
              <code className="text-violet-300">@mkbhd</code> or{" "}
              <code className="text-violet-300">
                youtube.com/@veritasium
              </code>
              .
            </p>

            <input
              type="text"
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleScrape()}
              placeholder="@channelhandle or https://youtube.com/@..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none transition mb-4"
              disabled={scraping}
            />

            {scrapeError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm">
                {scrapeError}
              </div>
            )}

            <button
              onClick={handleScrape}
              disabled={scraping || !channelInput.trim()}
              className="w-full md:w-auto bg-violet-500 hover:bg-violet-600 disabled:bg-violet-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-6 py-3 transition"
            >
              {scraping ? "Scraping channel..." : "Scrape channel"}
            </button>

            {scraping && (
              <p className="text-xs text-gray-500 mt-4">
                This can take 10–30 seconds on first scrape.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Preview + Select */}
        {step === 2 && scrapeResult && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">
                  {scrapeResult.channel_title}
                </div>
                <div className="text-sm text-gray-400">
                  {scrapeResult.videos.length} videos scraped
                  {scrapeResult.cached && (
                    <span className="ml-2 text-violet-400">
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
                className="text-sm text-gray-400 hover:text-white transition"
              >
                ← Try another channel
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="text-sm font-semibold mb-4 text-gray-300">
                Filters
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Min views
                  </label>
                  <input
                    type="number"
                    value={minViews || ""}
                    onChange={e => setMinViews(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Min duration (sec)
                  </label>
                  <input
                    type="number"
                    value={minDuration || ""}
                    onChange={e => setMinDuration(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Max duration (sec)
                  </label>
                  <input
                    type="number"
                    value={maxDuration || ""}
                    onChange={e => setMaxDuration(Number(e.target.value) || 0)}
                    placeholder="0 = any"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Posted within (days)
                  </label>
                  <input
                    type="number"
                    value={postedWithinDays || ""}
                    onChange={e =>
                      setPostedWithinDays(Number(e.target.value) || 0)
                    }
                    placeholder="0 = any"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => selectTopN(10)}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition"
                >
                  Select top 10
                </button>
                <button
                  onClick={() => selectTopN(5)}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition"
                >
                  Select top 5
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition"
                >
                  Clear
                </button>
                <div className="ml-auto text-sm">
                  <span
                    className={
                      selectedIds.size >= MAX_SELECTION
                        ? "text-amber-400 font-semibold"
                        : "text-violet-300 font-semibold"
                    }
                  >
                    {selectedIds.size} / {MAX_SELECTION}
                  </span>{" "}
                  <span className="text-gray-500">selected</span>
                </div>
              </div>
            </div>

            {/* Video grid */}
            {filteredVideos.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center text-gray-400">
                No videos match your filters. Try widening the criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map(v => {
                  const selected = selectedIds.has(v.video_id);
                  const atCap =
                    !selected && selectedIds.size >= MAX_SELECTION;
                  const daysAgo = daysSinceUpload(v.upload_date);
                  return (
                    <button
                      key={v.video_id}
                      onClick={() => toggleSelect(v.video_id)}
                      disabled={atCap}
                      className={`text-left rounded-xl overflow-hidden border transition relative ${
                        selected
                          ? "border-violet-500 bg-violet-500/10"
                          : atCap
                          ? "border-white/10 bg-white/5 opacity-40 cursor-not-allowed"
                          : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <div className="aspect-video bg-black/40 relative">
                        {v.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className="absolute bottom-2 right-2 bg-black/80 text-xs px-2 py-0.5 rounded">
                          {formatDuration(v.duration_seconds)}
                        </div>
                        {selected && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center text-xs font-bold">
                            ✓
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-medium line-clamp-2 mb-2">
                          {v.title}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{formatViews(v.views)} views</span>
                          {daysAgo !== null && <span>{daysAgo}d ago</span>}
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
                className="bg-violet-500 hover:bg-violet-600 disabled:bg-violet-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-6 py-3 transition"
              >
                Proceed to confirm ({selectedIds.size}) →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && scrapeResult && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-2">Ready to clone</h2>
              <p className="text-gray-400 text-sm mb-6">
                {selectedVideos.length} videos from{" "}
                <span className="text-white font-medium">
                  {scrapeResult.channel_title}
                </span>{" "}
                will be queued through the ReCreate pipeline.
              </p>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {selectedVideos.map(v => (
                  <div
                    key={v.video_id}
                    className="flex items-center gap-3 bg-black/20 rounded-lg p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-20 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {v.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatViews(v.views)} views ·{" "}
                        {formatDuration(v.duration_seconds)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {queueError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
                {queueError}
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                disabled={queuing}
                className="text-gray-400 hover:text-white transition"
              >
                ← Back to selection
              </button>
              <button
                onClick={handleQueue}
                disabled={queuing || selectedIds.size === 0}
                className="bg-violet-500 hover:bg-violet-600 disabled:bg-violet-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-6 py-3 transition"
              >
                {queuing
                  ? "Queuing videos..."
                  : `Start cloning ${selectedIds.size} video${
                      selectedIds.size === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}