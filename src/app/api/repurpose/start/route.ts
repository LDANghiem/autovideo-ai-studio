// ============================================================
// FILE: src/app/api/repurpose/start/route.ts
// ============================================================
// Triggers the Auto-Repurpose pipeline on the LOCAL worker.
//
// AUTH: Bearer token → supabase.auth.getUser(token)
//
// WORKER URL RESOLUTION:
//   Uses RENDER_WEBHOOK_URL base, replaces /render with /repurpose
//   e.g. http://localhost:10000/render → http://localhost:10000/repurpose
//
// CALLED BY: /dashboard/repurpose/page.tsx
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ── Worker URL: derive /repurpose from RENDER_WEBHOOK_URL ──── */
const REPURPOSE_WORKER_URL =
  process.env.REPURPOSE_WORKER_URL ||
  (process.env.RENDER_WEBHOOK_URL
    ? process.env.RENDER_WEBHOOK_URL.replace(/\/render\/?$/, "/repurpose")
    : null);

export async function POST(req: NextRequest) {
  try {
    /* ── [1] Verify auth ──────────────────────────────────── */
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
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    /* ── [2] Fetch project + verify ownership ─────────────── */
    const { data: project, error: fetchError } = await supabaseAdmin
      .from("repurpose_projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status === "processing" || project.status === "analyzing" || project.status === "clipping") {
      return NextResponse.json({ error: "Project is already processing" }, { status: 400 });
    }

    /* ── [3] Update status to processing ──────────────────── */
    const { error: updateError } = await supabaseAdmin
      .from("repurpose_projects")
      .update({
        status: "processing",
        progress_pct: 0,
        progress_stage: "downloading",
        error_message: null,
        clips: [],
        detected_moments: [],
      })
      .eq("id", project_id);

    if (updateError) {
      console.error("[repurpose/start] Update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    /* ── [4] Trigger the worker at /repurpose endpoint ────── */
    console.log("[repurpose/start] REPURPOSE_WORKER_URL:", REPURPOSE_WORKER_URL);

    if (REPURPOSE_WORKER_URL) {
      try {
        const workerPayload = {
          project_id,
          source_url: project.source_url,
          youtube_video_id: project.youtube_video_id,
          max_clips: project.max_clips || 5,
          clip_min_seconds: project.clip_min_seconds || 30,
          clip_max_seconds: project.clip_max_seconds || 60,
          caption_style: project.caption_style || "karaoke",
          caption_font_scale: project.caption_font_scale || 0.5,
          crop_mode: project.crop_mode || "center",
          target_platforms: project.target_platforms || ["youtube_shorts"],
          generate_thumbnails: project.generate_thumbnails !== false,
        };

        console.log("[repurpose/start] Sending to worker:", JSON.stringify(workerPayload));

        const workerRes = await fetch(REPURPOSE_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workerPayload),
        });

        if (!workerRes.ok) {
          const errText = await workerRes.text();
          console.error("[repurpose/start] Worker error:", errText);
        }
      } catch (workerErr) {
        console.error("[repurpose/start] Worker fetch error:", workerErr);
      }
    } else {
      console.warn("[repurpose/start] No REPURPOSE_WORKER_URL set — check RENDER_WEBHOOK_URL");
    }

    return NextResponse.json(
      { message: "Repurpose pipeline started", project_id },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[repurpose/start] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}