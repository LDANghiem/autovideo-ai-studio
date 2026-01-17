// scripts/render-local.mjs
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { createClient } from "@supabase/supabase-js";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and (SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node scripts/render-local.mjs <project_id>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BUCKET = process.env.VIDEO_BUCKET || "videos";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function parseSeconds(lengthStr) {
  if (!lengthStr) return 30;
  const s = String(lengthStr).toLowerCase();
  const m = s.match(/(\d+)\s*(sec|secs|second|seconds)/);
  if (m) return Math.max(10, Math.min(600, Number(m[1])));
  const m2 = s.match(/(\d+)\s*(min|mins|minute|minutes)/);
  if (m2) return Math.max(10, Math.min(600, Number(m2[1]) * 60));
  return 30;
}

function fallbackScript({ topic, seconds }) {
  const wordsTarget = Math.round(seconds * 2.2);
  const title = topic || "Untitled Project";
  const lines = [
    `Title: ${title}`,
    "",
    `Hook: Here are a few quick ideas you can use today.`,
    "",
    `Point 1: Start with one small action you can do in under 2 minutes.`,
    `Point 2: Remove one distraction before you begin—phone, tabs, or noise.`,
    `Point 3: Work in short sprints, then take a short reset.`,
    "",
    `Wrap-up: If you want, I can turn this into a longer version.`,
  ];

  let script = lines.join("\n");
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length > wordsTarget) {
    script = words.slice(0, wordsTarget).join(" ");
  }
  return script;
}

async function generateScript({ topic, style, tone, language, seconds }) {
  if (!OPENAI_API_KEY) return fallbackScript({ topic, seconds });

  const prompt = `
Write a voiceover script for a ${seconds}-second video.
Topic: ${topic || "Untitled"}
Style: ${style || "modern"}
Tone: ${tone || "friendly"}
Language: ${language || "English"}

Requirements:
- Speakable narration only (no scene directions).
- Strong hook in first 1–2 sentences.
- Fit the time limit.
`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: prompt.trim() }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.warn("OpenAI script generation failed:", resp.status, t);
    return fallbackScript({ topic, seconds });
  }

  const json = await resp.json();
  const text =
    json.output_text ||
    (json.output?.[0]?.content || [])
      .map((c) => c.text)
      .filter(Boolean)
      .join("\n");

  const cleaned = String(text || "").trim();
  return cleaned || fallbackScript({ topic, seconds });
}

async function main() {
  // 1) Load project
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) throw new Error(projErr?.message || "Project not found");

  const seconds = parseSeconds(project.length);

  // 2) Generate script (Option B)
  const script = await generateScript({
    topic: project.topic,
    style: project.style,
    tone: project.tone,
    language: project.language,
    seconds,
  });

  // 3) Set status processing + save script early
  await admin
    .from("projects")
    .update({
      status: "processing",
      script,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  // 4) Bundle Remotion entry
  const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
  const bundled = await bundle(entry);

  // 5) Select composition
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

      script,
    },
  });

  // 6) Render to MP4 (local file)
  const outDir = path.join(process.cwd(), "tmp", "renders");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${projectId}.mp4`);

  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outFile,
    inputProps: comp.props,
    timeoutInMilliseconds: 180000,
  });

  console.log("Rendered:", outFile);

  // 7) Upload to Supabase Storage
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

  // 8) Public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

  // 9) Update project to done + video_url + script
  await admin
    .from("projects")
    .update({
      status: "done",
      video_url: publicUrl,
      script,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  console.log("Updated project video_url:", publicUrl);
  console.log("Saved script to projects.script ✅");
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
