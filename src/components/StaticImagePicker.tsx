// ============================================================
// FILE: src/components/StaticImagePicker.tsx
// ============================================================
// Image picker for audio_static video type. Side-by-side
// Upload + Pexels search, returns { url, source } on selection.
// Matches the dark/purple aesthetic of ImageSourceToggle.
// ============================================================

"use client";

import React, { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type StaticImageSelection = {
  url: string;
  source: "upload" | "pexels";
  width?: number;
  height?: number;
};

type PexelsPhoto = {
  id: number;
  src: { large2x: string; landscape: string; portrait: string };
  alt: string;
  photographer: string;
};

interface Props {
  selected: StaticImageSelection | null;
  onChange: (sel: StaticImageSelection | null) => void;
  disabled?: boolean;
}

export default function StaticImagePicker({ selected, onChange, disabled = false }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsResults, setPexelsResults] = useState<PexelsPhoto[]>([]);
  const [pexelsBusy, setPexelsBusy] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);

  /* ── Upload ──────────────────────────────────────────── */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file later
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setUploadError("Not logged in.");
        return;
      }

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/upload-static-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadError(json?.error || "Upload failed.");
        return;
      }

      onChange({
        url: json.url,
        source: "upload",
        width: json.width,
        height: json.height,
      });
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  /* ── Pexels search ───────────────────────────────────── */
  const handlePexelsSearch = useCallback(async () => {
    const q = pexelsQuery.trim();
    if (!q) return;

    const apiKey = process.env.NEXT_PUBLIC_PEXELS_API_KEY;
    if (!apiKey) {
      setPexelsError("Pexels API key not configured.");
      return;
    }

    setPexelsError(null);
    setPexelsBusy(true);
    try {
      const params = new URLSearchParams({
        query: q,
        orientation: "landscape",
        per_page: "12",
        size: "large",
      });
      const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
        headers: { Authorization: apiKey },
      });
      const json = await res.json();
      if (!res.ok) {
        setPexelsError(json?.error || "Pexels search failed.");
        return;
      }
      setPexelsResults(json?.photos || []);
    } catch (err: any) {
      setPexelsError(err?.message || "Pexels search failed.");
    } finally {
      setPexelsBusy(false);
    }
  }, [pexelsQuery]);

  const handleSelectPexels = useCallback((photo: PexelsPhoto) => {
    onChange({
      url: photo.src.large2x,
      source: "pexels",
    });
  }, [onChange]);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-300">
          Static Image <span className="text-red-400">*</span>
        </label>
        {selected && (
          <span className="text-xs text-green-400 font-medium">
            ✓ Image ready
          </span>
        )}
      </div>

      {/* 🆕 Commit 16d — multilingual positioning hint */}
      <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-purple-200 leading-relaxed">
        🌍 <span className="font-medium">Native voices in 13 languages</span> — perfect for podcasts, voiceover, audiobooks, and motivational content. Pair with Script Mode to bring your own narration.
      </div>

      {/* Selected preview */}
      {selected && (
        <div className="relative rounded-xl border-2 border-green-500 bg-green-500/10 p-3 shadow-lg shadow-green-500/10">
          <div className="flex gap-3 items-start">
            <img
              src={selected.url}
              alt="Selected"
              className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-green-400">
                {selected.source === "upload" ? "📤 Uploaded image" : "📸 Pexels stock"}
              </div>
              {selected.width && selected.height && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {selected.width} × {selected.height}
                </div>
              )}
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled}
                className="mt-2 text-xs text-gray-400 hover:text-gray-200 underline"
              >
                Choose different image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column grid: Upload | Pexels */}
      {!selected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* ── UPLOAD CARD ── */}
          <div className="flex flex-col rounded-xl border-2 border-gray-700 bg-gray-800/50 p-4 gap-3 transition-all hover:border-blue-500/60">
            <div className="flex items-center gap-2">
              <span className="text-xl">📤</span>
              <div className="font-semibold text-sm text-blue-400">Upload your own</div>
            </div>
            <div className="text-[11px] text-gray-500 leading-relaxed">
              JPEG, PNG, or WebP · max 10MB · minimum 1920×1080
            </div>

            <label className={`mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all cursor-pointer ${
              uploading || disabled
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }`}>
              {uploading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-blue-200 border-t-white rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>Choose image</>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading || disabled}
              />
            </label>

            {uploadError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {uploadError}
              </div>
            )}
          </div>

          {/* ── PEXELS CARD ── */}
          <div className="flex flex-col rounded-xl border-2 border-gray-700 bg-gray-800/50 p-4 gap-3 transition-all hover:border-amber-500/60">
            <div className="flex items-center gap-2">
              <span className="text-xl">📸</span>
              <div className="font-semibold text-sm text-amber-400">Browse Pexels</div>
            </div>
            <div className="text-[11px] text-gray-500 leading-relaxed">
              Free stock photos · attribution shown to creators
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={pexelsQuery}
                onChange={(e) => setPexelsQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handlePexelsSearch();
                  }
                }}
                placeholder="Search e.g. 'mountain sunset'"
                disabled={pexelsBusy || disabled}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePexelsSearch}
                disabled={pexelsBusy || disabled || !pexelsQuery.trim()}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  pexelsBusy || disabled || !pexelsQuery.trim()
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-amber-600 text-white hover:bg-amber-500"
                }`}
              >
                {pexelsBusy ? "…" : "Search"}
              </button>
            </div>

            {pexelsError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {pexelsError}
              </div>
            )}

            {/* Pexels results grid */}
            {pexelsResults.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {pexelsResults.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handleSelectPexels(photo)}
                    disabled={disabled}
                    className="group relative aspect-video rounded overflow-hidden border border-gray-700 hover:border-amber-400 transition-all"
                    title={`Photo by ${photo.photographer}`}
                  >
                    <img
                      src={photo.src.landscape}
                      alt={photo.alt || `By ${photo.photographer}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}