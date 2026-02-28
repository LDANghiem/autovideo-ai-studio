// src/app/api/auth/youtube/status/route.ts
// Returns the user's YouTube connection status + channel info

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
    if (!token) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("youtube_tokens")
      .select("channel_id, channel_title, channel_thumbnail, connected_at")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    return NextResponse.json({
      connected: true,
      channel_id: data.channel_id,
      channel_title: data.channel_title,
      channel_thumbnail: data.channel_thumbnail,
      connected_at: data.connected_at,
    });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}

// DELETE — disconnect YouTube
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await supabaseAdmin.from("youtube_tokens").delete().eq("user_id", user.id);

    return NextResponse.json({ disconnected: true });
  } catch {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}