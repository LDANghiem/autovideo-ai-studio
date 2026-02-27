// ============================================================
// FILE 3 OF 7
// ============================================================
// COPY TO: src/lib/useImageSource.ts
//
// This goes in your lib folder alongside your existing hooks:
//   src/lib/
//   ├── useUserTier.ts          (existing — tier detection)
//   └── useImageSource.ts       ← THIS FILE
//
// PURPOSE: React hook that manages the "Real Photos" vs "AI Art"
//          toggle state. Provides the current selection plus
//          helpful computed properties like cost-per-image and labels.
//
// USAGE IN YOUR COMPONENTS:
//   const { imageSource, setImageSource, isRealPhotos } = useImageSource();
// ============================================================

import { useState, useCallback } from "react";

// ──────────────────────────────────────────────
// TYPE: The two image source options
// ──────────────────────────────────────────────
export type ImageSource = "ai-art" | "real-photos";

// ──────────────────────────────────────────────
// INTERFACE: Everything this hook returns
// ──────────────────────────────────────────────
interface ImageSourceState {
  imageSource: ImageSource;          // Current selection: "ai-art" or "real-photos"
  setImageSource: (source: ImageSource) => void;  // Set it directly
  isRealPhotos: boolean;             // Shortcut: true if "real-photos"
  isAiArt: boolean;                  // Shortcut: true if "ai-art"
  toggleImageSource: () => void;     // Flip between the two
  label: string;                     // Display label: "Real Photos" or "AI Art"
  description: string;               // Description text for UI
  costPerImage: string;              // "$0.00" or "$0.08"
}

// ──────────────────────────────────────────────
// HOOK: useImageSource
// Default is "ai-art" to match existing behavior
// ──────────────────────────────────────────────
export function useImageSource(defaultSource: ImageSource = "ai-art"): ImageSourceState {
  const [imageSource, setImageSource] = useState<ImageSource>(defaultSource);

  // Toggle between the two options
  const toggleImageSource = useCallback(() => {
    setImageSource((prev) => (prev === "ai-art" ? "real-photos" : "ai-art"));
  }, []);

  // Computed boolean shortcuts
  const isRealPhotos = imageSource === "real-photos";
  const isAiArt = imageSource === "ai-art";

  return {
    imageSource,
    setImageSource,
    isRealPhotos,
    isAiArt,
    toggleImageSource,

    // Display strings for the UI
    label: isRealPhotos ? "Real Photos" : "AI Art",
    description: isRealPhotos
      ? "High-quality stock photos from Pexels — instant & free"
      : "AI-generated images from DALL-E — unique & creative",
    costPerImage: isRealPhotos ? "$0.00" : "$0.08",
  };
}