// ============================================================
// FILE: src/app/api/shorts/create/route.ts
// ============================================================
// Creates a new shorts_projects record in Supabase.
//
// AUTH: Bearer token → supabase.auth.getUser(token)
//
// WHAT IT DOES:
//   [1] Verifies user via Bearer token
//   [2] Parses request body (source_url, max_clips, etc.)
//   [3] Fetches YouTube metadata via oEmbed (title, thumbnail)
//   [4] Inserts a new row into shorts_projects table
//   [5] Returns the project object with ID
//
// CALLED BY: /dashboard/shorts/page.tsx (handleGenerate)
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
      max_clips = 5,
      clip_length = "30-60",      // "15-30" | "30-60" | "15-60"
      caption_style = "karaoke",  // "karaoke" | "block" | "centered" | "none"
      crop_mode = "face-track",   // "face-track" | "center" | "dynamic"
      generate_thumbnails = true,
    } = body;

    if (!source_url) {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 }
      );
    }

    // Validate YouTube URL format
    const ytMatch = source_url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!ytMatch) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    const youtube_video_id = ytMatch[1];

    // Validate max_clips range
    if (max_clips < 1 || max_clips > 10) {
      return NextResponse.json(
        { error: "max_clips must be between 1 and 10" },
        { status: 400 }
      );
    }

    /* ── [3] Fetch YouTube metadata via oEmbed ───────────── */
    let source_title = null;
    let source_thumbnail = null;
    let source_channel = null;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(source_url)}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        source_title = oembed.title || null;
        source_thumbnail = oembed.thumbnail_url || null;
        source_channel = oembed.author_name || null;
      }
    } catch {
      // Non-fatal — worker will get metadata later
    }

    /* ── [4] Insert shorts project into Supabase ─────────── */
    const { data: project, error: insertError } = await supabaseAdmin
      .from("shorts_projects")
      .insert({
        user_id: user.id,
        source_url,
        youtube_video_id,
        source_title,
        source_thumbnail,
        source_channel,
        max_clips,
        clip_length,
        caption_style,
        crop_mode,
        generate_thumbnails,
        status: "draft",
        progress_pct: 0,
        progress_stage: null,
        clips: [],          // JSONB — will be populated by worker
        transcript: null,    // TEXT — full whisper transcript
        error_message: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[shorts/create] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    /* ── [5] Return project ──────────────────────────────── */
    return NextResponse.json({ project }, { status: 201 });
  } catch (err: any) {
    console.error("[shorts/create] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}