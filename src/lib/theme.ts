// ============================================================
// FILE: src/lib/theme.ts
// ============================================================
// Ripple design tokens — single source of truth for the
// coral-on-dark identity. Extracted from Sidebar.tsx so every
// surface (sidebar, create page, modals) pulls from one place.
//
// Usage:
//   import { ripple } from "@/lib/theme";
//   style={{ background: ripple.bg.gradient, color: ripple.text.primary }}
// ============================================================

export const ripple = {
  // ── Backgrounds ──────────────────────────────────────────
  bg: {
    // Main app dark gradient (matches sidebar)
    gradient: "linear-gradient(180deg, #0C0B16 0%, #100E1C 50%, #0C0B16 100%)",
    // Flat surfaces
    base: "#0C0B16",
    raised: "#16131F",      // cards, panels — slightly lifted
    input: "#1A1623",       // form fields — a touch lighter so they read as interactive
    overlay: "rgba(8,7,14,0.7)", // modal backdrops
  },

  // ── Text ─────────────────────────────────────────────────
  text: {
    primary: "#F5F2ED",     // warm off-white
    secondary: "#8B8794",   // muted
    tertiary: "#5A5762",    // labels, hints
    faint: "#3A3845",       // version strings, disabled
  },

  // ── Coral (primary accent) ───────────────────────────────
  coral: {
    base: "#FF6B5A",
    light: "#FF8B7A",
    bg: "rgba(255,107,90,0.10)",
    bgHover: "rgba(255,107,90,0.18)",
    border: "rgba(255,107,90,0.25)",
    borderFaint: "rgba(255,107,90,0.15)",
    glow: "0 0 16px rgba(255,107,90,0.18)",
  },

  // ── Secondary accents ────────────────────────────────────
  amber: { base: "#FFA94D", light: "#FFC174" },
  pink:  { base: "#F472B6" },
  green: { base: "#5DD39E" },

  // ── Borders / dividers ───────────────────────────────────
  border: {
    subtle: "1px solid rgba(255,255,255,0.05)",
    medium: "1px solid rgba(255,255,255,0.08)",
    input:  "1px solid rgba(255,255,255,0.12)",
  },

  // ── Fonts (CSS variables already wired in layout.tsx) ────
  font: {
    display: "var(--font-space-grotesk), system-ui, sans-serif",
    body: "var(--font-inter), system-ui, sans-serif",
    mono: "var(--font-mono), monospace",
  },

  // ── Radii ────────────────────────────────────────────────
  radius: {
    sm: "8px",
    md: "10px",
    lg: "12px",
    xl: "16px",
  },
} as const;

export type RippleTheme = typeof ripple;