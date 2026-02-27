// src/app/api/projects/generate-thumbnail/route.ts
// ------------------------------------------------------------
// AutoVideo AI Studio — AI Thumbnail Generator v2
//
// ✅ Generates 4 VARIATIONS in one call
// ✅ GPT creates 4 different concepts (different angles/compositions)
// ✅ DALL-E generates images in parallel (2 at a time)
// ✅ Sharp overlays bold styled text
// ✅ Style presets (Bold Red, Neon, Gold, etc.)
// ✅ Retry logic for content filter
// ------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/* ============================================================
   Env + Auth helpers
============================================================ */
function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error("Missing env: " + key);
  return v;
}

function getAdminClient() {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function getUserClient(token: string) {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: "Bearer " + token } },
    }
  );
}

/* ============================================================
   Types
============================================================ */
type ThumbnailConcept = {
  imagePrompt: string;
  titleText: string;
  textPosition: "left" | "right" | "center";
  angle: string;
};

/* ============================================================
   GPT: Generate 4 thumbnail concepts at once
============================================================ */
async function generateThumbnailConcepts(opts: {
  topic: string;
  title?: string;
  script?: string;
  count?: number;
}): Promise<ThumbnailConcept[]> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const { topic, title, script, count = 4 } = opts;

  const prompt = [
    "You are a top YouTube thumbnail designer. Create " + count + " DIFFERENT thumbnail concepts for this video.",
    "",
    "Topic: " + topic,
    title ? "Preferred title text: " + title : "",
    script ? "Brief script context: " + script.slice(0, 300) : "",
    "",
    "CRITICAL: Each concept must be VISUALLY DIFFERENT from the others:",
    "- Variation 1: Close-up / macro shot with shallow depth of field",
    "- Variation 2: Wide dramatic cinematic scene",
    "- Variation 3: Abstract / conceptual / symbolic representation",
    "- Variation 4: Action / dynamic / emotional moment",
    "",
    "For EACH concept, provide:",
    "",
    "1. \"imagePrompt\": A detailed DALL-E prompt for the background image.",
    "   - Must be visually STRIKING and attention-grabbing",
    "   - Vibrant, high-contrast colors, cinematic lighting",
    "   - NO text, NO words, NO letters, NO numbers in the image",
    "   - Photorealistic, 16:9 landscape, ultra high quality",
    "   - Leave space on one side for text overlay",
    "   IMPORTANT: each imagePrompt must describe a COMPLETELY DIFFERENT visual",
    "",
    "2. \"titleText\": Short punchy overlay text (2-5 words MAX, ALL CAPS)",
    "   - Use power words: SECRET, TRUTH, BEST, TOP, WHY, HOW",
    "   - Each variation can have a DIFFERENT title angle",
    "",
    "3. \"textPosition\": \"left\", \"right\", or \"center\"",
    "",
    "4. \"angle\": brief label for this variation (e.g. \"Close-up\", \"Epic Scene\", \"Symbolic\", \"Emotional\")",
    "",
    "Respond with a JSON array of " + count + " objects. No markdown, ONLY valid JSON array.",
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        { role: "system", content: "You are a YouTube thumbnail expert. Always respond with a valid JSON array only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error?.message || "GPT concepts failed");

  let raw = (json?.choices?.[0]?.message?.content || "").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("Not an array");
    return arr.slice(0, count) as ThumbnailConcept[];
  } catch {
    throw new Error("Failed to parse thumbnail concepts JSON");
  }
}

/* ============================================================
   DALL-E: Generate thumbnail background (with retry)
============================================================ */
async function generateThumbnailImage(imagePrompt: string, topic: string): Promise<Buffer> {
  const apiKey = getEnv("OPENAI_API_KEY");

  async function callDalle(prompt: string): Promise<Buffer> {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024",
        quality: "standard",
        response_format: "b64_json",
      }),
    });

    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error?.message || "DALL-E failed");

    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data");
    return Buffer.from(b64, "base64");
  }

  try {
    return await callDalle(imagePrompt);
  } catch (err: any) {
    console.warn("[thumbnail] DALL-E attempt 1 failed:", err?.message);
  }

  const safePrompt = "A vibrant, eye-catching YouTube thumbnail background about " + topic + ". Bright colors, dramatic lighting, cinematic composition, blurred background, clear focal point. No text, no words, no letters, no people. Professional photography, 16:9 landscape.";
  try {
    return await callDalle(safePrompt);
  } catch (err2: any) {
    console.warn("[thumbnail] DALL-E attempt 2 failed:", err2?.message);
  }

  const genericPrompt = "A beautiful abstract colorful gradient background with bokeh lights and dramatic lighting. Vibrant colors, professional, eye-catching, no text, no words, 16:9 landscape.";
  return await callDalle(genericPrompt);
}

/* ============================================================
   Sharp: Overlay bold text on image
============================================================ */
async function overlayText(
  imageBuffer: Buffer,
  text: string,
  position: "left" | "right" | "center",
  textColor: string,
  strokeColor: string,
  bgGradient: boolean = true
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 1792;
  const h = meta.height || 1024;

  const fontSize = Math.round(h * 0.12);
  const lineHeight = Math.round(fontSize * 1.2);
  const padding = Math.round(w * 0.05);
  const charsPerLine = Math.floor((w * 0.6) / (fontSize * 0.55));

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).trim().length > charsPerLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  const textBlockHeight = lines.length * lineHeight;
  const y = Math.round((h - textBlockHeight) / 2);

  let x: number;
  let textAnchor: string;
  if (position === "left") { x = padding; textAnchor = "start"; }
  else if (position === "right") { x = w - padding; textAnchor = "end"; }
  else { x = Math.round(w / 2); textAnchor = "middle"; }

  const strokeWidth = Math.round(fontSize * 0.08);
  const textLines = lines.map((line, i) => {
    const ly = y + i * lineHeight + fontSize;
    return [
      `<text x="${x}" y="${ly}" font-family="Arial Black, Arial, Impact, sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="${textAnchor}" fill="${strokeColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" letter-spacing="2">${escapeXml(line)}</text>`,
      `<text x="${x}" y="${ly}" font-family="Arial Black, Arial, Impact, sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="${textAnchor}" fill="${textColor}" letter-spacing="2">${escapeXml(line)}</text>`,
    ].join("\n");
  }).join("\n");

  let gradientRect = "";
  if (bgGradient) {
    if (position === "left") {
      gradientRect = `<defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="black" stop-opacity="0.6"/><stop offset="100%" stop-color="black" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="${Math.round(w * 0.55)}" height="${h}" fill="url(#tg)"/>`;
    } else if (position === "right") {
      gradientRect = `<defs><linearGradient id="tg" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="black" stop-opacity="0.6"/><stop offset="100%" stop-color="black" stop-opacity="0"/></linearGradient></defs><rect x="${Math.round(w * 0.45)}" y="0" width="${Math.round(w * 0.55)}" height="${h}" fill="url(#tg)"/>`;
    } else {
      gradientRect = `<defs><linearGradient id="tg" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="black" stop-opacity="0.5"/><stop offset="60%" stop-color="black" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="${w}" height="${h}" fill="url(#tg)"/>`;
    }
  }

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${gradientRect}${textLines}</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* ============================================================
   POST handler
============================================================ */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userClient = getUserClient(token);
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id || null;
    let topic = (body.topic || "").trim();
    let title = (body.title || "").trim();
    let script = (body.script || "").trim();
    const count = Math.min(4, Math.max(1, body.count || 4));

    const reqTextColor = (body.textColor || "").trim();
    const reqStrokeColor = (body.strokeColor || "").trim();
    const reqBgGradient = body.bgGradient !== false;

    if (projectId) {
      const { data: project } = await userClient
        .from("projects")
        .select("topic, script")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .single();
      if (project) {
        topic = topic || project.topic || "Untitled";
        script = script || project.script || "";
      }
    }

    if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

    console.log("[thumbnail] generating", count, "concepts for:", topic.slice(0, 60));

    const concepts = await generateThumbnailConcepts({ topic, title, script, count });
    console.log("[thumbnail] got", concepts.length, "concepts:", concepts.map((c) => c.titleText).join(", "));

    const admin = getAdminClient();
    const bucketName = process.env.THUMBNAIL_BUCKET || "thumbnails";
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const ts = Date.now();

    const results: { thumbnailUrl: string; titleText: string; textPosition: string; angle: string }[] = [];

    // Process 2 at a time (DALL-E rate limit friendly)
    for (let i = 0; i < concepts.length; i += 2) {
      const batch = concepts.slice(i, i + 2);

      const batchResults = await Promise.allSettled(
        batch.map(async (concept, batchIdx) => {
          const idx = i + batchIdx;
          const label = "v" + (idx + 1);

          console.log("[thumbnail] " + label + ": generating (" + (concept.angle || "") + ")...");
          const rawImage = await generateThumbnailImage(concept.imagePrompt, topic);

          const finalImage = await overlayText(
            rawImage,
            concept.titleText,
            concept.textPosition || "left",
            reqTextColor || "#FFFFFF",
            reqStrokeColor || "#000000",
            reqBgGradient
          );

          const objectPath = user!.id + "/" + (projectId || "standalone") + "/thumb-" + ts + "-" + label + ".jpg";
          const { error: upErr } = await admin.storage.from(bucketName).upload(objectPath, finalImage, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: "3600",
          });
          if (upErr) throw new Error("Upload: " + upErr.message);

          const url = SUPABASE_URL + "/storage/v1/object/public/" + bucketName + "/" + objectPath;
          console.log("[thumbnail] " + label + " ✅");

          return { thumbnailUrl: url, titleText: concept.titleText, textPosition: concept.textPosition || "left", angle: concept.angle || "Variation " + (idx + 1) };
        })
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
        else console.warn("[thumbnail] variation failed:", (r as any).reason?.message);
      }

      if (i + 2 < concepts.length) await new Promise((r) => setTimeout(r, 1500));
    }

    if (projectId && results.length > 0) {
      await admin.from("projects").update({
        thumbnail_url: results[0].thumbnailUrl,
        thumbnail_generated: true,
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);
    }

    console.log("[thumbnail] ✅ done:", results.length, "thumbnails generated");

    return NextResponse.json({ ok: true, count: results.length, thumbnails: results });
  } catch (err: any) {
    console.error("[thumbnail] ❌", err?.message || err);
    return NextResponse.json({ error: err?.message || "Thumbnail generation failed" }, { status: 500 });
  }
}