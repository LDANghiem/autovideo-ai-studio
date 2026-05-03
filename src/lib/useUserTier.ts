// ============================================================
// FILE: src/lib/useUserTier.ts
// Hook: Returns current user plan + usage for gating features
// Supports: free | creator | studio
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PLANS, type PlanId, type PlanLimits } from "@/lib/stripe";

export type UserTier = "free" | "creator" | "studio" | "loading";

export interface UserPlan {
  tier: UserTier;
  plan: PlanId;
  limits: PlanLimits;
  usage: { shorts: number; dub: number; create: number };
  canUse: (pipeline: "shorts" | "dub" | "create") => boolean;
  isLoading: boolean;
}

const DEFAULT_USAGE = { shorts: 0, dub: 0, create: 0 };
const DEFAULT_LIMITS = PLANS["free"].limits;

// Simple tier hook — backward compatible, used by Sidebar
export function useUserTier(): UserTier {
  const [tier, setTier] = useState<UserTier>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) { if (!cancelled) setTier("free"); return; }
        const { data } = await supabase
          .from("user_profiles")
          .select("plan")
          .eq("id", session.user.id)
          .single();
        if (!cancelled) {
          const p = data?.plan as string;
          setTier(p === "studio" ? "studio" : p === "creator" ? "creator" : "free");
        }
      } catch {
        if (!cancelled) setTier("free");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return tier;
}

// Full plan hook with limits + usage
export function useUserPlan(): UserPlan {
  const [plan, setPlan] = useState<PlanId>("free");
  const [usage, setUsage] = useState(DEFAULT_USAGE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) { if (!cancelled) setIsLoading(false); return; }

        const { data } = await supabase
          .from("user_profiles")
          .select("plan, usage_shorts, usage_dub, usage_create")
          .eq("id", session.user.id)
          .single();

        if (!cancelled && data) {
          const p = (data.plan || "free") as string;
          setPlan(PLANS[p] ? (p as PlanId) : "free");
          setUsage({
            shorts:   data.usage_shorts   ?? 0,
            dub:      data.usage_dub      ?? 0,
            create:   data.usage_create   ?? 0,
          });
        }
      } catch {
        // fail silently — defaults to free
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const limits: PlanLimits = PLANS[plan]?.limits ?? DEFAULT_LIMITS;
  const tier: UserTier = isLoading
    ? "loading"
    : plan === "studio" ? "studio"
    : plan === "creator" ? "creator"
    : "free";

  return {
    tier,
    plan,
    limits,
    usage,
    canUse: (pipeline) => {
      if (isLoading) return true; // optimistic while loading
      return usage[pipeline] < limits[pipeline];
    },
    isLoading,
  };
}