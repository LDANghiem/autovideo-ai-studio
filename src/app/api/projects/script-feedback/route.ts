// ============================================================
// FILE: src/app/api/projects/script-feedback/route.ts
// ============================================================
// COMMIT 10 — AI script feedback endpoint
//
// Returns editor's notes for a user-pasted script across six
// categories: Hook, Pacing, Specificity, Structure, CTA, Length.
//
// Suggestions only — never auto-edits. The script comes in, notes
// go out, the user decides what to do. This is intentional and
// load-bearing for the "Reach Multiplier for creators who already
// know their stuff" positioning.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Helpers ──────────────────────────────────────────────────

function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// ─── The feedback prompt ─────────────────────────────────────

const SYSTEM_PROMPT = `You are an experienced YouTube creator and video editor giving feedback on a script. The script writer is an expert in their topic — your job is NOT to fact-check or rewrite. Your job is to be the editor in their corner: spot structural and craft issues, suggest concrete improvements, and otherwise affirm what's working.

Tone rules:
- Peer-to-peer, not teacher-to-student
- Specific, never vague ("your hook lands at line 4" not "make your hook stronger")
- Use ✓ when something is solid and ⚠ when something could improve
- Mix passes and improvements — never flag everything, never flag nothing
- Brief — busy creators read fast

Six evaluation categories — give status (pass or improve) and a 1-3 sentence note for each:

1. HOOK — Do the first 1-2 sentences create curiosity, urgency, or stakes? Category labels like "Today I want to talk about X" are weak hooks.

2. PACING — Are paragraphs roughly balanced? Are there dead-zones with no concrete examples or stories?

3. SPECIFICITY — Are there generic claims ("studies show", "experts agree") that need a number, story, or name to land?

4. STRUCTURE — Does the script have a clear arc: hook → develop → payoff → close? Do beats flow?

5. CALL TO ACTION — Does the closing line give viewers something specific to do, think, or click?

6. LENGTH FIT — Does the script's word count match the chosen video format? (Conventional = up to 30 min, Shorts = max 60 sec, TikTok = max 3 min)

Then end with a brief OVERALL summary (2-3 sentences max) — the 1-2 changes that would matter most.

CRITICAL: Never rewrite the script. Never propose specific replacement sentences except as small illustrative examples. Suggestions only.

DO NOT include grammar nitpicks, topic accuracy questions, tone overrides, or vague "make it more engaging" feedback.

Respond with ONLY valid JSON in this exact shape:
{
  "categories": [
    { "name": "HOOK", "status": "pass" | "improve", "note": "..." },
    { "name": "PACING", "status": "pass" | "improve", "note": "..." },
    { "name": "SPECIFICITY", "status": "pass" | "improve", "note": "..." },
    { "name": "STRUCTURE", "status": "pass" | "improve", "note": "..." },
    { "name": "CTA", "status": "pass" | "improve", "note": "..." },
    { "name": "LENGTH", "status": "pass" | "improve", "note": "..." }
  ],
  "overall": "..."
}`;

function videoTypeLabel(videoType: string): string {
  if (videoType === "youtube_shorts") return "YouTube Shorts (vertical, max 60 seconds)";
  if (videoType === "tiktok") return "TikTok (vertical, max 3 minutes)";
  return "Conventional YouTube (16:9, up to 30 minutes)";
}

// ─── POST Handler ─────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfiguration — missing required env vars" },
        { status: 500 }
      );
    }

    /* Auth */
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* Parse body */
    const body = await req.json().catch(() => ({}));
    const script = String(body?.script || "").trim();
    const videoType = String(body?.video_type || "conventional");
    const language = String(body?.language || "English");

    if (!script) {
      return NextResponse.json({ error: "Script is required" }, { status: 400 });
    }

    const wordCount = countWords(script);
    if (wordCount < 20) {
      return NextResponse.json(
        { error: "Script too short for meaningful feedback (minimum 20 words)" },
        { status: 400 }
      );
    }

    if (wordCount > 6000) {
      return NextResponse.json(
        { error: "Script exceeds the 6,000-word limit" },
        { status: 400 }
      );
    }

    /* Build user prompt with context */
    const userPrompt = [
      `Video format: ${videoTypeLabel(videoType)}`,
      `Language: ${language}`,
      `Word count: ${wordCount}`,
      ``,
      `SCRIPT:`,
      `"""`,
      script,
      `"""`,
      ``,
      `Give your editor's notes per the six categories. Respond with ONLY the JSON object — no preamble, no markdown.`,
    ].join("\n");

    /* Call GPT */
    const model = process.env.OPENAI_FEEDBACK_MODEL || "gpt-4o-mini";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: json?.error?.message || `OpenAI error (${resp.status})` },
        { status: 502 }
      );
    }

    const rawText: string = json?.choices?.[0]?.message?.content?.trim() || "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "AI returned an unparseable response. Please try again." },
        { status: 502 }
      );
    }

    /* Validate shape */
    if (!parsed?.categories || !Array.isArray(parsed.categories) || parsed.categories.length !== 6) {
      return NextResponse.json(
        { error: "AI feedback was incomplete. Please try again." },
        { status: 502 }
      );
    }

    /* Sanity-check each category */
    const validNames = new Set(["HOOK", "PACING", "SPECIFICITY", "STRUCTURE", "CTA", "LENGTH"]);
    const validStatuses = new Set(["pass", "improve"]);

    for (const cat of parsed.categories) {
      if (!cat?.name || !validNames.has(cat.name)) {
        return NextResponse.json(
          { error: "AI returned malformed feedback. Please try again." },
          { status: 502 }
        );
      }
      if (!cat?.status || !validStatuses.has(cat.status)) {
        cat.status = "improve"; // soft-fix
      }
      if (typeof cat.note !== "string") {
        cat.note = "";
      }
    }

    if (typeof parsed.overall !== "string") {
      parsed.overall = "";
    }

    return NextResponse.json(
      {
        word_count: wordCount,
        feedback: parsed,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}