import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

/**
 * This script is executed on Render.com by server/render-webhook.mjs:
 *   node scripts/render-local.mjs <project_id>
 *
 * It will:
 * 1) Load project from Supabase
 * 2) Set status=processing
 * 3) Bundle Remotion
 * 4) Render MP4
 * 5) Upload to Supabase Storage
 * 6) Update project status=done + video_url
 */

// Accept multiple env var names (so it works locally + on Render)
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY; // <- your Render env uses this name

const BUCKET = process.env.VIDEO_BUCKET || "videos";

// IMPORTANT: Remotion "delayRender timeout" (default 30000ms)
// Increase this for Render's slower CPU / network.
const FRAME_TIMEOUT_MS = Number(process.env.RENDER_FRAME_TIMEOUT_MS || 240000); // 4 minutes

// Optional: helps if remote assets have CORS issues (can cause delayRender waits)
const DISABLE_WEB_SECURITY =
  (process.env.RENDER_DISABLE_WEB_SECURITY || "true").toLowerCase() === "true";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node scripts/render-local.mjs <project_id>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("== Render job starting ==");
  console.log("Project:", projectId);
  console.log("Bucket:", BUCKET);
  console.log("FRAME_TIMEOUT_MS:", FRAME_TIMEOUT_MS);
  console.log("DISABLE_WEB_SECURITY:", DISABLE_WEB_SECURITY);

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
  await admin
    .from("projects")
    .update({
      status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  // 3) Bundle Remotion entry
  const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
  console.log("Bundling entry:", entry);

  const serveUrl = await bundle(entry);

  // 4) Select composition
  const inputProps = {
    topic: project.topic ?? "Untitled Project",
    style: project.style,
    voice: project.voice,
    length: project.length,
    resolution: project.resolution,
    language: project.language,
    tone: project.tone,
    music: project.music,
  };

  const comp = await selectComposition({
    serveUrl,
    id: "Main",
    inputProps,
    // Helpful debugging: logs from inside the browser
    onBrowserLog: (log) => {
      // log.text can reveal failing image/audio fetches, etc.
      console.log("[browser]", log.text);
    },
  });

  // 5) Render to MP4
  const outDir = path.join(process.cwd(), "tmp", "renders");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${projectId}.mp4`);
  console.log("Rendering to:", outFile);

  await renderMedia({
    composition: comp,
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps: comp.props,

    // Key fix for your error:
    // Increase delayRender timeout (default 30000ms)
    timeoutInMilliseconds: FRAME_TIMEOUT_MS,

    // Render starter plan is slow—keep concurrency low
    concurrency: 1,

    chromiumOptions: {
      disableWebSecurity: DISABLE_WEB_SECURITY,
    },

    // Extra visibility
    onStart: () => console.log("Render started…"),
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 10 === 0) console.log(`Progress: ${pct}%`);
    },
  });

  console.log("Rendered:", outFile);

  // 6) Upload to Supabase Storage
  const fileBuffer = fs.readFileSync(outFile);
  const objectPath = `${project.user_id}/${projectId}.mp4`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, fileBuffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });

  if (upErr) throw new Error(upErr.message);

  // 7) Public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

  // 8) Update project to done + video_url
  await admin
    .from("projects")
    .update({
      status: "done",
      video_url: publicUrl,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  console.log("Updated project video_url:", publicUrl);
  console.log("DONE ✅");
}

main().catch(async (e) => {
  console.error("Render failed:", e);

  try {
    await admin
      .from("projects")
      .update({
        status: "error",
        error_message: String(e?.message || e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
  } catch {}

  process.exit(1);
});
