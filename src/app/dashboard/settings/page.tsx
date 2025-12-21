"use client";

import { useEffect, useState } from "react";
import { useUserPreferences } from "@/context/UserPreferencesContext";
import { updateUserPreferences } from "@/lib/preferences/updateUserPreferences";

import SettingsSection from "@/components/settings/SettingsSection";
import SettingsSelect from "@/components/settings/SettingsSelect";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const { prefs, loading, setPrefsLocal } = useUserPreferences();

  const [form, setForm] = useState({
    default_voice: "AI Voice",
    default_video_length: "60 seconds",
    default_style: "modern",
    default_resolution: "1080p",
    default_language: "English",
    default_tone: "friendly",
    default_music: "ambient",
  });

  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [showSuccess, setShowSuccess] = useState(false);


  // Load preferences into form when ready
  useEffect(() => {
    if (!loading && prefs) {
      setForm(prefs);
    }
  }, [loading, prefs]);

  const handleSave = async () => {
  setSaving(true);

  await updateUserPreferences(form);

  // Auto-save whenever a field changes
const handleAutoSave = async (key: string, value: string) => {
  const updated = { ...form, [key]: value };
  setForm(updated);

  // Update local instantly
  setPrefsLocal(updated);

  // Save to Supabase silently
  await updateUserPreferences(updated);

  // Tiny subtle toast (optional)
  toast({
    title: "Saved",
    description: `${key.replace("default_", "").replace("_", " ")} updated.`,
  });
};


  // Sync UI immediately
  setPrefsLocal(form);

  setSaving(false);

  // Toast popup
  toast({
    title: "Preferences Saved",
    description: "Your default video settings were updated successfully.",
  });

  // Trigger animation
  setShowSuccess(true);
  setTimeout(() => setShowSuccess(false), 1800);

  };

  if (loading) {
    return <p className="text-center mt-20 text-gray-500">Loading…</p>;
  }
  const handleAutoSave = async (field: string, value: string) => {
  const newForm = { ...form, [field]: value };
  setForm(newForm);

  // Save to Supabase
  await updateUserPreferences(newForm);

  // Update context instantly
  setPrefsLocal(newForm);

  // Show toast
  toast({
    title: "Saved ✓",
    description: `${field.replace("default_", "").replace("_", " ")} updated.`,
  });
};


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-3xl mx-auto px-4 py-10"
    >
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

      <SettingsSection
        title="Video Creation Defaults"
        description="These settings will automatically populate each time you start a new video project."
      >
        <SettingsSelect
          label="Default Voice"
          value={form.default_voice}
          options={["AI Voice", "Narrator", "Female Soft", "Male Deep"]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />

        <SettingsSelect
          label="Default Video Length"
          value={form.default_video_length}
          options={[
            "30 seconds",
            "60 seconds",
            "90 seconds",
            "2 minutes",
            "5 minutes",
            "10 minutes",
            "15 minutes",
            "20 minutes",
            "30 minutes",
          ]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />

        <SettingsSelect
          label="Default Style"
          value={form.default_style}
          options={[
            "modern",
            "cinematic",
            "documentary",
            "tiktok",
            "retro",
          ]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />

        <SettingsSelect
          label="Default Resolution"
          value={form.default_resolution}
          options={["720p", "1080p", "4K"]}
          onChange={(v) => setForm({ ...form, default_resolution: v })}
        />

        <SettingsSelect
          label="Default Language"
          value={form.default_language}
          options={["English", "Vietnamese", "Spanish", "Chinese", "Korean"]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />

        <SettingsSelect
          label="Default Tone"
          value={form.default_tone}
          options={[
            "friendly",
            "professional",
            "motivational",
            "serious",
            "fun",
          ]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />

        <SettingsSelect
          label="Default Music Style"
          value={form.default_music}
          options={[
            "ambient",
            "cinematic",
            "upbeat",
            "emotional",
            "minimal",
          ]}
          onChange={(v) => handleAutoSave("default_voice", v)}

        />
      </SettingsSection>

      <motion.button
        onClick={handleSave}
        disabled={saving}
        whileTap={{ scale: 0.97 }}
        className={`w-full py-3 text-white rounded-lg font-semibold mt-6 transition ${
          saving
            ? "bg-blue-300 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {saving ? "Saving..." : "Saved ✓"}

      </motion.button>
    {showSuccess && (
  <motion.div
    initial={{ opacity: 0, scale: 0.6, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.6 }}
    transition={{ duration: 0.25 }}
    className="flex justify-center mt-3"
  >
    <div className="flex items-center gap-2 text-green-600 font-medium">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 text-green-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span>Saved!</span>
    </div>
  </motion.div>
)}
</motion.div>
  );
}
