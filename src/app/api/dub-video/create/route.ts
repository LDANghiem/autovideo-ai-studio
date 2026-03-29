// ============================================================
// FILE: src/app/api/dub-video/create/route.ts
// ============================================================
// Creates a new dub_projects record in Supabase.
// Supports 3 source modes: youtube, partial (youtube+time range), upload
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

    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      // New fields for partial dub + upload
      start_time = null,
      end_time = null,
      uploaded_file_name = null,
    } = body;

    if (!source_url) {
      return NextResponse.json(
        { error: "Source URL is required" },
        { status: 400 }
      );
    }

    // Validate partial dub time range
    if (start_time !== null && end_time !== null) {
      if (typeof start_time !== "number" || typeof end_time !== "number") {
        return NextResponse.json({ error: "start_time and end_time must be numbers (seconds)" }, { status: 400 });
      }
      if (end_time <= start_time) {
        return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 });
      }
      if (end_time - start_time < 10) {
        return NextResponse.json({ error: "Segment must be at least 10 seconds" }, { status: 400 });
      }
    }

    // Fetch YouTube metadata (only for youtube/partial modes)
    let source_title = null;
    let source_thumbnail = null;
    let source_duration_sec = null;

    if (source_type !== "upload" && source_url) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(source_url)}&format=json`;
        const oembedRes = await fetch(oembedUrl);
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          source_title = oembed.title || null;
          source_thumbnail = oembed.thumbnail_url || null;
        }
      } catch {}
    }

    // For uploaded files, use the filename as title
    if (source_type === "upload" && uploaded_file_name) {
      source_title = uploaded_file_name.replace(/\.[^.]+$/, ""); // strip extension
    }

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
        // New fields
        start_time: start_time,
        end_time: end_time,
        status: "draft",
        progress_pct: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[dub-video/create] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (err: any) {
    console.error("[dub-video/create] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}