// src/app/api/projects/start-render/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ProjectRow = {
  id: string;
  user_id: string;
  status: string | null;

  topic: string | null;
  style: string | null;
  voice: string | null;
  length: string | null;
  resolution: string | null;
  language: string | null;
  tone: string | null;
  music: string | null;
  script: string | null;
};

function buildPrompt(p: ProjectRow) {
  const topic = p.topic ?? "Untitled video";
  const style = p.style ?? "modern";
  const tone = p.tone ?? "friendly";
  const language = p.language ?? "English";
  const length = p.length ?? "30 seconds";

  return `
Write a YouTube-style narration script.

Constraints:
- Language: ${language}
- Tone: ${tone}
- Style: ${style}
- Target length: ${length}
- Topic: "${topic}"

Output format (plain text, no markdown):
1) Title (1 line)
2) Hook (1–2 lines)
3) Main script (short paragraphs)
4) Quick recap (1–2 lines)
5) Call to action (1 line)

Keep it concise, clear, and easy to narrate aloud.
`.trim();
}

async function generateScriptWithOpenAI(p: ProjectRow) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const prompt = buildPrompt(p);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: "You write tight, practical scripts for short videos." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await resp.json();

  if (!resp.ok) {
    const msg = json?.error?.message || `OpenAI error (${resp.status})`;
    throw new Error(msg);
  }

  const text: string = json?.choices?.[0]?.message?.content?.trim?.() || "";
  if (!text) throw new Error("OpenAI returned an empty script");
  return text;
}

async function triggerRenderWebhook(projectId: string, secret: string) {
  const url = (process.env.RENDER_WEBHOOK_URL || "").trim();
  if (!url) throw new Error("Missing RENDER_WEBHOOK_URL env var");

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Render is NOT using header-based secret (but keeping it doesn't hurt)
  if (secret) headers["x-webhook-secret"] = secret;

  // ✅ Render expects the secret in the JSON BODY as `secret`
  const payload: Record<string, any> = { project_id: projectId };
  if (secret) payload.secret = secret;

  if (process.env.DEBUG_WEBHOOK === "1") {
    console.log("[start-render] webhook url:", url);
    console.log("[start-render] secret prefix:", secret.slice(0, 6), "len:", secret.length);
  }

  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Render webhook failed (${r.status}): ${text || "No body"}`);
  }
}

export async function POST(req: Request) {
  const now = new Date().toISOString();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const secret = (process.env.RENDER_WEBHOOK_SECRET || "").trim();
    if (!secret) console.warn("[start-render] WARNING: RENDER_WEBHOOK_SECRET is empty");


    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 }
      );
    }

    // ✅ Read access token from Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Server-side Supabase (service role)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ✅ Verify the token -> get user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = body?.project_id as string | undefined;
    if (!projectId) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

    // ✅ Load project and enforce ownership
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id,user_id,status,topic,style,voice,length,resolution,language,tone,music,script")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: projErr?.message || "Project not found" }, { status: 404 });
    }

    // ✅ Prevent duplicate renders
    const runningStatuses = new Set(["queued", "processing", "rendering"]);
    if (project.status && runningStatuses.has(project.status)) {
      return NextResponse.json(
        { error: `Render already in progress (${project.status})`, status: project.status },
        { status: 409 }
      );
    }

    let scriptGenerated = false;

    // 1) Generate + save script if missing
    if (!project.script || project.script.trim().length === 0) {
      const script = await generateScriptWithOpenAI(project as ProjectRow);

      const { error: upErr } = await supabase
        .from("projects")
        .update({
          script,
          updated_at: now,
          error_message: null,
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

      scriptGenerated = true;
    }

    // ✅ Mark as queued BEFORE triggering Render (better UX)
    const { error: queueErr } = await supabase
      .from("projects")
      .update({
        status: "queued",
        render_started_at: now,
        render_completed_at: null, // ✅ IMPORTANT (your column name)
        error_message: null,
        updated_at: now,
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (queueErr) return NextResponse.json({ error: queueErr.message }, { status: 400 });

    // 2) Trigger render (if this fails, we mark the project error)
    try {
      await triggerRenderWebhook(projectId, secret);
    } catch (err: any) {
      const message = err?.message || String(err);

      await supabase
        .from("projects")
        .update({
          status: "error",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scriptGenerated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
