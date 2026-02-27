// ============================================================
// FILE: src/app/api/shorts/start/route.ts
// ============================================================
// Triggers the AI Shorts pipeline on the Render.com worker.
//
// AUTH: Bearer token → supabase.auth.getUser(token)
//
// PIPELINE (worker will execute these steps):
//   Step 1: Download YouTube video via yt-dlp
//   Step 2: Transcribe audio via Whisper API
//   Step 3: GPT-4o analyzes transcript → finds viral moments
//   Step 4: FFmpeg extracts clips + crops to 9:16
//   Step 5: Add captions (karaoke/block/centered)
//   Step 6: Generate thumbnails per clip (optional)
//   Step 7: Generate titles & descriptions per clip
//   Step 8: Upload clips to Supabase Storage
//   Step 9: Update shorts_projects.clips JSONB + status
//
// WHAT THIS ROUTE DOES:
//   [1] Verifies user via Bearer token
//   [2] Fetches the shorts project + verifies ownership
//   [3] Updates status to "processing"
//   [4] Sends webhook to Render worker at /shorts endpoint
//
// WORKER URL RESOLUTION:
//   - Uses SHORTS_WORKER_URL env var if set
//   - Otherwise derives from RENDER_WEBHOOK_URL
//
// CALLED BY: /dashboard/shorts/page.tsx (handleGenerate)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── Supabase admin client (service role) ────────────────── */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ── Worker URL resolution ───────────────────────────────── */
const SHORTS_WORKER_URL =
  process.env.SHORTS_WORKER_URL ||
  (process.env.RENDER_WEBHOOK_URL
    ? process.env.RENDER_WEBHOOK_URL.replace(/\/render\/?$/, "/shorts")
    : null);

/* ── Parse clip_length string to min/max seconds ─────────── */
function parseClipLengthRange(clipLength: string | null): { min: number; max: number } {
  switch (clipLength) {
    case "15-30": return { min: 15, max: 30 };
    case "30-60": return { min: 30, max: 60 };
    case "15-60": return { min: 15, max: 60 };
    default:      return { min: 30, max: 60 };
  }
}

export async function POST(req: NextRequest) {
  try {
    /* ── [1] Verify auth via Bearer token ────────────────── */
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project_id } = await req.json();

    if (!project_id) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400 }
      );
    }

    /* ── [2] Fetch project + verify ownership ────────────── */
    const { data: project, error: fetchError } = await supabaseAdmin
      .from("shorts_projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.status === "processing") {
      return NextResponse.json(
        { error: "Project is already processing" },
        { status: 400 }
      );
    }

    /* ── [3] Update status to processing ─────────────────── */
    const { error: updateError } = await supabaseAdmin
      .from("shorts_projects")
      .update({
        status: "processing",
        progress_pct: 0,
        progress_stage: "downloading",
        error_message: null,
        clips: [],
      })
      .eq("id", project_id);

    if (updateError) {
      console.error("[shorts/start] Update error:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    /* ── [4] Trigger the Render worker at /shorts endpoint ── */
    console.log("[shorts/start] SHORTS_WORKER_URL:", SHORTS_WORKER_URL);

    // Parse duration constraints from project data
    // The frontend sends clip_min_seconds/clip_max_seconds to /api/shorts/create
    // which saves them to the DB. We forward them to the worker here.
    const { min: defaultMin, max: defaultMax } = parseClipLengthRange(project.clip_length);
    const clipMinSeconds = project.clip_min_seconds || defaultMin;
    const clipMaxSeconds = project.clip_max_seconds || defaultMax;

    if (SHORTS_WORKER_URL) {
      try {
        const workerPayload = {
          project_id,
          source_url: project.source_url,
          youtube_video_id: project.youtube_video_id,
          max_clips: project.max_clips || 5,
          clip_length: project.clip_length || "30-60",
          // ✅ NEW: Explicit min/max seconds for duration enforcement
          clip_min_seconds: clipMinSeconds,
          clip_max_seconds: clipMaxSeconds,
          caption_style: project.caption_style || "karaoke",
          // ✅ NEW: Caption font scale (0.5 = 50% of base size)
          caption_font_scale: project.caption_font_scale || 0.5,
          crop_mode: project.crop_mode || "center",
          generate_thumbnails: project.generate_thumbnails !== false,
        };

        console.log("[shorts/start] Sending to worker:", JSON.stringify(workerPayload));

        const workerRes = await fetch(SHORTS_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workerPayload),
        });

        if (!workerRes.ok) {
          const errText = await workerRes.text();
          console.error("[shorts/start] Worker error:", errText);
          // Don't fail — worker might be cold-starting
        }
      } catch (workerErr) {
        console.error("[shorts/start] Worker fetch error:", workerErr);
        // Non-fatal — Render free tier can take 30-60s to spin up
      }
    } else {
      console.warn("[shorts/start] No SHORTS_WORKER_URL set");
    }

    return NextResponse.json(
      { message: "Shorts generation started", project_id },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[shorts/start] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}