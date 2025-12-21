"use client";

import { motion } from "framer-motion";

interface StylePreviewProps {
  selected: string;
}

const styleMap: Record<
  string,
  { label: string; description: string }
> = {
  modern: {
    label: "Modern",
    description: "Clean shots, light motion graphics, YouTube style.",
  },
  cinematic: {
    label: "Cinematic",
    description: "Film-like look, dramatic lighting, slow camera moves.",
  },
  documentary: {
    label: "Documentary",
    description: "Informational, interview-focused, factual pacing.",
  },
  tiktok: {
    label: "TikTok",
    description: "Vertical, punchy edits, fast cuts and captions.",
  },
  retro: {
    label: "Retro",
    description: "Old-school color tones and nostalgic vibes.",
  },
};

export default function StylePreview({ selected }: StylePreviewProps) {
  const info = styleMap[selected] ?? styleMap.modern;

  return (
    <motion.div
      key={selected}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="mt-3 rounded-xl border bg-slate-50 px-4 py-3 text-sm"
    >
      <div className="font-semibold text-slate-800">
        {info.label} style preview
      </div>
      <p className="mt-1 text-slate-500">{info.description}</p>
    </motion.div>
  );
}
