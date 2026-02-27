// ============================================================
// FILE: src/components/LanguageDubPanel.tsx  
// ============================================================
// 🆕 VOICE SELECT: Voice picker per language for ElevenLabs
// 🆕 BUTTON FIX: Re-remix button bigger and more visible
// Full replacement file — paste over existing LanguageDubPanel.tsx
// ============================================================

"use client";

import React, { useState, useEffect } from "react";

interface Language { code: string; name: string; nativeName: string; flag: string; youtubeAudience: string; }
interface VoiceProvider { key: string; name: string; icon: string; quality: number; costPer1kChars: number; speed: string; description: string; bestFor: string; requiresKey: string; available: boolean; }
interface DubRecord { id: string; language_code: string; language_name: string; language_flag: string; audio_url: string; status: string; created_at: string; voice_provider?: string; tts_cost_usd?: number; remix_video_url?: string | null; remix_status?: string | null; remix_error?: string | null; }
interface LanguageDubPanelProps { projectId: string; existingDubs: DubRecord[]; hasScript: boolean; hasVideo: boolean; authToken: string; }

// 🆕 VOICE SELECT: Voice options per language for ElevenLabs
interface VoiceOption { id: string; voiceId: string; name: string; gender: string; description: string; }

const ELEVENLABS_VOICE_OPTIONS: Record<string, VoiceOption[]> = {
  vi: [
    // Female voices (6)
    { id: "el-tham",       voiceId: "0ggMuQ1r9f9jqBu50nJn", name: "Thảm",        gender: "Female", description: "Native Vietnamese female" },
    { id: "el-thanh-f",    voiceId: "N0Z0aL8qHhzwUHwRBcVo", name: "Thanh",        gender: "Female", description: "Native Vietnamese female" },
    { id: "el-duyen",      voiceId: "DVQIYWzpAqd5qcoIlirg", name: "Duyên",        gender: "Female", description: "Native Vietnamese female" },
    { id: "el-ngan",       voiceId: "DvG3I1kDzdBY3u4EzYh6", name: "Ngân Nguyễn",  gender: "Female", description: "Native Vietnamese female" },
    { id: "el-hien",       voiceId: "jdlxsPOZOHdGEfcItXVu", name: "Hiền",         gender: "Female", description: "Native Vietnamese female" },
    { id: "el-trang",      voiceId: "ArosID24mP18TEiQpNhs", name: "Trang",        gender: "Female", description: "Native Vietnamese female" },
    // Male voices (6)
    { id: "el-tranthanh",  voiceId: "kPNz4WRTiKDplS7jAwHu", name: "Trấn Thành",   gender: "Male",   description: "Native Vietnamese male" },
    { id: "el-anh",        voiceId: "ywBZEqUhld86Jeajq94o", name: "Anh",          gender: "Male",   description: "Native Vietnamese male" },
    { id: "el-trieuduong", voiceId: "UsgbMVmY3U59ijwK5mdh", name: "Triệu Dương",  gender: "Male",   description: "Native Vietnamese male" },
    { id: "el-hoangdang",  voiceId: "ipTvfDXAg1zowfF1rv9w", name: "Hoàng Đăng",   gender: "Male",   description: "Native Vietnamese male" },
    { id: "el-nhat",       voiceId: "6adFm46eyy74snVn6YrT", name: "Nhật",         gender: "Male",   description: "Native Vietnamese male" },
    { id: "el-tung",       voiceId: "3VnrjnYrskPMDsapTr8X", name: "Tùng",         gender: "Male",   description: "Native Vietnamese male" },
  ],
  es: [
    { id: "lily-es",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive — great for Spanish" },
    { id: "george-es", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
    { id: "aria-es",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
  ],
  pt: [
    { id: "lily-pt",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive female" },
    { id: "george-pt", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  hi: [
    { id: "george-hi", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
    { id: "aria-hi",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
  ],
  fr: [
    { id: "lily-fr",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Elegant for French" },
    { id: "george-fr", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  de: [
    { id: "aria-de",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Professional — suits German" },
    { id: "george-de", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  ja: [
    { id: "aria-ja",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
    { id: "george-ja", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  ko: [
    { id: "aria-ko",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
    { id: "george-ko", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  ar: [
    { id: "george-ar", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
    { id: "aria-ar",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
  ],
  zh: [
    { id: "george-zh", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
    { id: "lily-zh",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive female" },
  ],
  id: [
    { id: "lily-id",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive female" },
    { id: "george-id", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  ],
  th: [
    { id: "george-th", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
    { id: "lily-th",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive female" },
  ],
};

const DEFAULT_VOICES: VoiceOption[] = [
  { id: "george-def", voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male",   description: "Warm male narrator" },
  { id: "lily-def",   voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   gender: "Female", description: "Warm expressive female" },
  { id: "aria-def",   voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria",   gender: "Female", description: "Clear professional female" },
];

const DUB_STEPS = [
  { key: "translate", label: "Translating script", icon: "📝" },
  { key: "tts", label: "Generating voice", icon: "🎙️" },
  { key: "upload", label: "Uploading audio", icon: "☁️" },
  { key: "captions", label: "Creating captions", icon: "💬" },
  { key: "done", label: "Complete!", icon: "✅" },
];

const REMIX_STEPS = [
  { key: "prepare", label: "Preparing dubbed audio + captions", icon: "📝" },
  { key: "bundle", label: "Bundling Remotion project", icon: "📦" },
  { key: "render", label: "Rendering video with native captions", icon: "🎬" },
  { key: "upload", label: "Uploading remixed video", icon: "☁️" },
  { key: "done", label: "Remix complete!", icon: "✅" },
];

function QualityStars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < count ? "text-yellow-400" : "text-gray-600"}>★</span>
      ))}
    </span>
  );
}

export default function LanguageDubPanel({ projectId, existingDubs, hasScript, hasVideo, authToken }: LanguageDubPanelProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [providers, setProviders] = useState<VoiceProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  const [dubs, setDubs] = useState<DubRecord[]>(existingDubs || []);
  const [generating, setGenerating] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingLanguages, setLoadingLanguages] = useState(true);

  // 🆕 VOICE SELECT
  const [selectedVoices, setSelectedVoices] = useState<Record<string, string>>({});
  const [showVoicePicker, setShowVoicePicker] = useState<string | null>(null);

  // Remix
  const [remixingDubId, setRemixingDubId] = useState<string | null>(null);
  const [remixStep, setRemixStep] = useState(0);
  const [remixError, setRemixError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects/generate-dub");
        const data = await res.json();
        if (data.languages) setLanguages(data.languages);
        if (data.providers) {
          setProviders(data.providers);
          const el = data.providers.find((p: VoiceProvider) => p.key === "elevenlabs" && p.available);
          const g = data.providers.find((p: VoiceProvider) => p.key === "google" && p.available);
          if (el) setSelectedProvider("elevenlabs");
          else if (g) setSelectedProvider("google");
          else setSelectedProvider("openai");
        }
      } catch { /**/ } finally { setLoadingLanguages(false); }
    })();
  }, []);

  useEffect(() => { if (existingDubs?.length) setDubs(existingDubs); }, [existingDubs]);

  const dubbedCodes = new Set(dubs.map((d) => d.language_code));

  function getVoiceOptions(langCode: string) { return ELEVENLABS_VOICE_OPTIONS[langCode] || DEFAULT_VOICES; }
  function getSelectedVoice(langCode: string) {
    const opts = getVoiceOptions(langCode);
    return opts.find((v) => v.id === selectedVoices[langCode]) || opts[0];
  }

  // ── Generate dub ──
  async function handleGenerate(langCode: string) {
    setError(null); setGenerating(langCode); setCurrentStep(0); setShowVoicePicker(null);
    try {
      const timer = setInterval(() => setCurrentStep((p) => Math.min(p + 1, DUB_STEPS.length - 2)), 4000);
      const voice = getSelectedVoice(langCode);
      const payload: any = { project_id: projectId, target_language: langCode, voice_provider: selectedProvider };
      if (selectedProvider === "elevenlabs" && voice) {
        payload.elevenlabs_voice_id = voice.voiceId;
        payload.elevenlabs_voice_name = voice.name;
      }
      const res = await fetch("/api/projects/generate-dub", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload),
      });
      clearInterval(timer);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); setGenerating(null); return; }
      setCurrentStep(DUB_STEPS.length - 1);
      if (data.dub) {
        setDubs((prev) => [...prev, {
          id: data.dub.id, language_code: data.dub.language_code, language_name: data.dub.language_name,
          language_flag: data.dub.language_flag, audio_url: data.dub.audio_url, status: "completed",
          created_at: new Date().toISOString(), voice_provider: data.dub.voice_provider,
          tts_cost_usd: data.dub.tts_cost_usd, remix_video_url: null, remix_status: null,
        }]);
      }
      setTimeout(() => { setGenerating(null); setCurrentStep(0); }, 2000);
    } catch (err: any) { setError(err?.message || "Error"); setGenerating(null); }
  }

  // ── Remix ──
  async function handleRemix(dubId: string) {
    setRemixError(null); setRemixingDubId(dubId); setRemixStep(0);
    try {
      const timer = setInterval(() => setRemixStep((p) => Math.min(p + 1, REMIX_STEPS.length - 2)), 15000);
      const res = await fetch("/api/projects/remix-dub", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ dub_id: dubId }),
      });
      clearInterval(timer);
      const data = await res.json();
      if (!res.ok) {
        setRemixError(data.error || "Remix failed");
        setDubs((p) => p.map((d) => d.id === dubId ? { ...d, remix_status: "error", remix_error: data.error } : d));
        setRemixingDubId(null); return;
      }
      setRemixStep(REMIX_STEPS.length - 1);
      setDubs((p) => p.map((d) => d.id === dubId ? { ...d, remix_video_url: data.remix.remix_video_url, remix_status: "completed", remix_error: null } : d));
      setTimeout(() => { setRemixingDubId(null); setRemixStep(0); }, 2000);
    } catch (err: any) { setRemixError(err?.message || "Remix failed"); setRemixingDubId(null); }
  }

  // ── Delete ──
  async function handleDelete(dubId: string, langName: string) {
    if (!confirm(`Delete the ${langName} dub? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/projects/delete-dub", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ dub_id: dubId }),
      });
      if (res.ok) setDubs((p) => p.filter((d) => d.id !== dubId));
      else { const data = await res.json().catch(() => ({})); setError(data?.error || "Failed"); }
    } catch { setError("Failed to delete"); }
  }

  const currentProvider = providers.find((p) => p.key === selectedProvider);
  const providerName = (key: string) => { const p = providers.find((pr) => pr.key === key); return p ? `${p.icon} ${p.name}` : key; };

  // ═══════════ RENDER ═══════════
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌍</span>
          <h3 className="text-lg font-semibold text-white">Multi-Language Dubbing</h3>
          <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">PRO</span>
        </div>
        {dubs.length > 0 && <span className="text-xs text-gray-500">{dubs.length} language{dubs.length !== 1 ? "s" : ""} dubbed</span>}
      </div>

      {!hasScript && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-sm text-yellow-300">
          ⚠️ Generate a video first to enable dubbing.
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          ❌ {error} <button onClick={() => setError(null)} className="ml-2 text-red-400 underline text-xs">dismiss</button>
        </div>
      )}
      {remixError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          ❌ Remix: {remixError} <button onClick={() => setRemixError(null)} className="ml-2 text-red-400 underline text-xs">dismiss</button>
        </div>
      )}

      {/* Provider Selector */}
      {hasScript && providers.length > 0 && !generating && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Voice Provider</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {providers.map((prov) => {
              const isSel = selectedProvider === prov.key;
              const isAvail = prov.available;
              return (
                <button key={prov.key} onClick={() => isAvail && setSelectedProvider(prov.key)} disabled={!isAvail}
                  className={`relative flex flex-col items-start p-3 rounded-lg border transition-all text-left ${
                    !isAvail ? "border-gray-700 bg-gray-800/20 opacity-40 cursor-not-allowed"
                    : isSel ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-500 cursor-pointer"
                  }`}>
                  {prov.key === "elevenlabs" && isAvail && (
                    <span className="absolute -top-2 -right-2 text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">BEST</span>
                  )}
                  <div className="flex items-center gap-1.5 mb-1.5"><span className="text-lg">{prov.icon}</span><span className="text-sm font-medium text-white">{prov.name}</span></div>
                  <div className="flex items-center gap-1.5 mb-1"><span className="text-[10px] text-gray-500">Quality:</span><QualityStars count={prov.quality} /></div>
                  <div className="flex items-center gap-1.5 mb-1"><span className="text-[10px] text-gray-500">Cost:</span>
                    <span className={`text-[11px] font-medium ${prov.costPer1kChars <= 0.02 ? "text-green-400" : prov.costPer1kChars <= 0.05 ? "text-yellow-400" : "text-orange-400"}`}>
                      ${prov.costPer1kChars.toFixed(3)}/1K chars</span></div>
                  <div className="flex items-center gap-1.5 mb-1.5"><span className="text-[10px] text-gray-500">Speed:</span><span className="text-[11px] text-gray-300">{prov.speed}</span></div>
                  <div className="text-[10px] text-gray-500 leading-tight">{prov.bestFor}</div>
                  {!isAvail && <div className="text-[9px] text-red-400 mt-1.5">⚠️ Add {prov.requiresKey}</div>}
                  {isSel && isAvail && <div className="absolute top-2 right-2"><span className="text-blue-400 text-sm">✓</span></div>}
                </button>
              );
            })}
          </div>
          {currentProvider && (
            <div className="mt-2 text-[11px] text-gray-500">
              <span className="text-gray-400">Selected:</span> <span className="text-white">{currentProvider.icon} {currentProvider.name}</span> — {currentProvider.description}
            </div>
          )}
        </div>
      )}

      {/* Dub Progress */}
      {generating && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-blue-300 mb-3">
            Dubbing to {languages.find((l) => l.code === generating)?.flag} {languages.find((l) => l.code === generating)?.name}
            {currentProvider && <span className="text-blue-400/60 ml-1">with {currentProvider.icon} {currentProvider.name}</span>}
            {selectedProvider === "elevenlabs" && generating && (
              <span className="text-purple-400/60 ml-1">• Voice: {getSelectedVoice(generating).name}</span>
            )}...
          </div>
          <div className="space-y-2">
            {DUB_STEPS.map((step, i) => (
              <div key={step.key} className={`flex items-center gap-2 text-xs transition-all duration-300 ${i < currentStep ? "text-green-400" : i === currentStep ? "text-blue-300 font-medium" : "text-gray-600"}`}>
                <span>{i < currentStep ? "✅" : i === currentStep ? "⏳" : "⬜"}</span><span>{step.icon} {step.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remix Progress */}
      {remixingDubId && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-purple-300 mb-3">
            🎬 Re-rendering with {dubs.find((d) => d.id === remixingDubId)?.language_flag} {dubs.find((d) => d.id === remixingDubId)?.language_name} audio + native captions...
          </div>
          <div className="space-y-2">
            {REMIX_STEPS.map((step, i) => (
              <div key={step.key} className={`flex items-center gap-2 text-xs transition-all duration-300 ${i < remixStep ? "text-green-400" : i === remixStep ? "text-purple-300 font-medium" : "text-gray-600"}`}>
                <span>{i < remixStep ? "✅" : i === remixStep ? "⏳" : "⬜"}</span><span>{step.icon} {step.label}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-500 mt-2">Full re-render — may take 1-3 minutes...</div>
        </div>
      )}

      {/* Completed Dubs */}
      {dubs.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Completed Dubs</div>
          <div className="space-y-3">
            {dubs.map((dub) => (
              <div key={dub.id} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{dub.language_flag}</span>
                    <span className="text-sm text-white">{dub.language_name}</span>
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">✓ Ready</span>
                    {dub.voice_provider && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        dub.voice_provider === "elevenlabs" ? "bg-purple-500/20 text-purple-300"
                        : dub.voice_provider === "google" ? "bg-blue-500/20 text-blue-300"
                        : "bg-gray-500/20 text-gray-400"
                      }`}>{providerName(dub.voice_provider)}</span>
                    )}
                    {dub.tts_cost_usd != null && dub.tts_cost_usd > 0 && (
                      <span className="text-[9px] text-gray-500">${dub.tts_cost_usd.toFixed(3)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dub.audio_url && <audio controls className="h-8" style={{ maxWidth: "180px" }}><source src={dub.audio_url} type="audio/mpeg" /></audio>}
                    {dub.audio_url && <a href={dub.audio_url} download={`dub-${dub.language_code}.mp3`} className="text-xs text-blue-400 hover:text-blue-300" title="Download audio">⬇️</a>}
                    <button onClick={() => handleDelete(dub.id, dub.language_name)} className="text-xs text-red-400 hover:text-red-300" title="Delete">🗑️</button>
                  </div>
                </div>

                {/* Remix Section */}
                <div className="border-t border-gray-700/50 px-3 py-3">
                  {/* Remix completed */}
                  {dub.remix_status === "completed" && dub.remix_video_url && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full font-medium">🎬 Remixed Video Ready</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => window.open(dub.remix_video_url!, "_blank")}
                            className="text-xs text-blue-400 hover:text-blue-300 underline">Open</button>
                          <button onClick={async () => {
                            try {
                              const r = await fetch(dub.remix_video_url!); const b = await r.blob();
                              const u = URL.createObjectURL(b); const a = document.createElement("a");
                              a.href = u; a.download = `${dub.language_code}-dubbed-video.mp4`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
                            } catch { window.open(dub.remix_video_url!, "_blank"); }
                          }} className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-500 font-semibold shadow-lg shadow-purple-500/20">
                            ⬇️ Download MP4
                          </button>
                          {/* 🆕 BUTTON FIX: Bigger, more visible re-remix button */}
                          <button onClick={() => handleRemix(dub.id)} disabled={!!remixingDubId}
                            className="text-sm bg-gray-700 text-gray-100 px-4 py-2 rounded-lg hover:bg-gray-600 font-semibold disabled:opacity-50 transition-colors shadow">
                            🔄 Re-Remix Latest
                          </button>
                        </div>
                      </div>
                      <video src={dub.remix_video_url} controls className="w-full rounded-lg border border-gray-600 max-h-[300px]" />
                    </div>
                  )}

                  {/* Remix in progress (from DB) */}
                  {dub.remix_status === "remixing" && remixingDubId !== dub.id && (
                    <div className="flex items-center gap-2 text-xs text-purple-300">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg> Remixing in progress...
                    </div>
                  )}

                  {/* Remix error */}
                  {dub.remix_status === "error" && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-red-400">❌ Remix failed{dub.remix_error ? `: ${dub.remix_error}` : ""}</span>
                      <button onClick={() => handleRemix(dub.id)} disabled={!!remixingDubId}
                        className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-500 font-semibold disabled:opacity-50">
                        🔄 Retry Remix
                      </button>
                    </div>
                  )}

                  {/* No remix yet */}
                  {!dub.remix_status && !dub.remix_video_url && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {hasVideo ? "Re-render video with dubbed audio + native captions → upload-ready MP4" : "⚠️ Render video first"}
                      </span>
                      <button onClick={() => handleRemix(dub.id)}
                        disabled={!hasVideo || !!remixingDubId || !!generating}
                        className={`text-sm font-semibold px-5 py-2.5 rounded-lg transition-all ${
                          !hasVideo || !!remixingDubId || !!generating
                            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                            : "bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                        }`}>
                        🎬 Remix Video
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Language Grid */}
      {loadingLanguages ? (
        <div className="text-sm text-gray-500 text-center py-4">Loading languages...</div>
      ) : (
        <div>
          <div className="text-xs font-medium text-gray-400 mb-2">{dubs.length > 0 ? "Add More Languages" : "Choose a Language"}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {languages.map((lang) => {
              const isDubbed = dubbedCodes.has(lang.code);
              const isGen = generating === lang.code;
              const isPicker = showVoicePicker === lang.code;
              const voiceOpts = getVoiceOptions(lang.code);
              const selVoice = getSelectedVoice(lang.code);

              return (
                <div key={lang.code} className="relative">
                  <button disabled={!hasScript || !!generating || isDubbed}
                    onClick={() => {
                      if (selectedProvider === "elevenlabs" && voiceOpts.length > 1 && !isDubbed) {
                        setShowVoicePicker(isPicker ? null : lang.code);
                      } else {
                        handleGenerate(lang.code);
                      }
                    }}
                    className={`w-full flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-center ${
                      isDubbed ? "border-green-500/30 bg-green-500/5 opacity-60 cursor-default"
                      : isGen ? "border-blue-500 bg-blue-500/10 animate-pulse"
                      : isPicker ? "border-purple-500 bg-purple-500/10"
                      : !hasScript || generating ? "border-gray-700 bg-gray-800/30 opacity-40 cursor-not-allowed"
                      : "border-gray-700 bg-gray-800/50 hover:border-blue-500 hover:bg-blue-500/5 cursor-pointer"
                    }`}>
                    <span className="text-xl">{lang.flag}</span>
                    <span className="text-xs font-medium text-white">{lang.name}</span>
                    <span className="text-[10px] text-gray-500">{lang.nativeName}</span>
                    {isDubbed && <span className="text-[9px] text-green-400">✓ Done</span>}
                    {!isDubbed && selectedProvider === "elevenlabs" && voiceOpts.length > 1 && (
                      <span className="text-[9px] text-purple-400 mt-0.5">🎙️ {selVoice.name} ({selVoice.gender}) ▾</span>
                    )}
                  </button>

                  {/* 🆕 VOICE SELECT: Dropdown picker */}
                  {isPicker && (
                    <div className="absolute z-20 top-full left-0 mt-1 bg-gray-800 border border-purple-500/50 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: "240px" }}>
                      <div className="px-3 py-2 border-b border-gray-700">
                        <div className="text-[11px] font-medium text-purple-300">🎙️ Choose voice for {lang.flag} {lang.name}</div>
                      </div>
                      {voiceOpts.map((v) => {
                        const isSel = selVoice.id === v.id;
                        return (
                          <button key={v.id} onClick={(e) => { e.stopPropagation(); setSelectedVoices((p) => ({ ...p, [lang.code]: v.id })); }}
                            className={`w-full text-left px-3 py-2.5 hover:bg-gray-700/50 transition-colors ${isSel ? "bg-purple-500/10" : ""}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-medium text-white">{v.name}</span>
                                <span className={`text-[9px] ml-1.5 px-1.5 py-0.5 rounded ${v.gender === "Male" ? "bg-blue-500/20 text-blue-300" : "bg-pink-500/20 text-pink-300"}`}>{v.gender}</span>
                              </div>
                              {isSel && <span className="text-purple-400 text-xs">✓</span>}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">{v.description}</div>
                          </button>
                        );
                      })}
                      <div className="border-t border-gray-700 p-2">
                        <button onClick={(e) => { e.stopPropagation(); setShowVoicePicker(null); handleGenerate(lang.code); }}
                          className="w-full bg-purple-600 text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-purple-500 transition-colors">
                          🎙️ Dub with {selVoice.name} ({selVoice.gender})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
            <div className="text-[11px] text-gray-500 text-center">
              💡 Dubbing into Spanish, Portuguese, and Hindi alone reaches <b className="text-gray-300">1.4 billion+</b> additional viewers
            </div>
          </div>
        </div>
      )}
    </div>
  );
}