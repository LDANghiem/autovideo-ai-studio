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

type Pipeline = "shorts" | "dub" | "create";

const PIPELINE_LABELS: Record<Pipeline, string> = {
  shorts: "AI Shorts",
  dub:    "Dub Video",
  create: "Create Video",
};

const USAGE_COLUMNS: Record<Pipeline, string> = {
  shorts: "usage_shorts",
  dub:    "usage_dub",
  create: "usage_create",
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
          ? "rgba(255,107,107,0.10)"
          : "rgba(255,169,77,0.10)",
        border: isAtLimit
          ? "1px solid rgba(255,107,107,0.3)"
          : "1px solid rgba(255,169,77,0.3)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <span style={{ fontSize: 18 }}>{isAtLimit ? "🚫" : "⚠️"}</span>

        {/* Message */}
        <div>
          {isAtLimit ? (
            <p
              className="text-sm font-semibold"
              style={{
                color: "#FF6B6B",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              {label} limit reached — {data.used}/{data.limit} videos used this month
            </p>
          ) : (
            <p
              className="text-sm font-semibold"
              style={{
                color: "#FFA94D",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              {remaining} {label} video{remaining === 1 ? "" : "s"} remaining this month ({data.used}/{data.limit} used)
            </p>
          )}
          <p className="text-xs mt-0.5" style={{ color: "#8B8794" }}>
            Resets on the 1st · Upgrade for more videos
          </p>
        </div>
      </div>

      {/* Upgrade CTA */}
      <Link
        href="/dashboard/billing"
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02]"
        style={{
          background: isAtLimit
            ? "linear-gradient(135deg, #FF6B5A 0%, #FF8B7A 100%)"
            : "linear-gradient(135deg, #FFA94D 0%, #FFC174 100%)",
          color: "#0F0E1A",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
        }}
      >
        Upgrade
      </Link>
    </div>
  );
}