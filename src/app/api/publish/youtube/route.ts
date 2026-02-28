// src/app/api/publish/youtube/route.ts
// Publishes a repurpose clip to YouTube as a Short
//
// Flow:
//   [1] Verify user auth
//   [2] Get user's YouTube tokens from DB
//   [3] Refresh access token if expired
//   [4] Download clip video from Supabase URL
//   [5] Upload to YouTube via resumable upload
//   [6] Log publish to publish_log table
//   [7] Return YouTube video URL

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ── Helper: Refresh access token ──────────────────────────── */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[publish/youtube] Token refresh failed:", await res.text());
    return null;
  }

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    /* ── [1] Auth ──────────────────────────────────────────── */
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    /* ── [2] Parse request ─────────────────────────────────── */
    const body = await req.json();
    const {
      clip_id,
      project_id,
      video_url,      // Supabase public URL of the clip
      title,
      description,
      tags = [],
      privacy = "public",  // public | unlisted | private
    } = body;

    if (!video_url) return NextResponse.json({ error: "Missing video_url" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

    /* ── [3] Get YouTube tokens ────────────────────────────── */
    const { data: ytTokens, error: tokenErr } = await supabaseAdmin
      .from("youtube_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokenErr || !ytTokens) {
      return NextResponse.json({ error: "YouTube not connected. Please connect in Settings." }, { status: 403 });
    }

    /* ── [4] Refresh token if expired ──────────────────────── */
    let accessToken = ytTokens.access_token;
    const expiry = new Date(ytTokens.token_expiry || 0);

    if (expiry < new Date(Date.now() + 60000)) { // Expired or expiring within 1 min
      console.log("[publish/youtube] Refreshing expired token...");
      const refreshed = await refreshAccessToken(ytTokens.refresh_token);
      if (!refreshed) {
        return NextResponse.json({ error: "Failed to refresh YouTube token. Please reconnect in Settings." }, { status: 403 });
      }

      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      // Update token in DB
      await supabaseAdmin.from("youtube_tokens").update({
        access_token: accessToken,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
    }

    /* ── [5] Download clip from Supabase ───────────────────── */
    console.log("[publish/youtube] Downloading clip:", video_url.slice(0, 80));
    const videoRes = await fetch(video_url);
    if (!videoRes.ok) {
      return NextResponse.json({ error: "Failed to download clip video" }, { status: 500 });
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const videoSize = videoBuffer.length;
    console.log("[publish/youtube] Clip size:", (videoSize / 1024 / 1024).toFixed(1), "MB");

    /* ── [6] YouTube Resumable Upload — Init ───────────────── */
    // Build metadata — #Shorts tag tells YouTube this is a Short
    const ytTags = [...(tags || []), "#Shorts"].filter(Boolean);
    const ytDescription = [
      description || "",
      "",
      ytTags.join(" "),
    ].join("\n").trim();

    const metadata = {
      snippet: {
        title: title.slice(0, 100),
        description: ytDescription.slice(0, 5000),
        tags: ytTags.map((t: string) => t.replace("#", "")).slice(0, 30),
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
        madeForKids: false,
      },
    };

    console.log("[publish/youtube] Initiating resumable upload...");
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(videoSize),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errBody = await initRes.text();
      console.error("[publish/youtube] Upload init failed:", initRes.status, errBody);
      return NextResponse.json({
        error: `YouTube upload failed (${initRes.status}): ${errBody.slice(0, 200)}`,
      }, { status: 500 });
    }

    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      return NextResponse.json({ error: "No upload URL returned from YouTube" }, { status: 500 });
    }

    /* ── [7] YouTube Resumable Upload — Send video ─────────── */
    console.log("[publish/youtube] Uploading video bytes...");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(videoSize),
        "Content-Type": "video/mp4",
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      console.error("[publish/youtube] Upload failed:", uploadRes.status, errBody);
      return NextResponse.json({
        error: `Video upload failed (${uploadRes.status}): ${errBody.slice(0, 200)}`,
      }, { status: 500 });
    }

    const uploadResult = await uploadRes.json();
    const youtubeVideoId = uploadResult.id;
    const youtubeUrl = `https://youtube.com/shorts/${youtubeVideoId}`;

    console.log("[publish/youtube] ✅ Published:", youtubeUrl);

    /* ── [8] Log to publish_log ────────────────────────────── */
    try {
      await supabaseAdmin.from("publish_log").insert({
        user_id: user.id,
        clip_id: clip_id || null,
        project_id: project_id || null,
        source_video_url: video_url,
        platform: "youtube",
        platform_video_id: youtubeVideoId,
        platform_video_url: youtubeUrl,
        title: title.slice(0, 100),
        description: ytDescription.slice(0, 500),
        tags: ytTags,
        privacy,
        status: "published",
      });
    } catch (logErr) {
      console.warn("[publish/youtube] Log insert failed:", logErr);
    }

    /* ── [9] Return success ────────────────────────────────── */
    return NextResponse.json({
      success: true,
      youtube_video_id: youtubeVideoId,
      youtube_url: youtubeUrl,
    });
  } catch (err: any) {
    console.error("[publish/youtube] Error:", err);
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}