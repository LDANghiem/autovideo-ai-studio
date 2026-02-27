// ============================================================
// fetch-voices.mjs — Query ElevenLabs API for top voices per language
// 
// USAGE:
//   node scripts/fetch-voices.mjs
//
// REQUIRES:
//   ELEVENLABS_API_KEY in .env or as environment variable
//
// OUTPUT:
//   1. Console: formatted voice list per language
//   2. File: voices-output.json (full data)
//   3. File: languages-array.txt (ready to paste into page.tsx)
//
// NOTE: Vietnamese voices are PRESERVED (hand-picked already).
//       Only other languages are queried from ElevenLabs API.
// ============================================================

import "dotenv/config";
import fs from "fs";

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing ELEVENLABS_API_KEY in .env");
  process.exit(1);
}

// ── Hand-picked Vietnamese voices (DO NOT REPLACE) ──────────
const VIETNAMESE_VOICES = {
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
};

// Languages to query from ElevenLabs API (Vietnamese excluded)
const LANGUAGES_TO_FETCH = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "tl", name: "Filipino", flag: "🇵🇭" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "sv", name: "Swedish", flag: "🇸🇪" },
];

const VOICES_PER_LANG = 6; // Target: 3 female + 3 male

async function fetchSharedVoices(language) {
  const url = `https://api.elevenlabs.io/v1/shared-voices?language=${language}&page_size=50&sort=usage_character_count_1y&sort_direction=desc`;
  
  const res = await fetch(url, {
    headers: { "xi-api-key": API_KEY },
  });

  if (!res.ok) {
    console.warn(`  ⚠️ API error for ${language}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.voices || [];
}

async function main() {
  console.log("🎙️  ElevenLabs Voice Finder");
  console.log("═══════════════════════════════════════");
  console.log("📌 Vietnamese: SKIPPED (using 12 hand-picked voices)");
  console.log(`🔍 Fetching voices for ${LANGUAGES_TO_FETCH.length} other languages...\n`);

  const results = {};

  // Add Vietnamese first (hand-picked, not queried)
  results["vi"] = { ...VIETNAMESE_VOICES, totalFound: 12 };

  for (const lang of LANGUAGES_TO_FETCH) {
    process.stdout.write(`🔍 ${lang.flag} ${lang.name} (${lang.code})...`);

    const voices = await fetchSharedVoices(lang.code);

    const filtered = voices
      .filter(v => v.name && v.voice_id)
      .map(v => ({
        id: v.voice_id,
        name: v.name,
        gender: v.gender || "Unknown",
        accent: v.accent || "",
        age: v.age || "",
        description: v.descriptive || v.description || "",
        use_case: v.use_case || "",
        category: v.category || "",
        usage: v.usage_character_count_1y || 0,
      }));

    // Split by gender and pick top from each
    const females = filtered.filter(v => 
      v.gender?.toLowerCase() === "female"
    ).slice(0, Math.ceil(VOICES_PER_LANG / 2));

    const males = filtered.filter(v => 
      v.gender?.toLowerCase() === "male"
    ).slice(0, Math.floor(VOICES_PER_LANG / 2));

    let selected = [...females, ...males];
    
    // Fill if we don't have enough gendered voices
    if (selected.length < VOICES_PER_LANG) {
      const selectedIds = new Set(selected.map(v => v.id));
      const remaining = filtered
        .filter(v => !selectedIds.has(v.id))
        .slice(0, VOICES_PER_LANG - selected.length);
      selected = [...selected, ...remaining];
    }

    results[lang.code] = {
      ...lang,
      voices: selected.slice(0, VOICES_PER_LANG),
      totalFound: filtered.length,
    };

    console.log(` found ${filtered.length}, selected ${selected.length}`);

    // Rate limit
    await new Promise(r => setTimeout(r, 150));
  }

  // ── Print Results ──────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════");
  console.log("📋 SELECTED VOICES PER LANGUAGE");
  console.log("═══════════════════════════════════════\n");

  const allLangs = [VIETNAMESE_VOICES, ...LANGUAGES_TO_FETCH];

  for (const lang of allLangs) {
    const r = results[lang.code];
    if (!r) continue;

    const label = lang.code === "vi" ? " (HAND-PICKED ✋)" : "";
    console.log(`\n${lang.flag} ${lang.name} (${lang.code})${label} — ${r.voices.length} voices:`);
    console.log("─".repeat(60));

    for (const v of r.voices) {
      const usageK = v.usage > 1000 ? `${Math.round(v.usage / 1000)}K` : (v.usage || "n/a");
      console.log(`  ${(v.gender || "").padEnd(7)} ${v.name.padEnd(28)} ${v.id}  (${usageK})`);
    }
  }

  // ── Generate ready-to-paste TypeScript ──────────────────
  let tsOutput = "const LANGUAGES: {\n";
  tsOutput += "  code: string;\n  name: string;\n  flag: string;\n";
  tsOutput += "  voices: { id: string; name: string; gender: string }[];\n";
  tsOutput += "}[] = [\n";

  for (const lang of allLangs) {
    const r = results[lang.code];
    if (!r) continue;

    tsOutput += `  {\n`;
    tsOutput += `    code: "${lang.code}", name: "${lang.name}", flag: "${lang.flag}",\n`;
    tsOutput += `    voices: [\n`;

    for (const v of r.voices) {
      const safeName = v.name.replace(/"/g, '\\"');
      tsOutput += `      { id: "${v.id}", name: "${safeName}", gender: "${v.gender}" },\n`;
    }

    tsOutput += `    ],\n`;
    tsOutput += `  },\n`;
  }

  tsOutput += "];\n";

  // ── Save files ─────────────────────────────────────────
  fs.writeFileSync("voices-output.json", JSON.stringify(results, null, 2));
  fs.writeFileSync("languages-array.txt", tsOutput);

  console.log("\n\n✅ Done!");
  console.log("📁 voices-output.json — full voice data (for reference)");
  console.log("📁 languages-array.txt — ready to paste into page.tsx");
  console.log("\n📋 Next steps:");
  console.log("  1. Review languages-array.txt");
  console.log("  2. Copy the entire content");
  console.log("  3. Replace the LANGUAGES array in:");
  console.log("     src/app/dashboard/dub-video/new/page.tsx");
  console.log("  4. Vietnamese voices are already included (unchanged) ✅");
}

main().catch(console.error);
