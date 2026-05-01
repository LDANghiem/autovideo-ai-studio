// ============================================================
// FILE: src/app/login/page.tsx
// ============================================================
// Ripple — Sign In page
// Brand pass: Ripple logo + tagline, coral primary CTA, dark
// theme with subtle radial gradient backdrop.
//
// Preserves all auth logic:
// - signInWithPassword flow
// - Double session check (defense against silent persistence bugs)
// - router.replace("/dashboard/create") + refresh on success
// - Console logs for debugging
//
// Small UX upgrade: Enter key in password field submits the form.
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RippleLogo from "@/components/RippleLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Enter email and password.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // 1) Immediately check what Supabase returned
      console.log("SIGNIN RESULT session:", data.session);

      // 2) Confirm it's actually persisted (this is the key test)
      const { data: sessionCheck } = await supabase.auth.getSession();
      console.log("SESSION AFTER SIGNIN:", sessionCheck.session);

      if (!sessionCheck.session?.access_token) {
        throw new Error(
          "Signed in, but no session was persisted. This usually means the app is using a different Supabase project/keys, or the client is not the shared singleton."
        );
      }

      // Good: navigate
      router.replace("/dashboard/create");
      router.refresh(); // helps App Router re-render with new auth state
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      alert(err?.message ? err.message : JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  // Shared input style helper
  const inputStyle = (focused: boolean): React.CSSProperties => ({
    background: "#16151F",
    border: focused ? "1px solid rgba(255,107,90,0.5)" : "1px solid rgba(255,255,255,0.1)",
    color: "#F5F2ED",
    boxShadow: focused ? "0 0 0 3px rgba(255,107,90,0.15)" : "none",
    fontFamily: "'Inter', system-ui, sans-serif",
    transition: "all 0.15s ease-out",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "#0F0E1A" }}
    >
      {/* Ambient coral/amber gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 30%, rgba(255,107,90,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 30% 70%, rgba(255,169,77,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Ripple mark — large, decorative, blurred far behind the card */}
      <div
        className="absolute pointer-events-none opacity-[0.04]"
        style={{ filter: "blur(2px)" }}
      >
        <svg width="600" height="600" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="#FF6B5A" strokeWidth="0.3" fill="none" />
          <circle cx="16" cy="16" r="9" stroke="#FF6B5A" strokeWidth="0.4" fill="none" />
          <circle cx="16" cy="16" r="4" fill="#FFA94D" />
        </svg>
      </div>

      {/* Login card */}
      <div
        className="w-full max-w-md rounded-2xl p-8 relative z-10"
        style={{
          background: "rgba(22,21,31,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 24px 64px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,90,0.05)",
        }}
      >
        {/* ── Logo + tagline ─────────────────────────── */}
        <div className="flex flex-col items-center text-center mb-8">
          <RippleLogo size="lg" />
          <p
            className="text-sm mt-3"
            style={{
              color: "#8B8794",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}
          >
            One video. Infinite reach.
          </p>
        </div>

        <h1
          className="text-xl font-bold mb-6"
          style={{
            color: "#F5F2ED",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "-0.01em",
          }}
        >
          Sign in to your account
        </h1>

        {/* ── Email ──────────────────────────────────── */}
        <label
          className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
          style={{
            color: "#8B8794",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "0.05em",
          }}
        >
          Email
        </label>
        <input
          className="w-full rounded-lg px-3 py-2.5 mb-4 text-sm outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          style={inputStyle(emailFocused)}
        />

        {/* ── Password ───────────────────────────────── */}
        <label
          className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
          style={{
            color: "#8B8794",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            letterSpacing: "0.05em",
          }}
        >
          Password
        </label>
        <input
          className="w-full rounded-lg px-3 py-2.5 mb-6 text-sm outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) handleLogin();
          }}
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
          style={inputStyle(passwordFocused)}
        />

        {/* ── Sign In CTA (coral) ────────────────────── */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          style={{
            background: loading
              ? "rgba(255,107,90,0.4)"
              : "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)",
            color: "#0F0E1A",
            boxShadow: loading ? "none" : "0 8px 24px -8px rgba(255,107,90,0.5)",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        >
          {loading && (
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {/* ── Help text ──────────────────────────────── */}
        <p
          className="text-center text-xs mt-6"
          style={{ color: "#5A5762" }}
        >
          Trouble signing in?{" "}
          <span style={{ color: "#FF8B7A", cursor: "pointer" }}>
            Contact support
          </span>
        </p>
      </div>
    </div>
  );
}