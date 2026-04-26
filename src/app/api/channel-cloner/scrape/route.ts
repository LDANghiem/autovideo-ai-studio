import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lazy admin client — matches your existing pattern
let _admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _admin;
}

function getWorkerUrl(): string {
  const base =
    process.env.WORKER_URL ||
    process.env.RENDER_WEBHOOK_URL ||
    "http://localhost:10000";
  return base.replace(/\/render\/?$/, "");
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate via Bearer token (matches your other routes)
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Studio tier gate (matches Bulk Factory)
    const { data: profile } = await (admin as any)
      .from("user_profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (profile?.plan !== "studio") {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Channel Cloner is a Studio-tier feature",
        },
        { status: 403 }
      );
    }

    // 3. Parse input
    const body = await req.json();
    const channelInput = (body?.channelInput || "").trim();
    if (!channelInput) {
      return NextResponse.json(
        { error: "channelInput required" },
        { status: 400 }
      );
    }

    // 4. Normalize handle for cache lookup
    let cacheHandle = "";
    if (channelInput.startsWith("@")) {
      cacheHandle = channelInput.slice(1).toLowerCase();
    } else {
      const atMatch = channelInput.match(/youtube\.com\/@([^\/\?]+)/);
      const channelMatch = channelInput.match(
        /youtube\.com\/channel\/([^\/\?]+)/
      );
      const cMatch = channelInput.match(/youtube\.com\/c\/([^\/\?]+)/);
      cacheHandle = (
        atMatch?.[1] ||
        channelMatch?.[1] ||
        cMatch?.[1] ||
        channelInput
      ).toLowerCase();
    }

    // 5. Cache check (24hr TTL)
    const { data: cached } = await (admin as any)
      .from("channel_scrapes")
      .select("*")
      .eq("user_id", user.id)
      .eq("channel_handle", cacheHandle)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      console.log(`[channel-cloner/scrape] cache HIT for ${cacheHandle}`);
      return NextResponse.json({
        cached: true,
        channel_handle: cached.channel_handle,
        channel_url: cached.channel_url,
        channel_title: cached.channel_title,
        videos: cached.videos,
        scraped_at: cached.scraped_at,
      });
    }

    console.log(
      `[channel-cloner/scrape] cache MISS for ${cacheHandle} — calling worker`
    );

    // 6. Call worker
    const workerRes = await fetch(`${getWorkerUrl()}/scrape-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelInput }),
    });

    if (!workerRes.ok) {
      const errBody = await workerRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: errBody?.error || "worker_error",
          message: errBody?.message || "Failed to scrape channel",
        },
        { status: workerRes.status }
      );
    }

    const workerData = await workerRes.json();

    // 7. Save to cache
    const { error: upsertErr } = await (admin as any)
      .from("channel_scrapes")
      .upsert(
        {
          user_id: user.id,
          channel_handle: (
            workerData.channel_handle || cacheHandle
          ).toLowerCase(),
          channel_url: workerData.channel_url,
          channel_title: workerData.channel_title,
          videos: workerData.videos,
          scraped_at: workerData.scraped_at || new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "user_id,channel_handle" }
      );

    if (upsertErr) {
      console.error("[channel-cloner/scrape] cache upsert failed:", upsertErr);
    }

    return NextResponse.json({ cached: false, ...workerData });
  } catch (err: any) {
    console.error("[channel-cloner/scrape] Error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}