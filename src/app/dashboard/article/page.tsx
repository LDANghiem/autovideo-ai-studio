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
];

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
    <div className="min-h-screen" style={{ background: "#0a0812" }}>
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📰</span>
            <h1 className="text-3xl font-bold text-white">Article → Video</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(127,119,221,0.2)", color: "#c4b5fd", border: "1px solid rgba(127,119,221,0.3)" }}>
              NEW
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            Paste any article or blog URL — AI extracts the content and turns it into a professional video in your chosen language.
          </p>
        </div>

        {/* Usage banner */}
        <UsageBanner pipeline="recreate" className="mb-6" />

        {/* Done state */}
        {status === "done" && videoUrl && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" }}>
            <video controls className="w-full" src={videoUrl} />
            <div className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-green-400 font-semibold text-sm">✅ Video ready!</p>
                {articleTitle && <p className="text-gray-400 text-xs mt-0.5 truncate max-w-xs">{articleTitle}</p>}
              </div>
              <div className="flex gap-3">
                <a href={videoUrl} download
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-80"
                  style={{ background: "#7F77DD" }}>
                  ↓ Download
                </a>
                <button onClick={reset}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.1)" }}>
                  New video
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing state */}
        {(status === "fetching" || status === "processing") && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-white text-sm font-medium">{statusMsg}</p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7F77DD, #a78bfa)" }} />
            </div>
            <p className="text-gray-500 text-xs mt-2">{progress}% complete · This takes 2-5 minutes</p>
            {articleTitle && (
              <p className="text-gray-400 text-xs mt-3 truncate">
                📰 {articleTitle}
              </p>
            )}
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-4"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p className="text-red-400 text-sm">{error}</p>
            <div className="flex gap-2">
              {error.includes("Upgrade") && (
                <Link href="/dashboard/billing"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ background: "#ef4444" }}>
                  Upgrade
                </Link>
              )}
              <button onClick={reset}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}>
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Input form - only when idle or error */}
        {(status === "idle" || status === "error") && (
          <div className="space-y-5">

            {/* URL input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Article URL
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://vnexpress.net/article... or any news/blog URL"
                className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 text-sm"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
              <p className="text-gray-600 text-xs mt-1.5">
                Works with VnExpress, Tuổi Trẻ, BBC, CNN, Medium, blogs, and most news sites
              </p>
            </div>

            {/* Language + Style row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Output language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-white text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {LANGUAGES.map(l => <option key={l} value={l} style={{ background: "#1a1025" }}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Video style</label>
                <select value={style} onChange={e => setStyle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-white text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {STYLES.map(s => <option key={s.value} value={s.value} style={{ background: "#1a1025" }}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Length */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Video length</label>
              <div className="flex gap-2 flex-wrap">
                {LENGTHS.map(l => (
                  <button key={l.value} onClick={() => setTargetLength(l.value)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: targetLength === l.value ? "rgba(127,119,221,0.25)" : "rgba(255,255,255,0.05)",
                      border: targetLength === l.value ? "1px solid rgba(127,119,221,0.5)" : "1px solid rgba(255,255,255,0.1)",
                      color: targetLength === l.value ? "#c4b5fd" : "#9ca3af",
                    }}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
              <div className="flex gap-2">
                {(["landscape", "portrait"] as const).map(o => (
                  <button key={o} onClick={() => setOrientation(o)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: orientation === o ? "rgba(127,119,221,0.25)" : "rgba(255,255,255,0.05)",
                      border: orientation === o ? "1px solid rgba(127,119,221,0.5)" : "1px solid rgba(255,255,255,0.1)",
                      color: orientation === o ? "#c4b5fd" : "#9ca3af",
                    }}>
                    {o === "landscape" ? "🖥️ Landscape (16:9)" : "📱 Portrait (9:16)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!url.trim()}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #7F77DD, #5b54b8)" }}>
              🎬 Generate Video from Article
            </button>
          </div>
        )}

        {/* Tips */}
        {status === "idle" && (
          <div className="mt-8 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-3">How it works</p>
            <div className="space-y-2">
              {[
                "Paste any article URL — news, blog, or editorial",
                "AI extracts the key content and rewrites it as a video script",
                "Finds matching visuals from Pexels & Pixabay",
                "Generates voiceover in your chosen language",
                "Renders a complete video with captions and music",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-purple-500 font-bold text-xs mt-0.5">{i + 1}.</span>
                  <p className="text-gray-400 text-xs">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}