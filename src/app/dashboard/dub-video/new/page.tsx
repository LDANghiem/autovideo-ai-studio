// ============================================================
// FILE: src/app/dashboard/dub-video/new/page.tsx
// ============================================================
// "Dub Any Video" — 3 source modes:
//   [A] YouTube URL (full video)
//   [B] Partial Dub (YouTube URL + time range)
//   [C] Upload Video (drag & drop local file)
//
// All modes share: language picker, voice picker, caption style,
// original audio toggle, and submit button.
// ============================================================

"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

/* ============================================================
   LANGUAGE + VOICE DATABASE
============================================================ */
const LANGUAGES: {
  code: string;
  name: string;
  flag: string;
  voices: { id: string; name: string; gender: string }[];
}[] = [
  {
    code: "vi", name: "Vietnamese", flag: "🇻🇳",
    voices: [
      { id: "DvG3I1kDzdBY3u4EzYh6", name: "Ngân Nguyễn", gender: "Female" },
      { id: "0ggMuQ1r9f9jqBu50nJn", name: "Thảm", gender: "Female" },
      { id: "N0Z0aL8qHhzwUHwRBcVo", name: "Thanh", gender: "Female" },
      { id: "DVQIYWzpAqd5qcoIlirg", name: "Duyên", gender: "Female" },
      { id: "jdlxsPOZOHdGEfcItXVu", name: "Hiền", gender: "Female" },
      { id: "ArosID24mP18TEiQpNhs", name: "Trang", gender: "Female" },
      { id: "UsgbMVmY3U59ijwK5mdh", name: "Triệu Dương", gender: "Male" },
      { id: "ywBZEqUhld86Jeajq94o", name: "Anh", gender: "Male" },
      { id: "kPNz4WRTiKDplS7jAwHu", name: "Trấn Thành", gender: "Male" },
      { id: "ipTvfDXAg1zowfF1rv9w", name: "Hoàng Đăng", gender: "Male" },
      { id: "6adFm46eyy74snVn6YrT", name: "Nhật", gender: "Male" },
      { id: "3VnrjnYrskPMDsapTr8X", name: "Tùng", gender: "Male" },
    ],
  },
  {
    code: "en", name: "English", flag: "🇺🇸",
    voices: [
      { id: "ZF6FPAbjXT4488VcRRnw", name: "Amelia", gender: "Female" },
      { id: "kPzsL2i3teMYv0FxEYQ6", name: "Brittney", gender: "Female" },
      { id: "tnSpp4vdxKPjI9w0GnoV", name: "Hope", gender: "Female" },
      { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", gender: "Male" },
      { id: "1SM7GgM6IMuvQlz2BwM3", name: "Mark C.", gender: "Male" },
      { id: "j9jfwdrw7BRfcR43Qohk", name: "Frederick", gender: "Male" },
    ],
  },
  {
    code: "es", name: "Spanish", flag: "🇪🇸",
    voices: [
      { id: "CaJslL1xziwefCeTNzHv", name: "Cristina", gender: "Female" },
      { id: "kcQkGnn0HAT2JRDQ4Ljp", name: "Norah", gender: "Female" },
      { id: "qHkrJuifPpn95wK3rm2A", name: "Andrea", gender: "Female" },
      { id: "dlGxemPxFMTY7iXagmOj", name: "Fernando", gender: "Male" },
      { id: "l1zE9xgNpUTaQCZzpNJa", name: "Alberto", gender: "Male" },
      { id: "9F4C8ztpNUmXkdDDbz3J", name: "Dan", gender: "Male" },
    ],
  },
  {
    code: "fr", name: "French", flag: "🇫🇷",
    voices: [
      { id: "McVZB9hVxVSk3Equu8EH", name: "Audrey", gender: "Female" },
      { id: "6vTyAgAT8PncODBcLjRf", name: "Claire", gender: "Female" },
      { id: "txtf1EDouKke753vN8SL", name: "Jeanne", gender: "Female" },
      { id: "aQROLel5sQbj1vuIVi6B", name: "Nicolas", gender: "Male" },
      { id: "NyxenPOqNyllHIzSoPbJ", name: "Theo", gender: "Male" },
      { id: "ohItIVrXTBI80RrUECOD", name: "Guillaume", gender: "Male" },
    ],
  },
  {
    code: "pt", name: "Portuguese", flag: "🇧🇷",
    voices: [
      { id: "33B4UnXyTNbgLmdEDh5P", name: "Keren", gender: "Female" },
      { id: "MZxV5lN3cv7hi1376O0m", name: "Ana Dias", gender: "Female" },
      { id: "r2fkFV8WAqXq2AqBpgJT", name: "Amandoca", gender: "Female" },
      { id: "WFSxKvz27RguNRD3Phoq", name: "Wesley", gender: "Male" },
      { id: "NGS0ZsC7j4t4dCWbPdgO", name: "Dhyogo", gender: "Male" },
      { id: "CstacWqMhJQlnfLPxRG4", name: "Will", gender: "Male" },
    ],
  },
  {
    code: "de", name: "German", flag: "🇩🇪",
    voices: [
      { id: "v3V1d2rk6528UrLKRuy8", name: "Susi", gender: "Female" },
      { id: "7eVMgwCnXydb3CikjV7a", name: "Lea", gender: "Female" },
      { id: "K75lPKuh15SyVhQC1LrE", name: "Carola", gender: "Female" },
      { id: "FTNCalFNG5bRnkkaP5Ug", name: "Otto", gender: "Male" },
      { id: "r8MyP4qUsq5WFFSkPdfV", name: "Johannes", gender: "Male" },
      { id: "bAFkvitDGeDMmqo9gJzO", name: "Niander", gender: "Male" },
    ],
  },
  {
    code: "it", name: "Italian", flag: "🇮🇹",
    voices: [
      { id: "gfKKsLN1k0oYYN9n2dXX", name: "Violetta", gender: "Female" },
      { id: "3DPhHWXDY263XJ1d2EPN", name: "Linda", gender: "Female" },
      { id: "fQmr8dTaOQq116mo2X7F", name: "Samanta", gender: "Female" },
      { id: "W71zT1VwIFFx3mMGH2uZ", name: "Marco T.", gender: "Male" },
      { id: "fzDFBB4mgvMlL36gPXcz", name: "Giovanni", gender: "Male" },
      { id: "13Cuh3NuYvWOVQtLbRN8", name: "Marco", gender: "Male" },
    ],
  },
  {
    code: "zh", name: "Chinese", flag: "🇨🇳",
    voices: [
      { id: "ByhETIclHirOlWnWKhHc", name: "Shan Shan", gender: "Female" },
      { id: "hkfHEbBvdQFNX4uWHqRF", name: "Stacy", gender: "Female" },
      { id: "9lHjugDhwqoxA5MhX0az", name: "Anna Su", gender: "Female" },
      { id: "4VZIsMPtgggwNg7OXbPY", name: "James Gao", gender: "Male" },
      { id: "WuLq5z7nEcrhppO0ZQJw", name: "Martin Li", gender: "Male" },
      { id: "BrbEfHMQu0fyclQR7lfh", name: "Kevin Tu", gender: "Male" },
    ],
  },
  {
    code: "ja", name: "Japanese", flag: "🇯🇵",
    voices: [
      { id: "8EkOjt4xTPGMclNlh1pk", name: "Morioki", gender: "Female" },
      { id: "RBnMinrYKeccY3vaUxlZ", name: "Sakura", gender: "Female" },
      { id: "4lOQ7A2l7HPuG7UIHiKA", name: "Kyoko", gender: "Female" },
      { id: "3JDquces8E8bkmvbh6Bc", name: "Otani", gender: "Male" },
      { id: "j210dv0vWm7fCknyQpbA", name: "Hinata", gender: "Male" },
      { id: "Mv8AjrYZCBkdsmDHNwcB", name: "Ishibashi", gender: "Male" },
    ],
  },
  {
    code: "ko", name: "Korean", flag: "🇰🇷",
    voices: [
      { id: "uyVNoMrnUku1dZyVEXwD", name: "Anna Kim", gender: "Female" },
      { id: "z6Kj0hecH20CdetSElRT", name: "Jennie", gender: "Female" },
      { id: "ksaI0TCD9BstzEzlxj4q", name: "Seulki", gender: "Female" },
      { id: "ZJCNdZEjYwkOElxugmW2", name: "Hyuk", gender: "Male" },
      { id: "jB1Cifc2UQbq1gR3wnb0", name: "Bin", gender: "Male" },
      { id: "PDoCXqBQFGsvfO0hNkEs", name: "Chris", gender: "Male" },
    ],
  },
  {
    code: "hi", name: "Hindi", flag: "🇮🇳",
    voices: [
      { id: "KYiVPerWcenyBTIvWbfY", name: "Sia", gender: "Female" },
      { id: "gHu9GtaHOXcSqFTK06ux", name: "Anjali", gender: "Female" },
      { id: "2bNrEsM0omyhLiEyOwqY", name: "Monika", gender: "Female" },
      { id: "zT03pEAEi0VHKciJODfn", name: "Raju", gender: "Male" },
      { id: "zgqefOY5FPQ3bB7OZTVR", name: "Niraj", gender: "Male" },
      { id: "iWNf11sz1GrUE4ppxTOL", name: "Viraj", gender: "Male" },
    ],
  },
  {
    code: "ar", name: "Arabic", flag: "🇸🇦",
    voices: [
      { id: "u0TsaWvt0v8migutHM3M", name: "Ghizlane", gender: "Female" },
      { id: "mRdG9GYEjJmIzqbYTidv", name: "Sana", gender: "Female" },
      { id: "a1KZUXKFVFDOb33I1uqr", name: "Salma", gender: "Female" },
      { id: "LXrTqFIgiubkrMkwvOUr", name: "Masry", gender: "Male" },
      { id: "A9ATTqUUQ6GHu0coCz8t", name: "Hamid", gender: "Male" },
      { id: "JjTirzdD7T3GMLkwdd3a", name: "Hamida", gender: "Male" },
    ],
  },
  {
    code: "ru", name: "Russian", flag: "🇷🇺",
    voices: [
      { id: "ymDCYd8puC7gYjxIamPt", name: "Marina", gender: "Female" },
      { id: "EDpEYNf6XIeKYRzYcx4I", name: "Mariia", gender: "Female" },
      { id: "AB9XsbSA4eLG12t2myjN", name: "Larisa", gender: "Female" },
      { id: "gJEfHTTiifXEDmO687lC", name: "Prince Nur", gender: "Male" },
      { id: "3EuKHIEZbSzrHGNmdYsx", name: "Nikolay", gender: "Male" },
      { id: "txnCCHHGKmYIwrn7HfHQ", name: "Alexandr", gender: "Male" },
    ],
  },
  {
    code: "id", name: "Indonesian", flag: "🇮🇩",
    voices: [
      { id: "iWydkXKoiVtvdn4vLKp9", name: "Cahaya", gender: "Female" },
      { id: "I7sakys8pBZ1Z5f0UhT9", name: "Putri", gender: "Female" },
      { id: "gmnazjXOFoOcWA59sd5m", name: "Kira", gender: "Female" },
      { id: "X8n8hOy3e8VLQnHTUcc5", name: "Bram", gender: "Male" },
      { id: "RWiGLY9uXI70QL540WNd", name: "Putra", gender: "Male" },
      { id: "TMvmhlKUioQA4U7LOoko", name: "Andi", gender: "Male" },
    ],
  },
  {
    code: "pl", name: "Polish", flag: "🇵🇱",
    voices: [
      { id: "N0GCuK2B0qwWozQNTS8F", name: "Magdalena", gender: "Female" },
      { id: "W0sqKm1Sfw1EzlCH14FQ", name: "Beata", gender: "Female" },
      { id: "OOTZSkkPGHD1csczSCmT", name: "Lena", gender: "Female" },
      { id: "hIssydxXZ1WuDorjx6Ic", name: "Adam", gender: "Male" },
      { id: "W3ryZpL8gFeUBUllKisa", name: "Maciej", gender: "Male" },
      { id: "H5xTcsAIeS5RAykjz57a", name: "Alex", gender: "Male" },
    ],
  },
  {
    code: "nl", name: "Dutch", flag: "🇳🇱",
    voices: [
      { id: "SXBL9NbvTrjsJQYay2kT", name: "Melanie", gender: "Female" },
      { id: "YUdpWWny7k5yb4QCeweX", name: "Ruth", gender: "Female" },
      { id: "ANHrhmaFeVN0QJaa0PhL", name: "Petra", gender: "Female" },
      { id: "AVIlLDn2TVmdaDycgbo3", name: "Eric", gender: "Male" },
      { id: "UNBIyLbtFB9k7FKW8wJv", name: "Serge", gender: "Male" },
      { id: "s7Z6uboUuE4Nd8Q2nye6", name: "Hans", gender: "Male" },
    ],
  },
  {
    code: "tr", name: "Turkish", flag: "🇹🇷",
    voices: [
      { id: "KbaseEXyT9EE0CQLEfbB", name: "Belma", gender: "Female" },
      { id: "PdYVUd1CAGSXsTvZZTNn", name: "Mia", gender: "Female" },
      { id: "EJGs6dWlD5VrB3llhBqB", name: "Cicek", gender: "Female" },
      { id: "IuRRIAcbQK5AQk1XevPj", name: "Doga", gender: "Male" },
      { id: "7VqWGAWwo2HMrylfKrcm", name: "Fatih", gender: "Male" },
      { id: "J17lijyP1BHYcM7ld0Rg", name: "Adam", gender: "Male" },
    ],
  },
  {
    code: "sv", name: "Swedish", flag: "🇸🇪",
    voices: [
      { id: "aSLKtNoVBZlxQEMsnGL2", name: "Sanna", gender: "Female" },
      { id: "4xkUqaR9MYOJHoaC1Nak", name: "Sanna D.", gender: "Female" },
      { id: "4Ct5uMEndw4cJ7q0Jx0l", name: "Elin", gender: "Female" },
      { id: "x0u3EW21dbrORJzOq1m9", name: "Adam", gender: "Male" },
      { id: "6eknYWL7D5Z4nRkDy15t", name: "Tommy", gender: "Male" },
      { id: "e6OiUVixGLmvtdn2GJYE", name: "Jonas", gender: "Male" },
    ],
  },
];

/* ── Source mode type ──────────────────────────────────────── */
type SourceMode = "youtube" | "partial" | "upload";

/* ============================================================
   Page Component
============================================================ */
export default function DubVideoNewPage() {
  const router = useRouter();

  // Source mode
  const [sourceMode, setSourceMode] = useState<SourceMode>("youtube");

  // YouTube URL (for youtube + partial modes)
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<{ title: string; thumbnail: string; duration?: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Partial dub time range
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Upload mode
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Shared settings
  const [langCode, setLangCode] = useState("vi");
  const [voiceId, setVoiceId] = useState("");
  const [captionStyle, setCaptionStyle] = useState("block");
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [originalVolume, setOriginalVolume] = useState(0.15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedLang = useMemo(
    () => LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0],
    [langCode]
  );
  const voices = selectedLang.voices;
  const selectedVoice = voices.find((v) => v.id === voiceId);

  useEffect(() => {
    if (voices.length > 0 && !voices.find((v) => v.id === voiceId)) {
      setVoiceId(voices[0].id);
    }
  }, [langCode, voices, voiceId]);

  useEffect(() => {
    const lang = LANGUAGES.find((l) => l.code === langCode);
    if (lang && lang.voices.length > 0 && !voiceId) {
      setVoiceId(lang.voices[0].id);
    }
  }, []);

  /* ── YouTube preview fetch ───────────────────────────────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!url || sourceMode === "upload") { setPreview(null); return; }
      const ytMatch = url.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      if (!ytMatch) return;
      setLoadingPreview(true);
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setPreview({ title: data.title, thumbnail: data.thumbnail_url });
        })
        .catch(() => {})
        .finally(() => setLoadingPreview(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [url, sourceMode]);

  /* ── Parse time string "MM:SS" to seconds ────────────────── */
  function parseTimeToSeconds(timeStr: string): number | null {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const num = Number(timeStr);
    return isNaN(num) ? null : num;
  }

  /* ── File upload to Supabase ─────────────────────────────── */
  async function handleFileUpload(file: File) {
    if (file.size > 1024 * 1024 * 1024) {
      setError("File too large. Maximum 1GB.");
      return;
    }

    const validTypes = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|webm|avi|mkv)$/i)) {
      setError("Unsupported file type. Use MP4, MOV, WEBM, AVI, or MKV.");
      return;
    }

    setUploadFile(file);
    setUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

      // Simulate progress (Supabase JS client doesn't support upload progress natively)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 3, 90));
      }, 500);

      const { data, error: uploadErr } = await supabase.storage
        .from("dub-uploads")
        .upload(fileName, file, {
          contentType: file.type || "video/mp4",
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from("dub-uploads").getPublicUrl(fileName);
      setUploadedUrl(urlData?.publicUrl || null);
      setUploadProgress(100);
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setUploadFile(null);
    } finally {
      setUploading(false);
    }
  }

  /* ── Drag & Drop handlers ────────────────────────────────── */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, []);

  /* ── Submit ──────────────────────────────────────────────── */
  async function handleSubmit() {
    setError("");

    // Validate based on mode
    if (sourceMode === "upload") {
      if (!uploadedUrl) { setError("Please upload a video file first."); return; }
    } else {
      if (!url) { setError("Please enter a YouTube URL."); return; }
    }

    if (sourceMode === "partial") {
      const startSec = parseTimeToSeconds(startTime);
      const endSec = parseTimeToSeconds(endTime);
      if (startSec === null || endSec === null) {
        setError("Please enter valid start and end times (MM:SS format).");
        return;
      }
      if (endSec <= startSec) {
        setError("End time must be after start time.");
        return;
      }
      if (endSec - startSec < 10) {
        setError("Segment must be at least 10 seconds long.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError("Not logged in. Please log in again."); setSubmitting(false); return; }

      // Build the source URL — either YouTube or uploaded file
      const sourceUrl = sourceMode === "upload" ? uploadedUrl! : url;
      const sourceType = sourceMode === "upload" ? "upload" : "youtube";

      // Parse time range for partial mode
      const startSec = sourceMode === "partial" ? parseTimeToSeconds(startTime) : null;
      const endSec = sourceMode === "partial" ? parseTimeToSeconds(endTime) : null;

      const createRes = await fetch("/api/dub-video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source_url: sourceUrl,
          source_type: sourceType,
          target_language: selectedLang.name,
          target_language_code: selectedLang.code,
          voice_id: voiceId,
          voice_name: selectedVoice?.name || "",
          caption_style: captionStyle,
          keep_original_audio: keepOriginal,
          original_audio_volume: originalVolume,
          // Partial dub fields
          start_time: startSec,
          end_time: endSec,
          // Upload metadata
          uploaded_file_name: sourceMode === "upload" ? uploadFile?.name : null,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to create project");

      const projectId = createData.project.id;
      const startRes = await fetch("/api/dub-video/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Failed to start dubbing");
      router.push(`/dashboard/dub-video/${projectId}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Can submit? ─────────────────────────────────────────── */
  const canSubmit = sourceMode === "upload"
    ? !!uploadedUrl && !submitting
    : !!url && !submitting;

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition">← Back</Link>
          <div>
            <h1 className="text-2xl font-bold">🎬 Dub Any Video</h1>
            <p className="text-sm text-gray-400">Auto-detect any language & dub into 18 languages</p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            SOURCE MODE SELECTOR — 3 tabs
        ════════════════════════════════════════════════════ */}
        <section className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Source</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { mode: "youtube" as SourceMode, icon: "🔗", label: "YouTube URL", desc: "Paste any YouTube link" },
              { mode: "partial" as SourceMode, icon: "✂️", label: "Partial Dub", desc: "Dub a specific time range" },
              { mode: "upload" as SourceMode, icon: "📤", label: "Upload Video", desc: "Upload your own file" },
            ]).map(({ mode, icon, label, desc }) => {
              const isSelected = sourceMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => { setSourceMode(mode); setError(""); }}
                  className="p-3 rounded-xl text-left transition-all duration-200"
                  style={isSelected ? {
                    border: "2px solid #8b5cf6",
                    background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(109,40,217,0.08) 100%)",
                    boxShadow: "0 0 20px rgba(139,92,246,0.2)",
                  } : {
                    border: "1px solid #374151",
                    background: "rgba(31,41,55,0.4)",
                  }}
                >
                  <div className="text-lg mb-1">{icon}</div>
                  <div className="text-sm font-semibold" style={{ color: isSelected ? "#c4b5fd" : "#d1d5db" }}>{label}</div>
                  <div className="text-[10px]" style={{ color: isSelected ? "#a78bfa" : "#6b7280" }}>{desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            SOURCE INPUT — changes based on mode
        ════════════════════════════════════════════════════ */}

        {/* YouTube URL (for youtube + partial modes) */}
        {(sourceMode === "youtube" || sourceMode === "partial") && (
          <section className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">YouTube URL</label>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=... or youtube.com/shorts/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            {loadingPreview && (
              <div className="mt-3 p-3 bg-gray-800/50 rounded-lg text-gray-400 text-sm">Loading preview...</div>
            )}
            {preview && (
              <div className="mt-3 flex gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <img src={preview.thumbnail} alt="" className="w-32 h-20 object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{preview.title}</p>
                  <p className="text-xs text-green-400 mt-1">✓ Video found</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Partial Dub — Time Range Inputs */}
        {sourceMode === "partial" && (
          <section className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">⏱ Time Range to Dub</label>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                <input
                  type="text"
                  placeholder="0:00"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center text-lg font-mono"
                />
              </div>
              <span className="text-gray-500 text-2xl mt-5">→</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">End Time</label>
                <input
                  type="text"
                  placeholder="5:30"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center text-lg font-mono"
                />
              </div>
            </div>
            {startTime && endTime && (() => {
              const s = parseTimeToSeconds(startTime);
              const e = parseTimeToSeconds(endTime);
              if (s !== null && e !== null && e > s) {
                const dur = e - s;
                return (
                  <p className="mt-2 text-xs text-violet-400">
                    Dubbing {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, "0")} of video — saves time & ElevenLabs credits
                  </p>
                );
              }
              return null;
            })()}
            <p className="mt-2 text-[10px] text-gray-600">Format: MM:SS (e.g., 2:30 for 2 minutes 30 seconds) or H:MM:SS for longer videos</p>
          </section>
        )}

        {/* Upload Video — Drag & Drop Zone */}
        {sourceMode === "upload" && (
          <section className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">📤 Upload Your Video</label>

            {!uploadFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200"
                style={{
                  borderColor: dragOver ? "#8b5cf6" : "#374151",
                  background: dragOver ? "rgba(139,92,246,0.08)" : "rgba(31,41,55,0.3)",
                }}
              >
                <div className="text-4xl mb-3">{dragOver ? "📥" : "🎬"}</div>
                <p className="text-sm text-gray-300 font-medium mb-1">
                  {dragOver ? "Drop your video here" : "Drag & drop video file here"}
                </p>
                <p className="text-xs text-gray-500 mb-3">or click to browse</p>
                <p className="text-[10px] text-gray-600">MP4, MOV, WEBM, AVI, MKV — up to 1GB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,.mp4,.mov,.webm,.avi,.mkv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
            ) : (
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🎬</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{uploadFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  {uploadedUrl && (
                    <span className="text-xs text-green-400 font-medium">✓ Uploaded</span>
                  )}
                  <button
                    onClick={() => {
                      setUploadFile(null);
                      setUploadedUrl(null);
                      setUploadProgress(0);
                    }}
                    className="text-gray-500 hover:text-red-400 transition text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* Upload progress bar */}
                {(uploading || (uploadProgress > 0 && uploadProgress < 100)) && (
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${uploadProgress}%`,
                        background: "linear-gradient(90deg, #8b5cf6, #6366f1)",
                      }}
                    />
                  </div>
                )}
                {uploading && (
                  <p className="text-xs text-violet-400 mt-2">Uploading... {uploadProgress}%</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ════════════════════════════════════════════════════
            TARGET LANGUAGE
        ════════════════════════════════════════════════════ */}
        <section className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Dub Into — {selectedLang.flag} {selectedLang.name}
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {LANGUAGES.map((lang) => {
              const isSelected = langCode === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => setLangCode(lang.code)}
                  className="p-2 rounded-lg text-center transition-all duration-300 text-sm"
                  style={isSelected ? {
                    border: "2px solid #f472b6",
                    background: "linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(244,114,182,0.1) 100%)",
                    boxShadow: "0 0 16px rgba(236,72,153,0.3)",
                    color: "#ffffff",
                  } : {
                    border: "1px solid #374151",
                    background: "rgba(31,41,55,0.5)",
                    color: "#d1d5db",
                  }}
                >
                  <div className="text-lg">{lang.flag}</div>
                  <div className="text-xs truncate" style={{ color: isSelected ? "#fbcfe8" : "#9ca3af" }}>
                    {lang.name}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════
            VOICE PICKER
        ════════════════════════════════════════════════════ */}
        <section className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Voice — {selectedLang.flag} {voices.length} {selectedLang.name} narrator{voices.length > 1 ? "s" : ""}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {voices.map((voice) => {
              const isSelected = voiceId === voice.id;
              return (
                <button
                  key={voice.id}
                  onClick={() => setVoiceId(voice.id)}
                  className="p-3 rounded-lg text-left transition-all duration-300"
                  style={isSelected ? {
                    border: "2px solid #34d399",
                    background: "linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(16,185,129,0.1) 100%)",
                    boxShadow: "0 0 16px rgba(34,197,94,0.3)",
                    color: "#ffffff",
                  } : {
                    border: "1px solid #374151",
                    background: "rgba(31,41,55,0.5)",
                    color: "#d1d5db",
                  }}
                >
                  <div className="font-medium text-sm" style={{ color: isSelected ? "#ffffff" : "#d1d5db" }}>
                    {voice.name}
                  </div>
                  <div className="text-xs" style={{ color: isSelected ? "#a7f3d0" : "#9ca3af" }}>
                    {voice.gender}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Caption Style */}
        <section className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Caption Style</label>
          <div className="flex gap-3">
            {(["block", "karaoke"] as const).map((style) => {
              const isSelected = captionStyle === style;
              return (
                <button
                  key={style}
                  onClick={() => setCaptionStyle(style)}
                  className="flex-1 p-3 rounded-lg text-center transition-all duration-300"
                  style={isSelected ? {
                    border: "2px solid #60a5fa",
                    background: "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(99,102,241,0.1) 100%)",
                    boxShadow: "0 0 14px rgba(59,130,246,0.25)",
                    color: "#ffffff",
                  } : {
                    border: "1px solid #374151",
                    background: "rgba(31,41,55,0.5)",
                    color: "#d1d5db",
                  }}
                >
                  <div className="font-medium text-sm" style={{ color: isSelected ? "#ffffff" : "#d1d5db" }}>
                    {style === "block" ? "Block" : "Karaoke"}
                  </div>
                  <div className="text-xs" style={{ color: isSelected ? "#bfdbfe" : "#9ca3af" }}>
                    {style === "block" ? "Bottom subtitles" : "Word-by-word highlight"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Original Audio Toggle + Volume */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Keep Original Audio (Background)</label>
            <button
              onClick={() => setKeepOriginal(!keepOriginal)}
              className={`relative w-11 h-6 rounded-full transition ${keepOriginal ? "bg-blue-500" : "bg-gray-600"}`}
              style={{ border: "none", boxShadow: "none" }}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${keepOriginal ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {keepOriginal && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Muted</span>
                <span>{Math.round(originalVolume * 100)}%</span>
                <span>Full</span>
              </div>
              <input
                type="range" min={0} max={0.5} step={0.05}
                value={originalVolume}
                onChange={(e) => setOriginalVolume(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-normal text-xl tracking-wide transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: !canSubmit ? "#252040" : "#5b21b6",
            border: !canSubmit ? "1px solid #3a3555" : "1px solid rgba(167,139,250,0.6)",
            boxShadow: !canSubmit ? "none" : "0 0 24px rgba(91,33,182,0.35)",
            color: !canSubmit ? "#5a5070" : "#ffffff",
          }}
        >
          {submitting
            ? "✨ Creating..."
            : sourceMode === "partial"
              ? <>✂️ Dub Segment into {selectedLang.flag} {selectedLang.name}</>
              : sourceMode === "upload"
                ? <>📤 Dub Uploaded Video into {selectedLang.flag} {selectedLang.name}</>
                : <>🚀 Start Dubbing into {selectedLang.flag} {selectedLang.name}</>}
        </button>

        <p className="text-xs text-gray-500 mt-4 text-center">
          By using this feature, you confirm you have the rights to dub this content.
        </p>

        {/* Copyright Guidance */}
        <div
          className="mt-4 rounded-xl p-4"
          style={{
            background: "rgba(251,191,36,0.04)",
            border: "1px solid rgba(251,191,36,0.15)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <span className="text-sm mt-0.5">⚠️</span>
            <div>
              <p className="text-[11px] font-semibold text-yellow-300/90 mb-1.5">Copyright &amp; YouTube Policy Notice</p>
              <ul className="text-[10px] text-gray-400 space-y-1.5 leading-relaxed">
                <li>
                  <span className="text-green-400 font-bold">✅ Safe:</span>{" "}
                  Dubbing <strong className="text-gray-300">your own videos</strong> into other languages for global reach.
                </li>
                <li>
                  <span className="text-green-400 font-bold">✅ Safe:</span>{" "}
                  Dubbing content you have <strong className="text-gray-300">written permission</strong> to translate.
                </li>
                <li>
                  <span className="text-yellow-400 font-bold">⚡ Caution:</span>{" "}
                  Dubbing others&apos; content with <strong className="text-gray-300">substantial added value</strong> — commentary, new visuals, on-camera hosting.
                </li>
                <li>
                  <span className="text-red-400 font-bold">🚫 Not allowed:</span>{" "}
                  Simply dubbing someone else&apos;s video into another language and reuploading.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
