// ============================================================
// UPGRADED: src/app/api/projects/pexels-search/route.ts
//
// NOW SEARCHES BOTH PEXELS + UNSPLASH!
//
// WHAT CHANGED:
// 1. Added Unsplash API as second image source
// 2. Searches BOTH providers in parallel for each scene
// 3. Picks the best photo (prefers Unsplash for artistic quality,
//    falls back to Pexels, then DALL-E as last resort)
// 4. Uses primary query first, then fallback query if no results
// 5. More photos per search (5 instead of 3) for better variety
//
// SETUP NEEDED:
// Add to your .env.local:
//   UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
//
// Get your free Unsplash API key at:
//   https://unsplash.com/developers → New Application
//   (Free tier: 50 requests/hour in demo, 5000/hour when approved)
// ============================================================

import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || "";

const PEXELS_BASE_URL = "https://api.pexels.com/v1";
const UNSPLASH_BASE_URL = "https://api.unsplash.com";

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────
interface StandardPhoto {
  id: string;
  source: "pexels" | "unsplash";
  url: string;              // Best URL for video rendering
  urlHiRes: string;         // High-res version
  urlOriginal: string;      // Full original
  photographer: string;
  photographerUrl: string;
  alt: string;
  width: number;
  height: number;
  attribution: string;
}

// ──────────────────────────────────────────────
// PEXELS SEARCH
// ──────────────────────────────────────────────
async function searchPexels(
  query: string,
  orientation: "landscape" | "portrait" = "landscape",
  perPage: number = 5
): Promise<StandardPhoto[]> {
  if (!PEXELS_API_KEY) return [];

  try {
    const params = new URLSearchParams({
      query,
      orientation,
      per_page: perPage.toString(),
      size: "large",
    });

    const response = await fetch(`${PEXELS_BASE_URL}/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!response.ok) {
      console.error(`Pexels API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    return (data.photos || []).map((photo: any) => ({
      id: `pexels-${photo.id}`,
      source: "pexels" as const,
      url: orientation === "portrait" ? photo.src.portrait : photo.src.landscape,
      urlHiRes: photo.src.large2x,
      urlOriginal: photo.src.original,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      alt: photo.alt || "",
      width: photo.width,
      height: photo.height,
      attribution: `Photo by ${photo.photographer} on Pexels`,
    }));
  } catch (err: any) {
    console.error("Pexels search failed:", err.message);
    return [];
  }
}

// ──────────────────────────────────────────────
// UNSPLASH SEARCH
// ──────────────────────────────────────────────
async function searchUnsplash(
  query: string,
  orientation: "landscape" | "portrait" = "landscape",
  perPage: number = 5
): Promise<StandardPhoto[]> {
  if (!UNSPLASH_ACCESS_KEY) return [];

  try {
    const params = new URLSearchParams({
      query,
      orientation,
      per_page: perPage.toString(),
      content_filter: "high",   // Safe content only
    });

    const response = await fetch(`${UNSPLASH_BASE_URL}/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`Unsplash API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    return (data.results || []).map((photo: any) => ({
      id: `unsplash-${photo.id}`,
      source: "unsplash" as const,
      // Unsplash URLs support dynamic resizing via query params
      // w=1280 gives a good quality image for video rendering
      url: orientation === "portrait"
        ? `${photo.urls.raw}&w=1080&h=1920&fit=crop&crop=faces`
        : `${photo.urls.raw}&w=1920&h=1080&fit=crop&crop=faces`,
      urlHiRes: `${photo.urls.raw}&w=2560&q=85`,
      urlOriginal: photo.urls.full,
      photographer: photo.user?.name || "Unknown",
      photographerUrl: photo.user?.links?.html
        ? `${photo.user.links.html}?utm_source=autovideo&utm_medium=referral`
        : "",
      alt: photo.alt_description || photo.description || "",
      width: photo.width,
      height: photo.height,
      attribution: `Photo by ${photo.user?.name || "Unknown"} on Unsplash`,
    }));
  } catch (err: any) {
    console.error("Unsplash search failed:", err.message);
    return [];
  }
}

// ──────────────────────────────────────────────
// COMBINED SEARCH: Both providers in parallel
// Returns the best photo from either source
// ──────────────────────────────────────────────
async function searchBothProviders(
  query: string,
  orientation: "landscape" | "portrait",
): Promise<StandardPhoto[]> {
  // Search both APIs at the same time (fast!)
  const [pexelsResults, unsplashResults] = await Promise.all([
    searchPexels(query, orientation, 5),
    searchUnsplash(query, orientation, 5),
  ]);

  // Combine results — Unsplash first (generally higher artistic quality)
  // then Pexels as backup
  const combined = [...unsplashResults, ...pexelsResults];
  return combined;
}

// ──────────────────────────────────────────────
// SEARCH FOR A SINGLE SCENE
// Tries: primary query → fallback query → simplified → give up
// ──────────────────────────────────────────────
async function searchForScene(
  scene: { sceneIndex: number; searchQuery: string; fallbackQuery?: string; description: string },
  orientation: "landscape" | "portrait",
) {
  // Attempt 1: Primary query (specific)
  let photos = await searchBothProviders(scene.searchQuery, orientation);

  if (photos.length > 0) {
    const selected = photos[Math.floor(Math.random() * Math.min(photos.length, 4))];
    return {
      sceneIndex: scene.sceneIndex,
      description: scene.description,
      searchQuery: scene.searchQuery,
      queryUsed: scene.searchQuery,
      photo: selected,
      fallbackToDalle: false,
    };
  }

  // Attempt 2: Fallback query (broader)
  if (scene.fallbackQuery && scene.fallbackQuery !== scene.searchQuery) {
    photos = await searchBothProviders(scene.fallbackQuery, orientation);

    if (photos.length > 0) {
      const selected = photos[Math.floor(Math.random() * Math.min(photos.length, 4))];
      return {
        sceneIndex: scene.sceneIndex,
        description: scene.description,
        searchQuery: scene.searchQuery,
        queryUsed: `${scene.fallbackQuery} (fallback)`,
        photo: selected,
        fallbackToDalle: false,
      };
    }
  }

  // Attempt 3: Simplified query (first 2 words of primary)
  const simplified = scene.searchQuery.split(" ").slice(0, 2).join(" ");
  if (simplified !== scene.searchQuery && simplified !== scene.fallbackQuery) {
    photos = await searchBothProviders(simplified, orientation);

    if (photos.length > 0) {
      const selected = photos[Math.floor(Math.random() * Math.min(photos.length, 4))];
      return {
        sceneIndex: scene.sceneIndex,
        description: scene.description,
        searchQuery: scene.searchQuery,
        queryUsed: `${simplified} (simplified)`,
        photo: selected,
        fallbackToDalle: false,
      };
    }
  }

  // No photos found anywhere → flag for DALL-E fallback
  return {
    sceneIndex: scene.sceneIndex,
    description: scene.description,
    searchQuery: scene.searchQuery,
    queryUsed: "none — all queries failed",
    photo: null,
    fallbackToDalle: true,
  };
}

// ──────────────────────────────────────────────
// MAIN API HANDLER: POST /api/projects/pexels-search
// (Kept same endpoint URL for backward compatibility)
//
// Request body:
//   {
//     scenes: [{ sceneIndex: 0, description: "...", searchQuery: "...", fallbackQuery: "..." }, ...],
//     orientation: "landscape" | "portrait"
//   }
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenes, orientation = "landscape" } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { error: "scenes array is required" },
        { status: 400 }
      );
    }

    // Check at least one API key is configured
    if (!PEXELS_API_KEY && !UNSPLASH_ACCESS_KEY) {
      return NextResponse.json(
        { error: "No image API keys configured. Add PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY to .env.local" },
        { status: 500 }
      );
    }

    // Log which providers are active
    const providers = [];
    if (PEXELS_API_KEY) providers.push("Pexels");
    if (UNSPLASH_ACCESS_KEY) providers.push("Unsplash");
    console.log(`[image-search] Searching ${providers.join(" + ")} for ${scenes.length} scenes`);

    // Search for ALL scenes in parallel
    const results = await Promise.allSettled(
      scenes.map((scene: any) => searchForScene(scene, orientation))
    );

    // Process results
    const sceneResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        sceneIndex: scenes[index].sceneIndex,
        description: scenes[index].description,
        searchQuery: scenes[index].searchQuery,
        queryUsed: "error",
        photo: null,
        fallbackToDalle: true,
        error: result.reason?.message || "Search failed",
      };
    });

    // Summary stats
    const successCount = sceneResults.filter((r) => r.photo !== null).length;
    const fallbackCount = sceneResults.filter((r) => r.fallbackToDalle).length;
    const unsplashCount = sceneResults.filter((r) => r.photo?.source === "unsplash").length;
    const pexelsCount = sceneResults.filter((r) => r.photo?.source === "pexels").length;

    console.log(`[image-search] Results: ${successCount}/${scenes.length} found (${unsplashCount} Unsplash, ${pexelsCount} Pexels, ${fallbackCount} need DALL-E)`);

    return NextResponse.json({
      success: true,
      sceneResults,
      summary: {
        total: scenes.length,
        photosFound: successCount,
        fromUnsplash: unsplashCount,
        fromPexels: pexelsCount,
        needDalleFallback: fallbackCount,
        providers: providers,
        costSaved: `$${(successCount * 0.04).toFixed(2)} saved vs DALL-E`,
      },
    });
  } catch (error: any) {
    console.error("Image search error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search images" },
      { status: 500 }
    );
  }
}