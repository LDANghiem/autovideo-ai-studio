// ============================================================
// FILE: src/lib/stripe.ts
// Plan definitions only — NO Stripe SDK here (client-safe)
// Stripe client lives in stripeServer.ts (API routes only)
// ============================================================

export interface PlanLimits {
  shorts: number;
  dub: number;
  recreate: number;
  create: number;
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
      recreate: 2,
      create: 2,
      maxVideoLengthSec: 60,
      resolution: "720p",
      watermark: true,
    },
  },
  creator: {
    id: "creator",
    name: "Creator",
    price: 19,
    priceIdMonthly: null,
    priceIdAnnual: null,
    limits: {
      shorts: 30,
      dub: 20,
      recreate: 20,
      create: 15,
      maxVideoLengthSec: 180,
      resolution: "1080p",
      watermark: false,
    },
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: 49,
    priceIdMonthly: null,
    priceIdAnnual: null,
    limits: {
      shorts: 999999,
      dub: 999999,
      recreate: 999999,
      create: 999999,
      maxVideoLengthSec: 99999,
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