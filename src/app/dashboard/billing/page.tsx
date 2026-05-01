// ============================================================
// FILE: src/app/dashboard/billing/page.tsx
// ============================================================
// Ripple — Billing & Plans
// Brand pass: plan colors map to Ripple tier identity.
//   Starter → slate (de-emphasized free tier)
//   Creator → amber (Ripple secondary, matches sidebar badge)
//   Studio  → coral (Ripple primary, matches sidebar badge)
//
// All Stripe checkout / customer portal / usage logic preserved.
// ============================================================

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserPlan } from "@/lib/useUserTier";
import { useSearchParams } from "next/navigation";

const PLANS_UI = [
  {
    id: "free",
    name: "Starter",
    price: { monthly: 0, annual: 0 },
    desc: "Try the core tools. No credit card required.",
    color: "#7B7A8E",
    accentBg: "rgba(123,122,142,0.10)",
    accentBorder: "rgba(123,122,142,0.3)",
    features: [
      "AI Shorts — 3/month",
      "Dub Video — 2/month",
      "ReCreate — 2/month",
      "Create Video — 2/month",
      "Thumbnail creator",
      "5 caption styles",
      "720p export",
      "Ripple watermark",
    ],
    locked: [
      "No watermark",
      "Voice cloning",
      "YouTube auto-publish",
      "Article → Video",
      "Batch scheduler",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    price: { monthly: 19, annual: 15 },
    desc: "For solo creators publishing 3-5x per week.",
    color: "#FFA94D",
    accentBg: "rgba(255,169,77,0.10)",
    accentBorder: "rgba(255,169,77,0.35)",
    badge: "Most popular",
    features: [
      "AI Shorts — 30/month",
      "Dub Video — 20/month",
      "ReCreate — 20/month",
      "Create Video — 15/month",
      "No watermark",
      "1080p export",
      "Up to 3min videos",
      "YouTube auto-publish",
      "Article → Video",
      "Custom intro/outro",
      "Vietnamese SEO generator",
      "Unified video library",
    ],
    locked: [
      "Voice cloning",
      "Batch scheduler",
      "Dual-language captions",
      "Analytics dashboard",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: { monthly: 49, annual: 39 },
    desc: "For agencies and channels publishing daily.",
    color: "#FF6B5A",
    accentBg: "rgba(255,107,90,0.10)",
    accentBorder: "rgba(255,107,90,0.35)",
    features: [
      "Unlimited videos",
      "Everything in Creator",
      "Voice cloning",
      "Batch scheduler (7-day queue)",
      "Dual-language captions (VI + EN)",
      "YouTube analytics dashboard",
      "Multi-platform export",
      "Priority rendering (2x faster)",
      "Brand kit",
      "Zalo share integration",
      "API access",
    ],
    locked: [],
  },
];

export default function BillingPage() {
  const { tier, plan, usage, limits, isLoading } = useUserPlan();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    const planName = searchParams.get("plan");
    if (success === "true") setMessage({ type: "success", text: `You're now on the ${planName || "new"} plan! Enjoy your upgraded features.` });
    if (cancelled === "true") setMessage({ type: "error", text: "Checkout cancelled — no charge was made." });
  }, [searchParams]);

  async function handleUpgrade(planId: string) {
    if (planId === "free" || planId === plan) return;
    setLoading(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ planId, billing }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setMessage({ type: "error", text: data.error || "Failed to create checkout session." });
    } catch {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {} finally { setPortalLoading(false); }
  }

  const pipelines = [
    { key: "shorts", label: "AI Shorts" },
    { key: "dub", label: "Dub Video" },
    { key: "recreate", label: "ReCreate" },
    { key: "create", label: "Create Video" },
  ] as const;

  // Tier badge colors matching sidebar
  const tierBadge = {
    free: { bg: "rgba(139,135,148,0.15)", color: "#A4A3B5" },
    creator: { bg: "rgba(255,169,77,0.15)", color: "#FFC174" },
    studio: { bg: "rgba(255,107,90,0.15)", color: "#FF8B7A" },
  };

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "#0F0E1A" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{
              color: "#F5F2ED",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            Billing & Plans
          </h1>
          <p className="text-sm" style={{ color: "#8B8794" }}>
            Manage your subscription and usage.
          </p>
        </div>

        {/* Success/Error message */}
        {message && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm font-medium"
            style={{
              background: message.type === "success" ? "rgba(93,211,158,0.10)" : "rgba(255,107,107,0.10)",
              border: `1px solid ${message.type === "success" ? "rgba(93,211,158,0.3)" : "rgba(255,107,107,0.3)"}`,
              color: message.type === "success" ? "#5DD39E" : "#FF6B6B",
            }}
          >
            {message.text}
          </div>
        )}

        {/* Current plan + usage */}
        {!isLoading && (
          <div
            className="mb-8 p-5 rounded-2xl"
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
              <div>
                <p
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: "#5A5762", fontFamily: "'Space Grotesk', system-ui, sans-serif", letterSpacing: "0.1em" }}
                >
                  Current plan
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xl font-bold capitalize"
                    style={{
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    {plan} plan
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: tierBadge[tier as keyof typeof tierBadge]?.bg || tierBadge.free.bg,
                      color: tierBadge[tier as keyof typeof tierBadge]?.color || tierBadge.free.color,
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                  >
                    {tier === "free" ? "Free" : tier === "creator" ? "Creator" : "Studio"}
                  </span>
                </div>
              </div>
              {tier !== "free" && (
                <button
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#F5F2ED",
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => {
                    if (!portalLoading) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!portalLoading) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    }
                  }}
                >
                  {portalLoading ? "Loading..." : "Manage subscription"}
                </button>
              )}
            </div>

            {/* Usage bars */}
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "#5A5762", fontFamily: "'Space Grotesk', system-ui, sans-serif", letterSpacing: "0.1em" }}
            >
              This month's usage
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {pipelines.map(({ key, label }) => {
                const used = usage[key];
                const lim = limits[key] as number;
                const unlimited = lim >= 999999;
                const pct = unlimited ? 0 : Math.min(100, (used / lim) * 100);
                const near = pct >= 80;
                return (
                  <div
                    key={key}
                    className="p-3 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: "#8B8794" }}>{label}</p>
                    <p
                      className="text-lg font-bold"
                      style={{
                        color: "#F5F2ED",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {used}
                      <span className="text-xs font-normal" style={{ color: "#5A5762" }}>
                        /{unlimited ? "∞" : lim}
                      </span>
                    </p>
                    {!unlimited && (
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: near ? "#FFA94D" : "#FF6B5A",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-sm" style={{ color: "#8B8794" }}>Monthly</span>
          <button
            onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
            className="relative w-11 h-6 rounded-full transition-all"
            style={{ background: billing === "annual" ? "#FF6B5A" : "rgba(255,255,255,0.1)" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
              style={{
                left: billing === "annual" ? "22px" : "2px",
                background: "#F5F2ED",
              }}
            />
          </button>
          <span className="text-sm" style={{ color: "#8B8794" }}>
            Annual{" "}
            <span className="font-semibold" style={{ color: "#FF8B7A" }}>save 20%</span>
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {PLANS_UI.map((p) => {
            const isCurrent = p.id === plan;
            const price = billing === "annual" ? p.price.annual : p.price.monthly;
            const isHighlighted = p.id === "creator";

            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl overflow-hidden transition-all"
                style={{
                  background: "#16151F",
                  border: isHighlighted
                    ? `2px solid ${p.accentBorder}`
                    : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isHighlighted ? `0 0 32px -16px ${p.color}` : "none",
                }}
              >
                {/* Card header */}
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{
                        color: p.color,
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {p.name}
                    </span>
                    {p.badge && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: p.accentBg,
                          color: p.color,
                          border: `1px solid ${p.accentBorder}`,
                        }}
                      >
                        {p.badge}
                      </span>
                    )}
                    {isCurrent && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(93,211,158,0.15)",
                          color: "#5DD39E",
                          border: "1px solid rgba(93,211,158,0.3)",
                        }}
                      >
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mb-1">
                    <span
                      className="text-3xl font-bold"
                      style={{
                        color: "#F5F2ED",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      ${price}
                    </span>
                    <span className="text-sm" style={{ color: "#5A5762" }}>/mo</span>
                    {billing === "annual" && price > 0 && (
                      <span className="ml-2 text-xs" style={{ color: "#5DD39E" }}>billed annually</span>
                    )}
                  </div>
                  <p className="text-xs mb-4" style={{ color: "#8B8794" }}>{p.desc}</p>

                  <div className="space-y-2">
                    {p.features.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <span style={{ color: "#5DD39E", fontSize: 12, marginTop: 2 }} className="flex-shrink-0">✓</span>
                        <span className="text-sm" style={{ color: "#C7C3C9" }}>{f}</span>
                      </div>
                    ))}
                    {p.locked.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <span style={{ color: "#3A3845", fontSize: 12, marginTop: 2 }} className="flex-shrink-0">—</span>
                        <span className="text-sm" style={{ color: "#5A5762" }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="p-5 pt-0">
                  {isCurrent ? (
                    <div
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                      style={{
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "#5A5762",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      Current plan
                    </div>
                  ) : p.id === "free" ? (
                    <div
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
                      style={{
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "#5A5762",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      Free forever
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(p.id)}
                      disabled={loading === p.id}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
                      style={{
                        background: isHighlighted
                          ? `linear-gradient(135deg, ${p.color} 0%, ${p.color}dd 100%)`
                          : p.accentBg,
                        color: isHighlighted ? "#0F0E1A" : p.color,
                        border: isHighlighted ? "none" : `1px solid ${p.accentBorder}`,
                        boxShadow: isHighlighted ? `0 4px 16px -4px ${p.color}80` : "none",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      }}
                    >
                      {loading === p.id ? "Redirecting..." : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="text-center text-xs" style={{ color: "#5A5762" }}>
          <p>Payments are processed securely by Stripe. Cancel anytime from your billing portal.</p>
          <p className="mt-1">
            Questions? Contact us at{" "}
            <span style={{ color: "#FF8B7A" }}>support@ripple.app</span>
          </p>
        </div>

      </div>
    </div>
  );
}