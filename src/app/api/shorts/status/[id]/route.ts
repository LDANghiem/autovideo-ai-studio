// ============================================================
// FILE: src/app/api/shorts/status/[id]/route.ts
// ============================================================
// Returns the current status of a shorts project.
// The frontend polls this every 3 seconds while processing.
//
// AUTH: Bearer token → supabase.auth.getUser(token)
//
// RETURNS:
//   - status: "draft" | "processing" | "done" | "error"
//   - progress_pct: 0-100
//   - progress_stage: current pipeline step name
//   - clips: JSONB array of generated clips, each with:
//       {
//         id, index, title, description,
//         start_time, end_time, duration,
//         hook_score, reason,
//         video_url, thumbnail_url,
//         status: "pending" | "processing" | "done" | "error"
//       }
//   - source_title, source_thumbnail, source_channel
//   - error_message (if failed)
//
// CALLED BY: /dashboard/shorts/page.tsx (polling)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── Supabase admin client (service role) ────────────────── */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    /* ── [2] Await params (Next.js 15+ requirement) ──────── */
    const { id } = await context.params;

    /* ── [3] Fetch project (user must own it) ────────────── */
    const { data: project, error } = await supabaseAdmin
      .from("shorts_projects")
      .select(
        `id, status, progress_pct, progress_stage,
         source_url, youtube_video_id,
         source_title, source_thumbnail, source_channel,
         max_clips, clip_length, caption_style, crop_mode,
         generate_thumbnails,
         clips,
         error_message,
         created_at, updated_at`
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    /* ── [4] Return project status ───────────────────────── */
    return NextResponse.json({ project }, { status: 200 });
  } catch (err: any) {
    console.error("[shorts/status] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}