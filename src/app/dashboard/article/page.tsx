// ============================================================
// FILE: src/app/dashboard/article/page.tsx
// ============================================================
// Ripple — Article → Video pipeline
// Brand pass: lavender pipeline cue in header (matches sidebar),
// coral throughout the rest of the page (CTAs, focus, progress).
//
// Bug fix: removed stray URL string that was rendering at the
// bottom of the page.
//
// All article fetch, pipeline start, and polling logic preserved.
// ============================================================

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import UsageBanner from "@/components/UsageBanner";
import Link from "next/link";

type Status = "idle" | "fetching" | "processing" | "done" | "error";

interface ProjectStatus {
  status: string;
  progress: number;
  final_video_url?: string;
  error_message?: string;
}

const LANGUAGES = [
  "Vietnamese", "English", "Spanish", "French", "German",
  "Japanese", "Korean", "Chinese", "Portuguese", "Indonesian",
];

const STYLES = [
  { value: "news", label: "📰 News Report" },
  { value: "documentary", label: "🎬 Documentary" },
  { value: "explainer", label: "💡 Explainer" },
  { value: "storytelling", label: "📖 Storytelling" },
  { value: "viral", label: "🔥 Viral / Hook" },
];

const LENGTHS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 90, label: "90 seconds" },
  { value: 180, label: "3 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 480, label: "8 minutes" },
  { value: 720, label: "12 minutes" },
  { value: 960, label: "16 minutes" },
  { value: 1200, label: "20 minutes" },
  { value: 1440, label: "24 minutes" },
  { value: 1800, label: "30 minutes" },
];

// Ripple palette constants for clean code
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const LAVENDER = "#A39BD9";
const LAVENDER_BG = "rgba(163,155,217,0.12)";
const LAVENDER_BORDER = "rgba(163,155,217,0.25)";

export default function ArticlePage() {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("Vietnamese");
  const [style, setStyle] = useState("news");
  const [targetLength, setTargetLength] = useState(90);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [status, setStatus] = useState<Status>("idle");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Focus tracking for coral input rings
  const [urlFocused, setUrlFocused] = useState(false);

  async function handleSubmit() {
    if (!url.trim()) return;
    setError("");
    setStatus("fetching");
    setStatusMsg("Fetching article content...");
    setProgress(5);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Please sign in"); setStatus("error"); return; }
      const token = session.access_token;

      // Step 1: Create project (fetches article)
      const createRes = await fetch("/api/article/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source_url: url,
          target_language: language,
          style,
          target_length: targetLength,
          orientation,
          include_captions: true,
          music: "ambient",
          caption_style: "classic",
          caption_position: "bottom",
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Failed to fetch article");
        setStatus("error");
        return;
      }

      const pid = createData.project_id;
      setProjectId(pid);
      setArticleTitle(createData.title || "");
      setProgress(15);
      setStatusMsg(`Article found: "${createData.title?.slice(0, 60)}"`);

      // Step 2: Start pipeline
      setStatus("processing");
      setStatusMsg("Starting video generation...");

      const startRes = await fetch("/api/article/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: pid }),
      });

      const startData = await startRes.json();
      if (!startRes.ok) {
        if (startData.upgrade_required) {
          setError("Monthly limit reached. Upgrade your plan to continue.");
        } else {
          setError(startData.error || "Failed to start pipeline");
        }
        setStatus("error");
        return;
      }

      // Step 3: Poll for completion
      setProgress(20);
      setStatusMsg("AI is writing script and generating scenes...");
      await pollStatus(pid, token);

    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStatus("error");
    }
  }

  async function pollStatus(pid: string, token: string) {
    const maxAttempts = 120; // 10 minutes
    let attempts = 0;

    const STATUS_MSGS: Record<string, string> = {
      scripting: "AI is writing the script...",
      finding_media: "Finding matching visuals...",
      tts: "Generating voiceover...",
      captions: "Syncing captions...",
      rendering: "Rendering final video...",
      uploading: "Uploading video...",
    };

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setError("Timed out — please check My Projects for status");
        setStatus("error");
        return;
      }

      try {
        const { data } = await supabase
          .from("recreate_projects")
          .select("status, progress, final_video_url, error_message")
          .eq("id", pid)
          .single();

        const proj = data as ProjectStatus | null;
        if (!proj) { setTimeout(poll, 5000); return; }

        const pct = proj.progress || 0;
        setProgress(pct);
        setStatusMsg(STATUS_MSGS[proj.status] || `Processing... ${pct}%`);

        if (proj.status === "done" && proj.final_video_url) {
          setVideoUrl(proj.final_video_url);
          setStatus("done");
          setProgress(100);
          setStatusMsg("Video ready!");
          return;
        }

        if (proj.status === "error") {
          setError(proj.error_message || "Pipeline failed");
          setStatus("error");
          return;
        }

        setTimeout(poll, 5000);
      } catch {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
  }

  function reset() {
    setStatus("idle");
    setUrl("");
    setProjectId(null);
    setArticleTitle("");
    setProgress(0);
    setVideoUrl(null);
    setError("");
    setStatusMsg("");
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* ── Header (with lavender pipeline cue) ─────── */}
        <div className="flex items-center gap-4 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: LAVENDER_BG,
              border: `1px solid ${LAVENDER_BORDER}`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={LAVENDER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div>
            <h1
              className="text-3xl font-bold"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              Article → Video
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#8B8794" }}>
              Paste any article or blog URL — AI turns it into a video.
            </p>
          </div>
        </div>

        {/* Long description */}
        <p className="text-sm mb-8" style={{ color: "#8B8794" }}>
          AI extracts the content and turns it into a professional video in your chosen language.
        </p>

        {/* Usage banner */}
        <UsageBanner pipeline="recreate" className="mb-6" />

        {/* ── Done state ─────────────────────────────── */}
        {status === "done" && videoUrl && (
          <div
            className="rounded-2xl overflow-hidden mb-6"
            style={{
              border: "1px solid rgba(93,211,158,0.3)",
              background: "rgba(93,211,158,0.05)",
            }}
          >
            <video controls className="w-full" src={videoUrl} style={{ background: "#000" }} />
            <div className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p
                  className="font-semibold text-sm"
                  style={{
                    color: "#5DD39E",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  ✅ Video ready!
                </p>
                {articleTitle && (
                  <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: "#8B8794" }}>
                    {articleTitle}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <a
                  href={videoUrl}
                  download
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                    color: "#0F0E1A",
                    boxShadow: `0 4px 16px -4px rgba(255,107,90,0.5)`,
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  ↓ Download
                </a>
                <button
                  onClick={reset}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "#F5F2ED",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  New video
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Processing state ───────────────────────── */}
        {(status === "fetching" || status === "processing") && (
          <div
            className="rounded-2xl p-6 mb-6"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-5 h-5 rounded-full animate-spin flex-shrink-0"
                style={{
                  border: `2px solid rgba(255,107,90,0.2)`,
                  borderTopColor: CORAL,
                }}
              />
              <p
                className="text-sm font-semibold"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {statusMsg}
              </p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${CORAL}, #FFA94D)`,
                }}
              />
            </div>
            <p className="text-xs mt-2" style={{ color: "#5A5762", fontFamily: "'JetBrains Mono', monospace" }}>
              {progress}% complete · This takes 2-5 minutes
            </p>
            {articleTitle && (
              <p className="text-xs mt-3 truncate" style={{ color: "#8B8794" }}>
                📰 {articleTitle}
              </p>
            )}
          </div>
        )}

        {/* ── Error state ────────────────────────────── */}
        {status === "error" && (
          <div
            className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-4"
            style={{
              background: "rgba(255,107,107,0.10)",
              border: "1px solid rgba(255,107,107,0.3)",
            }}
          >
            <p className="text-sm" style={{ color: "#FF6B6B" }}>{error}</p>
            <div className="flex gap-2">
              {error.includes("Upgrade") && (
                <Link
                  href="/dashboard/billing"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                    color: "#0F0E1A",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  Upgrade
                </Link>
              )}
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "#F5F2ED",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Input form ─────────────────────────────── */}
        {(status === "idle" || status === "error") && (
          <div className="space-y-5">

            {/* URL input */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "0.05em",
                }}
              >
                Article URL
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onFocus={() => setUrlFocused(true)}
                onBlur={() => setUrlFocused(false)}
                placeholder="https://vnexpress.net/article... or any news/blog URL"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: "#16151F",
                  border: urlFocused
                    ? "1px solid rgba(255,107,90,0.5)"
                    : "1px solid rgba(255,255,255,0.1)",
                  color: "#F5F2ED",
                  boxShadow: urlFocused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "#5A5762" }}>
                Works with VnExpress, Tuổi Trẻ, BBC, CNN, Medium, blogs, and most news sites
              </p>
            </div>

            {/* Language + Style row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{
                    color: "#8B8794",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    letterSpacing: "0.05em",
                  }}
                >
                  Output language
                </label>
                <RippleSelect value={language} onChange={setLanguage}>
                  {LANGUAGES.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </RippleSelect>
              </div>
              <div>
                <label
                  className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{
                    color: "#8B8794",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    letterSpacing: "0.05em",
                  }}
                >
                  Video style
                </label>
                <RippleSelect value={style} onChange={setStyle}>
                  {STYLES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </RippleSelect>
              </div>
            </div>

            {/* Length pills */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "0.05em",
                }}
              >
                Video length
              </label>
              <div className="flex gap-2 flex-wrap">
                {LENGTHS.map(l => {
                  const active = targetLength === l.value;
                  return (
                    <button
                      key={l.value}
                      onClick={() => setTargetLength(l.value)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                        border: active ? `1px solid rgba(255,107,90,0.5)` : "1px solid rgba(255,255,255,0.08)",
                        color: active ? CORAL_SOFT : "#8B8794",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orientation toggles */}
            <div>
              <label
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "0.05em",
                }}
              >
                Format
              </label>
              <div className="flex gap-2">
                {(["landscape", "portrait"] as const).map(o => {
                  const active = orientation === o;
                  return (
                    <button
                      key={o}
                      onClick={() => setOrientation(o)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                        border: active ? `1px solid rgba(255,107,90,0.5)` : "1px solid rgba(255,255,255,0.08)",
                        color: active ? CORAL_SOFT : "#8B8794",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {o === "landscape" ? "🖥️ Landscape (16:9)" : "📱 Portrait (9:16)"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!url.trim()}
              className="w-full py-3.5 rounded-xl font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: !url.trim()
                  ? "rgba(255,107,90,0.3)"
                  : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: !url.trim() ? "none" : "0 8px 24px -8px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              🎬 Generate Video from Article
            </button>
          </div>
        )}

        {/* ── Tips ───────────────────────────────────── */}
        {status === "idle" && (
          <div
            className="mt-8 p-4 rounded-xl"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{
                color: "#8B8794",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "0.1em",
              }}
            >
              How it works
            </p>
            <div className="space-y-2">
              {[
                "Paste any article URL — news, blog, or editorial",
                "AI extracts the key content and rewrites it as a video script",
                "Finds matching visuals from Pexels & Pixabay",
                "Generates voiceover in your chosen language",
                "Renders a complete video with captions and music",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="font-bold text-xs mt-0.5"
                    style={{
                      color: CORAL_SOFT,
                      fontFamily: "'JetBrains Mono', monospace",
                      minWidth: 14,
                    }}
                  >
                    {i + 1}.
                  </span>
                  <p className="text-xs" style={{ color: "#C7C3C9" }}>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ─── Inline Ripple-themed select with custom chevron ──────── */
function RippleSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full appearance-none px-3 py-2.5 pr-9 rounded-xl text-sm font-medium outline-none cursor-pointer transition-all"
        style={{
          background: "#16151F",
          border: focused ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.1)",
          color: "#F5F2ED",
          boxShadow: focused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
        }}
      >
        {children}
      </select>
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors"
        style={{ color: focused ? "#FF8B7A" : "#5A5762" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}