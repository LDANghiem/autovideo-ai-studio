// src/app/api/projects/generate-thumbnail-face/route.ts
// ------------------------------------------------------------
// AutoVideo AI Studio — Face Thumbnail Generator API
//
// Pipeline:
// 1. User uploads a face photo (base64 or file)
// 2. Remove background (remove.bg API or @imgly/background-removal-node)
// 3. DALL-E generates scene background (no people in prompt)
// 4. Sharp composites: background + face cutout + text overlay
// 5. Upload to Supabase storage
//
// PRO feature only
// ------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const REMOVE_BG_KEY = process.env.REMOVE_BG_API_KEY || "";
const bucketName = "thumbnails";

/* ============================================================
   Step 1: Remove background from face photo
============================================================ */
async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  // Option A: Use remove.bg API if key is set (best quality)
  if (REMOVE_BG_KEY) {
    console.log("[face-thumb] Using remove.bg API");
    const formData = new FormData();
    formData.append("size", "auto");
    formData.append("image_file", new Blob([new Uint8Array(imageBuffer)]), "face.jpg");

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": REMOVE_BG_KEY },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error("remove.bg failed: " + errText);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // Option B: Use @imgly/background-removal-node (free, local)
  console.log("[face-thumb] Using @imgly/background-removal-node (local)");
  try {
    const { removeBackground: removeBg } = await import("@imgly/background-removal-node");
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    const result = await removeBg(blob, { model: "small" });
    const arrayBuf = await result.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err: any) {
    console.error("[face-thumb] @imgly failed:", err?.message);
    // Fallback: return original image (no bg removal)
    console.log("[face-thumb] Falling back to original image (no bg removal)");
    return imageBuffer;
  }
}

/* ============================================================
   Step 2: Generate scene background with DALL-E (no people)
============================================================ */
async function generateSceneBackground(topic: string): Promise<Buffer> {
  const prompt = `YouTube thumbnail background scene for a video about "${topic}". 
Cinematic, dramatic lighting, vibrant saturated colors, shallow depth of field.
DO NOT include any people, faces, or human figures. 
Leave space on the left side for a person to be composited in later.
The right side should have visual elements related to the topic.
Professional YouTube thumbnail aesthetic, 16:9 landscape.`;

  let imageUrl = "";
  const attempts = [prompt, `Abstract colorful cinematic background for "${topic}", no people, dramatic lighting`, "Abstract vibrant gradient background with dramatic cinematic bokeh lights, no people"];

  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log("[face-thumb] DALL-E attempt", i + 1);
      const imgRes = await openai.images.generate({
        model: "dall-e-3",
        prompt: attempts[i],
        n: 1,
        size: "1792x1024",
        quality: "standard",
      });
      imageUrl = imgRes.data?.[0]?.url ?? "";
      if (imageUrl) break;
    } catch (err: any) {
      console.warn("[face-thumb] DALL-E attempt", i + 1, "failed:", err?.message);
      if (i === attempts.length - 1) throw err;
    }
  }

  if (!imageUrl) throw new Error("Failed to generate background");

  const res = await fetch(imageUrl);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/* ============================================================
   Step 3: Composite face onto background + text overlay
============================================================ */
async function compositeThumbnail(
  bgBuffer: Buffer,
  faceBuffer: Buffer,
  titleText: string,
  textColor: string,
  strokeColor: string,
  facePosition: "left" | "right",
): Promise<Buffer> {
  const W = 1792;
  const H = 1024;

  // Resize background to exact dimensions
  const bg = await sharp(bgBuffer).resize(W, H, { fit: "cover" }).toBuffer();

  // Process face: resize to fit ~60% of thumbnail height
  const faceHeight = Math.round(H * 0.75);
  const face = await sharp(faceBuffer)
    .resize({ height: faceHeight, withoutEnlargement: false })
    .png()
    .toBuffer();

  const faceMeta = await sharp(face).metadata();
  const faceW = faceMeta.width || 400;
  const faceH = faceMeta.height || faceHeight;

  // Position face on left or right
  const faceX = facePosition === "left" ? Math.round(W * 0.02) : Math.round(W - faceW - W * 0.02);
  const faceY = H - faceH; // Align to bottom

  // Text positioning (opposite side of face)
  const textSide = facePosition === "left" ? "right" : "left";

  // Build text SVG overlay
  const fontSize = Math.round(H * 0.08);
  const lineHeight = Math.round(fontSize * 1.15);
  const strokeW = Math.round(fontSize * 0.08);
  const maxTextW = Math.round(W * 0.40);

  // Word wrap — conservative estimate to prevent overflow
  const words = titleText.toUpperCase().split(" ");
  const lines: string[] = [];
  let currentLine = "";
  const avgCharW = fontSize * 0.65;
  const charsPerLine = Math.floor(maxTextW / avgCharW);

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    if (testLine.length > charsPerLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  const totalTextH = lines.length * lineHeight;
  const textStartY = Math.round((H - totalTextH) / 2);
  
  // Text X position with padding from edges
  const textPadding = Math.round(W * 0.04);
  const textX = textSide === "right" ? Math.round(W * 0.52) + textPadding : textPadding;
  const textAnchor = "start";

  const textElements = lines.map((line, i) => {
    const y = textStartY + i * lineHeight + fontSize;
    const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <text x="${textX}" y="${y}" font-family="Arial Black, Impact, sans-serif" font-size="${fontSize}" font-weight="900"
        fill="${textColor}" stroke="${strokeColor}" stroke-width="${strokeW}" paint-order="stroke"
        text-anchor="${textAnchor}">
        ${escaped}
      </text>`;
  }).join("\n");

  // Clip region to prevent any text overflow
  const clipX = textSide === "right" ? Math.round(W * 0.48) : 0;
  const clipW = Math.round(W * 0.52);

  // Optional gradient overlay for text readability
  const gradientId = "textGrad";
  const gradX1 = textSide === "right" ? "45%" : "0%";
  const gradX2 = textSide === "right" ? "100%" : "55%";

  const svgOverlay = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gradientId}" x1="${gradX1}" y1="0%" x2="${gradX2}" y2="0%">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="40%" stop-color="rgba(0,0,0,0.5)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.7)" />
        </linearGradient>
        <clipPath id="textClip">
          <rect x="${clipX}" y="0" width="${clipW}" height="${H}" />
        </clipPath>
      </defs>
      <rect x="${textSide === "right" ? Math.round(W * 0.45) : 0}" y="0" width="${Math.round(W * 0.55)}" height="${H}" fill="url(#${gradientId})" />
      <g clip-path="url(#textClip)">
        ${textElements}
      </g>
    </svg>
  `);

  // Composite: background + gradient/text overlay + face
  const result = await sharp(bg)
    .composite([
      { input: svgOverlay, top: 0, left: 0 },
      { input: face, top: faceY, left: faceX },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
}

/* ============================================================
   Main API Handler
============================================================ */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      project_id,
      topic,
      title,
      faceImageBase64,
      facePosition = "left",
      textColor = "#FFFFFF",
      strokeColor = "#000000",
    } = body;

    if (!faceImageBase64) {
      return NextResponse.json({ error: "No face image provided" }, { status: 400 });
    }

    if (!topic && !project_id) {
      return NextResponse.json({ error: "Provide a topic or project_id" }, { status: 400 });
    }

    // Get topic from project if needed
    let finalTopic = topic || "";
    if (project_id && !finalTopic) {
      const { data: proj } = await admin.from("projects").select("topic").eq("id", project_id).single();
      if (proj?.topic) finalTopic = proj.topic;
    }

    if (!finalTopic) {
      return NextResponse.json({ error: "No topic available" }, { status: 400 });
    }

    console.log("[face-thumb] Starting for topic:", finalTopic.slice(0, 60));

    // Decode base64 face image
    const faceRaw = Buffer.from(faceImageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

    // Step 1: Remove background
    console.log("[face-thumb] Step 1: Removing background...");
    const faceCutout = await removeBackground(faceRaw);
    console.log("[face-thumb] Background removed, size:", faceCutout.length);

    // Step 2: Generate AI title text
    console.log("[face-thumb] Step 2: Generating title text...");
    const titleCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        { role: "system", content: "Generate a short, punchy YouTube thumbnail title (2-5 words, ALL CAPS). Use power words. Return ONLY the title text, nothing else." },
        { role: "user", content: `Video topic: ${finalTopic}${title ? `\nPreferred title: ${title}` : ""}` },
      ],
    });
    const titleText = (titleCompletion.choices[0]?.message?.content || "WATCH THIS").trim().replace(/"/g, "");

    // Step 3: Generate scene background
    console.log("[face-thumb] Step 3: Generating scene background...");
    const bgBuffer = await generateSceneBackground(finalTopic);

    // Step 4: Composite everything
    console.log("[face-thumb] Step 4: Compositing thumbnail...");
    const finalThumb = await compositeThumbnail(
      bgBuffer,
      faceCutout,
      titleText,
      textColor,
      strokeColor,
      facePosition as "left" | "right",
    );

    // Step 5: Upload to Supabase
    console.log("[face-thumb] Step 5: Uploading...");
    const ts = Date.now();
    const objectPath = `face-thumbs/${ts}-face.jpg`;
    const { error: upErr } = await admin.storage.from(bucketName).upload(objectPath, finalThumb, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });
    if (upErr) throw new Error("Upload failed: " + upErr.message);

    const thumbnailUrl = SUPABASE_URL + "/storage/v1/object/public/" + bucketName + "/" + objectPath;

    // Save to project if project_id
    if (project_id) {
      await admin.from("projects").update({
        thumbnail_url: thumbnailUrl,
        thumbnail_generated: true,
        updated_at: new Date().toISOString(),
      }).eq("id", project_id);
    }

    console.log("[face-thumb] ✅ Done!");

    return NextResponse.json({
      ok: true,
      thumbnailUrl,
      titleText,
      facePosition,
    });
  } catch (err: any) {
    console.error("[face-thumb] ❌", err?.message || err);
    return NextResponse.json({ error: err?.message || "Face thumbnail generation failed" }, { status: 500 });
  }
}