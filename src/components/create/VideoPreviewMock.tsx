"use client";

import { motion } from "framer-motion";

interface VideoPreviewMockProps {
  style: string;
  resolution: string;
  voice: string;
  tone: string;
  music: string;
  length: string;
}

export default function VideoPreviewMock({
  style,
  resolution,
  voice,
  tone,
  music,
  length,
}: VideoPreviewMockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border bg-slate-900 text-slate-100 shadow-lg overflow-hidden"
    >
      {/* Fake “player” */}
      <div className="relative h-40 bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full bg-white/70 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-blue-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="absolute left-3 bottom-3 rounded-full bg-black/40 px-3 py-1 text-xs">
          {resolution || "1080p"} • {length || "60 seconds"}
        </div>
      </div>

      {/* Settings summary */}
      <div className="px-4 py-3 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-slate-100">
            Preview Settings
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
            Mock
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div>
            <div className="text-slate-400">Style</div>
            <div className="text-slate-100 capitalize">
              {style || "modern"}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Voice</div>
            <div className="text-slate-100">{voice || "AI Voice"}</div>
          </div>
          <div>
            <div className="text-slate-400">Tone</div>
            <div className="text-slate-100 capitalize">
              {tone || "friendly"}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Music</div>
            <div className="text-slate-100 capitalize">
              {music || "ambient"}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
