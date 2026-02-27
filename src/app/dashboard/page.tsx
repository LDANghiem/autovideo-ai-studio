// ============================================================
// FILE: src/app/dashboard/page.tsx
// ============================================================
// Professional dashboard — dark theme with good contrast
// ============================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Welcome back{!loading && email ? `, ${firstName}` : ""}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {loading ? "Loading..." : email || "Not signed in"}
            </p>
          </div>
          <button
            onClick={onSignOut}
            disabled={signingOut}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-300 bg-[#352e50] border border-gray-500 hover:bg-[#382f55] hover:text-white disabled:opacity-50 transition-all duration-200"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {/* ── Hero: Dub a Video ───────────────────────────── */}
        <Link
          href="/dashboard/dub-video/new"
          className="group block rounded-2xl p-6 mb-6 transition-all duration-300 hover:scale-[1.005]"
          style={{
            background: "linear-gradient(135deg, #2e2650 0%, #332a55 50%, #2e2850 100%)",
            border: "1px solid rgba(99,102,241,0.25)",
            boxShadow: "0 4px 24px rgba(59,130,246,0.08)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                    boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                    Dub Any Video
                  </h2>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-wider">
                    NEW
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-300 max-w-md leading-relaxed">
                Auto-detect any language & dub into 18 languages with AI voices.
                126 native narrators across Vietnamese, English, Spanish, French, and more.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-gray-400 group-hover:text-blue-400 transition-colors mt-2">
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

          {/* Create Project */}
          <Link
            href="/dashboard/create"
            className="group block rounded-xl p-5 bg-[#2d2745] border border-gray-500/40 hover:border-blue-500/40 hover:bg-[#352e50] transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
              Create a Video
            </div>
            <div className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Start a new project and render a video from scratch.
            </div>
          </Link>

          {/* My Projects */}
          <Link
            href="/dashboard/projects"
            className="group block rounded-xl p-5 bg-[#2d2745] border border-gray-500/40 hover:border-amber-500/40 hover:bg-[#352e50] transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
              My Projects
            </div>
            <div className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              View, render, and manage your saved projects.
            </div>
          </Link>

          {/* Settings */}
          <Link
            href="/dashboard/settings"
            className="group block rounded-xl p-5 bg-[#2d2745] border border-gray-500/40 hover:border-gray-500/40 hover:bg-[#352e50] transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-lg bg-gray-500/15 flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white group-hover:text-gray-200 transition-colors">
              Settings
            </div>
            <div className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Update preferences, voice, style, and defaults.
            </div>
          </Link>
        </div>

        {/* ── Quick Tips ──────────────────────────────────── */}
        <div className="rounded-xl p-5 bg-[#2d2745] border border-gray-500/40">
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick tips</span>
          </div>
          <div className="space-y-2 text-[13px] text-gray-400 leading-relaxed">
            <p>Use <span className="text-white font-medium">Create</span> to generate a new video project from scratch.</p>
            <p>Use <span className="text-blue-400 font-medium">Dub a Video</span> to auto-detect any language & dub into 18 languages.</p>
            <p>Use <span className="text-white font-medium">Projects</span> to retry renders and review your results.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
