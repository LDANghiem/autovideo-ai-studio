// ============================================================
// FILE: src/app/api/recreate/status/route.ts
// ============================================================
// Returns the current status of a ReCreate project.
// Supports: GET /api/recreate/status?id=xxx
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const projectId = req.nextUrl.searchParams.get("id");
    if (!projectId) return NextResponse.json({ error: "Missing project id" }, { status: 400 });

    const { data: project, error } = await supabaseAdmin
      .from("recreate_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (err: any) {
    console.error("[recreate/status] Error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}