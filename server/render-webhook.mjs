// server/render-webhook.mjs
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { createClient } from "@supabase/supabase-js";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const app = express();
app.use(express.json({ limit: "2mb" }));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = process.env.VIDEO_BUCKET || "videos";

// Render uses PORT; your logs show 10000 which is fine locally, but Render sets PORT.
const PORT = Number(process.env.PORT || 10000);

// Optional (script generation)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and (SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

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
  // ~2.2 words/sec (rough), keep it punchy
  const wordsTarget = Math.round(seconds * 2.2);
  const title = topic || "Untitled Project";
  const lines = [
    `Title: ${title}`,
    "",
    `Hook: Here are ${Math.min(5, Math.max(3, Math.round(seconds / 10)))} quick ideas you can use today.`,
    "",
    `Point 1: Start with one small action you can do in under 2 minutes.`,
    `Point 2: Remove one distraction before you begin—phone, tabs, or noise.`,
    `Point 3: Work in short sprints, then take a short reset.`,
    "",
    `Wrap-up: If you want, I can turn this into a longer, deeper version.`,
  ];

  // Trim/expand slightly to match target
  let script = lines.join("\n");
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length > wordsTarget) {
    script = words.slice(0, wordsTarget).join(" ");
  }
  return script;
}

async function generateScript({ topic, style, tone, language, seconds }) {
  // If you haven’t added OpenAI yet, this still works (fallback).
  if (!OPENAI_API_KEY) {
    return fallbackScript({ topic, seconds });
  }

  // OpenAI generation (optional)
  const prompt = `
Write a voiceover script for a ${seconds}-second video.
Topic: ${topic || "Untitled"}
Style: ${style || "modern"}
Tone: ${tone || "friendly"}
Language: ${language || "English"}

Requirements:
- Make it natural and speakable.
- Hook in the first 1–2 sentences.
- Keep it concise for the time limit.
- No scene directions, just the narration text.
`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt.trim(),
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    // If OpenAI fails, still proceed with fallback so your pipeline doesn’t break
    console.warn("OpenAI script generation failed:", resp.status, t);
    return fallbackScript({ topic, seconds });
  }

  const json = await resp.json();
  // responses API returns text in output_text typically
  const text =
    json.output_text ||
    (json.output?.[0]?.content || [])
      .map((c) => c.text)
      .filter(Boolean)
      .join("\n");

  const cleaned = String(text || "").trim();
  return cleaned || fallbackScript({ topic, seconds });
}

async function runRender(projectId) {
  // 1) Load project
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    throw new Error(projErr?.message || "Project not found");
  }

  const seconds = parseSeconds(project.length);

  // 2) Generate script (Option B)
  const script = await generateScript({
    topic: project.topic,
    style: project.style,
    tone: project.tone,
    language: project.language,
    seconds,
  });

  // 3) Mark processing + save script early (so UI can display it even if render crashes)
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
      // Keep your existing props…
      topic: project.topic ?? "Untitled Project",
      style: project.style,
      voice: project.voice,
      length: project.length,
      resolution: project.resolution,
      language: project.language,
      tone: project.tone,
      music: project.music,

      // New: script available to Remotion (even if you don’t use it visually yet)
      script,
    },
  });

  // 6) Render to mp4
  const outDir = path.join(os.tmpdir(), "renders");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${projectId}.mp4`);

  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outFile,
    inputProps: comp.props,

    // IMPORTANT: helps with “Timeout (30000ms) exceeded…”
    timeoutInMilliseconds: 180000, // 3 minutes
  });

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

  // 8) Public URL (bucket must be public for this exact URL to work)
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

  // 9) Update project as done (Option B keeps script)
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

  return { publicUrl, script };
}

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));


// Main webhook
app.post("/render", async (req, res) => {
  // ✅ 0) normalize secrets (prevents whitespace/newline mismatch)
  const expected = String(process.env.RENDER_WEBHOOK_SECRET || "").trim();
  const received = String(req.header("x-webhook-secret") || "").trim();

  // ✅ 0.1) optional debug (does NOT expose full secret)
  if (process.env.DEBUG_WEBHOOK === "1") {
    console.log("[/render] header present?", Boolean(req.header("x-webhook-secret")));
    console.log("[/render] expected prefix:", expected.slice(0, 6), "len:", expected.length);
    console.log("[/render] received prefix:", received.slice(0, 6), "len:", received.length);
  }

  // ✅ 1) Webhook auth check FIRST
  if (expected && received !== expected) {
    return res.status(401).json({ error: "Invalid secret" });
  }

  // ✅ 2) Then your existing logic
  try {
    const projectId = req.body?.project_id;
    if (!projectId) return jsonError(res, 400, "Missing project_id");

    const { publicUrl, script } = await runRender(projectId);
    return res.json({ ok: true, video_url: publicUrl, script });
  } catch (e) {
    const msg = String(e?.message || e);

    // Best-effort update project error
    try {
      const projectId = req.body?.project_id;
      if (projectId) {
        await admin
          .from("projects")
          .update({
            status: "error",
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId);
      }
    } catch {}

    console.error("Render failed:", e);
    return jsonError(res, 500, msg);
  }
});

app.listen(PORT, () => {
  console.log(`Render webhook listening on port ${PORT}`);
});
