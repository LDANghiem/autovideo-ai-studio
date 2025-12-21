"use client";

import { motion } from "framer-motion";

type Template = {
  id: string;
  label: string;
  description: string;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
};

const templates: Template[] = [
  {
    id: "yt_explainer",
    label: "YouTube Explainer",
    description: "5–7 min educational explainer in 1080p.",
    style: "modern",
    voice: "AI Voice",
    length: "5 minutes",
    resolution: "1080p",
    language: "English",
    tone: "friendly",
    music: "ambient",
  },
  {
    id: "short_reel",
    label: "Short Reel",
    description: "Punchy 60s clip for TikTok / Reels.",
    style: "tiktok",
    voice: "Female Soft",
    length: "60 seconds",
    resolution: "1080p",
    language: "English",
    tone: "fun",
    music: "upbeat",
  },
  {
    id: "doc_style",
    label: "Mini Documentary",
    description: "Serious, documentary-style narration.",
    style: "documentary",
    voice: "Narrator",
    length: "10 minutes",
    resolution: "4K",
    language: "English",
    tone: "serious",
    music: "cinematic",
  },
];

interface TemplatePresetsProps {
  onSelectTemplate: (tpl: Template) => void;
}

export default function TemplatePresets({
  onSelectTemplate,
}: TemplatePresetsProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {templates.map((tpl) => (
        <motion.button
          key={tpl.id}
          type="button"
          whileTap={{ scale: 0.96 }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-blue-500 hover:shadow-md"
          onClick={() => onSelectTemplate(tpl)}
        >
          <div className="text-xs font-semibold uppercase text-slate-400">
            Template
          </div>
          <div className="text-sm font-semibold text-slate-800">
            {tpl.label}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {tpl.description}
          </div>
        </motion.button>
      ))}
    </div>
  );
}
