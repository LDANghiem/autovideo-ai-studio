import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=" + error, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=missing_code", req.url));
  }

  try {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(state);
    if (authError || !user) {
      return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=auth_failed", req.url));
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
    const REDIRECT_URI = "http://localhost:3000/api/auth/yt-callback";

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[yt-callback] Token exchange failed:", errText);
      return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=token_exchange", req.url));
    }

    const tokens = await tokenRes.json();

    if (!tokens.access_token || !tokens.refresh_token) {
      console.error("[yt-callback] Missing tokens:", JSON.stringify(tokens));
      return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=no_refresh_token", req.url));
    }

    const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    let channelId = null;
    let channelTitle = null;
    let channelThumbnail = null;

    try {
      const chRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: "Bearer " + tokens.access_token } }
      );
      if (chRes.ok) {
        const chData = await chRes.json();
        const ch = chData.items && chData.items[0];
        if (ch) {
          channelId = ch.id;
          channelTitle = ch.snippet.title;
          channelThumbnail = ch.snippet.thumbnails.default.url;
        }
      }
    } catch (e) {
      console.warn("[yt-callback] Channel fetch error:", e);
    }

    const { error: dbErr } = await supabaseAdmin
      .from("youtube_tokens")
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokenExpiry,
        scope: tokens.scope || "",
        channel_id: channelId,
        channel_title: channelTitle,
        channel_thumbnail: channelThumbnail,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (dbErr) {
      console.error("[yt-callback] DB error:", dbErr);
      return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=db_error", req.url));
    }

    console.log("[yt-callback] Connected YouTube:", channelTitle);
    return NextResponse.redirect(new URL("/dashboard/settings?youtube=connected", req.url));
  } catch (err) {
    console.error("[yt-callback] Error:", err);
    return NextResponse.redirect(new URL("/dashboard/settings?youtube=error&reason=unknown", req.url));
  }
}