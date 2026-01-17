import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { renderWithRemotionAndUpload } from "./remotionRender.js";

// --- Load .env explicitly (THIS FIXES your error) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/index.ts  ->  render-worker/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(express.json()); // ✅ must be express.json()
   app.use((req, _res, next) => {
  console.log(`[render-worker] ${req.method} ${req.path}`);
  next();
});


const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const WEBHOOK_SECRET = (process.env.RENDER_WEBHOOK_SECRET || "").trim();

const STORAGE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || "renders").trim();
const REMOTION_COMP_ID = (process.env.REMOTION_COMP_ID || "Main").trim();

function nowIso() {
  return new Date().toISOString();
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Loaded env from:", path.resolve(__dirname, "../.env"));
  console.error("SUPABASE_URL present?", Boolean(SUPABASE_URL));
  console.error("SUPABASE_SERVICE_ROLE_KEY present?", Boolean(SUPABASE_SERVICE_ROLE_KEY));
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function setStatus(projectId: string, status: string, extra?: Record<string, any>) {
  await supabase
    .from("projects")
    .update({
      status,
      updated_at: nowIso(),
      ...(extra || {}),
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
    const { project_id, secret } = req.body || {};
     console.log("[render-worker] /render called:", { project_id });

    if (!project_id) return res.status(400).json({ error: "Missing project_id" });

    // secret is expected in JSON body
    if (WEBHOOK_SECRET && String(secret || "").trim() !== WEBHOOK_SECRET) {
      console.log("[render-worker] invalid secret for project:", project_id);
      return res.status(401).json({ error: "Invalid secret" });
    }

    // Return immediately, do job async
    res.status(200).json({ ok: true, started: true });

    setImmediate(async () => {
      try {
        console.log("[render-worker] job start:", project_id);
        await setStatus(project_id, "processing", {
         render_started_at: nowIso(),
         error_message: null,
     });


        await renderWithRemotionAndUpload({
         projectId: project_id,
         supabase,
         bucket: STORAGE_BUCKET,
         compositionId: REMOTION_COMP_ID,
});

   // ✅ Mark done (important)
        await setStatus(project_id, "done", {
        render_completed_at: nowIso(),
        error_message: null,
     });

        console.log("[render-worker] job done:", project_id);


      } catch (e: any) {
        const message = e?.message || String(e);
        await setStatus(project_id, "error", { error_message: message });
        console.error("[render-worker] job failed:", project_id, message);
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => console.log(`Render worker listening on :${port}`));
