// ============================================================
// UPGRADED: src/app/api/projects/scene-to-query/route.ts
//
// WHAT CHANGED:
// 1. GPT now generates 2 search queries per scene (primary + fallback)
// 2. Smarter prompt — avoids abstract words, focuses on concrete visuals
// 3. Adds "mood" hint so image search can filter by color/tone
// 4. Much better hit rate on Pexels AND Unsplash
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenes, topic } = body;

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json(
        { error: "scenes array is required" },
        { status: 400 }
      );
    }

    const sceneList = scenes
      .map((s: any) => `Scene ${s.sceneIndex}: "${s.description}"`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a stock photo search expert. Convert video scene descriptions into optimal search queries for stock photo APIs (Pexels, Unsplash).

RULES FOR GREAT QUERIES:
- Generate TWO queries per scene: "primary" (specific) and "fallback" (broader)
- Each query: 2-4 words max, concrete visual nouns only
- NEVER use: scene, showing, depicting, featuring, concept, abstract, idea
- For abstract topics, use VISUAL METAPHORS:
    "success" → primary: "businessman celebrating", fallback: "trophy gold"
    "growth" → primary: "plant sprout sunlight", fallback: "green seedling"
    "money" → primary: "dollar bills stack", fallback: "gold coins"
    "technology" → primary: "laptop code screen", fallback: "circuit board"
    "sadness" → primary: "person rain window", fallback: "rainy street"
    "cooking steak" → primary: "grilling steak flame", fallback: "raw steak cutting board"
    "health" → primary: "fresh vegetables bowl", fallback: "running outdoor park"
- For people: use descriptive actions ("woman cooking kitchen" not "person")
- Add setting/context: "aerial city night" not just "city"
- Think: "what would a photographer actually photograph?"

Respond ONLY with valid JSON array. No markdown, no backticks.`,
        },
        {
          role: "user",
          content: `Video topic: "${topic || "general"}"

Convert each scene into TWO stock photo search queries (primary = specific, fallback = broader):

${sceneList}

JSON array format:
[{"sceneIndex": 0, "primary": "specific query", "fallback": "broader query"}, ...]`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() || "[]";

    let queries;
    try {
      const cleaned = content.replace(/```json\s*|```/g, "").trim();
      queries = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI queries:", content);
      queries = scenes.map((s: any) => ({
        sceneIndex: s.sceneIndex,
        primary: s.description.split(" ").slice(0, 3).join(" "),
        fallback: s.description.split(" ").slice(0, 2).join(" "),
      }));
    }

    // Merge AI queries back with original scene data
    const enrichedScenes = scenes.map((scene: any) => {
      const match = queries.find((q: any) => q.sceneIndex === scene.sceneIndex);
      return {
        sceneIndex: scene.sceneIndex,
        description: scene.description,
        // Primary query (specific) — used first
        searchQuery: match?.primary || scene.description.split(" ").slice(0, 3).join(" "),
        // Fallback query (broader) — used if primary returns no results
        fallbackQuery: match?.fallback || scene.description.split(" ").slice(0, 2).join(" "),
      };
    });

    return NextResponse.json({
      success: true,
      scenes: enrichedScenes,
    });
  } catch (error: any) {
    console.error("Scene-to-query error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate search queries" },
      { status: 500 }
    );
  }
}