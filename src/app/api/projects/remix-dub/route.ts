// ============================================================
// FILE: src/app/api/projects/remix-dub/route.ts
// ============================================================
// DUB REMIX RENDER v2 — Full Re-Render with Native Captions
//
// Instead of FFmpeg audio-swap (which keeps English captions burned in),
// this triggers a FULL Remotion re-render using:
//   - Same scene images (no re-generation needed)
//   - Dubbed audio URL (from ElevenLabs/OpenAI/Google)
//   - Translated caption words (from Whisper transcription of dubbed audio)
//
// This produces a CLEAN video with ONLY the target language captions.
//
// POST /api/projects/remix-dub
// Body: { dub_id: "uuid" }
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import os from "os";
import fs from "fs/promises";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

// ──────────────────────────────────────────────
// POST /api/projects/remix-dub
// ──────────────────────────────────────────────
export async function POST(req: Request) {
  const startTime = Date.now();
  const now = new Date().toISOString();

  try {
    const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const VIDEO_BUCKET = (process.env.VIDEO_BUCKET || "videos").trim();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    // ── Auth ──
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse request ──
    const body = await req.json().catch(() => ({}));
    const dubId = body?.dub_id;

    if (!dubId) {
      return NextResponse.json({ error: "Missing dub_id" }, { status: 400 });
    }

    // ── Load the dub record ──
    const { data: dub, error: dubErr } = await admin
      .from("project_dubs")
      .select("*")
      .eq("id", dubId)
      .eq("user_id", user.id)
      .single();

    if (dubErr || !dub) {
      return NextResponse.json({ error: "Dub not found" }, { status: 404 });
    }

    if (!dub.audio_url) {
      return NextResponse.json({ error: "Dub has no audio. Generate the dub first." }, { status: 400 });
    }

    if (!dub.caption_words || !Array.isArray(dub.caption_words) || dub.caption_words.length === 0) {
      return NextResponse.json({ error: "Dub has no caption data. Regenerate the dub." }, { status: 400 });
    }

    // ── Load the parent project ──
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", dub.project_id)
      .eq("user_id", user.id)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: "Parent project not found" }, { status: 404 });
    }

    if (!project.video_url) {
      return NextResponse.json({
        error: "Original video not rendered yet. Render the video first, then remix.",
      }, { status: 400 });
    }

    console.log(`[remix] 🎬 Starting full re-render for ${dub.language_flag} ${dub.language_name} dub`);
    console.log(`[remix]   Project: ${project.topic}`);
    console.log(`[remix]   Dubbed audio: ${dub.audio_url.slice(0, 80)}...`);
    console.log(`[remix]   Caption words: ${dub.caption_words.length} words`);
    console.log(`[remix]   Scenes: ${project.scenes?.length || 0}`);

    // ── Mark as "remixing" ──
    await admin.from("project_dubs").update({
      remix_status: "remixing",
      remix_started_at: now,
      remix_error: null,
      updated_at: now,
    }).eq("id", dubId);

    // ════════════════════════════════════════════
    // STEP 1: Calculate duration from dubbed audio captions
    // ════════════════════════════════════════════
    console.log("[remix] Step 1: Calculating duration...");

    const lastWord = dub.caption_words[dub.caption_words.length - 1];
    const audioDurationSec = lastWord?.end
      ? Math.ceil(lastWord.end) + 1
      : null;

    const FPS = 30;
    const durationInFrames = audioDurationSec
      ? Math.ceil(audioDurationSec * FPS) + Math.ceil(FPS * 0.5)
      : undefined;

    console.log(`[remix]   Audio duration: ~${audioDurationSec}s → ${durationInFrames} frames`);

    // ════════════════════════════════════════════
    // STEP 2: Prepare inputProps for Remotion
    // Same scenes, but dubbed audio + translated captions
    // ════════════════════════════════════════════
    console.log("[remix] Step 2: Preparing inputProps...");

    // Reuse same scene images
    const liteScenes = Array.isArray(project.scenes)
      ? project.scenes.map((s: any) => ({
          subject: s.subject || s.label || "",
          imageUrl: s.imageUrl || s.image_url || null,
          startSec: s.startSec ?? s.start_sec ?? 0,
          endSec: s.endSec ?? s.end_sec ?? 0,
          photographer: s.photographer || null,
          photographerUrl: s.photographerUrl || s.photographer_url || null,
          pexelsUrl: s.pexelsUrl || s.pexels_url || null,
        }))
      : [];

    // Use TRANSLATED caption words
    const liteWords = dub.caption_words.map((w: any) => ({
      word: w.word || "",
      start: w.start || 0,
      end: w.end || 0,
    }));

    // Music URL
    const musicChoice = (project.music || "none").toLowerCase();
    const musicBucket = process.env.MUSIC_BUCKET || "music";
    const musicMap: Record<string, string> = {
      ambient: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/ambient.mp3",
      uplifting: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/uplifting.mp3",
      dramatic: SUPABASE_URL + "/storage/v1/object/public/" + musicBucket + "/dramatic.mp3",
    };
    const musicUrl = musicMap[musicChoice] || null;

    const videoType = project.video_type || "conventional";

    const inputProps = {
      topic: project.topic ?? "Untitled Project",
      videoType,
      style: project.style ?? null,
      voice: project.voice ?? null,
      length: project.length ?? null,
      resolution: project.resolution ?? null,
      language: dub.language_name || project.language || null,
      tone: project.tone ?? null,
      music: project.music ?? null,
      musicUrl,

      // ✅ THE KEY: Use DUBBED audio + TRANSLATED captions
      audioUrl: dub.audio_url,
      captionWords: liteWords,
      audioDurationSec,
      durationInFrames,

      script: null,
      scenes: liteScenes,
    };

    console.log(`[remix]   ✅ Using dubbed audio: ${dub.audio_url.slice(0, 60)}...`);
    console.log(`[remix]   ✅ Using ${liteWords.length} ${dub.language_name} caption words`);
    console.log(`[remix]   ✅ Reusing ${liteScenes.length} scene images`);

    // ════════════════════════════════════════════
    // STEP 3: Render with Remotion (inline)
    // ════════════════════════════════════════════
    console.log("[remix] Step 3: Starting Remotion render...");

    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, selectComposition } = await import("@remotion/renderer");

    const entryPoint = path.join(process.cwd(), "src", "remotionApp", "index.ts");
    console.log(`[remix]   Entry point: ${entryPoint}`);

    // Bundle
    console.log("[remix]   Bundling...");
    const bundlePath = await bundle({
      entryPoint,
      onProgress: (pct: number) => {
        if (pct === 10 || pct === 50 || pct === 100) {
          console.log(`[remix]   Bundle: ${pct}%`);
        }
      },
    });

    // Select composition (this applies calculateMetadata with our inputProps)
    const comp = await selectComposition({
      serveUrl: bundlePath,
      id: "Main",
      inputProps,
    });

    console.log(`[remix]   Composition: ${comp.width}x${comp.height}, ${comp.durationInFrames} frames, ${comp.fps}fps`);
    console.log(`[remix]   Duration: ${(comp.durationInFrames / comp.fps).toFixed(1)}s`);

    // Create temp output file
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "remix-"));
    const outputFile = path.join(tmpDir, `remix-${dub.language_code}.mp4`);

    // Render!
    let lastLoggedProgress = 0;
    await renderMedia({
      composition: comp,
      serveUrl: bundlePath,
      codec: "h264",
      outputLocation: outputFile,
      inputProps,
      onProgress: ({ progress }: { progress: number }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= lastLoggedProgress + 20) {
          console.log(`[remix]   Render: ${pct}%`);
          lastLoggedProgress = pct;
        }
      },
    });

    const stat = await fs.stat(outputFile);
    console.log(`[remix]   ✅ Rendered: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

    // ════════════════════════════════════════════
    // STEP 4: Upload to Supabase Storage
    // ════════════════════════════════════════════
    console.log("[remix] Step 4: Uploading remixed video...");

    const remixAttempt = project.render_attempt || 1;
    const remixObjectPath = `${user.id}/${project.id}/remix-${dub.language_code}-attempt-${remixAttempt}.mp4`;

    const videoBuffer = await fs.readFile(outputFile);

    const { error: uploadErr } = await admin.storage.from(VIDEO_BUCKET).upload(
      remixObjectPath,
      videoBuffer,
      {
        contentType: "video/mp4",
        upsert: true,
        cacheControl: "3600",
      }
    );

    if (uploadErr) throw new Error("Upload failed: " + uploadErr.message);

    const remixVideoUrl = `${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${remixObjectPath}`;
    console.log(`[remix]   Uploaded: ${remixVideoUrl.slice(0, 80)}...`);

    // ════════════════════════════════════════════
    // STEP 5: Update database
    // ════════════════════════════════════════════
    console.log("[remix] Step 5: Saving to database...");

    const completedAt = new Date().toISOString();
    await admin.from("project_dubs").update({
      remix_video_url: remixVideoUrl,
      remix_object_path: remixObjectPath,
      remix_status: "completed",
      remix_completed_at: completedAt,
      remix_error: null,
      updated_at: completedAt,
    }).eq("id", dubId);

    // Cleanup temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    const elapsedMs = Date.now() - startTime;
    console.log(`[remix] ✅ Remix complete! ${dub.language_flag} ${dub.language_name}`);
    console.log(`[remix]   Time: ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`[remix]   Size: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

    return NextResponse.json({
      success: true,
      remix: {
        dub_id: dubId,
        language_code: dub.language_code,
        language_name: dub.language_name,
        language_flag: dub.language_flag,
        remix_video_url: remixVideoUrl,
        file_size_mb: +(stat.size / 1024 / 1024).toFixed(2),
        duration_sec: audioDurationSec,
        elapsed_sec: +(elapsedMs / 1000).toFixed(1),
      },
    });

  } catch (error: any) {
    console.error("[remix] ERROR:", error?.message || error);

    // Try to mark the dub as errored
    try {
      const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
      const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
      if (SUPABASE_URL && SERVICE_ROLE_KEY) {
        const errBody = await req.clone().json().catch(() => ({}));
        if (errBody?.dub_id) {
          const errAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
          await errAdmin.from("project_dubs").update({
            remix_status: "error",
            remix_error: (error?.message || "Unknown error").slice(0, 500),
            updated_at: new Date().toISOString(),
          }).eq("id", errBody.dub_id);
        }
      }
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json(
      { error: error?.message || "Remix failed" },
      { status: 500 }
    );
  }
}