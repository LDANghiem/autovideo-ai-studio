// ============================================================
// FILE: src/app/api/projects/translate-usage/route.ts
// ============================================================
// COMMIT 17d — Returns the user's translation usage this month.
// GET → { used, limit, plan }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLANS } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tier limits now live in PLANS (src/lib/stripe.ts)

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const plan = (profile?.plan as string) || "free";
    const planKey = PLANS[plan] ? plan : "free";
    const limit = PLANS[planKey].limits.translate;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count } = await supabaseAdmin
      .from("translation_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    return NextResponse.json({
      used: count ?? 0,
      limit: limit >= 999999 ? null : limit, // null = unlimited
      plan,
    });
  } catch (err: any) {
    console.error("[translate-usage] error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}