// ============================================================
// FILE: src/app/api/repurpose/status/[id]/route.ts
// ============================================================
// Returns current status of a repurpose project.
// Frontend polls this every 3 seconds while processing.
//
// AUTH: Bearer token → supabase.auth.getUser(token)
//
// CALLED BY: /dashboard/repurpose/page.tsx (polling)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    /* ── [2] Await params (Next.js 15+) ───────────────────── */
    const { id } = await context.params;

    /* ── [3] Fetch project (user must own it) ─────────────── */
    const { data: project, error } = await supabaseAdmin
      .from("repurpose_projects")
      .select(
        `id, status, progress_pct, progress_stage,
         source_url, youtube_video_id,
         source_title, source_thumbnail, source_channel,
         source_duration_sec,
         max_clips, clip_min_seconds, clip_max_seconds,
         caption_style, crop_mode, target_platforms,
         generate_thumbnails,
         detected_moments, clips,
         error_message,
         created_at, updated_at`
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    /* ── [4] Return status ────────────────────────────────── */
    return NextResponse.json({ project }, { status: 200 });
  } catch (err: any) {
    console.error("[repurpose/status] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}