// ============================================================
// FILE: src/app/api/projects/create/route.ts
// ============================================================
// COMMIT 9 — Script Mode support
//
// CHANGES vs previous version:
//   1. Accept optional `script` field in POST body
//   2. When `script` is provided:
//      - Save it to projects.script (so start-render skips GPT)
//      - Compute `length` from word count (~140 wpm pacing)
//      - This satisfies start-render's bypass condition
//   3. Topic mode behavior unchanged
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Helpers ──────────────────────────────────────────────────

function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Convert script word count to a length string the existing
 * pipeline understands. We pick the closest available option
 * for the user's video_type.
 *
 * Pacing: ~140 wpm narration (matches start-render's countWords
 * gate of `seconds * 2.2 * 0.92`, i.e. ~120 wpm minimum — we
 * pick a length that gives plenty of headroom).
 */
function wordsToLengthString(words: number, videoType: string): string {
  const seconds = Math.ceil(words / (140 / 60)); // ~140 wpm

  if (videoType === "youtube_shorts") {
    if (seconds <= 15) return "15 seconds";
    if (seconds <= 30) return "30 seconds";
    if (seconds <= 45) return "45 seconds";
    return "60 seconds";
  }

  if (videoType === "tiktok") {
    if (seconds <= 15) return "15 seconds";
    if (seconds <= 30) return "30 seconds";
    if (seconds <= 60) return "60 seconds";
    if (seconds <= 120) return "2 minutes";
    return "3 minutes";
  }

  // conventional
  if (seconds <= 60) return "60 seconds";
  if (seconds <= 120) return "2 minutes";
  if (seconds <= 180) return "3 minutes";
  if (seconds <= 240) return "4 minutes";
  if (seconds <= 300) return "5 minutes";
  if (seconds <= 480) return "8 minutes";
  if (seconds <= 720) return "12 minutes";
  if (seconds <= 960) return "16 minutes";
  if (seconds <= 1200) return "20 minutes";
  if (seconds <= 1440) return "24 minutes";
  return "30 minutes";
}

// ─── POST Handler ─────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    /* [S1] Env */
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" },
        { status: 500 }
      );
    }

    /* [S2] Auth */
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    /* [S3] Supabase client (RLS scoped to user) */
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    /* [S4] Verify user */
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* [S5] Parse + validate body */
    const body = await req.json().catch(() => ({}));

    // 🆕 SCRIPT MODE: Detect mode from body
    const userScript = String(body?.script || "").trim();
    const hasScript = userScript.length > 0;

    // Topic is optional in Script Mode (we'll auto-derive a placeholder)
    const rawTopic = String(body?.topic || "").trim();

    if (!hasScript && !rawTopic) {
      return NextResponse.json(
        { error: "Either topic (Topic Mode) or script (Script Mode) is required" },
        { status: 400 }
      );
    }

    // Video type
    const validTypes = ["conventional", "youtube_shorts", "tiktok", "audio_static"];
    const video_type = validTypes.includes(body?.video_type)
      ? body.video_type
      : "conventional";

    // 🆕 Commit 16d — audio_static fields
    const validStaticSources = ["upload", "pexels", "pixabay", "freepik"];
    const rawStaticUrl = String(body?.static_image_url || "").trim();
    const rawStaticSource = String(body?.static_image_source || "").trim();
    const static_image_url = rawStaticUrl.length > 0 ? rawStaticUrl : null;
    const static_image_source = validStaticSources.includes(rawStaticSource)
      ? rawStaticSource
      : null;

    // 🆕 Commit 16d — block audio_static without an image
    if (video_type === "audio_static" && !static_image_url) {
      return NextResponse.json(
        { error: "Audio + Image videos require an image. Please upload one or select from Pexels." },
        { status: 400 }
      );
    }

    // 🆕 SCRIPT MODE: Word count limits per safety
    let scriptWordCount = 0;
    if (hasScript) {
      scriptWordCount = countWords(userScript);

      const HARD_LIMIT = 6000;
      if (scriptWordCount > HARD_LIMIT) {
        return NextResponse.json(
          { error: `Script too long: ${scriptWordCount} words (max ${HARD_LIMIT})` },
          { status: 400 }
        );
      }

      const MIN_WORDS = 20;
      if (scriptWordCount < MIN_WORDS) {
        return NextResponse.json(
          { error: `Script too short: ${scriptWordCount} words (min ${MIN_WORDS})` },
          { status: 400 }
        );
      }
    }

    // Topic for the project row:
    //   Topic Mode → user's topic
    //   Script Mode → first 80 chars of script as a label (or user's topic if they provided one)
    const topic = hasScript
      ? (rawTopic || userScript.slice(0, 80).replace(/\s+/g, " ") + (userScript.length > 80 ? "…" : ""))
      : rawTopic;

    // Topic instructions:
    //   Topic Mode → user's instructions (passed through)
    //   Script Mode → null (script IS the instruction)
    const topic_instructions = hasScript
      ? null
      : (String(body?.topic_instructions || "").trim() || null);

    // Length:
    //   Topic Mode → user's selection (passed through)
    //   Script Mode → derived from word count
    const length = hasScript
      ? wordsToLengthString(scriptWordCount, video_type)
      : (body?.length ?? null);

    // Image source
    const validImageSources = ["ai-art", "real-photos"];
    const image_source = validImageSources.includes(body?.image_source)
      ? body.image_source
      : "ai-art";

    const now = new Date().toISOString();

    /* [S6] Insert project row */
    const insertRow = {
      user_id: user.id,
      topic,
      topic_instructions,
      video_type,
      image_source,

      // 🆕 Commit 16d — audio_static image fields
      static_image_url,
      static_image_source,

      status: "draft",

      // settings
      style: body?.style ?? null,
      voice: body?.voice ?? null,
      elevenlabs_voice_id: body?.elevenlabs_voice_id ?? null,
      elevenlabs_voice_name: body?.elevenlabs_voice_name ?? null,
      length,
      resolution: body?.resolution ?? null,
      language: body?.language ?? null,
      // 🆕 SCRIPT MODE: Tone is null in Script Mode (script defines tone)
      tone: hasScript ? null : (body?.tone ?? null),
      music: body?.music ?? null,
      caption_style: body?.caption_style ?? "karaoke",

      // 🆕 SCRIPT MODE: Pre-fill script when user pastes one.
      //    start-render's existing bypass condition will skip GPT generation.
      //    Topic Mode leaves this null so GPT generates from topic.
      script: hasScript ? userScript : null,

      // render-related fields
      video_url: null,
      error_message: null,
      render_started_at: null,
      render_completed_at: null,

      updated_at: now,
    };

    const { data, error } = await supabase
      .from("projects")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}