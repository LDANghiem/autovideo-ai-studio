// src/app/dashboard/thumbnails/page.tsx
"use client";

/* ============================================================
   AutoVideo AI Studio — Thumbnail Creator v2 (PRO ONLY)
   
   ✅ Generates 4 VARIATIONS at once (different angles)
   ✅ 2x2 grid comparison view
   ✅ 8 style presets with visual previews
   ✅ Download any / regenerate
   ✅ History of previous batches
   🔒 Gated: Free users see upgrade prompt
============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";

/* ============================================================
   Style Presets
============================================================ */
const STYLE_PRESETS = [
  { id: "bold_red", name: "Bold Red", preview: "bg-red-600 text-white", textColor: "#FFFFFF", strokeColor: "#CC0000", bgGradient: true, desc: "Classic YouTube" },
  { id: "clean_white", name: "Clean White", preview: "bg-white text-gray-900 border", textColor: "#FFFFFF", strokeColor: "#000000", bgGradient: true, desc: "Professional" },
  { id: "neon_glow", name: "Neon", preview: "bg-purple-900 text-cyan-400", textColor: "#00FFFF", strokeColor: "#FF00FF", bgGradient: false, desc: "Eye-catching" },
  { id: "gold_luxury", name: "Gold", preview: "bg-gray-900 text-yellow-400", textColor: "#FFD700", strokeColor: "#000000", bgGradient: true, desc: "Premium" },
  { id: "fire_orange", name: "Fire", preview: "bg-orange-600 text-white", textColor: "#FF6600", strokeColor: "#000000", bgGradient: true, desc: "Energetic" },
  { id: "electric_blue", name: "Electric", preview: "bg-blue-700 text-white", textColor: "#00BFFF", strokeColor: "#000033", bgGradient: true, desc: "Tech" },
  { id: "dark_minimal", name: "Dark", preview: "bg-gray-800 text-gray-100", textColor: "#F0F0F0", strokeColor: "#1A1A1A", bgGradient: true, desc: "Minimal" },
  { id: "green_nature", name: "Nature", preview: "bg-green-700 text-white", textColor: "#90EE90", strokeColor: "#003300", bgGradient: true, desc: "Fresh" },
];

type ThumbResult = {
  thumbnailUrl: string;
  titleText: string;
  textPosition: string;
  angle: string;
};

/* ============================================================
   YouTube Preview Simulator Component
   Shows thumbnail in real YouTube contexts
============================================================ */
function YouTubePreview({ thumb, videoTitle }: { thumb: ThumbResult; videoTitle: string }) {
  const [mode, setMode] = useState<"search" | "home" | "sidebar" | "mobile">("home");

  const channelName = "Your Channel";
  const views = "12K views";
  const time = "3 days ago";
  const duration = "10:24";

  const modes = [
    { id: "home" as const, label: "Home Feed" },
    { id: "search" as const, label: "Search" },
    { id: "sidebar" as const, label: "Suggested" },
    { id: "mobile" as const, label: "Mobile" },
  ];

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={"px-3 py-1.5 text-xs font-medium rounded-md transition-all " + (mode === m.id ? "bg-white shadow text-black" : "text-gray-500 hover:text-gray-700")}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Simulated YouTube background */}
      <div className={"rounded-lg p-4 " + (mode === "mobile" ? "bg-black max-w-[375px] mx-auto" : "bg-[#f1f1f1]")}>

        {/* === HOME FEED === */}
        {mode === "home" && (
          <div className="max-w-[360px]">
            {/* Thumbnail with duration badge */}
            <div className="relative rounded-xl overflow-hidden">
              <img src={thumb.thumbnailUrl} alt="" className="w-full" />
              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
                {duration}
              </div>
            </div>
            {/* Video info */}
            <div className="flex gap-2.5 mt-3">
              <div className="w-9 h-9 rounded-full bg-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight line-clamp-2 text-[#0f0f0f]">
                  {videoTitle}
                </div>
                <div className="text-xs text-[#606060] mt-1">{channelName}</div>
                <div className="text-xs text-[#606060]">{views} · {time}</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-gray-400 text-center">YouTube Home Feed — Desktop</div>
          </div>
        )}

        {/* === SEARCH RESULTS === */}
        {mode === "search" && (
          <div className="space-y-3">
            {/* Search bar mockup */}
            <div className="flex items-center gap-2 bg-white border rounded-full px-4 py-2 max-w-[500px]">
              <span className="text-gray-400 text-sm">🔍</span>
              <span className="text-sm text-gray-700">{videoTitle.toLowerCase()}</span>
            </div>
            {/* Search result row */}
            <div className="flex gap-4 max-w-[700px]">
              <div className="relative flex-shrink-0 w-[360px] rounded-xl overflow-hidden">
                <img src={thumb.thumbnailUrl} alt="" className="w-full" />
                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
                  {duration}
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-lg font-normal leading-snug text-[#0f0f0f] line-clamp-2">
                  {videoTitle}
                </div>
                <div className="text-xs text-[#606060] mt-1">{views} · {time}</div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-6 h-6 rounded-full bg-gray-300" />
                  <span className="text-xs text-[#606060]">{channelName}</span>
                </div>
                <div className="text-xs text-[#606060] mt-2 line-clamp-2">
                  In this video, we explore the topic of {videoTitle.toLowerCase()}. Watch to learn more...
                </div>
              </div>
            </div>
            {/* Fake second result (dimmed) */}
            <div className="flex gap-4 max-w-[700px] opacity-30">
              <div className="flex-shrink-0 w-[360px] h-[90px] rounded-xl bg-gray-300" />
              <div className="flex-1 pt-1">
                <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
            <div className="mt-2 text-[10px] text-gray-400 text-center">YouTube Search Results — Desktop</div>
          </div>
        )}

        {/* === SUGGESTED SIDEBAR === */}
        {mode === "sidebar" && (
          <div className="flex gap-6 max-w-[700px]">
            {/* Main video area (placeholder) */}
            <div className="flex-1">
              <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center">
                <span className="text-white/30 text-3xl">▶</span>
              </div>
              <div className="mt-2 text-sm font-medium text-[#0f0f0f]">Currently watching another video...</div>
              <div className="text-xs text-[#606060]">Some Channel · 45K views</div>
            </div>
            {/* Suggested sidebar */}
            <div className="w-[300px] flex-shrink-0 space-y-3">
              <div className="text-xs font-medium text-[#0f0f0f] mb-1">Up next</div>
              {/* YOUR video */}
              <div className="flex gap-2 bg-blue-50/50 rounded-lg p-1.5 border border-blue-200">
                <div className="relative flex-shrink-0 w-[168px] rounded overflow-hidden">
                  <img src={thumb.thumbnailUrl} alt="" className="w-full" />
                  <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[8px] px-1 rounded">
                    {duration}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium leading-tight line-clamp-2 text-[#0f0f0f]">
                    {videoTitle}
                  </div>
                  <div className="text-[10px] text-[#606060] mt-0.5">{channelName}</div>
                  <div className="text-[10px] text-[#606060]">{views}</div>
                </div>
              </div>
              {/* Other suggested (dimmed) */}
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex gap-2 opacity-30">
                  <div className="flex-shrink-0 w-[168px] h-[50px] rounded bg-gray-300" />
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-full mb-1" />
                    <div className="h-2 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-gray-400 text-center">Suggested Sidebar — Desktop</div>
          </div>
        )}

        {/* === MOBILE FEED === */}
        {mode === "mobile" && (
          <div className="max-w-[375px] mx-auto">
            {/* Status bar mockup */}
            <div className="flex justify-between items-center px-4 py-1.5 text-white text-[10px]">
              <span>9:41</span>
              <span>📶 🔋</span>
            </div>
            {/* YouTube mobile header */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-red-600 text-lg font-bold">▶</span>
                <span className="text-white text-sm font-semibold">YouTube</span>
              </div>
              <div className="flex gap-3 text-white/60 text-sm">
                <span>🔍</span>
                <span>🔔</span>
                <div className="w-6 h-6 rounded-full bg-gray-600" />
              </div>
            </div>
            {/* Video card */}
            <div className="px-0">
              <div className="relative">
                <img src={thumb.thumbnailUrl} alt="" className="w-full" />
                <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                  {duration}
                </div>
              </div>
              <div className="flex gap-3 px-3 mt-3">
                <div className="w-9 h-9 rounded-full bg-gray-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight text-white line-clamp-2">
                    {videoTitle}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {channelName} · {views} · {time}
                  </div>
                </div>
                <span className="text-gray-500 text-sm mt-0.5">⋮</span>
              </div>
            </div>
            {/* Fake next video (dimmed) */}
            <div className="px-0 mt-5 opacity-30">
              <div className="w-full h-[100px] bg-gray-700" />
              <div className="flex gap-3 px-3 mt-2">
                <div className="w-9 h-9 rounded-full bg-gray-600" />
                <div>
                  <div className="h-3 bg-gray-600 rounded w-48 mb-1" />
                  <div className="h-2 bg-gray-700 rounded w-32" />
                </div>
              </div>
            </div>
            <div className="mt-4 text-[10px] text-gray-500 text-center pb-2">YouTube Mobile Feed — iPhone</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThumbnailCreatorPage() {
  const router = useRouter();
  const userTier = useUserTier();

  // Mode tab
  const [mode, setMode] = useState<"ai" | "face">("ai");

  const [topic, setTopic] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("bold_red");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const [thumbnails, setThumbnails] = useState<ThumbResult[]>([]);
  const [history, setHistory] = useState<ThumbResult[][]>([]);
  const [previewThumb, setPreviewThumb] = useState<ThumbResult | null>(null);

  // Face upload state
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [facePosition, setFacePosition] = useState<"left" | "right">("left");
  const [faceTopic, setFaceTopic] = useState("");
  const [faceTitle, setFaceTitle] = useState("");
  const [faceStyle, setFaceStyle] = useState("bold_red");
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceProgress, setFaceProgress] = useState("");
  const [faceResult, setFaceResult] = useState<{ thumbnailUrl: string; titleText: string } | null>(null);
  const [faceHistory, setFaceHistory] = useState<{ thumbnailUrl: string; titleText: string }[]>([]);

  function handleFaceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaceFile(file);
    const reader = new FileReader();
    reader.onload = () => setFacePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function generateFaceThumbnail() {
    if (!facePreview) { setError("Upload a photo of yourself first"); return; }
    if (!faceTopic.trim()) { setError("Enter a video topic"); return; }

    setFaceBusy(true); setError(null);
    setFaceProgress("Step 1/4: Removing background from your photo...");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const preset = STYLE_PRESETS.find((s) => s.id === faceStyle) || STYLE_PRESETS[0];

      setFaceProgress("Step 2/4: Generating AI scene background...");

      const res = await fetch("/api/projects/generate-thumbnail-face", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          topic: faceTopic.trim(),
          title: faceTitle.trim() || undefined,
          faceImageBase64: facePreview,
          facePosition,
          textColor: preset.textColor,
          strokeColor: preset.strokeColor,
        }),
      });

      setFaceProgress("Step 3/4: Compositing your face onto the scene...");

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      setFaceProgress("Step 4/4: Done!");
      const result = { thumbnailUrl: json.thumbnailUrl, titleText: json.titleText };
      setFaceResult(result);
      setFaceHistory((prev) => [result, ...prev.slice(0, 9)]);
      setFaceProgress("");
    } catch (err: any) {
      setError(err?.message || "Face thumbnail generation failed");
      setFaceProgress("");
    } finally {
      setFaceBusy(false);
    }
  }

  async function generateThumbnails() {
    if (!topic.trim()) { setError("Please enter a topic"); return; }

    setBusy(true);
    setError(null);
    setProgress("Creating 4 unique concepts with AI...");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const preset = STYLE_PRESETS.find((s) => s.id === selectedStyle) || STYLE_PRESETS[0];

      setProgress("Generating 4 thumbnail variations (this takes ~30 seconds)...");

      const res = await fetch("/api/projects/generate-thumbnail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          topic: topic.trim(),
          title: customTitle.trim() || undefined,
          count: 4,
          stylePreset: preset.id,
          textColor: preset.textColor,
          strokeColor: preset.strokeColor,
          bgGradient: preset.bgGradient,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      const results: ThumbResult[] = json.thumbnails || [];
      setThumbnails(results);

      if (results.length > 0) {
        setHistory((prev) => [results, ...prev.slice(0, 4)]);
      }

      setProgress("");
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  /* ── Loading state ──────────────────────────────────────── */
  if (userTier === "loading") {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  /* ── Free user: Upgrade prompt ──────────────────────────── */
  if (userTier === "free") {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Thumbnail Creator</h1>
            <p className="text-sm text-gray-500 mt-1">Generate click-worthy YouTube thumbnails with AI</p>
          </div>
          <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2">Back</button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Pro Feature</h2>
          <p className="text-gray-600 mb-4 max-w-md mx-auto">
            The standalone Thumbnail Creator is a Pro feature. Generate unlimited thumbnails with 4 variations, 
            8 style presets, and regenerate as many times as you want.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Free users get 1 free thumbnail per video project.
          </p>
          <button
            className="bg-black text-white rounded-lg px-6 py-3 font-semibold hover:bg-gray-800 transition-colors"
            onClick={() => {
              // TODO: Redirect to Stripe checkout or pricing page
              alert("Stripe payment integration coming soon! For now, upgrade via the Settings page.");
            }}
          >
            Upgrade to Pro
          </button>
          <p className="text-xs text-gray-400 mt-3">Cancel anytime. Instant access after upgrade.</p>
        </div>

        {/* Preview of what Pro gets */}
        <div className="mt-8 border rounded-xl p-5 bg-gray-50">
          <h3 className="font-semibold mb-3">What Pro Includes:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Generate 4 unique thumbnail variations per click</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>8 professional text style presets</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Unlimited regenerations</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Standalone tool — no video project needed</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Custom title text override</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Batch history — compare previous generations</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pro user: Full Thumbnail Creator ───────────────────── */

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Thumbnail Creator</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate click-worthy YouTube thumbnail variations with one click
          </p>
        </div>
        <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2">Back</button>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setMode("ai"); setError(null); }}
          className={"px-4 py-2 rounded-md text-sm font-medium transition-all " + (mode === "ai" ? "bg-white shadow text-black" : "text-gray-500 hover:text-gray-700")}
        >
          🎨 AI Generated
        </button>
        <button
          onClick={() => { setMode("face"); setError(null); }}
          className={"px-4 py-2 rounded-md text-sm font-medium transition-all " + (mode === "face" ? "bg-white shadow text-black" : "text-gray-500 hover:text-gray-700")}
        >
          🧑 Face Upload
        </button>
      </div>

      {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</div>}

      {/* ============================================================
          TAB 1: AI GENERATED (original feature)
      ============================================================ */}
      {mode === "ai" && (<>

      {/* Form */}
      <div className="border rounded-xl p-5 bg-white mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="font-medium">Video Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g. 5 Morning Habits That Changed My Life"
            />
          </div>
          <div className="space-y-2">
            <label className="font-medium">Custom Title <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g. WAKE UP AT 5AM"
              maxLength={40}
            />
          </div>
        </div>

        {/* Style Presets - compact */}
        <div className="space-y-2">
          <label className="font-medium text-sm">Text Style</label>
          <div className="flex flex-wrap gap-2">
            {STYLE_PRESETS.map((preset) => {
              const isActive = selectedStyle === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedStyle(preset.id)}
                  className={
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 transition-all text-sm " +
                    (isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")
                  }
                >
                  <span className={"w-5 h-5 rounded text-[8px] font-black flex items-center justify-center " + preset.preview}>A</span>
                  <span className={isActive ? "font-semibold text-blue-700" : "text-gray-700"}>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={generateThumbnails}
            disabled={busy}
            className="bg-black text-white rounded px-5 py-2.5 font-semibold disabled:opacity-50"
          >
            {busy ? "Generating 4 thumbnails..." : "Generate 4 Thumbnails"}
          </button>

          {thumbnails.length > 0 && !busy && (
            <button
              onClick={generateThumbnails}
              className="border-2 border-gray-300 rounded px-4 py-2 font-medium hover:border-gray-400"
            >
              Regenerate All
            </button>
          )}
        </div>

        {progress && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {progress}
          </div>
        )}
      </div>

      {/* Results: 2x2 Grid */}
      {thumbnails.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Pick Your Favorite ({thumbnails.length} variations)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {thumbnails.map((thumb, i) => {
              const isSelected = previewThumb?.thumbnailUrl === thumb.thumbnailUrl;
              return (
                <div
                  key={i}
                  className={"border-2 rounded-xl overflow-hidden bg-white cursor-pointer transition-all " + (isSelected ? "border-blue-500 shadow-md" : "border-transparent hover:border-gray-300")}
                  onClick={() => setPreviewThumb(thumb)}
                >
                  <div className="relative">
                    <img src={thumb.thumbnailUrl} alt={thumb.titleText} className="w-full" />
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded">
                      {thumb.angle}
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded">
                        Previewing
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{thumb.titleText}</div>
                      <div className="text-xs text-gray-400">Click to preview on YouTube</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(thumb.thumbnailUrl);
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "thumbnail-" + (i + 1) + ".jpg";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch { window.open(thumb.thumbnailUrl, "_blank"); }
                        }}
                        className="border rounded px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================
          YouTube Preview Simulator
          Shows how the selected thumbnail looks in real YouTube contexts
      ============================================================ */}
      {previewThumb && (
        <div className="border rounded-xl p-5 bg-white mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">YouTube Preview</h3>
            <button onClick={() => setPreviewThumb(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>

          {/* Tab selector */}
          <YouTubePreview thumb={previewThumb} videoTitle={topic || "My Amazing Video"} />
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="border rounded-xl p-5 bg-white mb-6">
          <h3 className="font-semibold mb-3">Previous Batches</h3>
          {history.slice(1).map((batch, batchIdx) => (
            <div key={batchIdx} className="mb-4">
              <div className="text-xs text-gray-400 mb-2">Batch {batchIdx + 2}</div>
              <div className="grid grid-cols-4 gap-2">
                {batch.map((thumb, i) => (
                  <a key={i} href={thumb.thumbnailUrl} download className="block rounded border overflow-hidden hover:shadow">
                    <img src={thumb.thumbnailUrl} alt={thumb.titleText} className="w-full" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      {thumbnails.length === 0 && !busy && (
        <div className="border rounded-xl p-5 bg-gray-50">
          <h3 className="font-semibold mb-2">How It Works</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>1. Enter your video topic — AI creates 4 unique thumbnail concepts</p>
            <p>2. Each variation has a different visual angle (close-up, epic scene, symbolic, dynamic)</p>
            <p>3. Pick your favorite and download — or regenerate for fresh options</p>
            <p>4. Tip: Try different styles (Neon, Gold, Fire) for different vibes</p>
          </div>
        </div>
      )}

      </>)} {/* End AI Generated Tab */}

      {/* ============================================================
          TAB 2: FACE UPLOAD
      ============================================================ */}
      {mode === "face" && (
        <>
          {/* Face Upload Form */}
          <div className="border rounded-xl p-5 bg-white mb-6 space-y-4">
            {/* Photo upload */}
            <div>
              <label className="font-medium block mb-2">Upload Your Photo</label>
              <div className="flex items-start gap-4">
                {/* Upload area */}
                <label className={"flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-colors w-40 h-40 " + (facePreview ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-gray-400 bg-gray-50")}>
                  {facePreview ? (
                    <img src={facePreview} alt="Your face" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="text-center p-3">
                      <div className="text-2xl mb-1">📸</div>
                      <div className="text-xs text-gray-500">Click to upload</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">JPG, PNG</div>
                    </div>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFaceFileChange} className="hidden" />
                </label>

                {/* Tips */}
                <div className="text-xs text-gray-500 space-y-1 mt-1">
                  <p className="font-medium text-gray-700">Best results:</p>
                  <p>• Clear headshot or upper body</p>
                  <p>• Good lighting, solid background</p>
                  <p>• Expressive face (surprise, excitement)</p>
                  <p>• High resolution (at least 500×500)</p>
                  {facePreview && (
                    <button
                      onClick={() => { setFaceFile(null); setFacePreview(null); }}
                      className="text-red-500 hover:underline mt-1"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Topic + Title */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">Video Topic</label>
                <input
                  value={faceTopic}
                  onChange={(e) => setFaceTopic(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g. How I Made $100K in 30 Days"
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium">Custom Title <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  value={faceTitle}
                  onChange={(e) => setFaceTitle(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g. I DID IT"
                  maxLength={30}
                />
              </div>
            </div>

            {/* Face Position */}
            <div className="space-y-2">
              <label className="font-medium text-sm">Face Position</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFacePosition("left")}
                  className={"flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all " + (facePosition === "left" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}
                >
                  <div className="w-16 h-10 rounded border flex overflow-hidden">
                    <div className="w-1/2 bg-blue-200 flex items-center justify-center text-[10px]">🧑</div>
                    <div className="w-1/2 bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500">TEXT</div>
                  </div>
                  <span className={"text-sm " + (facePosition === "left" ? "font-semibold text-blue-700" : "text-gray-600")}>Face Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFacePosition("right")}
                  className={"flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all " + (facePosition === "right" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}
                >
                  <div className="w-16 h-10 rounded border flex overflow-hidden">
                    <div className="w-1/2 bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500">TEXT</div>
                    <div className="w-1/2 bg-blue-200 flex items-center justify-center text-[10px]">🧑</div>
                  </div>
                  <span className={"text-sm " + (facePosition === "right" ? "font-semibold text-blue-700" : "text-gray-600")}>Face Right</span>
                </button>
              </div>
            </div>

            {/* Text Style */}
            <div className="space-y-2">
              <label className="font-medium text-sm">Text Style</label>
              <div className="flex flex-wrap gap-2">
                {STYLE_PRESETS.map((preset) => {
                  const isActive = faceStyle === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setFaceStyle(preset.id)}
                      className={
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 transition-all text-sm " +
                        (isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")
                      }
                    >
                      <span className={"w-5 h-5 rounded text-[8px] font-black flex items-center justify-center " + preset.preview}>A</span>
                      <span className={isActive ? "font-semibold text-blue-700" : "text-gray-700"}>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <div className="flex items-center gap-3">
              <button
                onClick={generateFaceThumbnail}
                disabled={faceBusy || !facePreview}
                className={"rounded px-5 py-2.5 font-semibold disabled:opacity-50 transition-colors " + (facePreview ? "bg-black text-white hover:bg-gray-800" : "bg-gray-300 text-gray-500 cursor-not-allowed")}
              >
                {faceBusy ? "Generating..." : "Generate Face Thumbnail"}
              </button>
              {faceResult && !faceBusy && (
                <button
                  onClick={generateFaceThumbnail}
                  className="border-2 border-gray-300 rounded px-4 py-2 font-medium hover:border-gray-400"
                >
                  Regenerate
                </button>
              )}
            </div>

            {faceProgress && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {faceProgress}
              </div>
            )}
          </div>

          {/* Face Thumbnail Result */}
          {faceResult && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3">Your Face Thumbnail</h3>
              <div className="border-2 rounded-xl overflow-hidden bg-white max-w-2xl">
                <div className="relative">
                  <img src={faceResult.thumbnailUrl} alt={faceResult.titleText} className="w-full" />
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded">
                    🧑 Face + AI Scene
                  </div>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{faceResult.titleText}</div>
                    <div className="text-xs text-gray-400">Your face composited onto AI-generated scene</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(faceResult.thumbnailUrl);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "face-thumbnail.jpg";
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch { window.open(faceResult.thumbnailUrl, "_blank"); }
                      }}
                      className="border rounded px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setPreviewThumb({
                          thumbnailUrl: faceResult.thumbnailUrl,
                          titleText: faceResult.titleText,
                          textPosition: "center",
                          angle: "Face Upload",
                        });
                      }}
                      className="border rounded px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                    >
                      YouTube Preview
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* YouTube Preview for face thumbnail */}
          {previewThumb && mode === "face" && (
            <div className="border rounded-xl p-5 bg-white mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">YouTube Preview</h3>
                <button onClick={() => setPreviewThumb(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
              </div>
              <YouTubePreview thumb={previewThumb} videoTitle={faceTopic || "My Amazing Video"} />
            </div>
          )}

          {/* Face Thumbnail History */}
          {faceHistory.length > 1 && (
            <div className="border rounded-xl p-5 bg-white mb-6">
              <h3 className="font-semibold mb-3">Previous Face Thumbnails</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {faceHistory.slice(1).map((thumb, i) => (
                  <a key={i} href={thumb.thumbnailUrl} download className="block rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
                    <img src={thumb.thumbnailUrl} alt={thumb.titleText} className="w-full" />
                    <div className="p-1.5 text-xs text-gray-600 truncate">{thumb.titleText}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Face Upload Tips */}
          {!faceResult && !faceBusy && (
            <div className="border rounded-xl p-5 bg-gray-50">
              <h3 className="font-semibold mb-2">How Face Thumbnails Work</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>1. Upload a photo of yourself — AI removes the background automatically</p>
                <p>2. Enter your video topic — AI generates a cinematic scene related to your content</p>
                <p>3. Your face is composited onto the scene with bold title text overlay</p>
                <p>4. Choose face position (left/right) and text style to match your brand</p>
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs font-semibold text-blue-700 mb-1">💡 Pro Tip</div>
                <div className="text-xs text-blue-600">
                  Use a photo with an expressive face (surprised, excited, focused) — thumbnails with strong emotion 
                  get up to 38% higher click-through rates according to research on 300K+ YouTube videos.
                </div>
              </div>
            </div>
          )}
        </>
      )} {/* End Face Upload Tab */}
    </div>
  );
}