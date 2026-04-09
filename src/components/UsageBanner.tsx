// ============================================================
// FILE: src/components/UsageBanner.tsx
// Shows usage warning/limit banners for free-tier users
// Usage: <UsageBanner pipeline="shorts" />
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PLANS, type PlanId } from "@/lib/stripe";
import Link from "next/link";

type Pipeline = "shorts" | "dub" | "recreate" | "create";

const PIPELINE_LABELS: Record<Pipeline, string> = {
  shorts:   "AI Shorts",
  dub:      "Dub Video",
  recreate: "ReCreate",
  create:   "Create Video",
};

const USAGE_COLUMNS: Record<Pipeline, string> = {
  shorts:   "usage_shorts",
  dub:      "usage_dub",
  recreate: "usage_recreate",
  create:   "usage_create",
};

interface UsageData {
  plan: PlanId;
  used: number;
  limit: number;
}

interface UsageBannerProps {
  pipeline: Pipeline;
  className?: string;
}

export default function UsageBanner({ pipeline, className = "" }: UsageBannerProps) {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const col = USAGE_COLUMNS[pipeline];
        const { data: profile } = await supabase
          .from("user_profiles")
          .select(`plan, ${col}`)
          .eq("id", session.user.id)
          .single();

        if (!cancelled && profile) {
          const plan = ((profile as any).plan || "free") as PlanId;
          const planDef = PLANS[plan] ?? PLANS["free"];
          const used = (profile as any)[col] ?? 0;
          const limit = planDef.limits[pipeline] as number;
          setData({ plan, used, limit });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [pipeline]);

  // Don't show for paid unlimited plans
  if (!data) return null;
  if (data.limit >= 999999) return null;

  const remaining = data.limit - data.used;
  const pct = Math.min(100, (data.used / data.limit) * 100);
  const isAtLimit = data.used >= data.limit;
  const isNearLimit = pct >= 80 && !isAtLimit;
  const label = PIPELINE_LABELS[pipeline];

  // Don't show if usage is low and under 80%
  if (!isAtLimit && !isNearLimit) return null;

  return (
    <div
      className={`rounded-xl px-4 py-3 flex items-center justify-between gap-4 ${className}`}
      style={{
        background: isAtLimit
          ? "rgba(239,68,68,0.12)"
          : "rgba(249,115,22,0.10)",
        border: isAtLimit
          ? "1px solid rgba(239,68,68,0.3)"
          : "1px solid rgba(249,115,22,0.25)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <span style={{ fontSize: 18 }}>{isAtLimit ? "🚫" : "⚠️"}</span>

        {/* Message */}
        <div>
          {isAtLimit ? (
            <p className="text-sm font-semibold" style={{ color: "#fca5a5" }}>
              {label} limit reached — {data.used}/{data.limit} videos used this month
            </p>
          ) : (
            <p className="text-sm font-semibold" style={{ color: "#fdba74" }}>
              {remaining} {label} video{remaining === 1 ? "" : "s"} remaining this month ({data.used}/{data.limit} used)
            </p>
          )}
          <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
            Resets on the 1st · Upgrade for more videos
          </p>
        </div>
      </div>

      {/* Upgrade CTA */}
      <Link
        href="/dashboard/billing"
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
        style={{
          background: isAtLimit ? "#ef4444" : "#f97316",
          color: "#fff",
        }}
      >
        Upgrade
      </Link>
    </div>
  );
}