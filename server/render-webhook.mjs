import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// POST /render  { project_id, secret }
app.post("/render", async (req, res) => {
  try {
    const { project_id, secret } = req.body || {};

    if (!project_id) {
      return res.status(400).json({ error: "Missing project_id" });
    }

    if (!process.env.RENDER_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Missing RENDER_WEBHOOK_SECRET on server" });
    }

    if (secret !== process.env.RENDER_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    // Run your script (same one you already used locally)
    const { spawn } = await import("node:child_process");
    const child = spawn("node", ["scripts/render-local.mjs", project_id], {

      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("Render job finished ✅");
      } else {
        console.error("Render job failed ❌ code=", code);
      }
    });

    return res.status(200).json({ ok: true, started: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Render webhook listening on port ${PORT}`);
});
