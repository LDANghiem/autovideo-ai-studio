import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

    const RENDER_WEBHOOK_URL = Deno.env.get("RENDER_WEBHOOK_URL") || "";
    const RENDER_WEBHOOK_SECRET = Deno.env.get("RENDER_WEBHOOK_SECRET") || "";

    const authHeader = req.headers.get("Authorization") || "";

    // User client (to identify caller)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const project_id = body?.project_id as string | undefined;
    if (!project_id) return json({ error: "Missing project_id" }, 400);

    // Admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Ownership check
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id,user_id")
      .eq("id", project_id)
      .single();

    if (projErr || !project) return json({ error: "Project not found" }, 404);
    if (project.user_id !== userData.user.id) return json({ error: "Forbidden" }, 403);

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

    if (updErr) return json({ error: updErr.message }, 500);

    // Trigger Render.com webhook
    if (RENDER_WEBHOOK_URL) {
      if (!RENDER_WEBHOOK_SECRET) {
        return json({ error: "Missing RENDER_WEBHOOK_SECRET env on Edge Function" }, 500);
      }

      const url = `${RENDER_WEBHOOK_URL.replace(/\/$/, "")}/render`;
      console.log("Calling Render webhook:", url);

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id, secret: RENDER_WEBHOOK_SECRET }),
      });

      const text = await resp.text().catch(() => "");
      if (!resp.ok) {
        console.log("Render webhook failed:", resp.status, text);
        return json({ error: `Render webhook failed (${resp.status}): ${text}` }, 502);
      }

      return json({ ok: true, queued: true, webhook_called: true, webhook_response: text });
    }

    // If no webhook URL, still “queued” is fine
    return json({ ok: true, queued: true, webhook_called: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
