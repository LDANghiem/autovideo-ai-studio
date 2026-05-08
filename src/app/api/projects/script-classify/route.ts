// ============================================================
// FILE: src/app/api/projects/script-classify/route.ts
// ============================================================
// COMMIT 12 — News-event detection
//
// Classifies a script (or topic) into one of three categories:
//   - "evergreen"          → safe for stock photos
//   - "current_events"     → politics, recent news, named figures
//   - "conflict_disaster"  → war, attacks, disasters
//
// The frontend uses this to warn the user when they've selected
// real-photos mode for content stock libraries can't represent
// well (current events, conflict, named real people).
//
// Cheap: gpt-4o-mini, 50 max_tokens, ~$0.0001 per call.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── The classifier prompt ───────────────────────────────────

const SYSTEM_PROMPT = `You classify video scripts into one of three categories based on whether stock photo libraries (Pexels, Pixabay, Freepik) can represent the content visually.

Categories:

1. "evergreen" — General topics that stock libraries handle well:
   - Educational topics (science, math, history of pre-2010 events)
   - How-to guides, tutorials, productivity
   - Travel destinations (places, landmarks, cuisines)
   - Lifestyle, health, fitness, food, hobbies
   - Business concepts, finance, technology overviews
   - Nature, animals, environment

2. "current_events" — Recent news, politics, named real people:
   - Recent (post-2020) political events
   - Named politicians, celebrities, executives
   - Stock market events, recent corporate news
   - Election coverage, government policy debates
   - Topics where the script implies "right now" or "this week"

3. "conflict_disaster" — Hard topics for stock photos:
   - War, military strikes, terrorism, violence
   - Natural disasters, accidents, deaths
   - Crime, assault, abuse
   - Political protests with conflict elements

Respond with ONLY a JSON object: {"category": "evergreen" | "current_events" | "conflict_disaster", "reason": "<one short phrase>"}

No explanation, no markdown.`;

// ─── POST Handler ────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // For very short text (just a topic), pad with "context" hint
    // For longer scripts, truncate to first 1500 chars (more than enough to classify)
    const sample = text.slice(0, 1500);

    /* Call GPT — fast, cheap, structured */
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.0,
        max_tokens: 60,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sample },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Soft-fail: don't block the user if classifier breaks
      console.warn("[script-classify] OpenAI error:", json?.error?.message);
      return NextResponse.json(
        { category: "evergreen", reason: "classifier-unavailable" },
        { status: 200 }
      );
    }

    const rawText: string = json?.choices?.[0]?.message?.content?.trim() || "";

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Soft-fail
      return NextResponse.json(
        { category: "evergreen", reason: "parse-failed" },
        { status: 200 }
      );
    }

    const validCategories = new Set(["evergreen", "current_events", "conflict_disaster"]);
    const category = validCategories.has(parsed?.category)
      ? parsed.category
      : "evergreen";

    const reason = typeof parsed?.reason === "string"
      ? parsed.reason.slice(0, 100)
      : "";

    return NextResponse.json({ category, reason }, { status: 200 });
  } catch (e: any) {
    // Soft-fail: don't block user creation if classifier errors
    return NextResponse.json(
      { category: "evergreen", reason: "error" },
      { status: 200 }
    );
  }
}