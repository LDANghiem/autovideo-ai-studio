// ============================================================
// FILE: src/lib/stripeServer.ts
// Server-only Stripe client — lazy init to avoid build errors
// Import ONLY in API routes, never in client components
// ============================================================

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

// Proxy for backward-compat — stripe.X calls become getStripe().X at runtime
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});