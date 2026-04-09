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
    color: "#6b7280",
    features: [
      "AI Shorts — 3/month",
      "Dub Video — 2/month",
      "ReCreate — 2/month",
      "Create Video — 2/month",
      "Thumbnail creator",
      "5 caption styles",
      "720p export",
      "AutoVideo watermark",
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
    color: "#7F77DD",
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
    color: "#378ADD",
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

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "#0a0812" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Billing & Plans</h1>
          <p className="text-gray-400 text-sm">Manage your subscription and usage.</p>
        </div>

        {/* Success/Error message */}
        {message && (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm font-medium"
            style={{
              background: message.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: message.type === "success" ? "#6ee7b7" : "#fca5a5",
            }}>
            {message.text}
          </div>
        )}

        {/* Current plan + usage */}
        {!isLoading && (
          <div className="mb-8 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Current plan</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white capitalize">{plan} plan</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: tier === "free" ? "rgba(107,114,128,0.2)" : "rgba(127,119,221,0.2)", color: tier === "free" ? "#9ca3af" : "#c4b5fd" }}>
                    {tier === "free" ? "Free" : tier === "creator" ? "Creator" : "Studio"}
                  </span>
                </div>
              </div>
              {tier !== "free" && (
                <button onClick={handleManage} disabled={portalLoading}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 transition-all"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}>
                  {portalLoading ? "Loading..." : "Manage subscription"}
                </button>
              )}
            </div>

            {/* Usage bars */}
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">This month's usage</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {pipelines.map(({ key, label }) => {
                const used = usage[key];
                const lim = limits[key] as number;
                const unlimited = lim >= 999999;
                const pct = unlimited ? 0 : Math.min(100, (used / lim) * 100);
                const near = pct >= 80;
                return (
                  <div key={key} className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-lg font-bold text-white">{used}<span className="text-xs font-normal text-gray-500">/{unlimited ? "∞" : lim}</span></p>
                    {!unlimited && (
                      <div className="mt-1.5 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: near ? "#f97316" : "#7F77DD" }} />
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
          <span className="text-sm text-gray-400">Monthly</span>
          <button
            onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
            className="relative w-11 h-6 rounded-full transition-all"
            style={{ background: billing === "annual" ? "#7F77DD" : "rgba(255,255,255,0.12)" }}>
            <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all"
              style={{ left: billing === "annual" ? "22px" : "2px" }} />
          </button>
          <span className="text-sm text-gray-400">Annual <span className="text-purple-400 font-medium">save 20%</span></span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {PLANS_UI.map((p) => {
            const isCurrent = p.id === plan;
            const price = billing === "annual" ? p.price.annual : p.price.monthly;
            const isHighlighted = p.id === "creator";

            return (
              <div key={p.id} className="flex flex-col rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: isHighlighted ? `2px solid ${p.color}55` : "1px solid rgba(255,255,255,0.08)",
                }}>
                {/* Card header */}
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: p.color }}>{p.name}</span>
                    {p.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${p.color}22`, color: p.color }}>{p.badge}</span>
                    )}
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900/50 text-green-400">Current</span>
                    )}
                  </div>

                  <div className="mb-1">
                    <span className="text-3xl font-bold text-white">${price}</span>
                    <span className="text-gray-500 text-sm">/mo</span>
                    {billing === "annual" && price > 0 && (
                      <span className="ml-2 text-xs text-green-400">billed annually</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-4">{p.desc}</p>

                  <div className="space-y-2">
                    {p.features.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5 flex-shrink-0" style={{ fontSize: 12 }}>✓</span>
                        <span className="text-sm text-gray-300">{f}</span>
                      </div>
                    ))}
                    {p.locked.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <span className="text-gray-600 mt-0.5 flex-shrink-0" style={{ fontSize: 12 }}>—</span>
                        <span className="text-sm text-gray-600">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="p-5 pt-0">
                  {isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center text-gray-500"
                      style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                      Current plan
                    </div>
                  ) : p.id === "free" ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center text-gray-600"
                      style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                      Free forever
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(p.id)}
                      disabled={loading === p.id}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: isHighlighted ? p.color : "rgba(255,255,255,0.08)",
                        color: isHighlighted ? "#fff" : "#d1d5db",
                        border: isHighlighted ? "none" : "1px solid rgba(255,255,255,0.12)",
                      }}>
                      {loading === p.id ? "Redirecting..." : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="text-center text-xs text-gray-600">
          <p>Payments are processed securely by Stripe. Cancel anytime from your billing portal.</p>
          <p className="mt-1">Questions? Contact us at <span className="text-gray-400">support@autovideo.ai</span></p>
        </div>

      </div>
    </div>
  );
}