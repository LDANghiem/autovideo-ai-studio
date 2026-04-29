// ============================================================
// FILE: src/app/dashboard/page.tsx
// ============================================================
// Dashboard home — Ripple-branded
// Brand pass: coral hero, Ripple logo in header, refined accents.
// Session 2 will rebuild the layout entirely (3-zone activity dashboard).
// ============================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RippleLogo from "@/components/RippleLogo";

export default function DashboardHomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setLoading(false);
    };
    load();
  }, []);

  const onSignOut = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      window.location.href = "/login";
    } finally {
      setSigningOut(false);
    }
  };

  const firstName = email?.split("@")[0] || "there";

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Header with Ripple logo ─────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <RippleLogo size="lg" markOnly />
            <div>
              <h1
                className="text-2xl font-bold text-white tracking-tight"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
              >
                Welcome back{!loading && email ? `, ${firstName}` : ""}
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8B8794" }}>
                {loading ? "Loading..." : email || "Not signed in"}
              </p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            disabled={signingOut}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              color: "#F5F2ED",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => {
              if (!signingOut) {
                e.currentTarget.style.background = "rgba(255,107,90,0.1)";
                e.currentTarget.style.borderColor = "rgba(255,107,90,0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (!signingOut) {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {/* ── Hero: Dub a Video (coral) ───────────────────── */}
        <Link
          href="/dashboard/dub-video/new"
          className="group block rounded-2xl p-6 mb-6 transition-all duration-300 hover:scale-[1.005]"
          style={{
            background: "linear-gradient(135deg, #2A1A1F 0%, #3A1F1E 50%, #2A1A1F 100%)",
            border: "1px solid rgba(255,107,90,0.25)",
            boxShadow: "0 4px 24px rgba(255,107,90,0.08)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #FF6B5A 0%, #FFA94D 100%)",
                    boxShadow: "0 2px 12px rgba(255,107,90,0.4)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F0E1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div>
                  <h2
                    className="text-lg font-bold text-white transition-colors"
                    style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                  >
                    Dub Any Video
                  </h2>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider"
                    style={{
                      background: "rgba(255,107,90,0.15)",
                      color: "#FF8B7A",
                      border: "1px solid rgba(255,107,90,0.3)",
                    }}
                  >
                    HERO
                  </span>
                </div>
              </div>
              <p className="text-sm max-w-md leading-relaxed" style={{ color: "#C7C3C9" }}>
                One video. Infinite reach. Auto-detect any language & dub into 18 languages with AI voices.
                126 native narrators across Vietnamese, English, Spanish, French, and more.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1 mt-2 transition-colors" style={{ color: "#8B8794" }}>
              <span className="text-sm font-medium">Try it</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>

          {/* Language flags */}
          <div className="flex items-center gap-1.5 mt-4">
            {["🇻🇳", "🇺🇸", "🇪🇸", "🇫🇷", "🇧🇷", "🇩🇪", "🇮🇹", "🇨🇳", "🇯🇵", "🇰🇷", "🇮🇳", "🇸🇦", "🇷🇺", "🇮🇩", "🇵🇱", "🇳🇱", "🇹🇷", "🇸🇪"].map((flag, i) => (
              <span
                key={i}
                className="text-sm opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                style={{ transitionDelay: `${i * 20}ms` }}
              >
                {flag}
              </span>
            ))}
          </div>
        </Link>

        {/* ── Feature Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

          {/* Create Project — slate (de-emphasized) */}
          <Link
            href="/dashboard/create"
            className="group block rounded-xl p-5 transition-all duration-200"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1C1B27";
              e.currentTarget.style.borderColor = "rgba(123,122,142,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#16151F";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: "rgba(123,122,142,0.15)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A4A3B5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div
              className="text-sm font-semibold text-white"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Create a Video
            </div>
            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: "#8B8794" }}>
              Start a new project and render a video from scratch.
            </div>
          </Link>

          {/* My Projects — amber */}
          <Link
            href="/dashboard/projects"
            className="group block rounded-xl p-5 transition-all duration-200"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1C1B27";
              e.currentTarget.style.borderColor = "rgba(255,169,77,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#16151F";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: "rgba(255,169,77,0.15)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFA94D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div
              className="text-sm font-semibold text-white"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              My Projects
            </div>
            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: "#8B8794" }}>
              View, render, and manage your saved projects.
            </div>
          </Link>

          {/* Settings — neutral */}
          <Link
            href="/dashboard/settings"
            className="group block rounded-xl p-5 transition-all duration-200"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1C1B27";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#16151F";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B8794" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div
              className="text-sm font-semibold text-white"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Settings
            </div>
            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: "#8B8794" }}>
              Update preferences, voice, style, and defaults.
            </div>
          </Link>
        </div>

        {/* ── Quick Tips ──────────────────────────────────── */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF8B7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#FF8B7A" }}
            >
              Quick tips
            </span>
          </div>
          <div className="space-y-2 text-[13px] leading-relaxed" style={{ color: "#8B8794" }}>
            <p>
              Use <span className="text-white font-medium">Dub a Video</span> to multiply your reach across 18 languages.
            </p>
            <p>
              Use <span className="text-white font-medium">Create</span> to generate a new video project from scratch.
            </p>
            <p>
              Use <span className="text-white font-medium">Projects</span> to retry renders and review your results.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}