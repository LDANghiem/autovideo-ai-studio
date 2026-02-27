// ============================================================
// FILE 5 OF 7
// ============================================================
// COPY TO: src/components/PexelsAttribution.tsx
//
// This goes in your components folder:
//   src/components/
//   ├── ImageSourceToggle.tsx    (File 4)
//   └── PexelsAttribution.tsx    ← THIS FILE
//
// PURPOSE: Displays photographer credits for Pexels photos.
//          Required by Pexels API terms of service.
//          Two modes: compact (one-liner) or full (list with box).
//
// USAGE: Add to your project detail page (src/app/dashboard/projects/[id]/page.tsx):
//
//   import PexelsAttribution from "@/components/PexelsAttribution";
//
//   // Below the video player:
//   {project.image_source === "real-photos" && project.pexels_credits?.length > 0 && (
//     <PexelsAttribution credits={project.pexels_credits} compact />
//   )}
// ============================================================

"use client";

import React from "react";

// ──────────────────────────────────────────────
// TYPE: A single photo credit entry
// ──────────────────────────────────────────────
interface PhotoCredit {
  photographer: string;        // "John Smith"
  photographerUrl: string;     // "https://www.pexels.com/@johnsmith"
  sceneIndex: number;          // Which scene used this photo
}

// ──────────────────────────────────────────────
// PROPS: What this component accepts
// ──────────────────────────────────────────────
interface PexelsAttributionProps {
  credits: PhotoCredit[];      // Array of credits from the project
  compact?: boolean;           // true = one-liner, false = full box with list
}

// ──────────────────────────────────────────────
// COMPONENT: PexelsAttribution
// ──────────────────────────────────────────────
export default function PexelsAttribution({
  credits,
  compact = false,
}: PexelsAttributionProps) {
  // ── Don't render if no credits ──
  if (!credits || credits.length === 0) return null;

  // ── Deduplicate by photographer name ──
  // (same photographer might be used for multiple scenes)
  const unique = credits.filter(
    (c, i, arr) => arr.findIndex((x) => x.photographer === c.photographer) === i
  );

  // ──────────────────────────────────────────
  // COMPACT MODE: Single line of text
  // Example: "📷 Photos by John, Jane on Pexels"
  // ──────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-gray-500">
        <span>📷</span>
        <span>
          Photos by{" "}
          {unique.map((c, i) => (
            <React.Fragment key={c.photographer}>
              {i > 0 && ", "}
              <a
                href={c.photographerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white underline"
              >
                {c.photographer}
              </a>
            </React.Fragment>
          ))}{" "}
          on{" "}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white underline"
          >
            Pexels
          </a>
        </span>
      </div>
    );
  }

  // ──────────────────────────────────────────
  // FULL MODE: Box with header + list of credits
  // ──────────────────────────────────────────
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
      {/* ── Header row ── */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">📷</span>
        <span className="text-xs font-medium text-gray-300">Photo Credits</span>
        {/* FREE badge — highlights the cost savings */}
        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
          FREE
        </span>
      </div>

      {/* ── List of photographer credits ── */}
      <div className="space-y-1">
        {unique.map((credit) => (
          <div key={credit.photographer} className="text-[11px] text-gray-500">
            Photo by{" "}
            <a
              href={credit.photographerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white underline"
            >
              {credit.photographer}
            </a>{" "}
            on{" "}
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white underline"
            >
              Pexels
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}