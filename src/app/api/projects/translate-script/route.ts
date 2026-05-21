// ============================================================
// FILE: src/app/api/projects/translate-script/route.ts
// ============================================================
// COMMIT 17a — Script translation via Claude
//
// POST /api/projects/translate-script
//   Body: { text, source_language, target_language, mode }
//   Returns: { translated_text, warnings, used, limit }
//
// Tier limits (translations per month):
//   - Free: 2
//   - Creator: 30
//   - Studio: unlimited
//
// Modes:
//   - literal: word-for-word, preserve structure
//   - adaptive: rewrite for the target culture, preserve meaning + tone
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { PLANS } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ─── Supported languages (matches TTS voice list) ──────────────
const SUPPORTED_LANGUAGES = [
  "English", "Vietnamese", "Spanish", "Portuguese", "French",
  "German", "Hindi", "Japanese", "Korean", "Chinese",
  "Arabic", "Indonesian", "Thai",
];

// ─── Tier limits now live in PLANS (src/lib/stripe.ts) ─────────
// 999999 = effectively unlimited (codebase convention)

// ─── Validation limits ─────────────────────────────────────────
const MIN_CHARS = 50;
const MAX_CHARS = 35000; // ~6000 words

// ─── Prompts ───────────────────────────────────────────────────
function buildSystemPrompt(mode: "literal" | "adaptive", sourceLang: string, targetLang: string): string {
  if (mode === "literal") {
    return `You are a professional translator. Translate the following ${sourceLang} text into ${targetLang}.

RULES (literal mode):
- Preserve sentence structure and order as much as possible
- Translate idioms and metaphors as closely as the target language allows
- Do NOT add new content
- Do NOT remove content
- Do NOT explain or comment
- Preserve paragraph breaks
- If a word has no direct ${targetLang} equivalent, use the closest natural term

OUTPUT FORMAT:
- First line: <TRANSLATION_START>
- Then the translated text
- Last line: <TRANSLATION_END>
- After that, on a new line: <WARNINGS_START>
- Then a JSON array of any warnings (e.g. "Idiom 'comfort zone' translated literally"), one per line
- Last line: <WARNINGS_END>

If there are no warnings, use an empty array [].`;
  }

  return `You are a professional localizer. Adapt the following ${sourceLang} text into natural, native-sounding ${targetLang}.

RULES (adaptive mode):
- Prioritize natural ${targetLang} phrasing over literal accuracy
- Replace English idioms with culturally equivalent ${targetLang} expressions
- Adjust sentence rhythm and register to fit ${targetLang} norms
- Preserve the original meaning, tone, and emotional weight
- Do NOT add new content (no commentary, no embellishment)
- Do NOT remove substance
- Preserve paragraph breaks
- For motivational content: match the inspirational register of the target culture

OUTPUT FORMAT:
- First line: <TRANSLATION_START>
- Then the translated text
- Last line: <TRANSLATION_END>
- After that, on a new line: <WARNINGS_START>
- Then a JSON array of warnings (e.g. "Replaced 'rise and grind' with culturally equivalent phrase"), one per line
- Last line: <WARNINGS_END>

If there are no warnings, use an empty array [].`;
}

function parseModelOutput(raw: string): { translated_text: string; warnings: string[] } {
  const translationMatch = raw.match(/<TRANSLATION_START>([\s\S]*?)<TRANSLATION_END>/);
  const warningsMatch = raw.match(/<WARNINGS_START>([\s\S]*?)<WARNINGS_END>/);

  const translated_text = translationMatch ? translationMatch[1].trim() : raw.trim();

  let warnings: string[] = [];
  if (warningsMatch) {
    try {
      const parsed = JSON.parse(warningsMatch[1].trim());
      if (Array.isArray(parsed)) {
        warnings = parsed.filter((w) => typeof w === "string");
      }
    } catch {
      // Soft fail — warnings parsing failure shouldn't block translation
    }
  }

  return { translated_text, warnings };
}

// ─── POST Handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Parse body ────────────────────────────────────────
    const body = await req.json().catch(() => ({} as any));
    const text = String(body?.text || "").trim();
    const source_language = String(body?.source_language || "").trim();
    const target_language = String(body?.target_language || "").trim();
    const mode = String(body?.mode || "adaptive").trim();

    // ── Validation ────────────────────────────────────────
    if (text.length < MIN_CHARS) {
      return NextResponse.json(
        { error: `Text too short: ${text.length} chars (min ${MIN_CHARS}).` },
        { status: 400 }
      );
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `Text too long: ${text.length} chars (max ${MAX_CHARS}).` },
        { status: 400 }
      );
    }
    if (!SUPPORTED_LANGUAGES.includes(source_language)) {
      return NextResponse.json(
        { error: `Unsupported source language: ${source_language}` },
        { status: 400 }
      );
    }
    if (!SUPPORTED_LANGUAGES.includes(target_language)) {
      return NextResponse.json(
        { error: `Unsupported target language: ${target_language}` },
        { status: 400 }
      );
    }
    if (source_language === target_language) {
      return NextResponse.json(
        { error: "Source and target languages must be different." },
        { status: 400 }
      );
    }
    if (mode !== "literal" && mode !== "adaptive") {
      return NextResponse.json(
        { error: "Mode must be 'literal' or 'adaptive'." },
        { status: 400 }
      );
    }

    // ── Tier + rate limit check ───────────────────────────
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const plan = (profile?.plan as string) || "free";
    const planKey = PLANS[plan] ? plan : "free";
    const limit = PLANS[planKey].limits.translate;

    // Count translations this calendar month
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count: usedThisMonth } = await supabaseAdmin
      .from("translation_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    const used = usedThisMonth ?? 0;

    if (used >= limit) {
      return NextResponse.json({
        error: `You've used all ${limit} translations this month. Upgrade for more.`,
        upgrade_required: true,
        used,
        limit,
      }, { status: 429 });
    }

    // ── Call Claude ───────────────────────────────────────
    const systemPrompt = buildSystemPrompt(mode as "literal" | "adaptive", source_language, target_language);

    console.log(`[translate] user=${user.id} ${source_language}→${target_language} mode=${mode} chars=${text.length}`);

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: text },
      ],
    });

    const rawOutput = completion.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("\n");

    if (!rawOutput || rawOutput.length === 0) {
      return NextResponse.json({ error: "Empty response from translator." }, { status: 502 });
    }

    const { translated_text, warnings } = parseModelOutput(rawOutput);

    if (!translated_text || translated_text.length < 10) {
      return NextResponse.json({ error: "Translation failed — empty output." }, { status: 502 });
    }

    // ── Log usage ─────────────────────────────────────────
    await supabaseAdmin.from("translation_usage").insert({
      user_id: user.id,
      source_language,
      target_language,
      mode,
      input_char_count: text.length,
      output_char_count: translated_text.length,
    });

    return NextResponse.json({
      translated_text,
      warnings,
      used: used + 1,
      limit: limit >= 999999 ? null : limit, // null = unlimited
    });

  } catch (err: any) {
    console.error("[translate] unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}