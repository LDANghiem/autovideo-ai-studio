// ============================================================
// FILE: src/app/api/article/start/route.ts
// Triggers the Article → Video pipeline on the worker
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAndIncrementUsage } from "@/lib/usageGuard";

export const dynamic = "force-dynamic";

let _admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!_admin) _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _admin;
}

function getWorkerUrl(): string {
  const base = process.env.RECREATE_WORKER_URL
    || process.env.RENDER_WEBHOOK_URL
    || "http://localhost:10000";
  return base.replace(/\/render\/?$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await getAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Usage guard — article uses the "recreate" counter
    const usageCheck = await checkAndIncrementUsage(user.id, "recreate");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: usageCheck.error, upgrade_required: true },
        { status: 429 }
      );
    }

    const { project_id } = await req.json();
    if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });

    // Fetch project
    const { data: project, error: fetchErr } = await (getAdmin() as any)
      .from("recreate_projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.article_text) {
      return NextResponse.json({ error: "No article text found in project" }, { status: 400 });
    }

    // Update status to processing
    await (getAdmin() as any)
      .from("recreate_projects")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", project_id);

    // Fire webhook to worker /article endpoint
    const workerUrl = `${getWorkerUrl()}/article`;
    console.log("[article/start] firing worker:", workerUrl, "project:", project_id);

    const workerRes = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        article_text: project.article_text,
        source_url: project.source_url,
        target_language: project.target_language || "Vietnamese",
        style: project.style || "news",
        voice_id: project.voice_id || null,
        include_captions: project.include_captions !== false,
        music: project.music || "none",
        caption_style: project.caption_style || "classic",
        caption_position: project.caption_position || "bottom",
        target_length: project.target_length || 90,
        orientation: project.orientation || "landscape",
      }),
    });

    if (!workerRes.ok) {
      const errText = await workerRes.text();
      throw new Error(`Worker error: ${workerRes.status} — ${errText.slice(0, 200)}`);
    }

    return NextResponse.json({ message: "Article video started", project_id }, { status: 200 });

  } catch (err: any) {
    console.error("[article/start] error:", err.message);
    return NextResponse.json({ error: err.message || "Failed to start" }, { status: 500 });
  }
}