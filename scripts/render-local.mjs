import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { createClient } from "@supabase/supabase-js";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

// ---- ENV ----
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = process.env.VIDEO_BUCKET || "videos";

// Increase this if needed (Render is slower than your laptop)
const TIMEOUT_MS = Number(process.env.REMOTION_TIMEOUT_MS || 180000); // 3 minutes
// Keep this modest to reduce RAM usage (especially on small instances)
const OFFTHREAD_CACHE_MB = Number(process.env.REMOTION_OFFTHREAD_CACHE_MB || 256);
const OFFTHREAD_CACHE_BYTES = OFFTHREAD_CACHE_MB * 1024 * 1024;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL and (SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node scripts/render-local.mjs <project_id>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function setStatus(projectId, patch) {
  await admin
    .from("projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

async function main() {
  // 1) Load project
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    throw new Error(projErr?.message || "Project not found");
  }

  // 2) Set status processing
  await setStatus(projectId, { status: "processing", error_message: null });

  // 3) Bundle Remotion entry
  const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
  const bundled = await bundle(entry);

  // 4) Select composition (with safer cache + timeout)
  const comp = await selectComposition({
    serveUrl: bundled,
    id: "Main",
    inputProps: {
      topic: project.topic ?? "Untitled Project",
      style: project.style,
      voice: project.voice,
      length: project.length,
      resolution: project.resolution,
      language: project.language,
      tone: project.tone,
      music: project.music,
    },
    offthreadVideoCacheSizeInBytes: OFFTHREAD_CACHE_BYTES,
    timeoutInMilliseconds: TIMEOUT_MS,
  });

  // 5) Render to MP4 (write to temp dir on Render/Linux)
  const outDir = path.join(os.tmpdir(), "renders");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${projectId}.mp4`);

  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outFile,
    inputProps: comp.props,

    // IMPORTANT: lower memory/CPU pressure + avoid 30s timeouts
    concurrency: 1,
    timeoutInMilliseconds: TIMEOUT_MS,
  });

  console.log("Rendered:", outFile);

  // 6) Upload to Supabase Storage
  const fileBuffer = fs.readFileSync(outFile);
  const objectPath = `${project.user_id}/${projectId}.mp4`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
    });

  if (upErr) throw new Error(upErr.message);

  // 7) Public URL (bucket must be public, like you did in D22-A)
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

  // 8) Done
  await setStatus(projectId, {
    status: "done",
    video_url: publicUrl,
    error_message: null,
  });

  console.log("Updated project video_url:", publicUrl);
  console.log("DONE ✅");
}

main().catch(async (e) => {
  console.error("Render failed:", e);

  // Best-effort: mark project as error
  try {
    await setStatus(projectId, {
      status: "error",
      error_message: String(e?.message || e),
    });
  } catch {}

  process.exit(1);
});
