// ============================================================
// FILE: src/app/dashboard/seo/page.tsx
// ============================================================
// Ripple — YouTube SEO Generator (PRO ONLY)
//
// Brand pass: green pipeline cue in header (matches sidebar),
// coral CTAs throughout, semantic CTR score badges, all dark-only.
//
// Three states preserved:
//   - userTier === "loading" → minimal loading state
//   - userTier === "free" → upgrade prompt with feature preview
//   - Pro user → full generator with all 5 result sections
//
// All logic preserved: AI generation via /api/projects/generate-seo,
// copy-to-clipboard for individual items + copy-all, score-based
// title ranking, keyword analysis grid.
//
// Note: changed "Stripe coming soon" alert to actual link to
// /dashboard/billing since Stripe is already shipped.
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";

/* ── Ripple palette ─────────────────────────────────────────── */
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const AMBER = "#FFA94D";
const GREEN = "#5DD39E";              // SEO pipeline color
const GREEN_BG = "rgba(93,211,158,0.12)";
const GREEN_BORDER = "rgba(93,211,158,0.3)";

type SeoTitle = { text: string; score: number; strategy: string };
type KeywordAnalysis = {
  primary: string;
  secondary: string[];
  longTail: string[];
  difficulty: string;
  searchVolume: string;
};
type SeoData = {
  titles: SeoTitle[];
  description: string;
  tags: string[];
  hashtags: string[];
  keywordAnalysis: KeywordAnalysis;
};

/* ── Helper: CTR score → semantic color ──────────────────────── */
function ctrColor(score: number): string {
  if (score >= 90) return GREEN;       // 90+ = excellent
  if (score >= 80) return AMBER;       // 80-89 = good
  return "#8B8794";                    // <80 = muted
}

function ctrBg(score: number): string {
  if (score >= 90) return "rgba(93,211,158,0.12)";
  if (score >= 80) return "rgba(255,169,77,0.12)";
  return "rgba(139,135,148,0.10)";
}

function ctrBorder(score: number): string {
  if (score >= 90) return "rgba(93,211,158,0.3)";
  if (score >= 80) return "rgba(255,169,77,0.3)";
  return "rgba(139,135,148,0.25)";
}

/* ── Helper: difficulty → semantic color ──────────────────────── */
function difficultyColor(diff: string): { color: string; bg: string; border: string } {
  const d = diff.toLowerCase();
  if (d.includes("low") || d.includes("easy")) {
    return { color: GREEN, bg: "rgba(93,211,158,0.10)", border: "rgba(93,211,158,0.3)" };
  }
  if (d.includes("high") || d.includes("hard")) {
    return { color: "#FF6B6B", bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.3)" };
  }
  return { color: AMBER, bg: "rgba(255,169,77,0.10)", border: "rgba(255,169,77,0.3)" };
}

export default function SeoGeneratorPage() {
  const router = useRouter();
  const userTier = useUserTier();

  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [topicFocused, setTopicFocused] = useState(false);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  function copyAll() {
    if (!seo) return;
    const bestTitle = seo.titles[0]?.text || "";
    const allTags = seo.tags.join(", ");
    const allHashtags = seo.hashtags.join(" ");
    const full = `TITLE:\n${bestTitle}\n\nDESCRIPTION:\n${seo.description}\n\nTAGS:\n${allTags}\n\nHASHTAGS:\n${allHashtags}`;
    copy(full, "all");
  }

  async function generateSeo() {
    if (!topic.trim()) { setError("Enter a video topic"); return; }
    setBusy(true); setError(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/projects/generate-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      setSeo(json.seo);
    } catch (err: any) {
      setError(err?.message || "SEO generation failed");
    } finally {
      setBusy(false);
    }
  }

  /* Reusable styles */
  const sectionLabelStyle: React.CSSProperties = {
    color: "#8B8794",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
  };

  const cardStyle: React.CSSProperties = {
    background: "#16151F",
    border: "1px solid rgba(255,255,255,0.06)",
  };

  const headingStyle: React.CSSProperties = {
    color: "#F5F2ED",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "-0.01em",
  };

  /* ── Loading ──────────────────────────────────────────── */
  if (userTier === "loading") {
    return (
      <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center gap-2" style={{ color: "#8B8794" }}>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Free user: Upgrade prompt ──────────────────────── */
  if (userTier === "free") {
    return (
      <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
        <div className="max-w-4xl mx-auto p-6">

          {/* Header (green pipeline cue) */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: GREEN_BG, border: `1px solid ${GREEN_BORDER}` }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold" style={headingStyle}>SEO Generator</h1>
                <p className="text-sm mt-0.5" style={{ color: "#8B8794" }}>
                  AI-optimized YouTube titles, descriptions, tags &amp; hashtags
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              ← Back
            </button>
          </div>

          {/* Pro Lock card */}
          <div
            className="rounded-2xl p-10 text-center"
            style={{
              background: "#16151F",
              border: `2px dashed ${GREEN_BORDER}`,
            }}
          >
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: GREEN_BG, border: `1px solid ${GREEN_BORDER}` }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2" style={headingStyle}>Pro Feature</h2>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "#8B8794" }}>
              The SEO Generator is a Pro feature. Get AI-optimized titles ranked by CTR potential,
              full descriptions, 30 tags, and trending hashtags for every video.
            </p>
            <button
              onClick={() => router.push("/dashboard/billing")}
              className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: "0 8px 30px -8px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Upgrade to Pro
            </button>
          </div>

          {/* What Pro Includes */}
          <div className="mt-8 rounded-2xl p-6" style={cardStyle}>
            <h3
              className="font-bold mb-4"
              style={{
                color: GREEN,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              What Pro SEO Generator Includes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                "5 title variations ranked by CTR score",
                "Full 2000+ character description",
                "30 optimized tags (broad + long-tail)",
                "5 trending hashtags",
                "Keyword difficulty analysis",
                "One-click copy all to YouTube Studio",
              ].map((feat, i) => (
                <div key={i} className="flex items-start gap-2" style={{ color: "#C7C3C9" }}>
                  <span className="mt-0.5 flex-shrink-0" style={{ color: GREEN }}>✓</span>
                  <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pro user: Full SEO Generator ───────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-4xl mx-auto p-6">

        {/* Header (green pipeline cue) */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: GREEN_BG, border: `1px solid ${GREEN_BORDER}` }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={headingStyle}>SEO Generator</h1>
              <p className="text-sm mt-0.5" style={{ color: "#8B8794" }}>
                AI-optimized YouTube titles, descriptions, tags &amp; hashtags
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#F5F2ED",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            ← Back
          </button>
        </div>

        {/* Input card */}
        <div className="rounded-2xl p-6 mb-6" style={cardStyle}>
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-2"
            style={sectionLabelStyle}
          >
            Video Topic
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onFocus={() => setTopicFocused(true)}
            onBlur={() => setTopicFocused(false)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition mb-4"
            placeholder="e.g. 5 Morning Habits All Billionaires Do"
            onKeyDown={(e) => e.key === "Enter" && generateSeo()}
            style={{
              background: "#0F0E1A",
              border: topicFocused
                ? "1px solid rgba(255,107,90,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              color: "#F5F2ED",
              boxShadow: topicFocused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
            }}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generateSeo}
              disabled={busy || !topic.trim()}
              className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: busy || !topic.trim()
                  ? "rgba(255,107,90,0.3)"
                  : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: busy || !topic.trim() ? "none" : "0 4px 14px -2px rgba(255,107,90,0.4)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              {busy ? "Analyzing & Generating..." : seo ? "Regenerate SEO" : "Generate SEO"}
            </button>
            {seo && (
              <button
                onClick={copyAll}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{
                  background: copied === "all" ? "rgba(93,211,158,0.10)" : "rgba(255,255,255,0.04)",
                  border: copied === "all" ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,255,255,0.1)",
                  color: copied === "all" ? GREEN : "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {copied === "all" ? "Copied All ✓" : "Copy All to Clipboard"}
              </button>
            )}
          </div>

          {error && (
            <div
              className="mt-3 p-3 rounded-lg text-sm"
              style={{
                background: "rgba(255,107,107,0.10)",
                border: "1px solid rgba(255,107,107,0.3)",
                color: "#FF6B6B",
              }}
            >
              {error}
            </div>
          )}

          {busy && (
            <div
              className="flex items-center gap-2 text-sm mt-3"
              style={{ color: CORAL_SOFT, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing keywords &amp; generating optimized metadata...
            </div>
          )}
        </div>

        {/* Results */}
        {seo && (
          <div className="space-y-5">

            {/* ── Titles (ranked by CTR) ──────────────────── */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <h3 className="font-bold mb-4" style={headingStyle}>
                Title Variations <span style={{ color: "#8B8794", fontWeight: 400 }}>(ranked by CTR)</span>
              </h3>
              <div className="space-y-2">
                {seo.titles.map((t, i) => {
                  const isTop = i === 0;
                  const isCopied = copied === "title-" + i;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all"
                      style={{
                        background: isTop ? "rgba(93,211,158,0.06)" : "rgba(255,255,255,0.02)",
                        border: isTop ? `1px solid ${GREEN_BORDER}` : "1px solid rgba(255,255,255,0.06)",
                      }}
                      onClick={() => copy(t.text, "title-" + i)}
                      onMouseEnter={(e) => {
                        if (!isTop) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isTop) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }}
                    >
                      {/* Score badge */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{
                            background: ctrBg(t.score),
                            color: ctrColor(t.score),
                            border: `1px solid ${ctrBorder(t.score)}`,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {t.score}
                        </div>
                      </div>

                      {/* Title content */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-semibold"
                          style={{
                            color: "#F5F2ED",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          {t.text}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "#8B8794" }}>
                          {t.strategy}
                        </div>
                        <div
                          className="text-[10px] mt-1"
                          style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {t.text.length} chars
                        </div>
                      </div>

                      {/* Copy indicator */}
                      <div
                        className="flex-shrink-0 text-xs"
                        style={{
                          color: isCopied ? GREEN : "#5A5762",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        {isCopied ? "Copied ✓" : "Click to copy"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Description ───────────────────────────────── */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold" style={headingStyle}>Description</h3>
                <button
                  onClick={() => copy(seo.description, "desc")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{
                    background: copied === "desc" ? "rgba(93,211,158,0.10)" : "rgba(255,255,255,0.04)",
                    border: copied === "desc" ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    color: copied === "desc" ? GREEN : "#C7C3C9",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {copied === "desc" ? "Copied ✓" : "Copy Description"}
                </button>
              </div>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg p-4 max-h-[400px] overflow-y-auto"
                style={{
                  background: "#0F0E1A",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "#C7C3C9",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {seo.description}
              </div>
              <div
                className="text-[10px] mt-2"
                style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {seo.description.length} characters
              </div>
            </div>

            {/* ── Tags ──────────────────────────────────────── */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold" style={headingStyle}>
                  Tags{" "}
                  <span style={{ color: "#8B8794", fontFamily: "'JetBrains Mono', monospace", fontWeight: 400 }}>
                    ({seo.tags.length})
                  </span>
                </h3>
                <button
                  onClick={() => copy(seo.tags.join(", "), "tags")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{
                    background: copied === "tags" ? "rgba(93,211,158,0.10)" : "rgba(255,255,255,0.04)",
                    border: copied === "tags" ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    color: copied === "tags" ? GREEN : "#C7C3C9",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {copied === "tags" ? "Copied ✓" : "Copy All Tags"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {seo.tags.map((tag, i) => {
                  const isCopied = copied === "tag-" + i;
                  return (
                    <button
                      key={i}
                      onClick={() => copy(tag, "tag-" + i)}
                      className="px-2.5 py-1 rounded-full text-xs transition"
                      style={{
                        background: isCopied ? "rgba(93,211,158,0.10)" : "rgba(255,107,90,0.08)",
                        border: isCopied ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,107,90,0.2)",
                        color: isCopied ? GREEN : CORAL_SOFT,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div
                className="text-[10px] mt-2"
                style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}
              >
                Total: {seo.tags.join(", ").length} chars (YouTube max: 500)
              </div>
            </div>

            {/* ── Hashtags ──────────────────────────────────── */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold" style={headingStyle}>Hashtags</h3>
                <button
                  onClick={() => copy(seo.hashtags.join(" "), "hashtags")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{
                    background: copied === "hashtags" ? "rgba(93,211,158,0.10)" : "rgba(255,255,255,0.04)",
                    border: copied === "hashtags" ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    color: copied === "hashtags" ? GREEN : "#C7C3C9",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  {copied === "hashtags" ? "Copied ✓" : "Copy Hashtags"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {seo.hashtags.map((h, i) => {
                  const isCopied = copied === "ht-" + i;
                  return (
                    <button
                      key={i}
                      onClick={() => copy(h, "ht-" + i)}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition"
                      style={{
                        background: isCopied ? "rgba(93,211,158,0.10)" : "rgba(255,107,90,0.10)",
                        border: isCopied ? "1px solid rgba(93,211,158,0.3)" : "1px solid rgba(255,107,90,0.25)",
                        color: isCopied ? GREEN : CORAL_SOFT,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
              <div
                className="text-[10px] mt-2"
                style={{ color: "#5A5762", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
              >
                YouTube shows first 3 hashtags above your video title
              </div>
            </div>

            {/* ── Keyword Analysis ──────────────────────────── */}
            {seo.keywordAnalysis && (() => {
              const diffStyle = difficultyColor(seo.keywordAnalysis.difficulty);
              return (
                <div className="rounded-2xl p-6" style={cardStyle}>
                  <h3 className="font-bold mb-4" style={headingStyle}>Keyword Analysis</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {/* Primary Keyword */}
                    <div>
                      <div
                        className="text-xs mb-1 uppercase tracking-wider font-semibold"
                        style={sectionLabelStyle}
                      >
                        Primary Keyword
                      </div>
                      <div
                        className="text-lg font-semibold"
                        style={{ color: GREEN, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                      >
                        {seo.keywordAnalysis.primary}
                      </div>
                    </div>

                    {/* Difficulty */}
                    <div>
                      <div
                        className="text-xs mb-1 uppercase tracking-wider font-semibold"
                        style={sectionLabelStyle}
                      >
                        Difficulty
                      </div>
                      <span
                        className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background: diffStyle.bg,
                          color: diffStyle.color,
                          border: `1px solid ${diffStyle.border}`,
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        {seo.keywordAnalysis.difficulty}
                      </span>
                    </div>

                    {/* Search Volume */}
                    <div>
                      <div
                        className="text-xs mb-1 uppercase tracking-wider font-semibold"
                        style={sectionLabelStyle}
                      >
                        Est. Search Volume
                      </div>
                      <div
                        className="font-semibold"
                        style={{
                          color: "#F5F2ED",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {seo.keywordAnalysis.searchVolume}
                      </div>
                    </div>

                    {/* Secondary Keywords */}
                    <div>
                      <div
                        className="text-xs mb-1 uppercase tracking-wider font-semibold"
                        style={sectionLabelStyle}
                      >
                        Secondary Keywords
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {seo.keywordAnalysis.secondary.map((k, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              color: "#C7C3C9",
                              border: "1px solid rgba(255,255,255,0.08)",
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
                            }}
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Long-Tail Keywords (full width) */}
                    <div className="sm:col-span-2">
                      <div
                        className="text-xs mb-1 uppercase tracking-wider font-semibold"
                        style={sectionLabelStyle}
                      >
                        Long-Tail Keywords
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {seo.keywordAnalysis.longTail.map((k, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              background: "rgba(255,107,90,0.08)",
                              color: CORAL_SOFT,
                              border: "1px solid rgba(255,107,90,0.20)",
                              fontFamily: "'Space Grotesk', system-ui, sans-serif",
                            }}
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tips when no results */}
        {!seo && !busy && (
          <div className="rounded-2xl p-6" style={cardStyle}>
            <h3
              className="font-bold mb-3 flex items-center gap-2"
              style={{
                color: GREEN,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              <span>🎯</span> How It Works
            </h3>
            <div className="text-sm space-y-1.5" style={{ color: "#C7C3C9" }}>
              <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                <span style={{ color: GREEN, fontFamily: "'JetBrains Mono', monospace" }}>1.</span>{" "}
                Enter your video topic — AI analyzes keywords and competition
              </p>
              <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                <span style={{ color: GREEN, fontFamily: "'JetBrains Mono', monospace" }}>2.</span>{" "}
                Get 5 title options ranked by click-through potential (CTR score)
              </p>
              <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                <span style={{ color: GREEN, fontFamily: "'JetBrains Mono', monospace" }}>3.</span>{" "}
                Full description optimized for YouTube search with timestamps template
              </p>
              <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                <span style={{ color: GREEN, fontFamily: "'JetBrains Mono', monospace" }}>4.</span>{" "}
                30 tags mixing broad, specific, and long-tail keywords
              </p>
              <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                <span style={{ color: GREEN, fontFamily: "'JetBrains Mono', monospace" }}>5.</span>{" "}
                Copy everything to YouTube Studio with one click
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}