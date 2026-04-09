// ============================================================
// FILE: src/app/api/billing/checkout/route.ts
// Creates a Stripe Checkout session for plan upgrades
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripeServer";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { planId, billing } = await req.json();
    // billing: "monthly" | "annual"

    if (!planId || planId === "free") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Read price IDs directly from env vars (PLANS has null values - client-safe)
    const PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
      creator: {
        monthly: process.env.STRIPE_CREATOR_MONTHLY_PRICE_ID || "",
        annual:  process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID  || "",
      },
      studio: {
        monthly: process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID || "",
        annual:  process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID  || "",
      },
    };

    const planPrices = PRICE_IDS[planId];
    if (!planPrices) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = billing === "annual" ? planPrices.annual : planPrices.monthly;
    if (!priceId) {
      return NextResponse.json({ error: "Price not configured — check env vars" }, { status: 500 });
    }

    // Get or create Stripe customer
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("user_profiles")
        .upsert({ id: user.id, stripe_customer_id: customerId }, { onConflict: "id" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/billing?success=true&plan=${planId}`,
      cancel_url: `${baseUrl}/dashboard/billing?cancelled=true`,
      metadata: { supabase_user_id: user.id, plan_id: planId },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_id: planId },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing/checkout] error:", err);
    return NextResponse.json({ error: err.message || "Failed to create checkout" }, { status: 500 });
  }
}