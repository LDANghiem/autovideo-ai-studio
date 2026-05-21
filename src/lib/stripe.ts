// ============================================================
// FILE: src/lib/stripe.ts
// Plan definitions only — NO Stripe SDK here (client-safe)
// Stripe client lives in stripeServer.ts (API routes only)
// ============================================================

export interface PlanLimits {
  shorts: number;
  dub: number;
  create: number;
  translate: number;        // 🆕 monthly script translations (Infinity-as-999999 = unlimited)
  maxVideoLengthSec: number;
  resolution: string;
  watermark: boolean;
}

export interface PlanDef {
  id: string;
  name: string;
  price: number;
  priceIdMonthly: string | null;
  priceIdAnnual: string | null;
  limits: PlanLimits;
}

export const PLANS: Record<string, PlanDef> = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    priceIdMonthly: null,
    priceIdAnnual: null,
    limits: {
      shorts: 3,
      dub: 2,
      create: 3,            // 🆕 was 2 — small bump for the funnel
      translate: 5,         // 🆕 5 translations/mo on free
      maxVideoLengthSec: 60,
      resolution: "720p",
      watermark: true,
    },
  },
  creator: {
    id: "creator",
    name: "Creator",
    price: 15,              // 🆕 was 19 — undercut the field
    priceIdMonthly: null,
    priceIdAnnual: null,
    limits: {
      shorts: 30,
      dub: 20,
      create: 40,           // 🆕 was 15 — generous standard-video allowance
      translate: 999999,    // 🆕 unlimited translations (Claude cost is trivial)
      maxVideoLengthSec: 600, // 🆕 was 180 — 10 min, matches audio_static cap
      resolution: "1080p",
      watermark: false,
    },
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: 39,              // 🆕 was 49 — competitive for an unknown brand
    priceIdMonthly: null,
    priceIdAnnual: null,
    limits: {
      shorts: 999999,
      dub: 999999,
      create: 999999,       // standard videos unlimited
      translate: 999999,    // 🆕 unlimited translations
      maxVideoLengthSec: 1800, // 🆕 was 99999 — real 30 min cap, matches audio_static
      resolution: "1080p",
      watermark: false,
    },
  },
};

export type PlanId = "free" | "creator" | "studio";

export function getPlanFromPriceId(priceId: string): PlanId {
  const creatorMonthly = process.env.STRIPE_CREATOR_MONTHLY_PRICE_ID;
  const creatorAnnual  = process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID;
  const studioMonthly  = process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID;
  const studioAnnual   = process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID;
  if (priceId === creatorMonthly || priceId === creatorAnnual) return "creator";
  if (priceId === studioMonthly  || priceId === studioAnnual)  return "studio";
  return "free";
}