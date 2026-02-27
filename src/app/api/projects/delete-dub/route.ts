// ============================================================
// FILE 4 OF 5 — MULTI-LANGUAGE DUBBING
// ============================================================
// COPY TO: src/app/api/projects/delete-dub/route.ts
//
// PURPOSE: Deletes a dubbed version of a project.
//          Removes the audio file from Supabase Storage
//          and the dub record from the database.
//
// Request body:
//   { dub_id: "uuid" }
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ── Env vars ──
    const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const AUDIO_BUCKET = (process.env.AUDIO_BUCKET || "audio").trim();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    // ── Auth ──
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse request ──
    const body = await req.json().catch(() => ({}));
    const dubId = body?.dub_id;

    if (!dubId) {
      return NextResponse.json({ error: "Missing dub_id" }, { status: 400 });
    }

    // ── Load the dub record ──
    const { data: dub, error: dubErr } = await admin
      .from("project_dubs")
      .select("id,user_id,audio_object_path,language_name")
      .eq("id", dubId)
      .eq("user_id", user.id)
      .single();

    if (dubErr || !dub) {
      return NextResponse.json({ error: "Dub not found" }, { status: 404 });
    }

    // ── Delete audio file from Storage ──
    if (dub.audio_object_path) {
      const { error: storageErr } = await admin.storage
        .from(AUDIO_BUCKET)
        .remove([dub.audio_object_path]);

      if (storageErr) {
        console.warn("[delete-dub] Storage delete warning:", storageErr.message);
        // Don't fail the whole operation if storage delete fails
      }
    }

    // ── Delete the dub record ──
    const { error: deleteErr } = await admin
      .from("project_dubs")
      .delete()
      .eq("id", dubId)
      .eq("user_id", user.id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    console.log(`[delete-dub] Deleted ${dub.language_name} dub: ${dubId}`);

    return NextResponse.json({ success: true, deleted: dubId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Delete failed" },
      { status: 500 }
    );
  }
}