"use client";

/**
 * Ripple Logo
 * ───────────
 * Concentric circles expanding outward — the visual signature of the brand.
 * Used in sidebar, login, marketing surfaces.
 *
 * Variants:
 *   <RippleLogo />                    → Mark + wordmark, default size (sidebar)
 *   <RippleLogo size="sm" />          → Compact (collapsed sidebar)
 *   <RippleLogo size="lg" />          → Hero / login page
 *   <RippleLogo markOnly />           → Just the icon, no wordmark
 *   <RippleLogo animated />           → Continuous ripple animation (loading states)
 */

import React from "react";

type RippleLogoProps = {
  size?: "sm" | "base" | "lg" | "xl";
  markOnly?: boolean;
  animated?: boolean;
  className?: string;
};

const SIZE_MAP = {
  sm: { mark: 24, font: 16, gap: 8 },
  base: { mark: 32, font: 20, gap: 10 },
  lg: { mark: 48, font: 32, gap: 14 },
  xl: { mark: 72, font: 48, gap: 20 },
};

export default function RippleLogo({
  size = "base",
  markOnly = false,
  animated = false,
  className,
}: RippleLogoProps) {
  const dim = SIZE_MAP[size];

  return (
    <>
      {animated && (
        <style>{`
          @keyframes ripple-pulse-1 {
            0%   { r: 4;  opacity: 1; }
            100% { r: 14; opacity: 0; }
          }
          @keyframes ripple-pulse-2 {
            0%   { r: 4;  opacity: 1; }
            100% { r: 14; opacity: 0; }
          }
          .ripple-mark-anim circle.r-out {
            animation: ripple-pulse-1 1.6s ease-out infinite;
          }
          .ripple-mark-anim circle.r-mid {
            animation: ripple-pulse-2 1.6s ease-out infinite;
            animation-delay: 0.4s;
          }
        `}</style>
      )}

      <div
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: dim.gap,
        }}
      >
        {/* The ripple mark — concentric circles */}
        <svg
          className={animated ? "ripple-mark-anim" : ""}
          width={dim.mark}
          height={dim.mark}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Ripple"
        >
          {/* Outermost ring — fading */}
          <circle
            className="r-out"
            cx="16"
            cy="16"
            r="14"
            stroke="#FF6B5A"
            strokeOpacity="0.25"
            strokeWidth="1.5"
            fill="none"
          />
          {/* Middle ring — coral */}
          <circle
            className="r-mid"
            cx="16"
            cy="16"
            r="9"
            stroke="#FF6B5A"
            strokeOpacity="0.6"
            strokeWidth="2"
            fill="none"
          />
          {/* Inner solid dot — amber core */}
          <circle
            cx="16"
            cy="16"
            r="4"
            fill="#FFA94D"
          />
          {/* Highlight on the dot for dimension */}
          <circle
            cx="14.5"
            cy="14.5"
            r="1.5"
            fill="#FFC174"
            opacity="0.9"
          />
        </svg>

        {/* Wordmark */}
        {!markOnly && (
          <span
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: dim.font,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#F5F2ED",
              lineHeight: 1,
            }}
          >
            Ripple
          </span>
        )}
      </div>
    </>
  );
}