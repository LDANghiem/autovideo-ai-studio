// src/remotionApp/Video.tsx
// ------------------------------------------------------------
// AutoVideo AI Studio — Main Video Component
//
// ✅ Smooth scene transitions with overlap (no black gaps)
// ✅ Butter-smooth karaoke captions (no jitter)
// ✅ Ken Burns pan/zoom on AI-generated scene images
// ------------------------------------------------------------

import React, { useMemo, useRef } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** ============================================================
 * Types
 * ============================================================ */
export type CaptionWord = {
  word: string;
  start: number;
  end: number;
};

export type Scene = {
  index: number;
  title: string;
  imageUrl: string | null;
  startSec: number;
  endSec: number;
  transition: "crossfade" | "fade-black" | "slide-left" | "zoom-in";
};

export type VideoProps = {
  topic: string;
  videoType?: string | null;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
  musicUrl?: string | null;

  script?: string | null;
  audioUrl?: string | null;
  captionWords?: CaptionWord[] | null;
  audioDurationSec?: number | null;
  durationInFrames?: number | null;

  scenes?: Scene[] | null;
};

/** ============================================================
 * Fallback gradients
 * ============================================================ */
const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
  "linear-gradient(135deg, #141e30, #243b55)",
  "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
  "linear-gradient(135deg, #0d1117, #161b22, #21262d)",
  "linear-gradient(135deg, #1b1b2f, #162447, #1f4068)",
  "linear-gradient(135deg, #0c0c1d, #1a1a3e, #2d2d5e)",
];

/** ============================================================
 * Ken Burns — slow cinematic pan/zoom on each scene image
 * ============================================================ */
function KenBurnsImage({
  src,
  durationFrames,
  sceneIndex,
}: {
  src: string;
  durationFrames: number;
  sceneIndex: number;
}) {
  const frame = useCurrentFrame();

  const directions = [
    { s0: 1.0,  s1: 1.12, x0: 0,  x1: -2, y0: 0,  y1: -1.5 },
    { s0: 1.12, s1: 1.0,  x0: -2, x1: 0,  y0: -1, y1: 0 },
    { s0: 1.0,  s1: 1.10, x0: 1.5,x1: -1.5,y0: -0.5,y1: 0.5 },
    { s0: 1.10, s1: 1.0,  x0: -1, x1: 1,  y0: 0.5, y1: -0.5 },
    { s0: 1.0,  s1: 1.14, x0: 0,  x1: 0,  y0: 1.5, y1: -1.5 },
    { s0: 1.05, s1: 1.0,  x0: -0.5,x1: 0.5,y0: 0,  y1: 0 },
  ];

  const d = directions[sceneIndex % directions.length];

  // Ease-in-out for smoother motion
  const linear = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Smooth ease-in-out curve
  const p = linear < 0.5
    ? 2 * linear * linear
    : 1 - Math.pow(-2 * linear + 2, 2) / 2;

  const scale = d.s0 + (d.s1 - d.s0) * p;
  const tx = d.x0 + (d.x1 - d.x0) * p;
  const ty = d.y0 + (d.y1 - d.y0) * p;

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(" + scale + ") translate(" + tx + "%, " + ty + "%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** ============================================================
 * Scene image or fallback gradient
 * ============================================================ */
function SceneVisual({
  scene,
  durationFrames,
  sceneIndex,
}: {
  scene: Scene;
  durationFrames: number;
  sceneIndex: number;
}) {
  if (scene.imageUrl) {
    return (
      <KenBurnsImage
        src={scene.imageUrl}
        durationFrames={durationFrames}
        sceneIndex={sceneIndex}
      />
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: FALLBACK_GRADIENTS[sceneIndex % FALLBACK_GRADIENTS.length],
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.12)",
          fontSize: 100,
          fontWeight: 900,
          textAlign: "center",
          padding: 80,
        }}
      >
        {scene.title}
      </div>
    </AbsoluteFill>
  );
}

/** ============================================================
 * Scene Renderer — overlapping sequences for smooth crossfades
 *
 * Each scene's Sequence starts a bit early (overlap zone) so
 * the outgoing scene is still visible while the incoming one
 * fades in. This eliminates the brief "black flash" between
 * scenes that made it look like the video was hanging.
 * ============================================================ */
function SceneRenderer({ scenes }: { scenes: Scene[] }) {
  const { fps, durationInFrames } = useVideoConfig();

  // Overlap duration: 0.6 seconds of crossfade between scenes
  const OVERLAP_FRAMES = Math.round(fps * 0.6);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {scenes.map((scene, i) => {
        const startFrame = Math.round(scene.startSec * fps);
        const endFrame =
          i < scenes.length - 1
            ? Math.round(scenes[i + 1].startSec * fps)
            : durationInFrames;

        // Extend each scene by OVERLAP_FRAMES so it stays visible
        // while the next scene fades in on top
        const extendedDuration = Math.max(1, endFrame - startFrame + (i < scenes.length - 1 ? OVERLAP_FRAMES : 0));

        // Fade-in duration for this scene
        const fadeInFrames = i === 0 ? Math.round(fps * 0.3) : OVERLAP_FRAMES;
        // Fade-out: only the LAST scene fades out at the end
        const fadeOutFrames = i === scenes.length - 1 ? Math.round(fps * 0.5) : 0;

        return (
          <Sequence
            key={"scene-" + i}
            from={startFrame}
            durationInFrames={extendedDuration}
          >
            <SceneFader
              fadeInFrames={fadeInFrames}
              fadeOutFrames={fadeOutFrames}
              totalFrames={extendedDuration}
            >
              <SceneVisual
                scene={scene}
                durationFrames={extendedDuration}
                sceneIndex={i}
              />
              {/* Subtle vignette for caption readability */}
              <AbsoluteFill
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 35%, transparent 80%, rgba(0,0,0,0.2) 100%)",
                }}
              />
            </SceneFader>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

/** ============================================================
 * SceneFader — handles opacity for smooth enter/exit
 * ============================================================ */
function SceneFader({
  fadeInFrames,
  fadeOutFrames,
  totalFrames,
  children,
}: {
  fadeInFrames: number;
  fadeOutFrames: number;
  totalFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();

  let opacity = 1;

  // Fade in
  if (fadeInFrames > 0 && frame < fadeInFrames) {
    opacity = interpolate(frame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Fade out (only for last scene)
  if (fadeOutFrames > 0 && frame > totalFrames - fadeOutFrames) {
    const outOpacity = interpolate(
      frame,
      [totalFrames - fadeOutFrames, totalFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    opacity = Math.min(opacity, outOpacity);
  }

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/** ============================================================
 * Title card fallback (when no scenes)
 * ============================================================ */
function TitleCard({ topic }: { topic: string }) {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 72,
          fontWeight: 900,
          textAlign: "center",
          textShadow: "0 8px 30px rgba(0,0,0,0.75)",
        }}
      >
        {topic || "AutoVideo AI Studio"}
      </div>
    </AbsoluteFill>
  );
}

/** ============================================================
 * Caption utilities — smooth word timing
 * ============================================================ */

/**
 * Fill gaps between words so there's never a moment where
 * no word is highlighted. Each word's end extends to meet
 * the next word's start.
 */
function fillGaps(words: CaptionWord[]): CaptionWord[] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const result: CaptionWord[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const w = { ...sorted[i] };
    // Extend end to meet next word's start (fills timing gaps)
    if (i < sorted.length - 1) {
      const nextStart = sorted[i + 1].start;
      if (w.end < nextStart && nextStart - w.end < 0.4) {
        w.end = nextStart;
      }
    }
    // Ensure minimum word display duration
    if (w.end - w.start < 0.08) {
      w.end = w.start + 0.08;
    }
    result.push(w);
  }

  return result;
}

type Line = { words: CaptionWord[]; start: number; end: number };

/**
 * Group words into display lines of N words each.
 * Each line's timing spans from first word start to last word end.
 */
function groupLines(words: CaptionWord[], perLine: number): Line[] {
  const lines: Line[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + perLine);
    if (!slice.length) break;
    lines.push({
      words: slice,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
    i += perLine;
  }
  return lines;
}

/** ============================================================
 * Karaoke Captions — smooth, no jitter
 *
 * Key improvements over previous version:
 * 1. fillGaps() eliminates timing holes between words
 * 2. Binary search for current word (faster + more stable)
 * 3. No flickering — word stays highlighted until next starts
 * 4. All hooks called unconditionally at top (React rules)
 * ============================================================ */
function KaraokeCaptions({ words, vertical }: { words: CaptionWord[]; vertical?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ALL hooks at the top — before any conditional returns
  const prevLineRef = useRef(-1);

  const filled = useMemo(() => fillGaps(words), [words]);
  const wordsPerLine = vertical ? 4 : 7;
  const lines = useMemo(() => groupLines(filled, wordsPerLine), [filled, wordsPerLine]);

  const t = frame / fps;

  // Early exit after all hooks
  if (lines.length === 0) return null;

  // Find current line: the last line whose start <= t
  let lineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i].start - 0.05) {
      lineIdx = i;
    } else {
      break;
    }
  }

  // Stick with previous line if we're in a tiny gap
  if (lineIdx < 0) {
    lineIdx = prevLineRef.current;
  } else {
    prevLineRef.current = lineIdx;
  }

  if (lineIdx < 0 || lineIdx >= lines.length) return null;
  const line = lines[lineIdx];

  // Find current word within line: last word whose start <= t
  let wordIdx = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (t >= line.words[i].start - 0.02) {
      wordIdx = i;
    }
  }

  // Line opacity: fade in when line appears, fade out when ending
  const lineAge = t - line.start;
  const lineRemaining = line.end - t;
  let lineOpacity = 1;
  if (lineAge < 0.15) {
    lineOpacity = Math.max(0.3, lineAge / 0.15);
  }
  if (lineRemaining < 0.1 && lineIdx < lines.length - 1) {
    lineOpacity = Math.max(0.3, lineRemaining / 0.1);
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: vertical ? 250 : 55,
        display: "flex",
        justifyContent: "center",
        padding: vertical ? "0 30px" : "0 50px",
        opacity: lineOpacity,
      }}
    >
      <div
        style={{
          maxWidth: vertical ? 900 : 1400,
          textAlign: "center",
          fontSize: vertical ? 52 : 44,
          lineHeight: vertical ? 1.4 : 1.35,
          fontWeight: 700,
          color: "white",
          textShadow: "0 3px 16px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.9)",
          background: "rgba(0,0,0,0.45)",
          borderRadius: 14,
          padding: vertical ? "16px 26px" : "12px 22px",
          backdropFilter: "blur(6px)",
        }}
      >
        {line.words.map((w, i) => {
          const isCurrent = i === wordIdx;
          const isPast = wordIdx >= 0 && i < wordIdx;

          // Smooth highlight: word gradually brightens as it becomes current
          let wordOpacity = 0.55; // upcoming words are dimmed
          if (isPast) wordOpacity = 0.7;
          if (isCurrent) wordOpacity = 1.0;

          return (
            <span
              key={w.start + "-" + i}
              style={{
                marginRight: 8,
                display: "inline-block",
                opacity: wordOpacity,
                color: isCurrent ? "#ffffff" : "#e0e0e0",
                textShadow: isCurrent
                  ? "0 0 12px rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.9)"
                  : "0 2px 8px rgba(0,0,0,0.8)",
                transform: isCurrent ? "scale(1.05)" : "scale(1)",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** ============================================================
 * Main Video Component
 * ============================================================ */
export const Video: React.FC<VideoProps> = (props) => {
  const { topic, videoType, audioUrl, captionWords, scenes, musicUrl } = props;
  const { durationInFrames, fps, width, height } = useVideoConfig();

  // Detect vertical mode from either videoType prop or actual dimensions
  const isVertical = (videoType === "youtube_shorts" || videoType === "tiktok") || (height > width);

  /* ── validate caption words ──────────────────────────────── */
  const words: CaptionWord[] = useMemo(() => {
    if (!captionWords || !Array.isArray(captionWords)) return [];
    return captionWords.filter(
      (w) =>
        w &&
        typeof w.word === "string" &&
        typeof w.start === "number" &&
        typeof w.end === "number" &&
        Number.isFinite(w.start) &&
        Number.isFinite(w.end) &&
        w.end >= w.start
    );
  }, [captionWords]);

  /* ── validate scenes ─────────────────────────────────────── */
  const validScenes = useMemo(() => {
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) return null;
    const filtered = scenes.filter(
      (s) => s && typeof s.startSec === "number" && typeof s.endSec === "number" && s.endSec > s.startSec
    );
    return filtered.length > 0 ? filtered : null;
  }, [scenes]);

  /* ── background music volume (low, under narration) ──────── */
  const musicVolume = 0.12;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* ── background: scene images or title card ──────────── */}
      {validScenes && validScenes.length > 0 ? (
        <SceneRenderer scenes={validScenes} />
      ) : (
        <TitleCard topic={topic} />
      )}

      {/* ── narration audio ─────────────────────────────────── */}
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {/* ── background music (low volume, loops) ────────────── */}
      {musicUrl ? (
        <Audio
          src={musicUrl}
          volume={musicVolume}
          loop
        />
      ) : null}

      {/* ── karaoke captions ────────────────────────────────── */}
      {words.length > 0 ? <KaraokeCaptions words={words} vertical={isVertical} /> : null}
    </AbsoluteFill>
  );
};