// src/app/dashboard/seo/page.tsx
"use client";

/* ============================================================
   AutoVideo AI Studio — YouTube SEO Generator (PRO ONLY)
   
   ✅ 5 title variations ranked by CTR score
   ✅ Full description with timestamps placeholder
   ✅ 30 relevant tags (click to copy)
   ✅ 5 hashtags
   ✅ Keyword analysis
   🔒 Gated: Free/Creator users see upgrade prompt
============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";

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

export default function SeoGeneratorPage() {
  const router = useRouter();
  const userTier = useUserTier();

  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  /* ── Loading ──────────────────────────────────────────── */
  if (userTier === "loading") {
    return <div className="max-w-4xl mx-auto p-6 text-sm text-gray-400">Loading...</div>;
  }

  /* ── Free user: Upgrade prompt ──────────────────────── */
  if (userTier === "free") {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">SEO Generator</h1>
            <p className="text-sm text-gray-500 mt-1">Generate optimized YouTube titles, descriptions, tags & hashtags</p>
          </div>
          <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2 text-sm">Back</button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Pro Feature</h2>
          <p className="text-gray-600 mb-4 max-w-md mx-auto">
            The SEO Generator is a Pro feature. Get AI-optimized titles ranked by CTR potential,
            full descriptions, 30 tags, and trending hashtags for every video.
          </p>
          <button
            className="bg-black text-white rounded-lg px-6 py-3 font-semibold hover:bg-gray-800"
            onClick={() => alert("Stripe payment integration coming soon!")}
          >
            Upgrade to Pro
          </button>
        </div>

        <div className="mt-8 border rounded-xl p-5 bg-gray-50">
          <h3 className="font-semibold mb-3">What Pro SEO Generator Includes:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>5 title variations ranked by CTR score</span></div>
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>Full 2000+ character description</span></div>
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>30 optimized tags (broad + long-tail)</span></div>
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>5 trending hashtags</span></div>
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>Keyword difficulty analysis</span></div>
            <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>One-click copy all to YouTube Studio</span></div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pro user: Full SEO Generator ───────────────────── */
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">SEO Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate optimized YouTube titles, descriptions, tags & hashtags</p>
        </div>
        <button onClick={() => router.push("/dashboard")} className="border rounded px-3 py-2 text-sm">Back</button>
      </div>

      {/* Input */}
      <div className="border rounded-xl p-5 bg-white mb-6">
        <label className="font-medium block mb-2">Video Topic</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full border rounded px-3 py-2.5 mb-3"
          placeholder="e.g. 5 Morning Habits All Billionaires Do"
          onKeyDown={(e) => e.key === "Enter" && generateSeo()}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={generateSeo}
            disabled={busy}
            className="bg-black text-white rounded px-5 py-2.5 font-semibold disabled:opacity-50"
          >
            {busy ? "Analyzing & Generating..." : seo ? "Regenerate SEO" : "Generate SEO"}
          </button>
          {seo && (
            <button onClick={copyAll} className="border-2 border-gray-300 rounded px-4 py-2 font-medium hover:border-gray-400 text-sm">
              {copied === "all" ? "Copied All ✅" : "Copy All to Clipboard"}
            </button>
          )}
        </div>
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing keywords & generating optimized metadata...
          </div>
        )}
      </div>

      {/* Results */}
      {seo && (
        <div className="space-y-5">

          {/* ── Titles ────────────────────────────────────── */}
          <div className="border rounded-xl p-5 bg-white">
            <h3 className="font-semibold mb-3">Title Variations (ranked by CTR)</h3>
            <div className="space-y-2">
              {seo.titles.map((t, i) => (
                <div
                  key={i}
                  className={"flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors " + (i === 0 ? "border-green-300 bg-green-50/50" : "border-gray-200")}
                  onClick={() => copy(t.text, "title-" + i)}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold " +
                      (t.score >= 90 ? "bg-green-100 text-green-700" :
                       t.score >= 80 ? "bg-yellow-100 text-yellow-700" :
                       "bg-gray-100 text-gray-600")
                    }>
                      {t.score}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t.text}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.strategy}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{t.text.length} chars</div>
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-400">
                    {copied === "title-" + i ? "Copied ✅" : "Click to copy"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Description ───────────────────────────────── */}
          <div className="border rounded-xl p-5 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Description</h3>
              <button
                onClick={() => copy(seo.description, "desc")}
                className="border rounded px-3 py-1 text-xs font-medium hover:bg-gray-50"
              >
                {copied === "desc" ? "Copied ✅" : "Copy Description"}
              </button>
            </div>
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap bg-gray-50 border rounded-lg p-4 max-h-[400px] overflow-y-auto"
              style={{ fontFamily: "monospace, 'Courier New'" }}
            >
              {seo.description}
            </div>
            <div className="text-[10px] text-gray-400 mt-2">{seo.description.length} characters</div>
          </div>

          {/* ── Tags ──────────────────────────────────────── */}
          <div className="border rounded-xl p-5 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Tags ({seo.tags.length})</h3>
              <button
                onClick={() => copy(seo.tags.join(", "), "tags")}
                className="border rounded px-3 py-1 text-xs font-medium hover:bg-gray-50"
              >
                {copied === "tags" ? "Copied ✅" : "Copy All Tags"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seo.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => copy(tag, "tag-" + i)}
                  className={"px-2.5 py-1 rounded-full text-xs border transition-colors " + (copied === "tag-" + i ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-2">
              Total: {seo.tags.join(", ").length} chars (YouTube max: 500)
            </div>
          </div>

          {/* ── Hashtags ──────────────────────────────────── */}
          <div className="border rounded-xl p-5 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Hashtags</h3>
              <button
                onClick={() => copy(seo.hashtags.join(" "), "hashtags")}
                className="border rounded px-3 py-1 text-xs font-medium hover:bg-gray-50"
              >
                {copied === "hashtags" ? "Copied ✅" : "Copy Hashtags"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {seo.hashtags.map((h, i) => (
                <button
                  key={i}
                  onClick={() => copy(h, "ht-" + i)}
                  className={"px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors " + (copied === "ht-" + i ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-blue-50/50 border-blue-200 text-blue-700 hover:bg-blue-100")}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-2">YouTube shows first 3 hashtags above your video title</div>
          </div>

          {/* ── Keyword Analysis ──────────────────────────── */}
          {seo.keywordAnalysis && (
            <div className="border rounded-xl p-5 bg-white">
              <h3 className="font-semibold mb-3">Keyword Analysis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-1">Primary Keyword</div>
                  <div className="font-medium text-lg">{seo.keywordAnalysis.primary}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Difficulty</div>
                  <div className="font-medium">
                    <span className={
                      "inline-block px-2 py-0.5 rounded-full text-xs font-semibold " +
                      (seo.keywordAnalysis.difficulty.toLowerCase().includes("low") ? "bg-green-100 text-green-700" :
                       seo.keywordAnalysis.difficulty.toLowerCase().includes("high") ? "bg-red-100 text-red-700" :
                       "bg-yellow-100 text-yellow-700")
                    }>
                      {seo.keywordAnalysis.difficulty}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Est. Search Volume</div>
                  <div className="font-medium">{seo.keywordAnalysis.searchVolume}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Secondary Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {seo.keywordAnalysis.secondary.map((k, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{k}</span>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-gray-500 text-xs mb-1">Long-Tail Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {seo.keywordAnalysis.longTail.map((k, i) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700">{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tips when no results */}
      {!seo && !busy && (
        <div className="border rounded-xl p-5 bg-gray-50">
          <h3 className="font-semibold mb-2">How It Works</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>1. Enter your video topic — AI analyzes keywords and competition</p>
            <p>2. Get 5 title options ranked by click-through potential (CTR score)</p>
            <p>3. Full description optimized for YouTube search with timestamps template</p>
            <p>4. 30 tags mixing broad, specific, and long-tail keywords</p>
            <p>5. Copy everything to YouTube Studio with one click</p>
          </div>
        </div>
      )}
    </div>
  );
}