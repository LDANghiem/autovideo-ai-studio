"use client";

interface QualityEstimateProps {
  style: string;
  resolution: string;
  length: string;
}

function estimateScore({ style, resolution, length }: QualityEstimateProps) {
  let score = 80;

  // Style weighting
  if (style === "cinematic" || style === "documentary") score += 5;
  if (style === "tiktok") score -= 3;

  // Resolution
  if (resolution === "4K") score += 5;
  if (resolution === "720p") score -= 5;

  // Length considerations
  if (length === "30 seconds" || length === "60 seconds") score += 3;
  if (length === "10 minutes") score -= 3;

  if (score > 95) score = 95;
  if (score < 50) score = 50;

  let label = "Good";
  let color = "text-amber-500";

  if (score >= 90) {
    label = "Excellent";
    color = "text-emerald-500";
  } else if (score <= 65) {
    label = "Needs Tweaks";
    color = "text-rose-500";
  }

  return { score, label, color };
}

export default function QualityEstimate(props: QualityEstimateProps) {
  const { score, label, color } = estimateScore(props);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-slate-800">Quality estimate</span>
        <span className={`${color} text-xs font-semibold`}>{label}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400"
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="w-10 text-right text-xs text-slate-500">{score}</div>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        This is a rough guide based on <span className="font-medium">style</span>,{" "}
        <span className="font-medium">resolution</span> and{" "}
        <span className="font-medium">length</span>. You can still generate anything you like.
      </p>
    </div>
  );
}
