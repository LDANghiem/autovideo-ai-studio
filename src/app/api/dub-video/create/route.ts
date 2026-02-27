// ============================================================
// FILE: src/app/api/dub-video/create/route.ts
// ============================================================
// Creates a new dub_projects record in Supabase.
//
// AUTH: Reads Bearer token from Authorization header,
//       verifies via supabase.auth.getUser(token).
//       Same pattern as your existing /api/projects/create.
//
// WHAT IT DOES:
//   [1] Verifies user via Bearer token
//   [2] Parses request body (source_url, voice_id, etc.)
//   [3] Fetches YouTube metadata via oEmbed (title, thumbnail)
//   [4] Inserts a new row into dub_projects table
//   [5] Returns the project object with ID
//
// CALLED BY: /dashboard/dub-video/new/page.tsx (handleSubmit)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── Supabase admin client (service role) ────────────────── */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
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

    /* ── [2] Parse request body ──────────────────────────── */
    const body = await req.json();
    const {
      source_url,
      source_type = "youtube",
      target_language = "Vietnamese",
      target_language_code = "vi",
      voice_id,
      voice_name,
      caption_style = "block",
      keep_original_audio = true,
      original_audio_volume = 0.15,
    } = body;

    if (source_type === "youtube" && !source_url) {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 }
      );
    }

    /* ── [3] Fetch YouTube metadata via oEmbed ───────────── */
    // oEmbed works on Vercel serverless (no yt-dlp needed)
    // Gives us title + thumbnail. Duration comes from the worker later.
    let source_title = null;
    let source_thumbnail = null;
    let source_duration_sec = null;

    if (source_type === "youtube" && source_url) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(source_url)}&format=json`;
        const oembedRes = await fetch(oembedUrl);
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          source_title = oembed.title || null;
          source_thumbnail = oembed.thumbnail_url || null;
        }
      } catch {
        // Non-fatal — the Render worker will get metadata later
      }
    }

    /* ── [4] Insert dub project into Supabase ────────────── */
    const { data: project, error: insertError } = await supabaseAdmin
      .from("dub_projects")
      .insert({
        user_id: user.id,
        source_type,
        source_url,
        source_title,
        source_thumbnail,
        source_duration_sec,
        target_language,
        target_language_code,
        voice_id,
        voice_name,
        caption_style,
        keep_original_audio,
        original_audio_volume,
        status: "draft",
        progress_pct: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[dub-video/create] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    /* ── [5] Return project ──────────────────────────────── */
    return NextResponse.json({ project }, { status: 201 });
  } catch (err: any) {
    console.error("[dub-video/create] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}