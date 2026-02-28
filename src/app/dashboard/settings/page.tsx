"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUserPreferences } from "@/context/UserPreferencesContext";
import { updateUserPreferences } from "@/lib/preferences/updateUserPreferences";
import { supabase } from "@/lib/supabaseClient";

import SettingsSection from "@/components/settings/SettingsSection";
import SettingsSelect from "@/components/settings/SettingsSelect";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";

/* ── YouTube Connection Status Type ────────────────────────── */
interface YouTubeStatus {
  connected: boolean;
  channel_id?: string;
  channel_title?: string;
  channel_thumbnail?: string;
  connected_at?: string;
}

export default function SettingsPage() {
  const { prefs, loading, setPrefsLocal } = useUserPreferences();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    default_voice: "AI Voice",
    default_video_length: "60 seconds",
    default_style: "modern",
    default_resolution: "1080p",
    default_language: "English",
    default_tone: "friendly",
    default_music: "ambient",
  });

  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [showSuccess, setShowSuccess] = useState(false);

  // YouTube state
  const [ytStatus, setYtStatus] = useState<YouTubeStatus>({ connected: false });
  const [ytLoading, setYtLoading] = useState(true);
  const [ytDisconnecting, setYtDisconnecting] = useState(false);
  const [ytMessage, setYtMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load preferences into form when ready
  useEffect(() => {
    if (!loading && prefs) {
      setForm(prefs);
    }
  }, [loading, prefs]);

  // Check YouTube connection status
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { setYtLoading(false); return; }

        const res = await fetch("/api/auth/youtube/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const status = await res.json();
          setYtStatus(status);
        }
      } catch {} finally {
        setYtLoading(false);
      }
    })();
  }, []);

  // Show message from OAuth callback redirect
  useEffect(() => {
    const yt = searchParams.get("youtube");
    if (yt === "connected") {
      setYtMessage({ type: "success", text: "YouTube connected successfully!" });
      // Refresh status
      (async () => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/auth/youtube/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setYtStatus(await res.json());
      })();
    } else if (yt === "error") {
      const reason = searchParams.get("reason") || "unknown";
      setYtMessage({ type: "error", text: `YouTube connection failed: ${reason}` });
    }
  }, [searchParams]);

  // Connect YouTube
  async function connectYouTube() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      toast({ title: "Error", description: "Please log in first." });
      return;
    }
    // Redirect to Google OAuth
    window.location.href = `/api/auth/youtube/connect?token=${token}`;
  }

  // Disconnect YouTube
  async function disconnectYouTube() {
    setYtDisconnecting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;

      await fetch("/api/auth/youtube/status", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      setYtStatus({ connected: false });
      setYtMessage({ type: "success", text: "YouTube disconnected." });
    } catch {
      setYtMessage({ type: "error", text: "Failed to disconnect." });
    } finally {
      setYtDisconnecting(false);
    }
  }

  // Auto-save
  const handleAutoSave = async (key: string, value: string) => {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setPrefsLocal(updated);
    await updateUserPreferences(updated);
    toast({
      title: "Saved",
      description: `${key.replace("default_", "").replace("_", " ")} updated.`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await updateUserPreferences(form);
    setPrefsLocal(form);
    setSaving(false);
    toast({ title: "Preferences Saved", description: "Your default video settings were updated successfully." });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1800);
  };

  if (loading) {
    return <p className="text-center mt-20 text-gray-500">Loading…</p>;
  }

  return (
    <div className="min-h-screen" style={{ background: "#0f0b1a" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-3xl mx-auto px-4 py-10"
      >
        <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
          <span className="text-2xl">⚙️</span>
          Settings
        </h1>

        {/* ═══════════════════════════════════════════════════════
            CONNECTED ACCOUNTS
        ═══════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6 mb-8"
          style={{
            background: "rgba(20,17,35,0.6)",
            border: "1px solid rgba(74,66,96,0.3)",
          }}
        >
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            🔗 Connected Accounts
          </h2>
          <p className="text-xs text-gray-400 mb-5">
            Connect your social accounts to publish clips directly
          </p>

          {/* Status message */}
          {ytMessage && (
            <div
              className="mb-4 px-4 py-2 rounded-lg text-sm"
              style={{
                background: ytMessage.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${ytMessage.type === "success" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                color: ytMessage.type === "success" ? "#4ade80" : "#f87171",
              }}
            >
              {ytMessage.text}
            </div>
          )}

          {/* YouTube */}
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{
              background: "rgba(15,12,26,0.6)",
              border: "1px solid rgba(74,66,96,0.25)",
            }}
          >
            {/* YouTube icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FF0000"/>
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white text-sm">YouTube</div>
              {ytLoading ? (
                <span className="text-xs text-gray-500">Checking...</span>
              ) : ytStatus.connected ? (
                <div className="flex items-center gap-2 mt-0.5">
                  {ytStatus.channel_thumbnail && (
                    <img src={ytStatus.channel_thumbnail} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-xs text-green-400">{ytStatus.channel_title || "Connected"}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-500">Not connected</span>
              )}
            </div>

            {/* Action button */}
            {ytLoading ? null : ytStatus.connected ? (
              <button
                onClick={disconnectYouTube}
                disabled={ytDisconnecting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 transition hover:text-red-400"
                style={{
                  background: "rgba(74,66,96,0.2)",
                  border: "1px solid rgba(74,66,96,0.3)",
                }}
              >
                {ytDisconnecting ? "..." : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={connectYouTube}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(239,68,68,0.6), rgba(220,38,38,0.4))",
                  border: "1px solid rgba(239,68,68,0.4)",
                  boxShadow: "0 2px 12px rgba(239,68,68,0.15)",
                }}
              >
                Connect YouTube
              </button>
            )}
          </div>

          {/* TikTok — Coming Soon */}
          <div
            className="rounded-xl p-4 flex items-center gap-4 mt-3 opacity-50"
            style={{
              background: "rgba(15,12,26,0.6)",
              border: "1px solid rgba(74,66,96,0.15)",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(74,66,96,0.15)",
                border: "1px solid rgba(74,66,96,0.15)",
              }}
            >
              <span className="text-xl">🎵</span>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-400 text-sm">TikTok</div>
              <span className="text-xs text-gray-600">Coming soon</span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium text-gray-500 border border-gray-700">
              Soon
            </span>
          </div>

          {/* Instagram — Coming Soon */}
          <div
            className="rounded-xl p-4 flex items-center gap-4 mt-3 opacity-50"
            style={{
              background: "rgba(15,12,26,0.6)",
              border: "1px solid rgba(74,66,96,0.15)",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(74,66,96,0.15)",
                border: "1px solid rgba(74,66,96,0.15)",
              }}
            >
              <span className="text-xl">📸</span>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-400 text-sm">Instagram Reels</div>
              <span className="text-xs text-gray-600">Coming soon</span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium text-gray-500 border border-gray-700">
              Soon
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            VIDEO CREATION DEFAULTS
        ═══════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(20,17,35,0.6)",
            border: "1px solid rgba(74,66,96,0.3)",
          }}
        >
          <h2 className="text-lg font-semibold text-white mb-1">🎬 Video Creation Defaults</h2>
          <p className="text-xs text-gray-400 mb-5">
            These settings auto-populate when you start a new video project.
          </p>

          <SettingsSection
            title=""
            description=""
          >
            <SettingsSelect
              label="Default Voice"
              value={form.default_voice}
              options={["AI Voice", "Narrator", "Female Soft", "Male Deep"]}
              onChange={(v) => handleAutoSave("default_voice", v)}
            />
            <SettingsSelect
              label="Default Video Length"
              value={form.default_video_length}
              options={["30 seconds", "60 seconds", "90 seconds", "2 minutes","3 minutes", "4 minutes", "5 minutes", "8 minutes", "12 minutes", "16 minutes", "20 minutes", "24 minutes","30 minutes"]}
              onChange={(v) => handleAutoSave("default_video_length", v)}
            />
            <SettingsSelect
              label="Default Style"
              value={form.default_style}
              options={["modern", "cinematic", "documentary", "tiktok", "retro"]}
              onChange={(v) => handleAutoSave("default_style", v)}
            />
            <SettingsSelect
              label="Default Resolution"
              value={form.default_resolution}
              options={["720p", "1080p", "4K"]}
              onChange={(v) => handleAutoSave("default_resolution", v)}
            />
            <SettingsSelect
              label="Default Language"
              value={form.default_language}
              options={["English", "Vietnamese", "Spanish", "Chinese", "Korean"]}
              onChange={(v) => handleAutoSave("default_language", v)}
            />
            <SettingsSelect
              label="Default Tone"
              value={form.default_tone}
              options={["friendly", "professional", "motivational", "serious", "fun"]}
              onChange={(v) => handleAutoSave("default_tone", v)}
            />
            <SettingsSelect
              label="Default Music Style"
              value={form.default_music}
              options={["ambient", "cinematic", "upbeat", "emotional", "minimal"]}
              onChange={(v) => handleAutoSave("default_music", v)}
            />
          </SettingsSection>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 text-white rounded-xl font-semibold mt-4 transition"
            style={{
              background: saving
                ? "rgba(99,102,241,0.3)"
                : "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))",
              border: "1px solid rgba(139,92,246,0.4)",
            }}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>

          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.25 }}
              className="flex justify-center mt-3"
            >
              <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Saved!</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
