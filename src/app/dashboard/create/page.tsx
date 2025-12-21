"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { useUserPreferences } from "@/context/UserPreferencesContext";

import StylePreview from "@/components/create/StylePreview";
import TemplatePresets from "@/components/create/TemplatePresets";
import VideoPreviewMock from "@/components/create/VideoPreviewMock";
import QualityEstimate from "@/components/create/QualityEstimate";
import FinalSummary from "@/components/create/FinalSummary";

type FormState = {
  topic: string;
  style: string;
  voice: string;
  length: string;
  resolution: string;
  language: string;
  tone: string;
  music: string;
};

const voiceSamples: Record<string, string> = {
  "AI Voice": "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav",
  Narrator: "https://www2.cs.uic.edu/~i101/SoundFiles/ImperialMarch60.wav",
  "Female Soft": "https://www2.cs.uic.edu/~i101/SoundFiles/Front_Center.wav",
  "Male Deep": "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther60.wav",
};

export default function CreateProjectPage() {
  const router = useRouter();
  const { prefs, loading } = useUserPreferences();

  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<FormState>({
    topic: "",
    style: "modern",
    voice: "AI Voice",
    length: "60 seconds",
    resolution: "1080p",
    language: "English",
    tone: "friendly",
    music: "ambient",
  });

  // Voice preview
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Apply saved user preferences once loaded
  useEffect(() => {
    if (!loading && prefs) {
      setForm((prev) => ({
        ...prev,
        style: prefs.default_style ?? prev.style,
        voice: prefs.default_voice ?? prev.voice,
        length: prefs.default_video_length ?? prev.length,
        resolution: prefs.default_resolution ?? prev.resolution,
        language: prefs.default_language ?? prev.language,
        tone: prefs.default_tone ?? prev.tone,
        music: prefs.default_music ?? prev.music,
      }));
    }
  }, [loading, prefs]);

  // Template apply function
  const applyTemplate = (tpl: any) => {
    setForm((prev) => ({
      ...prev,
      topic: "",
      style: tpl.style,
      voice: tpl.voice,
      length: tpl.length,
      resolution: tpl.resolution,
      language: tpl.language,
      tone: tpl.tone,
      music: tpl.music,
    }));
  };

  // Create project row via API (Bearer token), then redirect
  const handleSubmit = async () => {
    if (submitting) return;

    if (!form.topic.trim()) {
      alert("Please enter a topic before generating.");
      return;
    }

    try {
      setSubmitting(true);

       // Must be logged in (client-side auth)
    const { data, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    const token = data.session?.access_token;

    console.log(
    "ACCESS TOKEN:",
    token ? token.slice(0, 40) + "..." : "❌ NO TOKEN"
    );

    if (!token) {
    throw new Error("Auth session missing. Please log in again.");
    }

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to create project");
      }

      router.push(`/dashboard/projects/${json.id}`);
    } catch (err: any) {
      console.error("Create project error:", err);
      alert(err?.message ?? "Failed to create project.");
    } finally {
      setSubmitting(false);
    }
  };

  // Voice preview play
  const handlePlayPreview = async () => {
    const voiceKey = form.voice || prefs?.default_voice || "AI Voice";
    const url = voiceSamples[voiceKey];

    if (!url) {
      alert("No sample audio set for this voice yet.");
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlaying(true);

    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);

    try {
      await audio.play();
    } catch (err) {
      console.error("Error playing audio preview:", err);
      setIsPlaying(false);
    }
  };

  // Topic strength helper
  const topicWords = form.topic.trim() ? form.topic.trim().split(/\s+/) : [];
  const topicWordCount = topicWords.length;

  let topicStrengthLabel = "Tip: aim for 8–16 words for best results.";
  let topicStrengthClass = "text-gray-400";

  if (topicWordCount > 0 && topicWordCount < 5) {
    topicStrengthLabel = "A bit short — add a few more details.";
    topicStrengthClass = "text-amber-500";
  } else if (topicWordCount >= 5 && topicWordCount <= 18) {
    topicStrengthLabel = "Nice — this is a strong, focused topic.";
    topicStrengthClass = "text-emerald-500";
  } else if (topicWordCount > 18) {
    topicStrengthLabel = "Quite long — consider trimming for clarity.";
    topicStrengthClass = "text-rose-500";
  }

  if (loading) {
    return <p className="text-center mt-20 text-gray-500">Loading project creator…</p>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-5xl mx-auto px-4 py-10"
    >
      <h1 className="text-2xl font-bold mb-2">Create New Video</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your default settings from <span className="font-semibold">Settings</span> are pre-applied.
      </p>

      <TemplatePresets onSelectTemplate={applyTemplate} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-6">
        {/* LEFT */}
        <div>
          {/* Topic */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
            <input
              type="text"
              placeholder='e.g. "The Future of AI in Education"'
              className="w-full border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-gray-400">
                {topicWordCount} word{topicWordCount === 1 ? "" : "s"}
              </span>
              <span className={topicStrengthClass}>{topicStrengthLabel}</span>
            </div>
          </div>

          {/* Style */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.style}
              onChange={(e) => setForm({ ...form, style: e.target.value })}
            >
              <option value="modern">Modern</option>
              <option value="cinematic">Cinematic</option>
              <option value="documentary">Documentary</option>
              <option value="tiktok">TikTok</option>
              <option value="retro">Retro</option>
            </select>

            <div className="mt-3">
              <StylePreview selected={form.style} />
            </div>
          </div>

          {/* Voice */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Voice</label>

              <motion.button
                type="button"
                onClick={handlePlayPreview}
                whileTap={{ scale: 0.9 }}
                animate={
                  isPlaying
                    ? {
                        scale: [1, 1.1, 1],
                        boxShadow: [
                          "0 0 0 0 rgba(34,197,94,0.5)",
                          "0 0 0 8px rgba(34,197,94,0)",
                          "0 0 0 0 rgba(34,197,94,0.5)",
                        ],
                      }
                    : { scale: 1, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }
                }
                transition={isPlaying ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-green-500 text-green-600 bg-white"
              >
                {isPlaying ? (
                  <div className="flex gap-0.5">
                    <span className="block w-1 h-3 bg-green-600 rounded-sm" />
                    <span className="block w-1 h-3 bg-green-600 rounded-sm" />
                  </div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </motion.button>
            </div>

            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.voice}
              onChange={(e) => setForm({ ...form, voice: e.target.value })}
            >
              <option>AI Voice</option>
              <option>Narrator</option>
              <option>Female Soft</option>
              <option>Male Deep</option>
            </select>
          </div>

          {/* Length */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Video Length</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.length}
              onChange={(e) => setForm({ ...form, length: e.target.value })}
            >
              <option>30 seconds</option>
              <option>60 seconds</option>
              <option>90 seconds</option>
              <option>2 minutes</option>
              <option>5 minutes</option>
              <option>10 minutes</option>
              <option>15 minutes</option>
              <option>20 minutes</option>
              <option>30 minutes</option>
            </select>
          </div>

          {/* Resolution */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Resolution</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.resolution}
              onChange={(e) => setForm({ ...form, resolution: e.target.value })}
            >
              <option>720p</option>
              <option>1080p</option>
              <option>4K</option>
            </select>
          </div>

          {/* Language */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            >
              <option>English</option>
              <option>Vietnamese</option>
              <option>Spanish</option>
              <option>Chinese</option>
              <option>Korean</option>
            </select>
          </div>

          {/* Tone */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
            >
              <option>friendly</option>
              <option>professional</option>
              <option>motivational</option>
              <option>serious</option>
              <option>fun</option>
            </select>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          <VideoPreviewMock
            style={form.style}
            resolution={form.resolution}
            voice={form.voice}
            tone={form.tone}
            music={form.music}
            length={form.length}
          />

          <QualityEstimate style={form.style} resolution={form.resolution} length={form.length} />

          <FinalSummary
            topic={form.topic}
            style={form.style}
            voice={form.voice}
            length={form.length}
            resolution={form.resolution}
            language={form.language}
            tone={form.tone}
            music={form.music}
            onGenerate={handleSubmit}
          />

          {/* Music */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Music Style</label>
            <select
              className="border rounded-lg px-3 py-2 w-full bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={form.music}
              onChange={(e) => setForm({ ...form, music: e.target.value })}
            >
              <option>ambient</option>
              <option>cinematic</option>
              <option>upbeat</option>
              <option>emotional</option>
              <option>minimal</option>
            </select>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
