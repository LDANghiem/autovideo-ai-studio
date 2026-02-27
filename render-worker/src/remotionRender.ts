// render-worker/src/remotionRender.ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";

import ffprobeStatic from "ffprobe-static";

let cachedServeUrl: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

async function getServeUrl() {
  if (cachedServeUrl) return cachedServeUrl;

  // ✅ MAIN app Remotion entry (registerRoot)
  const entryPoint = path.resolve(process.cwd(), "../src/remotionApp/index.ts");
  const outDir = path.join(os.tmpdir(), "remotion-bundle");

  const serveUrl = await bundle({ entryPoint, outDir });
  cachedServeUrl = serveUrl;
  return serveUrl;
}

const chromiumOptions = {
  headless: true,
  args: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-features=site-per-process",
  ],
  // browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
};

// Keep the type simple and permissive (caption_words is jsonb)
type CaptionWord = { word: string; start: number; end: number };

type ProjectForRender = {
  id: string;
  user_id: string;
  topic: string | null;
  script: string | null;
  audio_url: string | null;
  caption_words: CaptionWord[] | null;
  render_attempt: number | null;
  status: string | null;
  length?: string | null;
};

async function downloadToFile(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download audio (${res.status})`);
  await pipeline(res.body as any, createWriteStream(outPath));
}

function getFfprobeBin(): string {
  // ffprobe-static can be either: {path: "..."} or just a string in some setups
  const anyVal = ffprobeStatic as any;
  return (anyVal?.path as string) || (ffprobeStatic as unknown as string);
}

async function probeDurationSec(filePath: string): Promise<number | null> {
  const bin = getFfprobeBin();

  return await new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];

    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    p.stdout.on("data", (d) => (out += String(d)));

    p.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const n = Number(String(out).trim());
      if (!Number.isFinite(n) || n <= 0) return resolve(null);
      resolve(n);
    });

    p.on("error", () => resolve(null));
  });
}

export async function renderWithRemotionAndUpload(opts: {
  projectId: string;
  supabase: SupabaseClient;
  bucket?: string;
  compositionId?: string;
}) {
  const { projectId, supabase } = opts;
  const bucket = (opts.bucket || "renders").trim();
  const compositionId = (opts.compositionId || "Main").trim();

  // ------------------------------------------------------------
  // [1] Load project
  // ------------------------------------------------------------
  const { data: p, error: pErr } = await supabase
    .from("projects")
    .select("id,user_id,topic,script,audio_url,caption_words,render_attempt,status,length")
    .eq("id", projectId)
    .single();

  if (pErr) throw pErr;

  const project = p as unknown as ProjectForRender;

  // OPTIONAL: bump attempt so every re-render creates a new file path
  // If you do NOT have render_attempt column, remove this whole block.
  const nextAttempt = (project.render_attempt ?? 0) + 1;
  {
    const { error: bumpErr } = await supabase
      .from("projects")
      .update({ render_attempt: nextAttempt, updated_at: nowIso() })
      .eq("id", projectId);

    if (!bumpErr) {
      project.render_attempt = nextAttempt;
    }
  }

  const attempt = project.render_attempt ?? 0;

  // ------------------------------------------------------------
  // [2] Mark as processing
  // ------------------------------------------------------------
  const startTime = nowIso();
  
  const { error: startErr } = await supabase
    .from("projects")
    .update({
      status: "processing",
      
       // ✅ actual render start time
    processing_started_at: startTime,

    // ✅ do NOT touch render_started_at anymore (it now represents queued time)
    render_completed_at: null,

      error_message: null,
      updated_at: startTime,
    })
    .eq("id", projectId);

  if (startErr) throw startErr;

  // ------------------------------------------------------------
  // [3] Compute actual audio duration (Option A)
  // ------------------------------------------------------------
  let audioDurationSec: number | null = null;

  if (project.audio_url) {
    const tmpAudioPath = path.join(os.tmpdir(), `${projectId}-attempt-${attempt}.mp3`);
    try {
      await downloadToFile(project.audio_url, tmpAudioPath);
      audioDurationSec = await probeDurationSec(tmpAudioPath);
    } finally {
      try {
        await fs.unlink(tmpAudioPath);
      } catch {
        // ignore
      }
    }
  }

  // ------------------------------------------------------------
  // [4] Bundle + inputProps
  // ------------------------------------------------------------
  const serveUrl = await getServeUrl();

  const inputProps = {
    projectId,
    topic: project.topic ?? undefined,
    script: project.script ?? undefined,
    audioUrl: project.audio_url ?? undefined,
    captionWords: Array.isArray(project.caption_words) ? project.caption_words : [],
    attempt,

    // Used by src/remotionApp/Root.tsx to compute durationInFrames
    audioDurationSec: audioDurationSec ?? null,

    // Optional fallback used by Root.tsx when audioDurationSec missing
    length: project.length ?? undefined,
  };

  const comps = await getCompositions(serveUrl, {
    inputProps,
    chromiumOptions,
  });

  const comp = comps.find((c) => c.id === compositionId);
  if (!comp) {
    throw new Error(
      `Remotion composition "${compositionId}" not found. Available: ${comps
        .map((c) => c.id)
        .join(", ")}`
    );
  }

  const outputPath = path.join(os.tmpdir(), `${projectId}-attempt-${attempt}.mp4`);

  // ------------------------------------------------------------
  // [5] Render -> Upload -> DB update
  // ------------------------------------------------------------
  try {
    await renderMedia({
      composition: comp,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      chromiumOptions,
    });

    const file = await fs.readFile(outputPath);
    const storagePath = `projects/${projectId}/attempt-${attempt}.mp4`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, file, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = pub.publicUrl;

    const endTime = nowIso();
    const { error: dbErr } = await supabase
      .from("projects")
      .update({
        status: "done",
        video_url: publicUrl,
        render_completed_at: endTime,
        updated_at: endTime,
        error_message: null,
      })
      .eq("id", projectId);

    if (dbErr) throw dbErr;

    return publicUrl;
  } finally {
    // Best-effort cleanup of mp4
    try {
      await fs.unlink(outputPath);
    } catch {
      // ignore
    }
  }
}