"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CreatePayload = {
  topic: string;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
};

export default function CreateProjectPage() {
  const router = useRouter();

  // Form fields
  const [topic, setTopic] = useState("3 tips to focus better");
  const [style, setStyle] = useState("modern");
  const [voice, setVoice] = useState("AI Voice");
  const [length, setLength] = useState("30 seconds");
  const [resolution, setResolution] = useState("720p");
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState("friendly");
  const [music, setMusic] = useState("ambient");

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload: CreatePayload = useMemo(
    () => ({
      topic,
      style,
      voice,
      length,
      resolution,
      language,
      tone,
      music,
    }),
    [topic, style, voice, length, resolution, language, tone, music]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      // Get access token for authenticated requests
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("You are not logged in. Please log in again.");
        setBusy(false);
        return;
      }

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to create project.");
        setBusy(false);
        return;
      }

      // Redirect to project detail page
      router.push(`/dashboard/projects/${json.id}`);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create Project</h1>
        <button
          onClick={() => router.push("/dashboard")}
          className="border rounded px-3 py-2"
          type="button"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="font-medium">Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. 3 tips to focus better"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="font-medium">Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="modern">modern</option>
              <option value="cinematic">cinematic</option>
              <option value="minimal">minimal</option>
              <option value="energetic">energetic</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="AI Voice">AI Voice</option>
              <option value="Narrator">Narrator</option>
              <option value="Friendly">Friendly</option>
              <option value="Serious">Serious</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Video Length</label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="30 seconds">30 seconds</option>
              <option value="60 seconds">60 seconds</option>
              <option value="90 seconds">90 seconds</option>
              <option value="2 minutes">2 minutes</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="English">English</option>
              <option value="Vietnamese">Vietnamese</option>
              <option value="Spanish">Spanish</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-medium">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="friendly">friendly</option>
              <option value="professional">professional</option>
              <option value="excited">excited</option>
              <option value="calm">calm</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="font-medium">Music</label>
            <select
              value={music}
              onChange={(e) => setMusic(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="ambient">ambient</option>
              <option value="uplifting">uplifting</option>
              <option value="dramatic">dramatic</option>
              <option value="none">none</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="bg-black text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create Project"}
          </button>

          <button
            type="button"
            onClick={() => {
              setTopic("3 tips to focus better");
              setStyle("modern");
              setVoice("AI Voice");
              setLength("30 seconds");
              setResolution("720p");
              setLanguage("English");
              setTone("friendly");
              setMusic("ambient");
              setError(null);
            }}
            className="border rounded px-4 py-2"
            disabled={busy}
          >
            Reset
          </button>
        </div>
      </form>

      <div className="mt-8 rounded border p-4 bg-gray-50">
        <h2 className="font-semibold mb-2">Final Project Summary</h2>
        <div className="text-sm space-y-1">
          <div><b>Topic:</b> {topic}</div>
          <div><b>Style:</b> {style}</div>
          <div><b>Voice:</b> {voice}</div>
          <div><b>Video Length:</b> {length}</div>
          <div><b>Resolution:</b> {resolution}</div>
          <div><b>Language:</b> {language}</div>
          <div><b>Tone:</b> {tone}</div>
          <div><b>Music:</b> {music}</div>
        </div>
      </div>
    </div>
  );
}
