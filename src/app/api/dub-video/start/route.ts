// ============================================================
// FILE: src/app/api/dub-video/start/route.ts
// ============================================================
// Triggers the dubbing pipeline on the worker.
// Now passes start_time, end_time, source_type for partial/upload modes.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DUB_WORKER_URL =
  process.env.DUB_WORKER_URL ||
  (process.env.RENDER_WEBHOOK_URL
    ? process.env.RENDER_WEBHOOK_URL.replace(/\/render\/?$/, "/dub")
    : null);

export async function POST(req: NextRequest) {
  try {
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

    const { data: project, error: fetchError } = await supabaseAdmin
      .from("dub_projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status === "processing" || project.status === "done") {
      return NextResponse.json({ error: `Project is already ${project.status}` }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("dub_projects")
      .update({ status: "processing", progress_pct: 0, error_message: null })
      .eq("id", project_id);

    if (updateError) {
      console.error("[dub-video/start] Update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log("[dub-video/start] DUB_WORKER_URL:", DUB_WORKER_URL);
    console.log("[dub-video/start] source_type:", project.source_type,
      "start_time:", project.start_time, "end_time:", project.end_time);

    if (DUB_WORKER_URL) {
      try {
        const workerRes = await fetch(DUB_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id,
            source_type: project.source_type || "youtube",
            source_url: project.source_url,
            target_language: project.target_language,
            target_language_code: project.target_language_code,
            voice_id: project.voice_id,
            caption_style: project.caption_style,
            keep_original_audio: project.keep_original_audio,
            original_audio_volume: project.original_audio_volume,
            // New fields for partial dub + upload
            start_time: project.start_time || null,
            end_time: project.end_time || null,
          }),
        });

        if (!workerRes.ok) {
          const errText = await workerRes.text();
          console.error("[dub-video/start] Worker error:", errText);
        }
      } catch (workerErr) {
        console.error("[dub-video/start] Worker fetch error:", workerErr);
      }
    } else {
      console.warn("[dub-video/start] No DUB_WORKER_URL set");
    }

    return NextResponse.json({ message: "Dubbing started", project_id }, { status: 200 });
  } catch (err: any) {
    console.error("[dub-video/start] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}