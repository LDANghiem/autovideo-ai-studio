// src/remotionApp/Root.tsx
// ------------------------------------------------------------
// AutoVideo AI Studio — Remotion Root
// Now includes scenes[] prop for AI-generated visuals.
// ------------------------------------------------------------

import React from "react";
import { Composition } from "remotion";
import { Video, type VideoProps } from "./Video";

const FPS = 30;

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function lengthToSeconds(lengthStr: string | null | undefined): number {
  if (!lengthStr) return 60;
  const s = String(lengthStr).toLowerCase().trim();
  const secMatch = s.match(/(\d+)\s*(sec|secs|second|seconds)\b/);
  if (secMatch) return clamp(Number(secMatch[1]), 10, 1800);
  const minMatch = s.match(/(\d+)\s*(min|mins|minute|minutes)\b/);
  if (minMatch) return clamp(Number(minMatch[1]) * 60, 10, 1800);
  if (s.includes("5")) return 300;
  if (s.includes("8")) return 480;
  if (s.includes("12")) return 720;
  if (s.includes("16")) return 960;
  if (s.includes("20")) return 1200;
  if (s.includes("24")) return 1440;
  if (s.includes("30")) return 1800;
  return 60;
}

const defaultProps: VideoProps & { durationInFrames?: number | null } = {
  topic: "AutoVideo AI Studio",
  style: "modern",
  voice: "AI Voice",
  length: "60 seconds",
  resolution: "1080p",
  language: "English",
  tone: "friendly",
  music: "ambient",

  script: "",
  audioUrl: null,
  captionWords: null,
  audioDurationSec: null,
  durationInFrames: null,

  // ✅ NEW: scenes for AI-generated visuals
  scenes: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={Video as any}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={FPS * 60}
      defaultProps={defaultProps as any}
      calculateMetadata={({ props }: { props: any }) => {
        const fromWebhook = Number(props?.durationInFrames);
        if (Number.isFinite(fromWebhook) && fromWebhook > 0) {
          return { durationInFrames: Math.round(fromWebhook) };
        }
        const audioSec = Number(props?.audioDurationSec);
        const requestedSec = lengthToSeconds(props?.length);
        const baseSec = Math.max(
          Number.isFinite(audioSec) && audioSec > 0 ? audioSec : 0,
          requestedSec
        );
        const finalSec = baseSec > 0 ? baseSec : 60;
        return { durationInFrames: Math.ceil((finalSec + 0.35) * FPS) };
      }}
    />
  );
};
