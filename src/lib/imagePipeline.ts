// ============================================================
// FILE 6 OF 7
// ============================================================
// COPY TO: src/lib/imagePipeline.ts
//
// This goes in your lib folder:
//   src/lib/
//   ├── useUserTier.ts          (existing — tier detection)
//   ├── useImageSource.ts       (File 3)
//   └── imagePipeline.ts        ← THIS FILE
//
// PURPOSE: The main orchestrator that handles the full image
//          fetching flow for video generation:
//
//          If "ai-art" mode:
//            → Use DALL-E for all scenes (existing behavior)
//
//          If "real-photos" mode:
//            → Step 1: Convert scene descriptions → search queries (GPT-4o-mini)
//            → Step 2: Search Pexels for each scene (parallel)
//            → Step 3: Any scenes with no results → automatic DALL-E fallback
//
// USAGE: Called from your video generation logic:
//
//   import { fetchSceneImages } from "@/lib/imagePipeline";
//
//   const result = await fetchSceneImages(
//     scenes, imageSource, topic, orientation, dalleGenerateFn
//   );
//   // result.images = array of { sceneIndex, imageUrl, source, pexelsCredit? }
//   // result.stats  = { total, pexels, dalle, costSaved, totalCost }
// ============================================================

import { ImageSource } from "./useImageSource";

// ──────────────────────────────────────────────
// TYPE: A single scene from the script
// ──────────────────────────────────────────────
interface Scene {
  sceneIndex: number;
  description: string;
  narration?: string;
}

// ──────────────────────────────────────────────
// TYPE: A processed scene image (output)
// ──────────────────────────────────────────────
interface SceneImage {
  sceneIndex: number;
  description: string;
  imageUrl: string;                // The final image URL to use in the video
  source: "pexels" | "dalle";     // Where the image came from
  pexelsCredit?: {                 // Only present for Pexels photos
    photographer: string;
    photographerUrl: string;
  };
}

// ──────────────────────────────────────────────
// TYPE: Full pipeline result with stats
// ──────────────────────────────────────────────
interface PipelineResult {
  images: SceneImage[];
  stats: {
    total: number;       // Total scenes processed
    pexels: number;      // How many used Pexels (free)
    dalle: number;       // How many used DALL-E ($0.08 each)
    costSaved: string;   // Dollar amount saved vs all-DALL-E
    totalCost: string;   // Actual cost incurred
  };
}

// ──────────────────────────────────────────────
// MAIN FUNCTION: fetchSceneImages
//
// Parameters:
//   scenes          - Array of scene objects from the script
//   imageSource     - "real-photos" or "ai-art"
//   topic           - Video topic (helps AI generate better search queries)
//   orientation     - "landscape" (regular) or "portrait" (Shorts/TikTok)
//   dalleGenerateFn - Your existing DALL-E generation function
//                     (pass it in so this module doesn't need to know about DALL-E)
// ──────────────────────────────────────────────
export async function fetchSceneImages(
  scenes: Scene[],
  imageSource: ImageSource,
  topic: string,
  orientation: "landscape" | "portrait" = "landscape",
  dalleGenerateFn?: (description: string, orientation: string) => Promise<string>
): Promise<PipelineResult> {

  // ══════════════════════════════════════════════
  // PATH A: AI ART MODE (existing behavior)
  // Just use DALL-E for everything — no changes needed
  // ══════════════════════════════════════════════
  if (imageSource === "ai-art") {
    if (!dalleGenerateFn) {
      throw new Error("dalleGenerateFn is required for AI Art mode");
    }

    const images: SceneImage[] = [];
    for (const scene of scenes) {
      const imageUrl = await dalleGenerateFn(scene.description, orientation);
      images.push({
        sceneIndex: scene.sceneIndex,
        description: scene.description,
        imageUrl,
        source: "dalle",
      });
    }

    return {
      images,
      stats: {
        total: scenes.length,
        pexels: 0,
        dalle: scenes.length,
        costSaved: "$0.00",
        totalCost: `$${(scenes.length * 0.08).toFixed(2)}`,
      },
    };
  }

  // ══════════════════════════════════════════════
  // PATH B: REAL PHOTOS MODE (new!)
  // ══════════════════════════════════════════════

  // ── Step 1: Convert scene descriptions → optimized Pexels search queries ──
  // Uses GPT-4o-mini via the scene-to-query API route
  const queryResponse = await fetch("/api/projects/scene-to-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenes: scenes.map((s) => ({
        sceneIndex: s.sceneIndex,
        description: s.description,
      })),
      topic,
    }),
  });

  if (!queryResponse.ok) {
    throw new Error("Failed to generate search queries");
  }

  const queryData = await queryResponse.json();
  const enrichedScenes = queryData.scenes;
  // enrichedScenes now has { sceneIndex, description, searchQuery } for each scene

  // ── Step 2: Search Pexels for all scenes in parallel ──
  const pexelsResponse = await fetch("/api/projects/pexels-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenes: enrichedScenes,
      orientation,
    }),
  });

  if (!pexelsResponse.ok) {
    throw new Error("Failed to search Pexels");
  }

  const pexelsData = await pexelsResponse.json();
  const sceneResults = pexelsData.sceneResults;

  // ── Step 3: Build final image list ──
  // For each scene: use Pexels photo if found, otherwise fall back to DALL-E
  const images: SceneImage[] = [];
  let pexelsCount = 0;
  let dalleCount = 0;

  for (const result of sceneResults) {
    if (result.photo && !result.fallbackToDalle) {
      // ✅ Pexels photo found — use it (FREE!)
      images.push({
        sceneIndex: result.sceneIndex,
        description: result.description,
        imageUrl: result.photo.url,
        source: "pexels",
        pexelsCredit: {
          photographer: result.photo.photographer,
          photographerUrl: result.photo.photographerUrl,
        },
      });
      pexelsCount++;
    } else if (dalleGenerateFn) {
      // ⚠️ No Pexels match — fall back to DALL-E ($0.08)
      console.log(
        `Scene ${result.sceneIndex}: No Pexels results for "${result.searchQuery}", falling back to DALL-E`
      );
      try {
        const imageUrl = await dalleGenerateFn(result.description, orientation);
        images.push({
          sceneIndex: result.sceneIndex,
          description: result.description,
          imageUrl,
          source: "dalle",
        });
        dalleCount++;
      } catch (err) {
        // ❌ Both Pexels AND DALL-E failed — use placeholder
        console.error(`DALL-E fallback also failed for scene ${result.sceneIndex}:`, err);
        images.push({
          sceneIndex: result.sceneIndex,
          description: result.description,
          imageUrl: "/placeholder-scene.png",
          source: "dalle",
        });
        dalleCount++;
      }
    } else {
      // No DALL-E function provided — use placeholder
      images.push({
        sceneIndex: result.sceneIndex,
        description: result.description,
        imageUrl: "/placeholder-scene.png",
        source: "pexels",
      });
    }
  }

  // ── Sort by scene index to maintain correct order ──
  images.sort((a, b) => a.sceneIndex - b.sceneIndex);

  // ── Calculate cost stats ──
  const costSaved = pexelsCount * 0.08;    // Money saved by using Pexels instead of DALL-E
  const totalCost = dalleCount * 0.08;     // Actual cost (only DALL-E fallback scenes)

  return {
    images,
    stats: {
      total: scenes.length,
      pexels: pexelsCount,
      dalle: dalleCount,
      costSaved: `$${costSaved.toFixed(2)}`,
      totalCost: `$${totalCost.toFixed(2)}`,
    },
  };
}