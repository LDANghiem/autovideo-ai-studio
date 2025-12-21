import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const RENDER_WEBHOOK_URL = Deno.env.get("RENDER_WEBHOOK_URL") || "";

    const authHeader = req.headers.get("Authorization") || "";

    // Identify caller (uses user's JWT)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const project_id = body?.project_id as string | undefined;

    if (!project_id) {
      return jsonResponse({ error: "Missing project_id" }, 400);
    }

    // Admin DB client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify ownership
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id,user_id")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      return jsonResponse({ error: "Project not found" }, 404);
    }

    if (project.user_id !== userData.user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Reset project so it can be rendered again
    const { error: updErr } = await admin
      .from("projects")
      .update({
        status: "queued",
        error_message: null,
        video_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    if (updErr) {
      return jsonResponse({ error: updErr.message }, 500);
    }

    // Optional: ping renderer
    if (RENDER_WEBHOOK_URL) {
      fetch(RENDER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id }),
      }).catch(() => {});
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
