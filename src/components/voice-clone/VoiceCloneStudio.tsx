"use client";

// ============================================================
// FILE: src/components/voice-clone/VoiceCloneStudio.tsx
// Phase 3: Voice Cloning UI Component
// Studio tier exclusive — record or upload 30s+ audio sample,
// clone via ElevenLabs, save to profile, auto-use in all pipelines.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";

type VoiceStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "uploading"
  | "cloning"
  | "success"
  | "error";

interface ClonedVoice {
  voice_id: string;
  voice_name: string;
  updated_at: string;
}

export default function VoiceCloneStudio() {
  // Voice status
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [clonedVoice, setClonedVoice] = useState<ClonedVoice | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Recording state
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState("");

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"record" | "upload">("record");

  // Error/success
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing cloned voice
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setLoadingExisting(false); return; }

        const res = await fetch("/api/voice-clone/delete", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.has_cloned_voice) {
            setClonedVoice({
              voice_id: data.voice_id,
              voice_name: data.voice_name,
              updated_at: data.updated_at,
            });
            setStatus("success");
          }
        }
      } catch {}
      setLoadingExisting(false);
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ── Recording ───────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus("recorded");
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100);
      setStatus("recording");
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 180) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setErrorMsg("Microphone access denied. Please allow microphone permissions and try again.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── File Upload ─────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setAudioBlob(null); // not a blob, it's a File
    setStatus("recorded");
    setErrorMsg("");
  };

  // ── Clone Voice ─────────────────────────────────────────────
  const cloneVoice = async () => {
    const fileToUpload = uploadedFile || (audioBlob ? new File([audioBlob], "voice_sample.webm", { type: audioBlob.type }) : null);
    if (!fileToUpload) {
      setErrorMsg("No audio to upload.");
      return;
    }
    if (recordingSeconds < 10 && !uploadedFile) {
      setErrorMsg("Recording is too short. Please record at least 10 seconds for best quality.");
      return;
    }

    setStatus("cloning");
    setErrorMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const name = voiceName.trim() || `My Voice – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

      const form = new FormData();
      form.append("audio", fileToUpload, fileToUpload.name || "voice_sample.webm");
      form.append("voice_name", name);
      form.append("voice_description", "Cloned via AutoVideo AI Studio");

      const res = await fetch("/api/voice-clone/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cloning failed");

      setClonedVoice({
        voice_id: data.voice_id,
        voice_name: data.voice_name,
        updated_at: new Date().toISOString(),
      });
      setSuccessMsg(data.message || "Voice cloned successfully!");
      setStatus("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Voice cloning failed. Please try again.");
      setStatus("recorded");
    }
  };

  // ── Delete Voice ────────────────────────────────────────────
  const deleteVoice = async () => {
    if (!confirm("Delete your cloned voice? This cannot be undone. Your videos will use the default AI voice going forward.")) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/voice-clone/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");

      setClonedVoice(null);
      setStatus("idle");
      setAudioBlob(null);
      setAudioUrl(null);
      setUploadedFile(null);
      setRecordingSeconds(0);
      setVoiceName("");
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Reset to try again ──────────────────────────────────────
  const resetToRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setUploadedFile(null);
    setRecordingSeconds(0);
    setStatus("idle");
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ──────────────────────────────────────────────────
  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))",
            border: "1px solid rgba(139,92,246,0.35)",
          }}
        >
          <span className="text-2xl">🎙️</span>
        </div>
        <div>
          <h3 className="text-white font-semibold text-base">Voice Cloning</h3>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            Record 30+ seconds of your voice, and we'll clone it using ElevenLabs AI.
            Your voice will automatically be used in every video you create.
          </p>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-2"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(234,179,8,0.15))",
              border: "1px solid rgba(245,158,11,0.3)",
              color: "#fbbf24",
            }}
          >
            ✦ Studio Exclusive
          </span>
        </div>
      </div>

      {/* Success — existing voice */}
      <AnimatePresence mode="wait">
        {status === "success" && clonedVoice ? (
          <motion.div
            key="existing-voice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {/* Active voice card */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.05))",
                border: "1px solid rgba(34,197,94,0.25)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
                >
                  <span className="text-lg">🎤</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm truncate">{clonedVoice.voice_name}</span>
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80" }}
                    >
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cloned {clonedVoice.updated_at ? new Date(clonedVoice.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "recently"} · Auto-applied to all videos
                  </p>
                </div>
              </div>

              {/* Waveform decoration */}
              <div className="flex items-center gap-0.5 mb-4 px-1">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: `${6 + Math.sin(i * 0.8) * 5 + Math.random() * 4}px`,
                      background: `rgba(34,197,94,${0.3 + Math.sin(i * 0.5) * 0.2})`,
                      minHeight: "3px",
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetToRecord}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-white transition hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))",
                    border: "1px solid rgba(139,92,246,0.35)",
                  }}
                >
                  Re-clone Voice
                </button>
                <button
                  onClick={deleteVoice}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                  style={{ border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>

            {successMsg && (
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {successMsg}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="clone-form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Mode toggle */}
            <div
              className="flex rounded-xl p-0.5 gap-0.5"
              style={{ background: "rgba(15,12,26,0.8)", border: "1px solid rgba(74,66,96,0.3)" }}
            >
              {(["record", "upload"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); resetToRecord(); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition"
                  style={
                    mode === m
                      ? {
                          background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))",
                          color: "#fff",
                          border: "1px solid rgba(139,92,246,0.4)",
                        }
                      : { color: "rgba(156,163,175,0.8)" }
                  }
                >
                  {m === "record" ? "🎙️ Record" : "📁 Upload File"}
                </button>
              ))}
            </div>

            {/* Tips */}
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}
            >
              <p className="text-[11px] text-gray-400 font-medium mb-1.5">Tips for best quality:</p>
              <ul className="space-y-0.5">
                {[
                  "Record in a quiet room with no background noise",
                  "Speak naturally — read aloud from a book or article",
                  "30 seconds minimum, 2-3 minutes is ideal",
                  "Hold your device 6-12 inches from your mouth",
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                    <span className="text-purple-400 mt-0.5">·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Record or Upload */}
            {mode === "record" ? (
              <div className="space-y-3">
                {/* Recording visualizer */}
                <div
                  className="rounded-2xl p-5 flex flex-col items-center gap-4"
                  style={{
                    background: "rgba(15,12,26,0.7)",
                    border: `1px solid ${status === "recording" ? "rgba(239,68,68,0.4)" : "rgba(74,66,96,0.3)"}`,
                    transition: "border-color 0.3s",
                  }}
                >
                  {/* Timer */}
                  <div className="text-center">
                    <div
                      className="text-4xl font-mono font-bold tabular-nums"
                      style={{
                        color: status === "recording"
                          ? recordingSeconds < 30 ? "#f87171" : "#4ade80"
                          : status === "recorded" ? "#a78bfa" : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {formatTime(recordingSeconds)}
                    </div>
                    <p className="text-xs mt-1"
                      style={{
                        color: status === "recording"
                          ? recordingSeconds < 30 ? "rgba(248,113,113,0.7)" : "rgba(74,222,128,0.7)"
                          : "rgba(156,163,175,0.5)"
                      }}
                    >
                      {status === "recording"
                        ? recordingSeconds < 30
                          ? `${30 - recordingSeconds}s more for minimum quality`
                          : "Great! Stop when ready."
                        : status === "recorded"
                        ? `Recorded ${formatTime(recordingSeconds)}`
                        : "Click to start recording"}
                    </p>
                  </div>

                  {/* Animated waveform during recording */}
                  {status === "recording" && (
                    <div className="flex items-center gap-0.5 w-full px-2">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full animate-pulse"
                          style={{
                            height: `${4 + Math.random() * 20}px`,
                            background: "rgba(239,68,68,0.6)",
                            animationDuration: `${0.4 + Math.random() * 0.8}s`,
                            animationDelay: `${Math.random() * 0.5}s`,
                            minHeight: "3px",
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Record / Stop button */}
                  {status !== "recorded" && (
                    <button
                      onClick={status === "recording" ? stopRecording : startRecording}
                      className="w-16 h-16 rounded-full flex items-center justify-center transition hover:scale-105 active:scale-95"
                      style={{
                        background: status === "recording"
                          ? "linear-gradient(135deg, rgba(239,68,68,0.8), rgba(220,38,38,0.6))"
                          : "linear-gradient(135deg, rgba(139,92,246,0.7), rgba(99,102,241,0.5))",
                        border: "3px solid rgba(255,255,255,0.15)",
                        boxShadow: status === "recording"
                          ? "0 0 30px rgba(239,68,68,0.4)"
                          : "0 0 20px rgba(139,92,246,0.3)",
                      }}
                    >
                      {status === "recording" ? (
                        <div className="w-5 h-5 rounded-sm bg-white" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-white" />
                      )}
                    </button>
                  )}
                </div>

                {/* Audio preview after recording */}
                {status === "recorded" && audioUrl && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "rgba(15,12,26,0.6)", border: "1px solid rgba(74,66,96,0.3)" }}
                  >
                    <p className="text-xs text-gray-400 mb-2">Preview your recording:</p>
                    <audio src={audioUrl} controls className="w-full h-8" style={{ filter: "invert(1) hue-rotate(180deg) brightness(0.8)" }} />
                  </div>
                )}
              </div>
            ) : (
              /* Upload mode */
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: uploadedFile ? "rgba(139,92,246,0.08)" : "rgba(15,12,26,0.6)",
                    border: `2px dashed ${uploadedFile ? "rgba(139,92,246,0.5)" : "rgba(74,66,96,0.4)"}`,
                  }}
                >
                  <div className="text-4xl">{uploadedFile ? "🎵" : "📁"}</div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">
                      {uploadedFile ? uploadedFile.name : "Click to upload audio"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {uploadedFile
                        ? `${(uploadedFile.size / 1024 / 1024).toFixed(1)} MB · MP3, WAV, M4A, WebM, OGG`
                        : "MP3, WAV, M4A, WebM, OGG · Max 10MB"}
                    </p>
                  </div>
                </div>
                {uploadedFile && audioUrl && (
                  <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(15,12,26,0.6)", border: "1px solid rgba(74,66,96,0.3)" }}>
                    <p className="text-xs text-gray-400 mb-2">Preview:</p>
                    <audio src={audioUrl} controls className="w-full h-8" style={{ filter: "invert(1) hue-rotate(180deg) brightness(0.8)" }} />
                  </div>
                )}
              </div>
            )}

            {/* Voice Name Input */}
            {status === "recorded" && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Voice Name <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. My Voice, Narrator Voice, Studio Take 1"
                  maxLength={64}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition"
                  style={{
                    background: "rgba(15,12,26,0.8)",
                    border: "1px solid rgba(74,66,96,0.4)",
                    caretColor: "#a78bfa",
                  }}
                />
              </motion.div>
            )}

            {/* Error message */}
            {errorMsg && (
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171",
                }}
              >
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {status === "recorded" && (
                <>
                  <button
                    onClick={resetToRecord}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium text-gray-400 transition hover:text-white"
                    style={{ border: "1px solid rgba(74,66,96,0.3)" }}
                  >
                    ↩ Redo
                  </button>
                  <button
                    onClick={cloneVoice}
                    disabled={status === ("cloning" as any)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(135deg, rgba(139,92,246,0.7), rgba(99,102,241,0.5))",
                      border: "1px solid rgba(139,92,246,0.5)",
                      boxShadow: "0 4px 20px rgba(139,92,246,0.2)",
                    }}
                  >
                    🎙️ Clone My Voice with ElevenLabs
                  </button>
                </>
              )}
            </div>

            {/* Cloning spinner */}
            {status === "cloning" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-4"
              >
                <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                <p className="text-sm text-gray-400">Cloning your voice with ElevenLabs AI…</p>
                <p className="text-xs text-gray-600">This usually takes 10–30 seconds</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* How it works */}
      {status === "idle" && (
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">How it works</p>
          <div className="space-y-2">
            {[
              ["1", "Record or upload 30s+ of your voice"],
              ["2", "ElevenLabs AI analyzes your vocal pattern"],
              ["3", "Your cloned voice is saved to your profile"],
              ["4", "Every video you create uses your voice automatically"],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-2.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(139,92,246,0.25)", color: "#a78bfa" }}
                >
                  {num}
                </div>
                <p className="text-xs text-gray-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}