// ============================================================
// FILE: src/app/api/dub-video/start/route.ts
// ============================================================
// Triggers the dubbing pipeline on the Render.com worker.
//
// AUTH: Reads Bearer token from Authorization header,
//       verifies via supabase.auth.getUser(token).
//       Same pattern as your existing /api/projects/create.
//
// WHAT IT DOES:
//   [1] Verifies user via Bearer token
//   [2] Fetches the dub project + verifies ownership
//   [3] Updates status to "processing"
//   [4] Sends webhook to Render worker at /dub endpoint
//
// WORKER URL RESOLUTION:
//   - Uses DUB_WORKER_URL env var if set
//   - Otherwise derives from RENDER_WEBHOOK_URL by replacing
//     /render with /dub
//   - e.g. http://localhost:10000/render → http://localhost:10000/dub
//   - e.g. https://autovideo-ai-studio-1.onrender.com/render
//          → https://autovideo-ai-studio-1.onrender.com/dub
//
// CALLED BY: /dashboard/dub-video/new/page.tsx (handleSubmit)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── Supabase admin client (service role) ────────────────── */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ── Worker URL resolution ───────────────────────────────── */
// DUB_WORKER_URL takes priority (e.g. https://...onrender.com/dub)
// Falls back to RENDER_WEBHOOK_URL with /render replaced by /dub
const DUB_WORKER_URL =
  process.env.DUB_WORKER_URL ||
  (process.env.RENDER_WEBHOOK_URL
    ? process.env.RENDER_WEBHOOK_URL.replace(/\/render\/?$/, "/dub")
    : null);

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
      .from("dub_projects")
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

    if (project.status === "processing" || project.status === "done") {
      return NextResponse.json(
        { error: `Project is already ${project.status}` },
        { status: 400 }
      );
    }

    /* ── [3] Update status to processing ─────────────────── */
    const { error: updateError } = await supabaseAdmin
      .from("dub_projects")
      .update({ status: "processing", progress_pct: 0, error_message: null })
      .eq("id", project_id);

    if (updateError) {
      console.error("[dub-video/start] Update error:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    /* ── [4] Trigger the Render worker at /dub endpoint ──── */
    console.log("[dub-video/start] DUB_WORKER_URL:", DUB_WORKER_URL);

    if (DUB_WORKER_URL) {
      try {
        const workerRes = await fetch(DUB_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id,
            source_type: project.source_type,
            source_url: project.source_url,
            target_language: project.target_language,
            target_language_code: project.target_language_code,
            voice_id: project.voice_id,
            caption_style: project.caption_style,
            keep_original_audio: project.keep_original_audio,
            original_audio_volume: project.original_audio_volume,
          }),
        });

        if (!workerRes.ok) {
          const errText = await workerRes.text();
          console.error("[dub-video/start] Worker error:", errText);
          // Don't fail the request — worker might be cold-starting on Render
        }
      } catch (workerErr) {
        console.error("[dub-video/start] Worker fetch error:", workerErr);
        // Non-fatal — Render free tier can take 30-60s to spin up
      }
    } else {
      console.warn("[dub-video/start] No DUB_WORKER_URL set and could not derive from RENDER_WEBHOOK_URL");
    }

    return NextResponse.json(
      { message: "Dubbing started", project_id },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[dub-video/start] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}