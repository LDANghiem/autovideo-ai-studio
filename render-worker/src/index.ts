// render-worker/src/index.ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { renderWithRemotionAndUpload } from "./remotionRender.js";

// --- Load .env explicitly ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(express.json());

// simple request logger
app.use((req, _res, next) => {
  console.log(`[render-worker] ${req.method} ${req.path}`);
  next();
});

function nowIso() {
  return new Date().toISOString();
}

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const WEBHOOK_SECRET = (process.env.RENDER_WEBHOOK_SECRET || "").trim();

const STORAGE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || "renders").trim();
const REMOTION_COMP_ID = (process.env.REMOTION_COMP_ID || "Main").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Loaded env from:", path.resolve(__dirname, "../.env"));
  console.error("SUPABASE_URL present?", Boolean(SUPABASE_URL));
  console.error("SUPABASE_SERVICE_ROLE_KEY present?", Boolean(SUPABASE_SERVICE_ROLE_KEY));
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function setError(projectId: string, message: string) {
  const t = nowIso();
  await supabase
    .from("projects")
    .update({
      status: "error",
      error_message: message,
      render_completed_at: t,
      updated_at: t,
    })
    .eq("id", projectId);
}

// ✅ Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "render-worker",
    time: nowIso(),
  });
});

// ✅ Main webhook endpoint
app.post("/render", async (req, res) => {
  try {
    const { project_id, secret } = (req.body || {}) as { project_id?: string; secret?: string };

    console.log("[render-worker] /render called:", { project_id });

    if (!project_id) return res.status(400).json({ error: "Missing project_id" });

    // Accept secret from either header or JSON body
    const headerSecret = String(req.headers["x-webhook-secret"] || "").trim();
    const bodySecret = String(secret || "").trim();
    const providedSecret = headerSecret || bodySecret;

    if (WEBHOOK_SECRET && providedSecret !== WEBHOOK_SECRET) {
      console.log("[render-worker] invalid secret for project:", project_id);
      return res.status(401).json({ error: "Invalid secret" });
    }

    // Optional: idempotency guard (prevents duplicate renders)
    const { data: statusRow, error: statusErr } = await supabase
      .from("projects")
      .select("status")
      .eq("id", project_id)
      .single();

    if (statusErr) {
      console.warn("[render-worker] could not read status:", project_id, statusErr.message);
      // continue anyway
    } else {
      const status = String(statusRow?.status || "");
      if (status === "processing") {
        return res.status(202).json({ ok: true, accepted: true, skipped: "already_processing" });
      }
    }

    // Return immediately (fast webhook)
    res.status(202).json({ ok: true, accepted: true });

    // Do job async
    setImmediate(async () => {
      try {
        console.log("[render-worker] job start:", project_id);

        // remotionRender.ts updates processing/done and sets video_url
        await renderWithRemotionAndUpload({
          projectId: project_id,
          supabase,
          bucket: STORAGE_BUCKET,
          compositionId: REMOTION_COMP_ID,
        });

        console.log("[render-worker] job done:", project_id);
      } catch (e: any) {
        const message = e?.message || String(e);
        console.error("[render-worker] job failed:", project_id, message);
        await setError(project_id, message);
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => console.log(`Render worker listening on :${port}`));