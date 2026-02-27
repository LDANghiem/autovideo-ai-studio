import { SupabaseClient } from "@supabase/supabase-js";

export type CaptionWord = { word: string; start: number; end: number };

export type Scene = {
  index: number;
  title: string;
  narrationText: string;
  imagePrompt: string;
  imageUrl: string | null;
  imageObjectPath: string | null;
  startSec: number;
  endSec: number;
  transition: "crossfade" | "fade-black" | "slide-left" | "zoom-in";
};

type SceneSplitResult = {
  index: number;
  title: string;
  narrationText: string;
  imagePrompt: string;
  startWordIndex: number;
  endWordIndex: number;
  transition: string;
};

async function splitScriptIntoScenes(opts: {
  script: string;
  captionWords: CaptionWord[];
  topic: string;
  style: string;
  tone: string;
  durationSec: number;
}): Promise<Scene[]> {
  const { script, captionWords, topic, style, tone, durationSec } = opts;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const targetScenes = Math.max(4, Math.min(40, Math.round(durationSec / 20)));

  const prompt = `You are a video director. Split this narration script into ${targetScenes} visual scenes for a YouTube video.

Topic: "${topic}"
Style: ${style}
Tone: ${tone}
Total duration: ${durationSec} seconds
Total narration words: ${captionWords.length}

SCRIPT:
"""
${script}
"""

For each scene, provide:
1. "title": short scene label (2-4 words)
2. "narrationText": the exact portion of script text for this scene
3. "imagePrompt": a detailed image generation prompt (describe the visual: subject, setting, lighting, mood, color palette, camera angle). Make it cinematic and YouTube-worthy. Do NOT include text or watermarks. Style: ${style}, high quality, 16:9 aspect ratio.
4. "startWordIndex": approximate starting word index (0-based) in the full script
5. "endWordIndex": approximate ending word index (0-based, inclusive)
6. "transition": one of "crossfade", "fade-black", "slide-left", "zoom-in"

Rules:
- Scenes must cover the ENTIRE script with no gaps or overlaps
- Each scene should be 10-30 seconds of narration
- Image prompts should be vivid, specific, and match the narration content
- Vary transitions for visual interest
- First scene should use "fade-black", last scene should use "fade-black"

Respond with ONLY a JSON array. No markdown, no explanation.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: "You are a professional video director. Always respond with valid JSON arrays only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI scene split error");
  }

  let rawText: string = json?.choices?.[0]?.message?.content?.trim() || "";
  rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  let rawScenes: SceneSplitResult[];
  try {
    rawScenes = JSON.parse(rawText);
  } catch {
    throw new Error("Failed to parse scene JSON from GPT");
  }

  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error("GPT returned empty scene array");
  }

  const validTransitions = ["crossfade", "fade-black", "slide-left", "zoom-in"];

  const scenes: Scene[] = rawScenes.map((raw, i) => {
    const startIdx = Math.max(0, Math.min(raw.startWordIndex ?? 0, captionWords.length - 1));
    const endIdx = Math.max(startIdx, Math.min(raw.endWordIndex ?? 0, captionWords.length - 1));

    const startSec = captionWords[startIdx]?.start ?? (i * (durationSec / rawScenes.length));
    const endSec = captionWords[endIdx]?.end ?? ((i + 1) * (durationSec / rawScenes.length));

    const transition = validTransitions.includes(raw.transition)
      ? (raw.transition as Scene["transition"])
      : "crossfade";

    return {
      index: i,
      title: raw.title || "Scene " + (i + 1),
      narrationText: raw.narrationText || "",
      imagePrompt: raw.imagePrompt || "",
      imageUrl: null,
      imageObjectPath: null,
      startSec,
      endSec,
      transition,
    };
  });

  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].startSec < scenes[i - 1].endSec) {
      scenes[i].startSec = scenes[i - 1].endSec;
    }
    if (scenes[i].endSec <= scenes[i].startSec) {
      scenes[i].endSec = scenes[i].startSec + 5;
    }
  }

  return scenes;
}

async function generateOneImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.IMAGE_MODEL || "dall-e-3";
  const quality = process.env.IMAGE_QUALITY || "standard";
  const size = process.env.IMAGE_SIZE || "1792x1024";

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
      response_format: "b64_json",
    }),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || "Image gen failed");
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned");

  return Buffer.from(b64, "base64");
}

export async function generateScenesWithImages(opts: {
  script: string;
  captionWords: CaptionWord[];
  topic: string;
  style: string;
  tone: string;
  durationSec: number;
  userId: string;
  projectId: string;
  attempt: number;
  supabaseUrl: string;
  admin: SupabaseClient<any, any, any>;
  imageBucket?: string;
}): Promise<Scene[]> {
  const {
    script, captionWords, topic, style, tone, durationSec,
    userId, projectId, attempt, supabaseUrl, admin,
    imageBucket = "scene-images",
  } = opts;

  console.log("[scenes] splitting script into scenes...");

  const scenes = await splitScriptIntoScenes({
    script, captionWords, topic, style, tone, durationSec,
  });

  console.log("[scenes] got " + scenes.length + " scenes, generating images...");

  const CONCURRENCY = 2;

  async function processScene(scene: Scene): Promise<void> {
    const label = "scene-" + String(scene.index).padStart(2, "0");
    try {
      console.log("[scenes]   " + label + ": generating image...");
      const imgBuffer = await generateOneImage(scene.imagePrompt);

      const objectPath = userId + "/" + projectId + "/attempt-" + attempt + "/" + label + ".png";

      const { error: upErr } = await admin.storage
        .from(imageBucket)
        .upload(objectPath, imgBuffer, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "3600",
        });

      if (upErr) {
        console.warn("[scenes]   " + label + ": upload failed:", upErr.message);
        return;
      }

      scene.imageUrl = supabaseUrl + "/storage/v1/object/public/" + imageBucket + "/" + objectPath;
      scene.imageObjectPath = objectPath;
      console.log("[scenes]   " + label + ": done");
    } catch (err: any) {
      console.warn("[scenes]   " + label + ": image gen failed:", err?.message);
    }
  }

  const active: Promise<void>[] = [];
  for (const scene of scenes) {
    const p = processScene(scene).then(() => {
      const idx = active.indexOf(p);
      if (idx >= 0) active.splice(idx, 1);
    });
    active.push(p);
    if (active.length >= CONCURRENCY) {
      await Promise.race(active);
    }
  }
  await Promise.all(active);

  const successCount = scenes.filter((s) => s.imageUrl).length;
  console.log("[scenes] done: " + successCount + "/" + scenes.length + " images generated");

  return scenes;
}