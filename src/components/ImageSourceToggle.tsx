// ============================================================
// FILE 4 OF 7
// ============================================================
// COPY TO: src/components/ImageSourceToggle.tsx
//
// This goes in your components folder:
//   src/components/
//   ├── (your existing components)
//   └── ImageSourceToggle.tsx    ← THIS FILE
//
// PURPOSE: Beautiful toggle switch that lets users choose between
//          "Real Photos" (Pexels, free) and "AI Art" (DALL-E, $0.08/image).
//          Shows cost per image, a savings badge, and helpful descriptions.
//
// USAGE: Add this inside your video creation form (src/app/dashboard/create/page.tsx):
//
//   import ImageSourceToggle from "@/components/ImageSourceToggle";
//   import { useImageSource } from "@/lib/useImageSource";
//
//   // Inside your component:
//   const { imageSource, setImageSource } = useImageSource();
//
//   // In your JSX (above or below the topic input):
//   <ImageSourceToggle
//     imageSource={imageSource}
//     onChange={setImageSource}
//     disabled={isGenerating}
//   />
// ============================================================

"use client";

import React from "react";
import { ImageSource } from "@/lib/useImageSource";

// ──────────────────────────────────────────────
// PROPS: What this component accepts
// ──────────────────────────────────────────────
interface ImageSourceToggleProps {
  imageSource: ImageSource;                    // Current selection
  onChange: (source: ImageSource) => void;      // Called when user clicks an option
  disabled?: boolean;                          // Disable during video generation
}

// ──────────────────────────────────────────────
// COMPONENT: ImageSourceToggle
// Renders two clickable cards side by side
// ──────────────────────────────────────────────
export default function ImageSourceToggle({
  imageSource,
  onChange,
  disabled = false,
}: ImageSourceToggleProps) {
  return (
    <div className="w-full">
      {/* ── Section Label ── */}
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Image Style
      </label>

      {/* ── Two-Column Grid: Real Photos | AI Art ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* ────────────────────────────────────── */}
        {/* OPTION 1: Real Photos (Pexels)         */}
        {/* ────────────────────────────────────── */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("real-photos")}
          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
            imageSource === "real-photos"
              ? "border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-500"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {/* Savings badge — only shows when Real Photos is selected */}
          {imageSource === "real-photos" && (
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              94% SAVINGS
            </span>
          )}

          {/* Camera emoji icon */}
          <div className={`text-2xl ${imageSource === "real-photos" ? "grayscale-0" : "grayscale"}`}>
            📸
          </div>

          {/* Label + subtitle */}
          <div className="text-center">
            <div className={`font-semibold text-sm ${
              imageSource === "real-photos" ? "text-green-400" : "text-gray-400"
            }`}>
              Real Photos
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Stock photos • Instant • Free
            </div>
          </div>

          {/* Cost badge */}
          <div className={`text-xs font-mono px-2 py-0.5 rounded-full ${
            imageSource === "real-photos"
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-700 text-gray-500"
          }`}>
            $0.00/image
          </div>
        </button>

        {/* ────────────────────────────────────── */}
        {/* OPTION 2: AI Art (DALL-E)              */}
        {/* ────────────────────────────────────── */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("ai-art")}
          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
            imageSource === "ai-art"
              ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-500"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {/* Palette emoji icon */}
          <div className={`text-2xl ${imageSource === "ai-art" ? "grayscale-0" : "grayscale"}`}>
            🎨
          </div>

          {/* Label + subtitle */}
          <div className="text-center">
            <div className={`font-semibold text-sm ${
              imageSource === "ai-art" ? "text-purple-400" : "text-gray-400"
            }`}>
              AI Art
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              DALL-E generated • Unique
            </div>
          </div>

          {/* Cost badge */}
          <div className={`text-xs font-mono px-2 py-0.5 rounded-full ${
            imageSource === "ai-art"
              ? "bg-purple-500/20 text-purple-400"
              : "bg-gray-700 text-gray-500"
          }`}>
            $0.08/image
          </div>
        </button>
      </div>

      {/* ── Help text below the toggle — changes based on selection ── */}
      <p className="text-[11px] text-gray-500 mt-2 text-center">
        {imageSource === "real-photos"
          ? "📷 High-quality photos from Pexels. Best for: landmarks, nature, food, cities, travel."
          : "✨ AI-generated unique images. Best for: abstract concepts, fantasy, custom scenes."}
      </p>
    </div>
  );
}