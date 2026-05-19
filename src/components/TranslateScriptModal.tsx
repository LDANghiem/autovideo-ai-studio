// ============================================================
// FILE: src/components/TranslateScriptModal.tsx
// ============================================================
// Translate script modal — calls /api/projects/translate-script
// Supports Literal vs Adaptive mode, shows usage counter,
// and provides clear upgrade path for Free users at cap.
// ============================================================

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// Same 13 languages your TTS supports
const SUPPORTED_LANGUAGES = [
  { value: "English",    flag: "🇺🇸" },
  { value: "Vietnamese", flag: "🇻🇳" },
  { value: "Spanish",    flag: "🇪🇸" },
  { value: "Portuguese", flag: "🇧🇷" },
  { value: "French",     flag: "🇫🇷" },
  { value: "German",     flag: "🇩🇪" },
  { value: "Hindi",      flag: "🇮🇳" },
  { value: "Japanese",   flag: "🇯🇵" },
  { value: "Korean",     flag: "🇰🇷" },
  { value: "Chinese",    flag: "🇨🇳" },
  { value: "Arabic",     flag: "🇸🇦" },
  { value: "Indonesian", flag: "🇮🇩" },
  { value: "Thai",       flag: "🇹🇭" },
];

export type TranslationResult = {
  translatedText: string;
  warnings: string[];
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  scriptText: string;
  currentLanguage: string;       // The current Language dropdown value
  onTranslated: (result: TranslationResult) => void;
}

export default function TranslateScriptModal({
  open,
  onClose,
  scriptText,
  currentLanguage,
  onTranslated,
}: Props) {
  const router = useRouter();

  const [sourceLanguage, setSourceLanguage] = useState(currentLanguage || "English");
  const [targetLanguage, setTargetLanguage] = useState("Vietnamese");
  const [mode, setMode] = useState<"adaptive" | "literal">("adaptive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number | null } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setError(null);
      setLimitReached(false);
      setUsageInfo(null);
      setSourceLanguage(currentLanguage || "English");
      // Auto-pick a sensible target (not the same as source)
      setTargetLanguage(currentLanguage === "Vietnamese" ? "English" : "Vietnamese");
    }
  }, [open, currentLanguage]);

  if (!open) return null;

  const targetOptions = SUPPORTED_LANGUAGES.filter((l) => l.value !== sourceLanguage);

  async function handleTranslate() {
    if (sourceLanguage === targetLanguage) {
      setError("Source and target languages must be different.");
      return;
    }
    if (!scriptText || scriptText.trim().length < 50) {
      setError("Script must be at least 50 characters to translate.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Not logged in.");
        return;
      }

      const res = await fetch("/api/projects/translate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: scriptText,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          mode,
        }),
      });

      const json = await res.json();

      // Rate-limit case
      if (res.status === 429 && json?.upgrade_required) {
        setLimitReached(true);
        setUsageInfo({ used: json.used, limit: json.limit });
        return;
      }

      if (!res.ok) {
        setError(json?.error || "Translation failed.");
        return;
      }

      // Success — pass result back to parent
      onTranslated({
        translatedText: json.translated_text,
        warnings: json.warnings || [],
        sourceLanguage,
        targetLanguage,
        originalText: scriptText,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Translation failed.");
    } finally {
      setBusy(false);
    }
  }

  /* ──────────── Limit reached state ──────────── */
  if (limitReached) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-700 text-xl">
              ⏳
            </span>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">
                Translation limit reached
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                You've used {usageInfo?.used} of {usageInfo?.limit} translations this month.
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">
            Your free monthly quota refreshes on the 1st. For more translations now, upgrade to Creator (30/month) or Studio (unlimited).
          </p>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
            <div className="text-sm font-medium text-purple-900">
              🌍 Why translate matters
            </div>
            <p className="text-xs text-purple-800 leading-relaxed">
              Reach audiences in 13 languages with native-sounding voices. Perfect for motivational content, podcasts, and bilingual marketing.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/dashboard/billing");
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2.5 font-medium text-sm transition-colors"
            >
              Upgrade plan
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ──────────── Normal translate state ──────────── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-700 text-xl">
            🌍
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Translate script</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Translate to any of 13 supported languages. AI translation — please review before rendering.
            </p>
          </div>
        </div>

        {/* Language selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">From</label>
            <select
              value={sourceLanguage}
              onChange={(e) => {
                const newSource = e.target.value;
                // If the user picks the same language as current target, swap them
                if (newSource === targetLanguage) {
                  setTargetLanguage(sourceLanguage);
                }
                setSourceLanguage(newSource);
              }}
              disabled={busy}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.flag} {l.value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">To</label>
            <select
              value={targetLanguage}
              onChange={(e) => {
                const newTarget = e.target.value;
                // If the user picks the same language as current source, swap them
                if (newTarget === sourceLanguage) {
                  setSourceLanguage(targetLanguage);
                }
                setTargetLanguage(newTarget);
              }}
              disabled={busy}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {targetOptions.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.flag} {l.value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700">Translation style</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("adaptive")}
              disabled={busy}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (mode === "adaptive"
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 bg-white hover:border-gray-300")
              }
            >
              <div className="font-medium text-sm text-gray-900">✨ Adaptive</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-snug">
                Natural target-language phrasing. Best for motivational, conversational, marketing.
              </div>
              <div className="text-[10px] font-bold text-purple-700 mt-1">Recommended</div>
            </button>
            <button
              type="button"
              onClick={() => setMode("literal")}
              disabled={busy}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (mode === "literal"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300")
              }
            >
              <div className="font-medium text-sm text-gray-900">📐 Literal</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-snug">
                Word-for-word. Best for technical, instructional, or precise content.
              </div>
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
          🤖 AI translation. Always review before rendering — especially proper nouns, idioms, and cultural references.
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleTranslate}
            disabled={busy || sourceLanguage === targetLanguage}
            className={
              "rounded-lg px-4 py-2.5 font-medium text-sm transition-colors flex items-center justify-center gap-2 " +
              (busy || sourceLanguage === targetLanguage
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white")
            }
          >
            {busy ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-white rounded-full animate-spin" />
                Translating…
              </>
            ) : (
              <>Translate</>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}