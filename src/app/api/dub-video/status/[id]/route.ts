// ============================================================
// FILE: src/app/api/dub-video/status/[id]/route.ts
// ============================================================
// Returns the current status of a dub project.
// The frontend polls this every 3 seconds while processing.
//
// AUTH: Reads Bearer token from Authorization header,
//       verifies via supabase.auth.getUser(token).
//
// FIX: params must be awaited in Next.js 15+ (it's a Promise)
//
// WHAT IT DOES:
//   [1] Verifies user via Bearer token
//   [2] Awaits params to get project ID
//   [3] Fetches project by ID (user_id must match)
//   [4] Returns status, progress, video_url, error_message, etc.
//
// CALLED BY: /dashboard/dub-video/[id]/page.tsx (polling)
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
      .from("dub_projects")
      .select(
        `id, status, progress_pct,
         source_title, source_thumbnail, source_duration_sec,
         source_language, target_language,
         voice_name, caption_style,
         video_url, srt_url, error_message,
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
    console.error("[dub-video/status] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}