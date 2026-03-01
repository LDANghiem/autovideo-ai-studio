// ============================================================
// FILE: src/app/api/recreate/create/route.ts
// ============================================================
// Creates a new recreate_projects record in Supabase.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      source_url,
      target_language = "Vietnamese",
      style = "news",
      voice_id = null,
      video_length = "auto",
      include_captions = true,
    } = body;

    if (!source_url) return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });

    // Validate YouTube URL
    const ytMatch = source_url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!ytMatch) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

    const youtube_video_id = ytMatch[1];

    // Fetch metadata via oEmbed
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
    } catch {}

    const { data: project, error: insertError } = await supabaseAdmin
      .from("recreate_projects")
      .insert({
        user_id: user.id,
        source_url,
        youtube_video_id,
        source_title,
        source_channel,
        source_thumbnail,
        target_language,
        style,
        voice_id,
        video_length,
        include_captions,
        status: "draft",
        progress_pct: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[recreate/create] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (err: any) {
    console.error("[recreate/create] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}