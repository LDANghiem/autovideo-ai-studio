"use client";

// ============================================================
// FILE: src/app/dashboard/bulk/page.tsx
// Bulk Video Factory — Studio exclusive
// Queue up to 50 videos in one shot, renders overnight
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";
import { motion, AnimatePresence } from "framer-motion";

const MAX_TOPICS = 50;
const WORDS_PER_MIN = 130;

// ── Shared settings defaults ─────────────────────────────────
const STYLE_OPTIONS   = ["modern", "cinematic", "documentary", "educational", "motivational"];
const LENGTH_OPTIONS  = ["1 minute", "2 minutes", "3 minutes", "5 minutes", "8 minutes", "12 minutes", "20 minutes", "30 minutes"];
const LANG_OPTIONS    = ["English", "Vietnamese", "Spanish", "Chinese", "Korean", "Japanese", "French", "German"];
const TONE_OPTIONS    = ["friendly", "professional", "motivational", "serious", "casual"];
const MUSIC_OPTIONS   = ["ambient", "cinematic", "upbeat", "emotional", "minimal", "none"];
const IMAGE_OPTIONS   = [
  { value: "real-photos", label: "📸 Real Photos", sub: "Pexels — free" },
  { value: "ai-art",      label: "🎨 AI Art",      sub: "DALL-E — $0.08/img" },
];

interface TopicRow { id: number; topic: string; instructions: string; }
interface BatchProject { id: string; topic: string; status: string; video_url: string | null; error_message: string | null; }
interface BatchStatus {
  batch_id: string; total: number; done: number; failed: number;
  processing: number; percent: number; is_complete: boolean;
  projects: BatchProject[];
}

let rowCounter = 0;
function makeRow(topic = "", instructions = ""): TopicRow {
  return { id: ++rowCounter, topic, instructions };
}

export default function BulkPage() {
  const router = useRouter();
  const userTier = useUserTier();

  // Topics
  const [rows, setRows] = useState<TopicRow[]>([makeRow(), makeRow(), makeRow()]);

  // Shared settings
  const [style, setStyle]       = useState("modern");
  const [length, setLength]     = useState("5 minutes");
  const [language, setLanguage] = useState("English");
  const [tone, setTone]         = useState("friendly");
  const [music, setMusic]       = useState("ambient");
  const [imageSource, setImageSource] = useState("real-photos");
  const [videoType, setVideoType]     = useState("conventional");

  // Job state
  const [phase, setPhase]       = useState<"build" | "running" | "done">("build");
  const [batchId, setBatchId]   = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Redirect non-Studio users ───────────────────────────────
  useEffect(() => {
    if (userTier !== "loading" && userTier !== "studio") {
      // Show locked state — don't redirect, let them see the page
    }
  }, [userTier]);

  // ── Topic row helpers ───────────────────────────────────────
  const addRow = () => {
    if (rows.length >= MAX_TOPICS) return;
    setRows(r => [...r, makeRow()]);
  };

  const removeRow = (id: number) => {
    if (rows.length <= 1) return;
    setRows(r => r.filter(row => row.id !== id));
  };

  const updateRow = (id: number, field: "topic" | "instructions", value: string) => {
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, rowId: number) => {
    const text = e.clipboardData.getData("text");
    const lines = text.split("\n").map(l => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      setRows(prev => {
        const idx = prev.findIndex(r => r.id === rowId);
        const newRows = [...prev];
        // Fill current row with first line
        newRows[idx] = { ...newRows[idx], topic: lines[0] };
        // Add remaining lines as new rows (up to MAX)
        const extra = lines.slice(1, MAX_TOPICS - prev.length + 1);
        const inserted = extra.map(t => makeRow(t));
        newRows.splice(idx + 1, 0, ...inserted);
        return newRows.slice(0, MAX_TOPICS);
      });
    }
  };

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.topic.trim().length > 0);
    if (validRows.length === 0) { setError("Add at least one topic."); return; }
    setError("");
    setBusy(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      // Step 1: Create all projects in DB
      const res = await fetch("/api/bulk/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: validRows.map(r => ({ topic: r.topic.trim(), topic_instructions: r.instructions.trim() })),
          shared_settings: { style, length, language, tone, music, image_source: imageSource, video_type: videoType },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create batch");

      setBatchId(json.batch_id);
      setPhase("running");

      // Step 2: Start polling status
      startPolling(json.batch_id, token);

      // Step 3: Kick off renders sequentially from browser
      // Each start-render call takes 2-5 min — we await each one before starting next
      // This prevents server overload and ensures clean sequential processing
      renderSequentially(json.project_ids, token);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Sequential renderer — called from browser, one at a time ──
  const renderSequentially = async (projectIds: string[], token: string) => {
    for (const projectId of projectIds) {
      try {
        console.log("[bulk] starting render for", projectId);
        const res = await fetch("/api/projects/start-render", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: projectId }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.warn("[bulk] start-render failed for", projectId, data?.error);
        } else {
          console.log("[bulk] ✅ render completed for", projectId);
        }
      } catch (e) {
        console.warn("[bulk] render error for", projectId, e);
      }
      // Small gap between renders to let the system breathe
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log("[bulk] all renders triggered");
  };

  // ── Polling ─────────────────────────────────────────────────
  const startPolling = useCallback((bid: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk/status?batch_id=${bid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const status: BatchStatus = await res.json();
        setBatchStatus(status);
        if (status.is_complete) {
          clearInterval(pollRef.current!);
          setPhase("done");
        }
      } catch {}
    }, 6000);
  }, []);

  // Poll on mount if returning to running batch
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const validCount = rows.filter(r => r.topic.trim().length > 0).length;
  const isLocked = userTier !== "studio" && userTier !== "loading";

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-4xl mx-auto px-4 py-10"
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(139,92,246,0.4)" }}>
            <span className="text-2xl">⚡</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              Bulk Video Factory
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(234,179,8,0.15))", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24" }}>
                ✦ Studio
              </span>
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Queue up to {MAX_TOPICS} videos at once. They render in the background — check back later or watch live progress.
            </p>
          </div>
        </div>

        {/* Studio lock */}
        {isLocked && (
          <div className="rounded-2xl p-10 text-center mb-8"
            style={{ background: "rgba(20,17,35,0.7)", border: "1px solid rgba(74,66,96,0.3)" }}>
            <div className="text-4xl mb-3">🔒</div>
            <h2 className="text-white font-semibold text-lg mb-1">Studio Tier Required</h2>
            <p className="text-gray-500 text-sm mb-5">Bulk Video Factory is available exclusively on the Studio plan.</p>
            <a href="/dashboard/billing"
              className="inline-flex px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.6), rgba(234,179,8,0.4))", border: "1px solid rgba(245,158,11,0.4)" }}>
              Upgrade to Studio →
            </a>
          </div>
        )}

        {/* Build phase */}
        {!isLocked && phase === "build" && (
          <div className="space-y-6">

            {/* Shared Settings Card */}
            <div className="rounded-2xl p-6" style={{ background: "rgba(20,17,35,0.6)", border: "1px solid rgba(74,66,96,0.3)" }}>
              <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
                <span>⚙️</span> Shared Settings
              </h2>
              <p className="text-xs text-gray-500 mb-5">Applied to every video in this batch. You can override per-video in the topic rows.</p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Video Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Format</label>
                  <div className="flex gap-1.5">
                    {[
                      { v: "conventional", icon: "🎬", label: "16:9" },
                      { v: "youtube_shorts", icon: "📱", label: "9:16" },
                    ].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setVideoType(opt.v)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium transition"
                        style={videoType === opt.v
                          ? { background: "rgba(99,102,241,0.4)", border: "1px solid rgba(139,92,246,0.5)", color: "#fff" }
                          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,66,96,0.3)", color: "#9ca3af" }}>
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Style</label>
                  <select value={style} onChange={e => setStyle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.4)" }}>
                    {STYLE_OPTIONS.map(s => <option key={s} value={s} style={{ background: "#1a1025" }}>{s}</option>)}
                  </select>
                </div>

                {/* Length */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Video Length</label>
                  <select value={length} onChange={e => setLength(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.4)" }}>
                    {LENGTH_OPTIONS.map(l => <option key={l} value={l} style={{ background: "#1a1025" }}>{l}</option>)}
                  </select>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.4)" }}>
                    {LANG_OPTIONS.map(l => <option key={l} value={l} style={{ background: "#1a1025" }}>{l}</option>)}
                  </select>
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Tone</label>
                  <select value={tone} onChange={e => setTone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.4)" }}>
                    {TONE_OPTIONS.map(t => <option key={t} value={t} style={{ background: "#1a1025" }}>{t}</option>)}
                  </select>
                </div>

                {/* Music */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Music</label>
                  <select value={music} onChange={e => setMusic(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.4)" }}>
                    {MUSIC_OPTIONS.map(m => <option key={m} value={m} style={{ background: "#1a1025" }}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Image source */}
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">Image Source</label>
                <div className="flex gap-2">
                  {IMAGE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setImageSource(opt.value)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium transition"
                      style={imageSource === opt.value
                        ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(139,92,246,0.5)", color: "#c4b5fd" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,66,96,0.3)", color: "#6b7280" }}>
                      <div>{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Topics Card */}
            <div className="rounded-2xl p-6" style={{ background: "rgba(20,17,35,0.6)", border: "1px solid rgba(74,66,96,0.3)" }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <span>📋</span> Topics
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(99,102,241,0.15)", color: "#a78bfa" }}>
                    {validCount} / {MAX_TOPICS}
                  </span>
                </h2>
                <button onClick={addRow} disabled={rows.length >= MAX_TOPICS}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition hover:scale-[1.02] disabled:opacity-40"
                  style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)", color: "#a78bfa" }}>
                  + Add Topic
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                💡 Paste a list of topics — each line becomes a separate video automatically.
              </p>

              <div className="space-y-2">
                <AnimatePresence>
                  {rows.map((row, idx) => (
                    <motion.div key={row.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex gap-2 items-start"
                    >
                      {/* Row number */}
                      <div className="w-6 h-9 flex items-center justify-center text-xs flex-shrink-0"
                        style={{ color: "rgba(107,114,128,0.6)" }}>
                        {idx + 1}
                      </div>

                      {/* Topic input */}
                      <textarea
                        value={row.topic}
                        onChange={e => updateRow(row.id, "topic", e.target.value)}
                        onPaste={e => handlePaste(e, row.id)}
                        placeholder={`Topic ${idx + 1} — e.g. "5 reasons to visit Vietnam"`}
                        rows={1}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-white resize-none outline-none transition"
                        style={{
                          background: row.topic.trim() ? "rgba(99,102,241,0.07)" : "rgba(15,12,26,0.6)",
                          border: `1px solid ${row.topic.trim() ? "rgba(99,102,241,0.3)" : "rgba(74,66,96,0.3)"}`,
                          minHeight: "36px",
                          overflow: "hidden",
                        }}
                        onInput={e => {
                          const el = e.target as HTMLTextAreaElement;
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }}
                      />

                      {/* Remove */}
                      <button onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                        className="w-8 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 transition disabled:opacity-20 flex-shrink-0"
                        style={{ border: "1px solid rgba(74,66,96,0.2)" }}>
                        ×
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {rows.length < MAX_TOPICS && (
                <button onClick={addRow}
                  className="mt-3 w-full py-2 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition"
                  style={{ border: "1px dashed rgba(74,66,96,0.3)" }}>
                  + Add another topic
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button onClick={handleSubmit} disabled={busy || validCount === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold text-white transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.7), rgba(139,92,246,0.5))",
                  border: "1px solid rgba(139,92,246,0.5)",
                  boxShadow: "0 4px 30px rgba(99,102,241,0.25)",
                }}>
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Creating batch...
                  </span>
                ) : (
                  `⚡ Generate ${validCount} Video${validCount !== 1 ? "s" : ""}`
                )}
              </button>
            </div>

            {validCount > 0 && (
              <p className="text-center text-xs text-gray-600">
                {validCount} videos × {length} each · renders in the background · check Library when done
              </p>
            )}
          </div>
        )}

        {/* Running / Done phase */}
        {!isLocked && (phase === "running" || phase === "done") && batchStatus && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* Progress card */}
            <div className="rounded-2xl p-6" style={{ background: "rgba(20,17,35,0.6)", border: "1px solid rgba(74,66,96,0.3)" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white font-bold text-lg">
                    {phase === "done" ? "✅ Batch Complete!" : "⚡ Rendering in Progress"}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {phase === "done"
                      ? `${batchStatus.done} completed · ${batchStatus.failed} failed`
                      : `${batchStatus.done} done · ${batchStatus.processing} rendering · ${batchStatus.failed} failed`}
                  </p>
                </div>
                <div className="text-3xl font-bold tabular-nums"
                  style={{ color: phase === "done" ? "#4ade80" : "#a78bfa" }}>
                  {batchStatus.percent}%
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 rounded-full overflow-hidden mb-2"
                style={{ background: "rgba(74,66,96,0.3)" }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                  animate={{ width: `${batchStatus.percent}%` }}
                  transition={{ duration: 0.5 }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>{batchStatus.done} of {batchStatus.total} complete</span>
                {phase !== "done" && <span className="animate-pulse">Refreshing every 4s...</span>}
              </div>

              {phase === "done" && (
                <div className="flex gap-2 mt-4">
                  <a href="/dashboard/library"
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white text-center transition hover:scale-[1.01]"
                    style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))", border: "1px solid rgba(139,92,246,0.4)" }}>
                    View in Library →
                  </a>
                  <button onClick={() => { setPhase("build"); setBatchId(null); setBatchStatus(null); setRows([makeRow(), makeRow(), makeRow()]); }}
                    className="px-5 py-3 rounded-xl text-sm font-medium text-gray-400 transition hover:text-white"
                    style={{ border: "1px solid rgba(74,66,96,0.3)" }}>
                    New Batch
                  </button>
                </div>
              )}
            </div>

            {/* Project list */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(74,66,96,0.3)" }}>
              <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ background: "rgba(15,12,26,0.8)", borderBottom: "1px solid rgba(74,66,96,0.2)" }}>
                Videos in this batch
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(74,66,96,0.15)" }}>
                {batchStatus.projects.map((p, i) => {
                  const isDone = p.status === "done" || p.status === "completed";
                  const isFailed = p.status === "failed" || p.status === "error";
                  const isRunning = !isDone && !isFailed;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3"
                      style={{ background: "rgba(20,17,35,0.4)" }}>
                      {/* Status dot */}
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: isDone ? "#4ade80" : isFailed ? "#f87171" : "#fbbf24", boxShadow: isRunning ? "0 0 6px #fbbf24" : "none" }} />
                      {/* Number */}
                      <span className="text-xs text-gray-600 w-5 flex-shrink-0">{i + 1}</span>
                      {/* Topic */}
                      <span className="flex-1 text-sm text-white truncate">{p.topic}</span>
                      {/* Status */}
                      <span className="text-xs flex-shrink-0"
                        style={{ color: isDone ? "#4ade80" : isFailed ? "#f87171" : "#fbbf24" }}>
                        {isDone ? "Done" : isFailed ? "Failed" : p.status}
                      </span>
                      {/* Watch link */}
                      {isDone && p.video_url && (
                        <a href={p.video_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded-lg flex-shrink-0 transition hover:scale-[1.02]"
                          style={{ background: "rgba(99,102,241,0.2)", color: "#a78bfa", border: "1px solid rgba(99,102,241,0.3)" }}>
                          Watch
                        </a>
                      )}
                      {isFailed && (
                        <span className="text-xs text-gray-600 truncate max-w-[120px]">{p.error_message}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Running with no status yet */}
        {!isLocked && phase === "running" && !batchStatus && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            <p className="text-gray-400 text-sm">Starting batch render...</p>
          </div>
        )}

      </motion.div>
    </div>
  );
}