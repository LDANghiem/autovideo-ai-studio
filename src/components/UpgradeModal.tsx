// ============================================================
// FILE: src/components/UpgradeModal.tsx
// Generic upgrade modal — reusable across features
// ============================================================

"use client";

import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  onClose: () => void;
  feature?: string;           // e.g. "Audio + Static Image"
  requiredTier?: "creator" | "studio";
};

export default function UpgradeModal({
  open,
  onClose,
  feature = "This feature",
  requiredTier = "creator",
}: Props) {
  const router = useRouter();

  if (!open) return null;

  const tierLabel = requiredTier === "studio" ? "Studio" : "Creator";

  const bullets =
    requiredTier === "studio"
      ? [
          "🎭 Voice cloning (your own voice)",
          "📦 Bulk Video Factory (up to 50 videos)",
          "🎙️ Audio + Static Image (30-min cap)",
          "Highest output quotas and resolution",
        ]
      : [
          "🎙️ Audio + Static Image (10-min cap)",
          "Higher monthly video quota",
          "Priority rendering",
          "No watermark on exports",
        ];

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
          <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-700 text-xl">
            ⭐
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">
              Upgrade to {tierLabel}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {feature} is available on {tierLabel} and above.
            </p>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1.5">
          <div className="font-medium text-sm text-purple-900">
            {tierLabel} unlocks:
          </div>
          <ul className="text-xs text-purple-800 space-y-1 leading-relaxed">
            {bullets.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
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
            View plans
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