// ============================================================
// FILE: src/app/api/voice-clone/delete/route.ts
// Phase 3: Voice Cloning — Delete cloned voice from ElevenLabs + profile
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get current cloned voice
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("cloned_voice_id, plan")
      .eq("id", user.id)
      .single();

    if (!profile?.cloned_voice_id) {
      return NextResponse.json({ error: "No cloned voice found." }, { status: 404 });
    }

    // Delete from ElevenLabs
    if (ELEVENLABS_API_KEY) {
      const elRes = await fetch(`https://api.elevenlabs.io/v1/voices/${profile.cloned_voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!elRes.ok) {
        console.warn("[voice-clone/delete] ElevenLabs delete returned:", elRes.status);
        // Continue anyway — clean up DB record
      }
    }

    // Clear from user profile
    await supabaseAdmin
      .from("user_profiles")
      .update({
        cloned_voice_id: null,
        cloned_voice_name: null,
        cloned_voice_updated_at: null,
      })
      .eq("id", user.id);

    return NextResponse.json({ success: true, message: "Cloned voice deleted." });
  } catch (err: any) {
    console.error("[voice-clone/delete] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// GET: Fetch current voice status
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("cloned_voice_id, cloned_voice_name, cloned_voice_updated_at, plan")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      has_cloned_voice: !!profile?.cloned_voice_id,
      voice_id: profile?.cloned_voice_id || null,
      voice_name: profile?.cloned_voice_name || null,
      updated_at: profile?.cloned_voice_updated_at || null,
      plan: profile?.plan || "free",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}