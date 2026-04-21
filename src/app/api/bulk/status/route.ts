// ============================================================
// FILE: src/app/api/bulk/status/route.ts
// Returns live progress for a bulk batch
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const batchId = req.nextUrl.searchParams.get("batch_id");
    if (!batchId) return NextResponse.json({ error: "Missing batch_id" }, { status: 400 });

    // Get all projects in this batch
    const { data: projects, error } = await supabaseAdmin
      .from("projects")
      .select("id, topic, status, video_url, error_message, updated_at")
      .eq("bulk_batch_id", batchId)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!projects || projects.length === 0) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const total = projects.length;
    const done = projects.filter(p => p.status === "done" || p.status === "completed").length;
    const failed = projects.filter(p => p.status === "failed" || p.status === "error").length;
    const processing = projects.filter(p =>
      ["queued", "processing", "rendering", "generating_script", "generating_audio"].includes(p.status)
    ).length;

    const allDone = done + failed === total;

    return NextResponse.json({
      batch_id: batchId,
      total,
      done,
      failed,
      processing,
      percent: Math.round((done / total) * 100),
      is_complete: allDone,
      projects: projects.map(p => ({
        id: p.id,
        topic: p.topic,
        status: p.status,
        video_url: p.video_url,
        error_message: p.error_message,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}