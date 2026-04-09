// ============================================================
// FILE: src/app/api/billing/webhook/route.ts
// Stripe webhook — syncs subscription state to Supabase
// Events handled:
//   checkout.session.completed  → activate plan
//   customer.subscription.updated → plan change
//   customer.subscription.deleted → downgrade to free
//   invoice.paid → reset monthly usage counters
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripeServer";
import { getPlanFromPriceId } from "@/lib/stripe";
import Stripe from "stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[webhook] event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const planId = session.metadata?.plan_id || "free";

        if (userId && session.customer) {
          await supabaseAdmin.from("user_profiles").upsert({
            id: userId,
            plan: planId,
            // Legacy compat: map creator/studio → "pro" for old tier check
            tier: planId === "free" ? "free" : "pro",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan_expires_at: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

          console.log(`[webhook] activated ${planId} for user ${userId}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        const priceId = sub.items.data[0]?.price.id;
        const planId = priceId ? getPlanFromPriceId(priceId) : "free";
        const status = sub.status;

        if (userId) {
          const isActive = ["active", "trialing"].includes(status);
          await supabaseAdmin.from("user_profiles").upsert({
            id: userId,
            plan: isActive ? planId : "free",
            tier: isActive && planId !== "free" ? "pro" : "free",
            stripe_subscription_id: sub.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

          console.log(`[webhook] updated plan → ${planId} (${status}) for user ${userId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;

        if (userId) {
          await supabaseAdmin.from("user_profiles").upsert({
            id: userId,
            plan: "free",
            tier: "free",
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

          console.log(`[webhook] subscription cancelled — downgraded to free for user ${userId}`);
        }
        break;
      }

      case "invoice.paid": {
        // New billing period — reset monthly usage counters
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: profile } = await supabaseAdmin
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile?.id) {
          await supabaseAdmin.from("user_profiles").update({
            usage_shorts: 0,
            usage_dub: 0,
            usage_recreate: 0,
            usage_create: 0,
            usage_reset_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", profile.id);

          console.log(`[webhook] usage counters reset for user ${profile.id}`);
        }
        break;
      }

      default:
        console.log(`[webhook] unhandled event: ${event.type}`);
    }
  } catch (err: any) {
    console.error("[webhook] handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}


