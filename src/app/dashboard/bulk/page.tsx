"use client";

// ============================================================
// FILE: src/app/dashboard/bulk/page.tsx
// ============================================================
// Ripple — Bulk Video Factory (Studio exclusive)
// Brand pass: slate pipeline cue in header (matches sidebar),
// coral CTAs throughout, semantic status colors.
//
// Queue up to 50 videos in one shot, renders sequentially.
//
// All logic preserved: queue creation, sequential renderSequentially
// pattern with 2s gaps, batch polling every 6s, phase state machine,
// Studio tier gating.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";
import { motion, AnimatePresence } from "framer-motion";

const MAX_TOPICS = 50;
const WORDS_PER_MIN = 130;

// Ripple palette
const CORAL = "#FF6B5A";
const CORAL_SOFT = "#FF8B7A";
const SLATE = "#7B7A8E";
const SLATE_BG = "rgba(123,122,142,0.12)";
const SLATE_BORDER = "rgba(123,122,142,0.25)";

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

/* ─── Inline Ripple Select with custom chevron ─── */
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
        className="w-full appearance-none px-3 py-2 pr-9 rounded-lg text-sm font-medium outline-none cursor-pointer transition-all"
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
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
        newRows[idx] = { ...newRows[idx], topic: lines[0] };
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

      startPolling(json.batch_id, token);
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

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const validCount = rows.filter(r => r.topic.trim().length > 0).length;
  const isLocked = userTier !== "studio" && userTier !== "loading";

  // ── Section header label helper ──
  const labelStyle: React.CSSProperties = {
    color: "#8B8794",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    letterSpacing: "0.05em",
  };

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-4xl mx-auto px-4 py-10"
      >
        {/* ── Header (slate pipeline cue) ───────────────── */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: SLATE_BG,
              border: `1px solid ${SLATE_BORDER}`,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="4" rx="1" />
              <rect x="2" y="10" width="20" height="4" rx="1" />
              <rect x="2" y="17" width="20" height="4" rx="1" />
            </svg>
          </div>
          <div className="flex-1">
            <h1
              className="text-2xl font-bold flex items-center gap-3 flex-wrap"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              Bulk Video Factory
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: "rgba(255,107,90,0.15)",
                  border: "1px solid rgba(255,107,90,0.35)",
                  color: CORAL_SOFT,
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Studio
              </span>
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
              Queue up to {MAX_TOPICS} videos at once. They render in the background — check back later or watch live progress.
            </p>
          </div>
        </div>

        {/* ── Studio lock ───────────────────────────────── */}
        {isLocked && (
          <div
            className="rounded-2xl p-10 text-center mb-8"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: "rgba(255,107,90,0.15)",
                border: "1px solid rgba(255,107,90,0.3)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CORAL_SOFT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2
              className="font-semibold text-lg mb-1"
              style={{
                color: "#F5F2ED",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Studio Tier Required
            </h2>
            <p className="text-sm mb-5" style={{ color: "#8B8794" }}>
              Bulk Video Factory is available exclusively on the Studio plan.
            </p>
            <a
              href="/dashboard/billing"
              className="inline-flex px-6 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                color: "#0F0E1A",
                boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Upgrade to Studio →
            </a>
          </div>
        )}

        {/* ── Build phase ──────────────────────────────── */}
        {!isLocked && phase === "build" && (
          <div className="space-y-6">

            {/* Shared Settings Card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <h2
                className="font-semibold mb-1 flex items-center gap-2"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={CORAL_SOFT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Shared Settings
              </h2>
              <p className="text-xs mb-5" style={{ color: "#8B8794" }}>
                Applied to every video in this batch. You can override per-video in the topic rows.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Video Type */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Format</label>
                  <div className="flex gap-1.5">
                    {[
                      { v: "conventional", icon: "🎬", label: "16:9" },
                      { v: "youtube_shorts", icon: "📱", label: "9:16" },
                    ].map(opt => {
                      const active = videoType === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setVideoType(opt.v)}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold transition"
                          style={{
                            background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                            border: active ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                            color: active ? CORAL_SOFT : "#8B8794",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          {opt.icon} {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Style */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Style</label>
                  <RippleSelect value={style} onChange={setStyle}>
                    {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </RippleSelect>
                </div>

                {/* Length */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Video Length</label>
                  <RippleSelect value={length} onChange={setLength}>
                    {LENGTH_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </RippleSelect>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Language</label>
                  <RippleSelect value={language} onChange={setLanguage}>
                    {LANG_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </RippleSelect>
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Tone</label>
                  <RippleSelect value={tone} onChange={setTone}>
                    {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </RippleSelect>
                </div>

                {/* Music */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={labelStyle}>Music</label>
                  <RippleSelect value={music} onChange={setMusic}>
                    {MUSIC_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </RippleSelect>
                </div>
              </div>

              {/* Image source */}
              <div className="mt-5">
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={labelStyle}>Image Source</label>
                <div className="flex gap-2">
                  {IMAGE_OPTIONS.map(opt => {
                    const active = imageSource === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setImageSource(opt.value)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition"
                        style={{
                          background: active ? "rgba(255,107,90,0.15)" : "rgba(255,255,255,0.03)",
                          border: active ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          color: active ? CORAL_SOFT : "#8B8794",
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Topics Card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2
                  className="font-semibold flex items-center gap-2"
                  style={{
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={CORAL_SOFT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Topics
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(255,107,90,0.12)",
                      color: CORAL_SOFT,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {validCount} / {MAX_TOPICS}
                  </span>
                </h2>
                <button
                  onClick={addRow}
                  disabled={rows.length >= MAX_TOPICS}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                  style={{
                    background: "rgba(255,107,90,0.10)",
                    border: "1px solid rgba(255,107,90,0.3)",
                    color: CORAL_SOFT,
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  + Add Topic
                </button>
              </div>
              <p className="text-xs mb-4" style={{ color: "#8B8794" }}>
                💡 Paste a list of topics — each line becomes a separate video automatically.
              </p>

              <div className="space-y-2">
                <AnimatePresence>
                  {rows.map((row, idx) => (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex gap-2 items-start"
                    >
                      {/* Row number */}
                      <div
                        className="w-6 h-9 flex items-center justify-center text-xs flex-shrink-0"
                        style={{
                          color: "#5A5762",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* Topic input */}
                      <textarea
                        value={row.topic}
                        onChange={e => updateRow(row.id, "topic", e.target.value)}
                        onPaste={e => handlePaste(e, row.id)}
                        placeholder={`Topic ${idx + 1} — e.g. "5 reasons to visit Vietnam"`}
                        rows={1}
                        className="flex-1 px-3 py-2 rounded-lg text-sm resize-none outline-none transition"
                        style={{
                          background: row.topic.trim() ? "rgba(255,107,90,0.06)" : "#16151F",
                          border: `1px solid ${row.topic.trim() ? "rgba(255,107,90,0.3)" : "rgba(255,255,255,0.1)"}`,
                          color: "#F5F2ED",
                          minHeight: "36px",
                          overflow: "hidden",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255,107,90,0.5)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,107,90,0.15)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = row.topic.trim()
                            ? "rgba(255,107,90,0.3)"
                            : "rgba(255,255,255,0.1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                        onInput={e => {
                          const el = e.target as HTMLTextAreaElement;
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }}
                      />

                      {/* Remove */}
                      <button
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        className="w-8 h-9 flex items-center justify-center rounded-lg transition disabled:opacity-20 flex-shrink-0"
                        style={{
                          color: "#5A5762",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                        onMouseEnter={(e) => {
                          if (rows.length > 1) {
                            e.currentTarget.style.color = "#FF6B6B";
                            e.currentTarget.style.background = "rgba(255,107,107,0.10)";
                            e.currentTarget.style.borderColor = "rgba(255,107,107,0.3)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "#5A5762";
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        }}
                      >
                        ×
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {rows.length < MAX_TOPICS && (
                <button
                  onClick={addRow}
                  className="mt-3 w-full py-2 rounded-xl text-xs transition"
                  style={{
                    color: "#5A5762",
                    border: "1px dashed rgba(255,255,255,0.1)",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = CORAL_SOFT;
                    e.currentTarget.style.borderColor = "rgba(255,107,90,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#5A5762";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  }}
                >
                  + Add another topic
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(255,107,107,0.10)",
                  border: "1px solid rgba(255,107,107,0.3)",
                  color: "#FF6B6B",
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSubmit}
                disabled={busy || validCount === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: (busy || validCount === 0)
                    ? "rgba(255,107,90,0.3)"
                    : `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                  color: "#0F0E1A",
                  boxShadow: (busy || validCount === 0) ? "none" : "0 8px 30px -8px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full animate-spin"
                      style={{
                        border: "2px solid rgba(15,14,26,0.3)",
                        borderTopColor: "#0F0E1A",
                      }}
                    />
                    Creating batch...
                  </span>
                ) : (
                  `⚡ Generate ${validCount} Video${validCount !== 1 ? "s" : ""}`
                )}
              </button>
            </div>

            {validCount > 0 && (
              <p
                className="text-center text-xs"
                style={{
                  color: "#5A5762",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {validCount} videos × {length} each · renders in the background · check Library when done
              </p>
            )}
          </div>
        )}

        {/* ── Running / Done phase ──────────────────────── */}
        {!isLocked && (phase === "running" || phase === "done") && batchStatus && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* Progress card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2
                    className="font-bold text-lg"
                    style={{
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {phase === "done" ? "✅ Batch Complete!" : "⚡ Rendering in Progress"}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#8B8794" }}>
                    {phase === "done"
                      ? `${batchStatus.done} completed · ${batchStatus.failed} failed`
                      : `${batchStatus.done} done · ${batchStatus.processing} rendering · ${batchStatus.failed} failed`}
                  </p>
                </div>
                <div
                  className="text-3xl font-bold"
                  style={{
                    color: phase === "done" ? "#5DD39E" : CORAL_SOFT,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {batchStatus.percent}%
                </div>
              </div>

              {/* Progress bar */}
              <div
                className="h-3 rounded-full overflow-hidden mb-2"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: phase === "done"
                      ? "linear-gradient(90deg, #5DD39E, #5DD39E)"
                      : `linear-gradient(90deg, ${CORAL}, #FFA94D)`,
                  }}
                  animate={{ width: `${batchStatus.percent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between text-xs" style={{ color: "#5A5762" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {batchStatus.done} of {batchStatus.total} complete
                </span>
                {phase !== "done" && <span className="animate-pulse">Refreshing every 6s...</span>}
              </div>

              {phase === "done" && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  <a
                    href="/dashboard/library"
                    className="flex-1 min-w-[180px] py-3 rounded-xl text-sm font-semibold text-center transition hover:scale-[1.01]"
                    style={{
                      background: `linear-gradient(135deg, ${CORAL} 0%, ${CORAL_SOFT} 100%)`,
                      color: "#0F0E1A",
                      boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    View in Library →
                  </a>
                  <button
                    onClick={() => {
                      setPhase("build");
                      setBatchId(null);
                      setBatchStatus(null);
                      setRows([makeRow(), makeRow(), makeRow()]);
                    }}
                    className="px-5 py-3 rounded-xl text-sm font-semibold transition"
                    style={{
                      color: "#F5F2ED",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  >
                    New Batch
                  </button>
                </div>
              )}
            </div>

            {/* Project list */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="px-5 py-3 text-xs font-bold uppercase tracking-wider"
                style={{
                  background: "#16151F",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  letterSpacing: "0.1em",
                }}
              >
                Videos in this batch
              </div>
              <div>
                {batchStatus.projects.map((p, i) => {
                  const isDone = p.status === "done" || p.status === "completed";
                  const isFailed = p.status === "failed" || p.status === "error";
                  const isRunning = !isDone && !isFailed;
                  const dotColor = isDone ? "#5DD39E" : isFailed ? "#FF6B6B" : "#FFA94D";
                  const labelColor = isDone ? "#5DD39E" : isFailed ? "#FF6B6B" : "#FFA94D";

                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{
                        background: i % 2 === 0 ? "#16151F" : "rgba(22,21,31,0.6)",
                        borderBottom: i < batchStatus.projects.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      {/* Status dot */}
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          background: dotColor,
                          boxShadow: isRunning ? `0 0 8px ${dotColor}` : "none",
                        }}
                      />
                      {/* Number */}
                      <span
                        className="text-xs w-5 flex-shrink-0"
                        style={{
                          color: "#5A5762",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {i + 1}
                      </span>
                      {/* Topic */}
                      <span className="flex-1 text-sm truncate" style={{ color: "#F5F2ED" }}>
                        {p.topic}
                      </span>
                      {/* Status */}
                      <span
                        className="text-xs flex-shrink-0 font-semibold"
                        style={{
                          color: labelColor,
                          fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        }}
                      >
                        {isDone ? "Done" : isFailed ? "Failed" : p.status}
                      </span>
                      {/* Watch link */}
                      {isDone && p.video_url && (
                        <a
                          href={p.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 font-semibold transition hover:scale-[1.02]"
                          style={{
                            background: "rgba(255,107,90,0.10)",
                            color: CORAL_SOFT,
                            border: "1px solid rgba(255,107,90,0.25)",
                            fontFamily: "'Space Grotesk', system-ui, sans-serif",
                          }}
                        >
                          Watch
                        </a>
                      )}
                      {isFailed && p.error_message && (
                        <span className="text-xs truncate max-w-[160px]" style={{ color: "#5A5762" }}>
                          {p.error_message}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Running with no status yet ────────────────── */}
        {!isLocked && phase === "running" && !batchStatus && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{
                border: "2px solid rgba(255,107,90,0.2)",
                borderTopColor: CORAL,
              }}
            />
            <p className="text-sm" style={{ color: "#8B8794" }}>Starting batch render...</p>
          </div>
        )}

      </motion.div>
    </div>
  );
}