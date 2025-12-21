import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function buildScript(opts: {
  topic: string;
  style: string;
  voice: string;
  length: string;
  language: string;
  tone: string;
  music: string;
}) {
  const { topic, style, voice, length, language, tone, music } = opts;

  return [
    `TITLE: ${topic}`,
    ``,
    `SETTINGS`,
    `- Style: ${style}`,
    `- Voice: ${voice}`,
    `- Length: ${length}`,
    `- Language: ${language}`,
    `- Tone: ${tone}`,
    `- Music: ${music}`,
    ``,
    `INTRO (0–10s)`,
    `Hook: “In the next ${length}, you’ll learn ${topic}—fast and clearly.”`,
    ``,
    `BODY`,
    `1) Define it simply.`,
    `2) Why it matters.`,
    `3) A real-world example.`,
    ``,
    `CLOSING`,
    `Recap + CTA: “Follow for more like this.”`,
  ].join("\n");
}

async function postToRenderer(project_id: string) {
  const url = process.env.RENDER_WEBHOOK_URL;
  if (!url) return; // renderer trigger is optional in dev

  const secret = process.env.RENDER_WEBHOOK_SECRET || ""; // optional but recommended

  // IMPORTANT: this should be a server-only secret; do not expose in client code
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Render-Secret": secret } : {}),
    },
    body: JSON.stringify({ project_id }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Renderer trigger failed: ${res.status} ${text}`);
  }
}

export async function POST(req: Request) {
  try {
    // -------- Auth (same as your current approach) --------
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Auth session missing (no bearer token)" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return NextResponse.json(
        { error: "Auth session missing (empty token)" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: "Auth session missing (invalid token)" },
        { status: 401 }
      );
    }

    // -------- Inputs --------
    const body = await req.json();
    const projectId = body?.projectId as string | undefined;
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // -------- Load project + ownership check --------
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id,user_id,topic,style,voice,length,language,tone,music,status,video_url")
      .eq("id", projectId)
      .single();

    if (projErr || !proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (proj.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Avoid double-start if it’s already rendering
    if (proj.status === "processing") {
      return NextResponse.json(
        { ok: true, message: "Already processing", projectId },
        { status: 200 }
      );
    }

    // -------- Generate script --------
    const topic = (proj.topic ?? "").trim();
    if (!topic) {
      return NextResponse.json(
        { error: "Project topic is missing" },
        { status: 400 }
      );
    }

    const script = buildScript({
      topic,
      style: proj.style ?? "modern",
      voice: proj.voice ?? "AI Voice",
      length: proj.length ?? "60 seconds",
      language: proj.language ?? "English",
      tone: proj.tone ?? "friendly",
      music: proj.music ?? "ambient",
    });

    // -------- Save script + queue for rendering --------
    const { data: updated, error: updErr } = await supabase
      .from("projects")
      .update({
        script,
        status: "queued",
        error_message: null,
        // keep existing video_url until new one arrives (optional)
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("id,status,script,video_url,error_message,updated_at")
      .single();

    if (updErr) {
      return NextResponse.json(
        { error: `Failed to queue render: ${updErr.message}` },
        { status: 400 }
      );
    }

    // -------- Trigger your renderer (Render.com or other) --------
    // In dev: you can set RENDER_WEBHOOK_URL to a local endpoint or skip it.
    await postToRenderer(projectId);

    return NextResponse.json({ ok: true, project: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Start render failed" },
      { status: 500 }
    );
  }
}
