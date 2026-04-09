// ============================================================
// FILE: src/lib/stripeServer.ts
// Server-only Stripe client — import ONLY in API routes
// Never import this in components or client-side hooks
// ============================================================

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});