// ============================================================
// FILE: src/app/api/voice-clone/create/route.ts
// Phase 3: Voice Cloning — Create/Upload voice sample to ElevenLabs
// Studio tier exclusive
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check Studio tier
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (profile?.plan !== "studio") {
      return NextResponse.json(
        { error: "Voice Cloning is a Studio tier exclusive feature. Upgrade to Studio to unlock." },
        { status: 403 }
      );
    }

    // Parse multipart form
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const voiceName = (formData.get("voice_name") as string) || `My Voice (${new Date().toLocaleDateString()})`;
    const voiceDescription = (formData.get("voice_description") as string) || "User cloned voice";

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Validate file size (max 10MB) and type
    const MAX_SIZE = 10 * 1024 * 1024;
    if (audioFile.size > MAX_SIZE) {
      return NextResponse.json({ error: "Audio file too large. Maximum size is 10MB." }, { status: 400 });
    }

    const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/mp4"];
    if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
      return NextResponse.json({ error: "Unsupported audio format. Use MP3, WAV, WebM, OGG, or M4A." }, { status: 400 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ElevenLabs API key not configured on server." }, { status: 500 });
    }

    // Send to ElevenLabs Instant Voice Cloning API
    const elForm = new FormData();
    elForm.append("name", voiceName);
    elForm.append("description", voiceDescription);
    elForm.append("files", audioFile, audioFile.name || "voice_sample.mp3");
    elForm.append("labels", JSON.stringify({ source: "autovideo_ai_studio", user_id: user.id }));

    const elRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: elForm,
    });

    if (!elRes.ok) {
      const errBody = await elRes.text();
      console.error("[voice-clone/create] ElevenLabs error:", elRes.status, errBody);
      return NextResponse.json(
        { error: `ElevenLabs API error: ${elRes.status}. ${errBody}` },
        { status: 502 }
      );
    }

    const elData = await elRes.json();
    const voiceId = elData.voice_id as string;

    if (!voiceId) {
      return NextResponse.json({ error: "ElevenLabs returned no voice ID." }, { status: 502 });
    }

    // Save to user_profiles: cloned_voice_id + cloned_voice_name
    const { error: updateErr } = await supabaseAdmin
      .from("user_profiles")
      .update({
        cloned_voice_id: voiceId,
        cloned_voice_name: voiceName,
        cloned_voice_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error("[voice-clone/create] DB update error:", updateErr);
      // Voice was created in ElevenLabs but we couldn't save — still return it
      return NextResponse.json({
        voice_id: voiceId,
        voice_name: voiceName,
        warning: "Voice created but could not be saved to profile. Please contact support.",
      });
    }

    console.log(`[voice-clone/create] Created voice ${voiceId} for user ${user.id}`);

    return NextResponse.json({
      success: true,
      voice_id: voiceId,
      voice_name: voiceName,
      message: "Voice cloned successfully! It will now be used automatically across all your videos.",
    });
  } catch (err: any) {
    console.error("[voice-clone/create] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}