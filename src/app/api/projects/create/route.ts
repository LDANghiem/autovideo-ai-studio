// ============================================================
// FILE: src/app/api/projects/create/route.ts
// ============================================================
// REPLACES your existing create/route.ts
//
// WHAT CHANGED (search for "🆕 PEXELS" to see all changes):
//   1. Added image_source parsing in [S5] (line ~80)
//   2. Added image_source to insertRow in [S6] (line ~105)
//
// That's it — just 2 lines added!
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    /* ============================================================
       [S1] Env
    ============================================================ */
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" },
        { status: 500 }
      );
    }

    /* ============================================================
       [S2] Auth: Bearer token from client
    ============================================================ */
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    /* ============================================================
       [S3] User-scoped Supabase client (RLS applies)
    ============================================================ */
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    /* ============================================================
       [S4] Verify user
    ============================================================ */
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ============================================================
       [S5] Parse + validate body
    ============================================================ */
    const body = await req.json().catch(() => ({}));

    const topic = String(body?.topic || "").trim();
    if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

    // Optional instructions (can be long prompt text)
    const topic_instructions = String(body?.topic_instructions || "").trim() || null;

    // Video type: conventional (16:9), youtube_shorts (9:16), tiktok (9:16)
    const validTypes = ["conventional", "youtube_shorts", "tiktok"];
    const video_type = validTypes.includes(body?.video_type)
      ? body.video_type
      : "conventional";

    // 🆕 PEXELS: Image source — "ai-art" (DALL-E) or "real-photos" (Pexels)
    const validImageSources = ["ai-art", "real-photos"];
    const image_source = validImageSources.includes(body?.image_source)
      ? body.image_source
      : "ai-art";

    const now = new Date().toISOString();

    /* ============================================================
       [S6] Insert project row
       - Projects start as draft (NOT queued)
       - Render fields start null
    ============================================================ */
    const insertRow = {
      user_id: user.id,
      topic,
      topic_instructions,
      video_type,
      image_source,       // 🆕 PEXELS: Save image source preference

      status: "draft",

      // settings
      style: body?.style ?? null,
      voice: body?.voice ?? null,
      elevenlabs_voice_id: body?.elevenlabs_voice_id ?? null,      // 🆕 VOICE PICKER
      elevenlabs_voice_name: body?.elevenlabs_voice_name ?? null,  // 🆕 VOICE PICKER
      length: body?.length ?? null,
      resolution: body?.resolution ?? null,
      language: body?.language ?? null,
      tone: body?.tone ?? null,
      music: body?.music ?? null,

      // render-related fields
      script: null,
      video_url: null,
      error_message: null,
      render_started_at: null,
      render_completed_at: null,

      updated_at: now,
    };

    const { data, error } = await supabase.from("projects").insert(insertRow).select("id").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}