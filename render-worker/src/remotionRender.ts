import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedServeUrl: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

async function getServeUrl() {
  if (cachedServeUrl) return cachedServeUrl;

  // Bundle Remotion entry from your main app
  // (render-worker is a sibling of src/)
  const entryPoint = path.resolve(process.cwd(), "../src/remotion/index.ts");
  const outDir = path.join(os.tmpdir(), "remotion-bundle");

  const serveUrl = await bundle({
    entryPoint,
    outDir,
  });

  cachedServeUrl = serveUrl;
  return serveUrl;
}

const chromiumOptions = {
  headless: true,
  // These flags prevent a lot of “Target closed” crashes
  args: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-features=site-per-process",
  ],
  // Optional: if you ever need to force Chrome path on Windows, uncomment:
  // browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
};

export async function renderWithRemotionAndUpload(opts: {
  projectId: string;
  supabase: SupabaseClient;
  bucket?: string;
  compositionId?: string;
}) {
  const { projectId, supabase } = opts;
  const bucket = opts.bucket || "renders";
  const compositionId = opts.compositionId || "Main"; // your composition id is "Main"

  const serveUrl = await getServeUrl();

  // Input props passed into Remotion composition
  const inputProps = { projectId };

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

  const outputPath = path.join(os.tmpdir(), `${projectId}.mp4`);

  await renderMedia({
    composition: comp,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    chromiumOptions,
  });

  const file = await fs.readFile(outputPath);
  const storagePath = `projects/${projectId}.mp4`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  const { error: dbErr } = await supabase
    .from("projects")
    .update({
      status: "done",
      video_url: publicUrl,
      render_completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", projectId);

  if (dbErr) throw dbErr;

  return publicUrl;
}
