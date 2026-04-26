import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAndIncrementUsage } from "@/lib/usageGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const MAX_PER_JOB = 10;

export async function POST(req: NextRequest) {
  try {
    // 1. Auth via Bearer token
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

    // 2. Studio tier gate
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

    // 3. Parse + validate input
    const body = await req.json();
    const channelHandle = (body?.channelHandle || "").trim().toLowerCase();
    const videoIds: string[] = Array.isArray(body?.videoIds)
      ? body.videoIds
      : [];

    if (!channelHandle) {
      return NextResponse.json(
        { error: "channelHandle required" },
        { status: 400 }
      );
    }
    if (videoIds.length === 0) {
      return NextResponse.json(
        { error: "videoIds required" },
        { status: 400 }
      );
    }
    if (videoIds.length > MAX_PER_JOB) {
      return NextResponse.json(
        { error: `Max ${MAX_PER_JOB} videos per clone job` },
        { status: 400 }
      );
    }

    // 4. Load cached scrape + validate videoIds
    const { data: scrape } = await (admin as any)
      .from("channel_scrapes")
      .select("*")
      .eq("user_id", user.id)
      .eq("channel_handle", channelHandle)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!scrape) {
      return NextResponse.json(
        {
          error: "scrape_expired",
          message: "Channel scrape expired or not found. Please re-scrape.",
        },
        { status: 404 }
      );
    }

    const videosMap = new Map<string, any>();
    for (const v of scrape.videos || []) {
      videosMap.set(v.video_id, v);
    }

    const selectedVideos: any[] = [];
    for (const id of videoIds) {
      const v = videosMap.get(id);
      if (v) selectedVideos.push(v);
    }

    if (selectedVideos.length === 0) {
      return NextResponse.json(
        { error: "No valid videos from scrape matched the selection" },
        { status: 400 }
      );
    }

    // 5. Reserve credits upfront (one check per video)
    //    We call checkAndIncrementUsage once per video — if any fail, we refund
    const creditsReserved: number[] = [];
    for (let i = 0; i < selectedVideos.length; i++) {
      const check = await checkAndIncrementUsage(user.id, "recreate");
      if (!check.allowed) {
        // Refund any reserved slots by decrementing usage
        console.warn(
          `[channel-cloner/queue] credit limit hit after ${i} reservations — aborting`
        );
        return NextResponse.json(
          {
            error: "usage_limit",
            message: check.error || "Not enough credits for this job",
            upgrade_required: true,
            reserved: i,
            requested: selectedVideos.length,
          },
          { status: 429 }
        );
      }
      creditsReserved.push(i);
    }

    console.log(
      `[channel-cloner/queue] reserved ${creditsReserved.length} credits for user ${user.id}`
    );

    // 6. Insert recreate_projects rows + fire worker for each
    const createdProjects: any[] = [];
    const failed: any[] = [];
    const workerUrl = `${getWorkerUrl()}/recreate`;

    for (const video of selectedVideos) {
      try {
        // Insert the project
        const { data: project, error: insertErr } = await (admin as any)
          .from("recreate_projects")
          .insert({
            user_id: user.id,
            source_url: video.url,
            source_type: "youtube",
            source_title: video.title?.slice(0, 255) || null,
            target_language: "Vietnamese",
            style: "news",
            voice_id: null,
            include_captions: true,
            music: "none",
            caption_style: "classic",
            caption_position: "bottom",
            target_length: 90,
            orientation: "landscape",
            status: "pending",
            source_channel_handle: channelHandle,
            source_channel_title: scrape.channel_title,
            source_video_title: video.title?.slice(0, 255) || null,
          })
          .select()
          .single();

        if (insertErr || !project) {
          console.error(
            "[channel-cloner/queue] insert failed for",
            video.video_id,
            insertErr
          );
          failed.push({ video_id: video.video_id, reason: "insert_failed" });
          continue;
        }

        // Fire worker (non-blocking — worker accepts the request, works async)
        fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            source_url: video.url,
            target_language: "Vietnamese",
            style: "news",
            voice_id: null,
            include_captions: true,
            music: "none",
            caption_style: "classic",
            caption_position: "bottom",
            target_length: 90,
            orientation: "landscape",
          }),
        }).catch((err) => {
          console.error(
            "[channel-cloner/queue] worker fire failed for",
            project.id,
            err
          );
        });

        createdProjects.push({
          project_id: project.id,
          video_id: video.video_id,
          title: video.title,
        });
      } catch (err: any) {
        console.error(
          "[channel-cloner/queue] error processing",
          video.video_id,
          err
        );
        failed.push({
          video_id: video.video_id,
          reason: err?.message || "error",
        });
      }
    }

    console.log(
      `[channel-cloner/queue] ✅ queued ${createdProjects.length}/${selectedVideos.length} videos from @${channelHandle}`
    );

    return NextResponse.json({
      ok: true,
      queued: createdProjects.length,
      failed: failed.length,
      projects: createdProjects,
      channel: scrape.channel_title,
    });
  } catch (err: any) {
    console.error("[channel-cloner/queue] Error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}