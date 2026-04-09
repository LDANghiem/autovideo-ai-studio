// ============================================================
// FILE: src/lib/usageGuard.ts
// Server-side usage checking and incrementing
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { PLANS, type PlanId } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Pipeline = "shorts" | "dub" | "recreate" | "create";

const USAGE_COLUMN: Record<Pipeline, string> = {
  shorts:   "usage_shorts",
  dub:      "usage_dub",
  recreate: "usage_recreate",
  create:   "usage_create",
};

interface GuardResult {
  allowed: boolean;
  plan: PlanId;
  used: number;
  limit: number;
  error?: string;
}

interface UserProfileRow {
  plan?: string;
  usage_shorts?: number;
  usage_dub?: number;
  usage_recreate?: number;
  usage_create?: number;
}

export async function checkAndIncrementUsage(
  userId: string,
  pipeline: Pipeline
): Promise<GuardResult> {
  try {
    const col = USAGE_COLUMN[pipeline];

    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select(`plan, ${col}`)
      .eq("id", userId)
      .single();

    if (error || !data) {
      return { allowed: true, plan: "free", used: 0, limit: PLANS["free"].limits[pipeline] };
    }

    const profile = data as UserProfileRow;
    const planStr = profile.plan || "free";
    const planKey: PlanId = PLANS[planStr] ? (planStr as PlanId) : "free";
    const limit: number = PLANS[planKey].limits[pipeline];
    const used: number = (profile[col as keyof UserProfileRow] as number) ?? 0;

    if (used >= limit) {
      return {
        allowed: false,
        plan: planKey,
        used,
        limit,
        error: `Monthly limit reached (${used}/${limit} ${pipeline} videos). Please upgrade your plan to continue.`,
      };
    }

    // Increment usage
    await supabaseAdmin
      .from("user_profiles")
      .upsert(
        { id: userId, [col]: used + 1, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    return { allowed: true, plan: planKey, used: used + 1, limit };
  } catch (err: unknown) {
    console.error("[usageGuard] error:", err instanceof Error ? err.message : err);
    return { allowed: true, plan: "free", used: 0, limit: 999 };
  }
}

export async function getUserPlan(userId: string): Promise<PlanId> {
  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("plan")
      .eq("id", userId)
      .single();
    const p = (data as { plan?: string })?.plan || "free";
    return (PLANS[p] ? p : "free") as PlanId;
  } catch {
    return "free";
  }
}