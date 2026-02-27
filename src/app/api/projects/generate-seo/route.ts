// src/app/api/projects/generate-seo/route.ts
// ------------------------------------------------------------
// AutoVideo AI Studio — YouTube SEO Generator API
// ✅ 5 title variations ranked by CTR potential
// ✅ Full description with timestamps placeholder
// ✅ 30 relevant tags
// ✅ 5 hashtags
// ✅ Works standalone or attached to a project
// ------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, script, project_id } = body;

    if (!topic && !script) {
      return NextResponse.json({ error: "Provide a topic or script" }, { status: 400 });
    }

    // If project_id provided but no topic/script, fetch from project
    let finalTopic = topic || "";
    let finalScript = script || "";

    if (project_id && (!finalTopic || !finalScript)) {
      const { data: proj } = await admin
        .from("projects")
        .select("topic, script")
        .eq("id", project_id)
        .single();

      if (proj) {
        if (!finalTopic) finalTopic = proj.topic || "";
        if (!finalScript) finalScript = proj.script || "";
      }
    }

    const contextText = finalScript
      ? `Topic: ${finalTopic}\n\nFull Script:\n${finalScript.slice(0, 3000)}`
      : `Topic: ${finalTopic}`;

    console.log("[seo] Generating SEO for:", finalTopic.slice(0, 80));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `You are a YouTube SEO expert who has helped channels grow from 0 to 1M subscribers. You understand the YouTube algorithm, search ranking factors, and what makes viewers click.

Your job is to generate optimized YouTube metadata that maximizes:
1. Search rankings (SEO)
2. Click-through rate (CTR)
3. Watch time signals
4. Discoverability

Rules:
- Titles should be 50-70 characters, use power words, create curiosity gaps
- Description should be 2000-3000 characters with keywords in first 2 lines
- Tags should mix broad + specific + long-tail keywords
- Hashtags should be trending and relevant (max 5, YouTube shows first 3 above title)

Respond ONLY with valid JSON, no markdown, no backticks.`,
        },
        {
          role: "user",
          content: `Generate YouTube SEO metadata for this video:

${contextText}

Return this exact JSON structure:
{
  "titles": [
    { "text": "title here", "score": 92, "strategy": "why this title works" }
  ],
  "description": "full youtube description here with line breaks as \\n",
  "tags": ["tag1", "tag2", "tag3"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "keywordAnalysis": {
    "primary": "main keyword",
    "secondary": ["keyword2", "keyword3"],
    "longTail": ["long tail phrase 1", "long tail phrase 2"],
    "difficulty": "medium",
    "searchVolume": "estimated monthly searches"
  }
}

Generate exactly:
- 5 title variations, each with a CTR score (0-100) and strategy explanation. Rank from highest to lowest score.
- 1 full description (2000+ chars) with: hook in first 2 lines, timestamps placeholder section, about channel section, call-to-action, and relevant links placeholders. Use \\n for line breaks.
- 30 tags (mix of broad, specific, and long-tail)
- 5 hashtags (most relevant first)
- keyword analysis with primary keyword, secondary keywords, long-tail phrases, difficulty rating, and estimated search volume`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    console.log("[seo] Raw response length:", raw.length);

    // Parse JSON — strip markdown fences if present
    let seoData;
    try {
      const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      seoData = JSON.parse(clean);
    } catch (parseErr) {
      console.error("[seo] JSON parse error:", parseErr);
      return NextResponse.json({ error: "Failed to parse SEO data" }, { status: 500 });
    }

    // Save to project if project_id provided
    if (project_id) {
      const bestTitle = seoData.titles?.[0]?.text || "";
      await admin
        .from("projects")
        .update({
          seo_title: bestTitle,
          seo_description: seoData.description || "",
          seo_tags: seoData.tags || [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", project_id);
    }

    console.log("[seo] ✅ Generated:", seoData.titles?.length, "titles,", seoData.tags?.length, "tags");

    return NextResponse.json({ ok: true, seo: seoData });
  } catch (err: any) {
    console.error("[seo] ❌", err?.message || err);
    return NextResponse.json({ error: err?.message || "SEO generation failed" }, { status: 500 });
  }
}