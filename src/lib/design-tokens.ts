/**
 * Ripple Design Tokens
 * ─────────────────────
 * Single source of truth for the Ripple brand. Import these constants
 * anywhere instead of hardcoding hex values. Updating here updates the app.
 *
 * Brand: Ripple
 * Tagline: "One video. Infinite reach."
 *
 * Visual signature: Warm coral + amber on near-black. Ripples (concentric
 * circles) appear in loading states, hover effects, and the logo.
 */

// ─── Brand Colors ─────────────────────────────────────────────
export const BRAND = {
  // Hero coral — primary CTAs, logo, brand moments
  coral: "#FF6B5A",
  // Lighter coral — hovers, secondary accents
  coralSoft: "#FF8B7A",
  // Translucent coral for backgrounds & glows
  coralGlow: "rgba(255,107,90,0.35)",
  coralBg: "rgba(255,107,90,0.08)",
  coralBorder: "rgba(255,107,90,0.25)",

  // Amber — secondary highlights, success, AI Shorts pipeline
  amber: "#FFA94D",
  amberSoft: "#FFC174",
  amberGlow: "rgba(255,169,77,0.3)",
  amberBg: "rgba(255,169,77,0.08)",
} as const;

// ─── Surface Colors ───────────────────────────────────────────
export const SURFACE = {
  // Page background base
  base: "#0F0E1A",
  // Card / panel surfaces
  card: "#16151F",
  // Elevated cards (hovered, important)
  cardElevated: "#1C1B27",
  // Sidebar / navigation
  nav: "#0C0B16",
  // Modal / overlay backgrounds
  overlay: "rgba(15,14,26,0.85)",
} as const;

// ─── Border Colors ────────────────────────────────────────────
export const BORDER = {
  subtle: "rgba(255,255,255,0.06)",
  default: "rgba(255,255,255,0.1)",
  strong: "rgba(255,255,255,0.15)",
  brand: BRAND.coralBorder,
} as const;

// ─── Text Colors ──────────────────────────────────────────────
export const TEXT = {
  // Primary body text — slightly warm white to harmonize with coral
  primary: "#F5F2ED",
  // Secondary labels, metadata
  secondary: "#8B8794",
  // Tertiary — timestamps, hints
  tertiary: "#5A5762",
  // Disabled state
  disabled: "#3A3845",
  // On colored backgrounds (coral CTAs etc.)
  onBrand: "#0F0E1A",
} as const;

// ─── Pipeline Accent Colors ───────────────────────────────────
// Each pipeline gets a distinct color used in:
// - Library card left-edge accents
// - Pipeline badges
// - Sidebar nav themes
// - Hover glows
export const PIPELINE = {
  dub: {
    name: "Dub",
    hex: BRAND.coral,
    glow: BRAND.coralGlow,
    description: "HERO — Multiply reach across languages",
  },
  shorts: {
    name: "Shorts",
    hex: BRAND.amber,
    glow: BRAND.amberGlow,
    description: "Cut viral clips from long-form",
  },
  recreate: {
    name: "ReCreate",
    hex: "#5DD3E0",
    glow: "rgba(93,211,224,0.3)",
    description: "Reimagine any video",
  },
  channel_cloner: {
    name: "Channel Cloner",
    hex: "#E879A6",
    glow: "rgba(232,121,166,0.3)",
    description: "Bulk reimagine a channel",
  },
  article: {
    name: "Article → Video",
    hex: "#A39BD9",
    glow: "rgba(163,155,217,0.3)",
    description: "Turn writing into video",
  },
  create: {
    name: "Create",
    hex: "#7B7A8E",
    glow: "rgba(123,122,142,0.2)",
    description: "Generate from a topic",
  },
  repurpose: {
    name: "Repurpose",
    hex: "#FF8C66",
    glow: "rgba(255,140,102,0.3)",
    description: "Auto-clip long videos",
  },
} as const;

// ─── Status Colors ────────────────────────────────────────────
export const STATUS = {
  success: "#5DD39E",
  successBg: "rgba(93,211,158,0.1)",
  warning: BRAND.amber,
  warningBg: BRAND.amberBg,
  error: "#FF6B6B",
  errorBg: "rgba(255,107,107,0.1)",
  info: "#5DD3E0",
  infoBg: "rgba(93,211,224,0.1)",
} as const;

// ─── Typography ───────────────────────────────────────────────
export const FONT = {
  heading: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Menlo', monospace",
} as const;

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  hero: 48,
} as const;

// ─── Spacing Scale ────────────────────────────────────────────
export const SPACE = {
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// ─── Border Radius ────────────────────────────────────────────
export const RADIUS = {
  sm: 4,
  base: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  full: 9999,
} as const;

// ─── Shadows ──────────────────────────────────────────────────
export const SHADOW = {
  // Card edges, subtle depth
  subtle: "0 1px 2px rgba(0,0,0,0.4)",
  // Resting cards
  card: "0 2px 8px -2px rgba(0,0,0,0.4)",
  // Hovered cards — coral glow
  cardHover: `0 8px 24px -8px ${BRAND.coralGlow}`,
  // Primary CTAs
  cta: `0 4px 16px -4px ${BRAND.coralGlow}`,
  ctaHover: `0 8px 32px -8px ${BRAND.coral}`,
  // Hero moments
  hero: `0 16px 48px -12px rgba(255,107,90,0.4)`,
  // Modals
  modal: "0 24px 64px -16px rgba(0,0,0,0.6)",
} as const;

// ─── Transitions ──────────────────────────────────────────────
export const TRANSITION = {
  fast: "0.15s ease-out",
  base: "0.2s ease-out",
  slow: "0.35s ease-out",
  spring: "0.4s cubic-bezier(0.34, 1.56, 0.64, 1)", // bouncy
} as const;

// ─── Z-index ──────────────────────────────────────────────────
export const Z = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 1000,
  toast: 2000,
} as const;

// ─── Brand Strings ────────────────────────────────────────────
export const BRAND_STRINGS = {
  name: "Ripple",
  tagline: "One video. Infinite reach.",
  taglineAlt: "Your content, multiplied.",
  description:
    "Ripple turns one video into many. Dub into 18 languages, cut viral shorts, repurpose long-form into formats that fit every platform. Built for creators who want to grow without grinding.",
  taglineVi: "Một video. Tiếng vọng vô tận.",
} as const;