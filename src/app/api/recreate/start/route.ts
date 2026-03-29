// ============================================================
// FILE: src/app/api/recreate/start/route.ts
// ============================================================
// Triggers the ReCreate pipeline on the worker.
// Updated: passes music param to worker
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RECREATE_WORKER_URL =
  process.env.RECREATE_WORKER_URL ||
  (process.env.RENDER_WEBHOOK_URL
    ? process.env.RENDER_WEBHOOK_URL.replace(/\/render\/?$/, "/recreate")
    : null);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

    const { data: project, error: fetchError } = await supabaseAdmin
      .from("recreate_projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!RECREATE_WORKER_URL) {
      return NextResponse.json({ error: "Worker not configured" }, { status: 500 });
    }

    await supabaseAdmin.from("recreate_projects").update({
      status: "processing",
      progress_pct: 5,
      progress_stage: "Starting pipeline...",
      updated_at: new Date().toISOString(),
    }).eq("id", project_id);

    const workerRes = await fetch(RECREATE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        source_url: project.source_url,
        target_language: project.target_language,
        style: project.style,
        voice_id: project.voice_id,
        video_length: project.video_length,
        include_captions: project.include_captions,
        music: project.music || "none",
      }),
    });

    if (!workerRes.ok) {
      const errText = await workerRes.text();
      console.error("[recreate/start] Worker error:", errText);
    }

    return NextResponse.json({ message: "ReCreate started", project_id }, { status: 200 });
  } catch (err: any) {
    console.error("[recreate/start] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}