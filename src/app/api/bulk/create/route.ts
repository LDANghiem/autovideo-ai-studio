// ============================================================
// FILE: src/app/api/bulk/create/route.ts
// Bulk Video Factory — Studio exclusive
// Creates up to 50 projects in one shot and queues all renders
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_BULK = 50;

// triggerRender removed — frontend handles sequencing via /api/projects/start-render

export async function POST(req: NextRequest) {
  try {
    // Auth
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Studio only
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (profile?.plan !== "studio") {
      return NextResponse.json(
        { error: "Bulk Video Factory is a Studio exclusive feature." },
        { status: 403 }
      );
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const items: any[] = body.items || [];
    const sharedSettings = body.shared_settings || {};

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }
    if (items.length > MAX_BULK) {
      return NextResponse.json({ error: `Maximum ${MAX_BULK} videos per batch.` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const batchId = `bulk_${user.id}_${Date.now()}`;

    // Create all projects
    const projectIds: string[] = [];
    const errors: { index: number; topic: string; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const topic = String(item.topic || "").trim();
      if (!topic) {
        errors.push({ index: i, topic: "(empty)", error: "Topic is required" });
        continue;
      }

      const insertRow = {
        user_id: user.id,
        topic,
        topic_instructions: String(item.topic_instructions || sharedSettings.topic_instructions || "").trim() || null,
        input_mode: "topic",
        video_type: sharedSettings.video_type || "conventional",
        image_source: sharedSettings.image_source || "real-photos",
        status: "draft",  // Must be draft so start-render processes it (queued triggers the guard)
        style: sharedSettings.style || "modern",
        voice: sharedSettings.voice || "Coral — warm female",
        elevenlabs_voice_id: sharedSettings.elevenlabs_voice_id || null,
        elevenlabs_voice_name: sharedSettings.elevenlabs_voice_name || null,
        length: sharedSettings.length || "5 minutes",
        resolution: sharedSettings.resolution || "1080p",
        language: sharedSettings.language || "English",
        tone: sharedSettings.tone || "friendly",
        music: sharedSettings.music || "ambient",
        caption_style: sharedSettings.caption_style || "none",
        script: null,
        video_url: null,
        error_message: null,
        render_started_at: null,
        render_completed_at: null,
        bulk_batch_id: batchId,
        updated_at: now,
      };

      const { data, error } = await supabaseAdmin
        .from("projects")
        .insert(insertRow)
        .select("id")
        .single();

      if (error || !data) {
        console.error("[bulk/create] Insert failed for topic:", topic, "error:", error?.message, "details:", error?.details, "hint:", error?.hint);
        errors.push({ index: i, topic, error: error?.message || "Insert failed" });
        continue;
      }

      projectIds.push(data.id);
    }

    if (projectIds.length === 0) {
      console.error("[bulk/create] All inserts failed. Errors:", JSON.stringify(errors));
      return NextResponse.json({ error: "No projects could be created. First error: " + (errors[0]?.error || "unknown"), errors }, { status: 400 });
    }

    // Projects are created with status "queued"
    // The frontend bulk page will call start-render for each project sequentially
    console.log(`[bulk/create] ${projectIds.length} projects created, ready for frontend sequencing`);

    // Save bulk job record for tracking (non-critical)
    try {
      await supabaseAdmin.from("bulk_jobs").insert({
        id: batchId,
        user_id: user.id,
        total: projectIds.length,
        completed: 0,
        failed: 0,
        project_ids: projectIds,
        shared_settings: sharedSettings,
        status: "processing",
        created_at: now,
        updated_at: now,
      });
    } catch { /* tracking only — ignore errors */ }

    console.log(`[bulk/create] Batch ${batchId}: ${projectIds.length} projects created for user ${user.id}`);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      total_created: projectIds.length,
      project_ids: projectIds,
      errors: errors.length > 0 ? errors : undefined,
      message: `${projectIds.length} videos queued successfully. They'll render in the background.`,
    });
  } catch (err: any) {
    console.error("[bulk/create] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}