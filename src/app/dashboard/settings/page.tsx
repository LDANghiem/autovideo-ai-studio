// ============================================================
// FILE: src/app/dashboard/settings/page.tsx
// ============================================================
// Ripple — Settings Page
// Brand pass: coral CTAs, Ripple cards and ink background,
// Space Grotesk headings, semantic statuses.
//
// YouTube brand red preserved (it's YouTube's identity, not ours).
// Studio gating now uses coral (matches sidebar Studio tier badge).
//
// All logic preserved: YouTube OAuth flow, Voice Clone gating,
// auto-save on field change, manual Save Preferences button.
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUserPreferences } from "@/context/UserPreferencesContext";
import { updateUserPreferences } from "@/lib/preferences/updateUserPreferences";
import { supabase } from "@/lib/supabaseClient";
import { useUserTier } from "@/lib/useUserTier";

import SettingsSection from "@/components/settings/SettingsSection";
import SettingsSelect from "@/components/settings/SettingsSelect";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const VoiceCloneStudio = dynamic(
  () => import("@/components/voice-clone/VoiceCloneStudio"),
  {
    ssr: false,
    loading: () => (
      <div className="h-24 flex items-center justify-center">
        <div
          className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{
            borderColor: "rgba(255,107,90,0.2)",
            borderTopColor: "#FF6B5A",
          }}
        />
      </div>
    ),
  }
);

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
  const userTier = useUserTier();

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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E1A" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{
              borderColor: "rgba(255,107,90,0.2)",
              borderTopColor: "#FF6B5A",
            }}
          />
          <p className="text-sm" style={{ color: "#8B8794" }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F0E1A" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-3xl mx-auto px-4 py-10"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(255,107,90,0.12)",
              border: "1px solid rgba(255,107,90,0.2)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
              Settings
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
              Account preferences and integrations
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            CONNECTED ACCOUNTS
        ═══════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-1 flex items-center gap-2"
            style={{
              color: "#F5F2ED",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Connected Accounts
          </h2>
          <p className="text-xs mb-5" style={{ color: "#8B8794" }}>
            Connect your social accounts to publish clips directly
          </p>

          {/* Status message */}
          {ytMessage && (
            <div
              className="mb-4 px-4 py-2.5 rounded-lg text-sm"
              style={{
                background: ytMessage.type === "success" ? "rgba(93,211,158,0.10)" : "rgba(255,107,107,0.10)",
                border: `1px solid ${ytMessage.type === "success" ? "rgba(93,211,158,0.3)" : "rgba(255,107,107,0.3)"}`,
                color: ytMessage.type === "success" ? "#5DD39E" : "#FF6B6B",
              }}
            >
              {ytMessage.text}
            </div>
          )}

          {/* YouTube — keeps YouTube red brand color */}
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* YouTube icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,0,0,0.1)",
                border: "1px solid rgba(255,0,0,0.2)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FF0000"/>
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div
                className="font-semibold text-sm"
                style={{
                  color: "#F5F2ED",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                YouTube
              </div>
              {ytLoading ? (
                <span className="text-xs" style={{ color: "#5A5762" }}>Checking...</span>
              ) : ytStatus.connected ? (
                <div className="flex items-center gap-2 mt-0.5">
                  {ytStatus.channel_thumbnail && (
                    <img src={ytStatus.channel_thumbnail} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-xs font-medium" style={{ color: "#5DD39E" }}>
                    {ytStatus.channel_title || "Connected"}
                  </span>
                </div>
              ) : (
                <span className="text-xs" style={{ color: "#5A5762" }}>Not connected</span>
              )}
            </div>

            {/* Action button */}
            {ytLoading ? null : ytStatus.connected ? (
              <button
                onClick={disconnectYouTube}
                disabled={ytDisconnecting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (!ytDisconnecting) {
                    e.currentTarget.style.color = "#FF6B6B";
                    e.currentTarget.style.borderColor = "rgba(255,107,107,0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!ytDisconnecting) {
                    e.currentTarget.style.color = "#8B8794";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  }
                }}
              >
                {ytDisconnecting ? "..." : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={connectYouTube}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #FF0000 0%, #CC0000 100%)",
                  boxShadow: "0 2px 12px rgba(255,0,0,0.25)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Connect YouTube
              </button>
            )}
          </div>

          {/* TikTok — Coming Soon */}
          <div
            className="rounded-xl p-4 flex items-center gap-4 mt-3"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              opacity: 0.5,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span className="text-xl">🎵</span>
            </div>
            <div className="flex-1">
              <div
                className="font-semibold text-sm"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                TikTok
              </div>
              <span className="text-xs" style={{ color: "#5A5762" }}>Coming soon</span>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
              style={{
                color: "#5A5762",
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Soon
            </span>
          </div>

          {/* Instagram — Coming Soon */}
          <div
            className="rounded-xl p-4 flex items-center gap-4 mt-3"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              opacity: 0.5,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span className="text-xl">📸</span>
            </div>
            <div className="flex-1">
              <div
                className="font-semibold text-sm"
                style={{
                  color: "#8B8794",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Instagram Reels
              </div>
              <span className="text-xs" style={{ color: "#5A5762" }}>Coming soon</span>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
              style={{
                color: "#5A5762",
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Soon
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            VOICE CLONING (Studio Tier)
        ═══════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6 mb-6 relative overflow-hidden"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Studio-only lock overlay */}
          {userTier !== "studio" && userTier !== "loading" && (
            <div
              className="absolute inset-0 rounded-2xl z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-[1px]"
              style={{ background: "rgba(15,14,26,0.85)" }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "rgba(255,107,90,0.15)",
                  border: "1px solid rgba(255,107,90,0.3)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="text-center">
                <p
                  className="font-semibold text-sm"
                  style={{
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                >
                  Studio Tier Required
                </p>
                <p className="text-xs mt-1" style={{ color: "#8B8794" }}>
                  Upgrade to Studio to clone your voice
                </p>
              </div>
              <a
                href="/dashboard/billing"
                className="px-5 py-2 rounded-xl text-xs font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
                  color: "#0F0E1A",
                  boxShadow: "0 4px 16px -4px rgba(255,107,90,0.5)",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Upgrade to Studio →
              </a>
            </div>
          )}

          <VoiceCloneStudio />
        </div>

        {/* ═══════════════════════════════════════════════════════
            VIDEO CREATION DEFAULTS
        ═══════════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-1 flex items-center gap-2"
            style={{
              color: "#F5F2ED",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Video Creation Defaults
          </h2>
          <p className="text-xs mb-5" style={{ color: "#8B8794" }}>
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
            className="w-full py-3 rounded-xl font-semibold mt-4 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: saving
                ? "rgba(255,107,90,0.4)"
                : "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
              color: "#0F0E1A",
              boxShadow: saving ? "none" : "0 4px 16px -4px rgba(255,107,90,0.5)",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
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
              <div
                className="flex items-center gap-2 font-semibold text-sm"
                style={{
                  color: "#5DD39E",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
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