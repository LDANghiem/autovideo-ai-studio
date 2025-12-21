import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Auth session missing (no bearer token)" },
      { status: 401 }
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return NextResponse.json(
      { error: "Auth session missing (empty token)" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Server env missing Supabase URL/ANON key" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // ✅ IMPORTANT: validate THIS token directly
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);

  const user = userData?.user;
  if (userErr || !user) {
    return NextResponse.json(
      { error: "Auth session missing (invalid token)", details: userErr?.message },
      { status: 401 }
    );
  }

  const body = await req.json();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      topic: body.topic,
      style: body.style,
      voice: body.voice,
      length: body.length,
      resolution: body.resolution,
      language: body.language,
      tone: body.tone,
      music: body.music,
      status: "queued",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
