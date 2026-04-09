// ============================================================
// FILE: src/app/api/article/create/route.ts
// Article → Video pipeline — Step 1
// Fetches article URL, extracts text, creates recreate_projects record
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

let _admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!_admin) _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _admin;
}

// Extract readable text from HTML
function extractText(html: string): string {
  // Remove scripts, styles, nav, footer, ads
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s*[\|\-–]\s*.+$/, "").trim() : "";

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description/i);
  const desc = descMatch ? descMatch[1] : "";

  // Extract paragraphs and headings
  const paragraphs: string[] = [];
  const tagPattern = /<(p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const content = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (content.length > 30) paragraphs.push(content);
  }

  const body = paragraphs.join("\n\n");
  const full = [title, desc, body].filter(Boolean).join("\n\n");
  return full.slice(0, 8000); // cap at 8k chars
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await getAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      source_url,
      target_language = "Vietnamese",
      style = "news",
      voice_id = null,
      include_captions = true,
      music = "none",
      caption_style = "classic",
      caption_position = "bottom",
      target_length = 90,
      orientation = "landscape",
    } = body;

    if (!source_url) return NextResponse.json({ error: "Article URL is required" }, { status: 400 });

    // Validate it's a real URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(source_url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Fetch article content
    console.log("[article] fetching:", source_url);
    let articleText = "";
    let articleTitle = parsedUrl.hostname;

    try {
      const res = await fetch(source_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AutoVideoBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      articleText = extractText(html);

      // Extract title from first line
      const firstLine = articleText.split("\n")[0];
      if (firstLine && firstLine.length < 200) articleTitle = firstLine;

    } catch (fetchErr: any) {
      console.error("[article] fetch error:", fetchErr.message);
      return NextResponse.json(
        { error: `Could not fetch article: ${fetchErr.message}` },
        { status: 422 }
      );
    }

    if (!articleText || articleText.length < 100) {
      return NextResponse.json(
        { error: "Not enough text found in this URL. Try a different article." },
        { status: 422 }
      );
    }

    console.log("[article] extracted:", articleText.length, "chars, title:", articleTitle.slice(0, 60));

    // Create recreate_projects record with article_text stored
    const { data: project, error: insertErr } = await (getAdmin() as any)
      .from("recreate_projects")
      .insert({
        user_id: user.id,
        source_url,
        source_type: "article",
        title: articleTitle.slice(0, 255),
        source_title: articleTitle.slice(0, 255),
        article_text: articleText,
        target_language,
        style,
        voice_id,
        include_captions,
        music,
        caption_style,
        caption_position,
        target_length,
        orientation,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr || !project) {
      console.error("[article] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    console.log("[article] ✅ project created:", project.id);
    return NextResponse.json({ ok: true, project_id: project.id, title: articleTitle });

  } catch (err: any) {
    console.error("[article/create] error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}