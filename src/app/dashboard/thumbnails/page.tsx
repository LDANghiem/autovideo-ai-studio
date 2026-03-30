"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Download, RotateCcw, Image as ImageIcon, ChevronRight } from "lucide-react";

// ─── Template Definitions ────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "news",
    name: "Breaking News",
    desc: "Bold bar · face cutouts · drama",
    thumbBg: "#1e293b",
    thumbAccent: "#e11d48",
    presets: ["#e11d48", "#f97316", "#facc15", "#16a34a", "#2563eb"],
    defaults: { accentColor: "#e11d48", textColor: "#ffffff", bgColor: "#1e293b", barColor: "#facc15" },
    controls: { sub: true, num: false, img2: true },
    labels: { h1: "Breaking headline", sub: "Channel / Source name", img1: "Face photo (optional)", img2: "Second face (optional)" },
  },
  {
    id: "bigface",
    name: "Big Face + Text",
    desc: "MrBeast style · huge face · 1-3 words",
    thumbBg: "#111827",
    thumbAccent: "#a855f7",
    presets: ["#a855f7", "#ec4899", "#f97316", "#22c55e", "#facc15"],
    defaults: { accentColor: "#a855f7", textColor: "#ffffff", bgColor: "#111827", barColor: "#facc15" },
    controls: { sub: false, num: false, img2: false },
    labels: { h1: "1-3 huge words", sub: "", img1: "Upload face photo", img2: "" },
  },
  {
    id: "vs",
    name: "VS Confrontation",
    desc: "Two faces · VS center · topic text",
    thumbBg: "#0f172a",
    thumbAccent: "#ef4444",
    presets: ["#ef4444", "#f97316", "#7c3aed", "#0ea5e9", "#facc15"],
    defaults: { accentColor: "#ef4444", textColor: "#ffffff", bgColor: "#0f172a", barColor: "#facc15" },
    controls: { sub: true, num: false, img2: true },
    labels: { h1: "VS topic / Context text", sub: "Name left vs Name right", img1: "Left person photo", img2: "Right person photo" },
  },
  {
    id: "question",
    name: "Question Hook",
    desc: "Giant question · gradient bg · curiosity",
    thumbBg: "#1e1b4b",
    thumbAccent: "#818cf8",
    presets: ["#818cf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"],
    defaults: { accentColor: "#818cf8", textColor: "#ffffff", bgColor: "#1e1b4b", barColor: "#a78bfa" },
    controls: { sub: true, num: false, img2: false },
    labels: { h1: "Your big question here?", sub: "Teaser answer or channel name", img1: "Background image (optional)", img2: "" },
  },
  {
    id: "beforeafter",
    name: "Before / After",
    desc: "Split screen · two images · transformation",
    thumbBg: "#1f2937",
    thumbAccent: "#10b981",
    presets: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
    defaults: { accentColor: "#10b981", textColor: "#ffffff", bgColor: "#1f2937", barColor: "#f59e0b" },
    controls: { sub: false, num: false, img2: true },
    labels: { h1: "Transformation topic", sub: "", img1: "BEFORE image", img2: "AFTER image" },
  },
  {
    id: "product",
    name: "Product Showcase",
    desc: "Clean bg · product centered · minimal text",
    thumbBg: "#f8fafc",
    thumbAccent: "#0ea5e9",
    presets: ["#0ea5e9", "#6366f1", "#ec4899", "#f59e0b", "#10b981"],
    defaults: { accentColor: "#0ea5e9", textColor: "#0f172a", bgColor: "#f8fafc", barColor: "#0ea5e9" },
    controls: { sub: true, num: false, img2: false },
    labels: { h1: "Product name / Tagline", sub: "Key benefit or price", img1: "Product photo", img2: "" },
  },
  {
    id: "listicle",
    name: "Listicle / Number",
    desc: "Giant number · topic · bold list vibe",
    thumbBg: "#18181b",
    thumbAccent: "#facc15",
    presets: ["#facc15", "#fb923c", "#4ade80", "#22d3ee", "#a78bfa"],
    defaults: { accentColor: "#facc15", textColor: "#ffffff", bgColor: "#18181b", barColor: "#facc15" },
    controls: { sub: true, num: true, img2: false },
    labels: { h1: "Topic of the list", sub: "Hook phrase or teaser", img1: "Background / topic image", img2: "" },
  },
  {
    id: "reaction",
    name: "Reaction / Shocked",
    desc: "Big shocked face · context image · bold text",
    thumbBg: "#0f172a",
    thumbAccent: "#f97316",
    presets: ["#f97316", "#ef4444", "#eab308", "#8b5cf6", "#06b6d4"],
    defaults: { accentColor: "#f97316", textColor: "#ffffff", bgColor: "#0f172a", barColor: "#ef4444" },
    controls: { sub: true, num: false, img2: true },
    labels: { h1: "Shocking headline text", sub: "Channel / Context", img1: "Shocked face photo", img2: "Context / reaction image" },
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

interface FormValues {
  headline: string;
  subline: string;
  bigNum: number;
  accentColor: string;
  textColor: string;
  bgColor: string;
  barColor: string;
  overlay: number;
}

// ─── Canvas Drawing Helpers ───────────────────────────────────────────────────

function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function autoFontSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxSize: number, font: string): number {
  let size = maxSize;
  while (size > 20) {
    ctx.font = `bold ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 4;
  }
  return size;
}

function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string, img: HTMLImageElement | null, overlay: number) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const scale = Math.max(W / img.width, H / img.height);
    const sw = img.width * scale, sh = img.height * scale;
    ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
    ctx.fillStyle = `rgba(0,0,0,${overlay})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawFace(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, font: string) {
  if (!img) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = `22px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("Upload photo", x + w / 2, y + h / 2 + 8);
    return;
  }
  const scale = Math.max(w / img.width, h / img.height);
  const sw = img.width * scale, sh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  ctx.restore();
}

// ─── Template Renderers ───────────────────────────────────────────────────────

function renderNews(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  drawBg(ctx, W, H, v.bgColor, imgs.img1, v.overlay);
  const barH = 130;
  ctx.fillStyle = v.accentColor;
  ctx.fillRect(0, H - barH, W, barH);
  if (imgs.img1) {
    const fw = 320, fh = 420;
    ctx.save(); ctx.beginPath(); ctx.rect(80, H - barH - fh, fw, fh); ctx.clip();
    const sc = Math.max(fw / imgs.img1.width, fh / imgs.img1.height);
    ctx.drawImage(imgs.img1, 80 + (fw - imgs.img1.width * sc) / 2, H - barH - fh + (fh - imgs.img1.height * sc) / 2, imgs.img1.width * sc, imgs.img1.height * sc);
    ctx.restore();
    if (imgs.img2) {
      const fw2 = 260, fh2 = fh - 80;
      ctx.save(); ctx.beginPath(); ctx.rect(W - fw2 - 80, H - barH - fh + 80, fw2, fh2); ctx.clip();
      const sc2 = Math.max(fw2 / imgs.img2.width, fh2 / imgs.img2.height);
      ctx.drawImage(imgs.img2, W - fw2 - 80 + (fw2 - imgs.img2.width * sc2) / 2, H - barH - fh + 80 + (fh2 - imgs.img2.height * sc2) / 2, imgs.img2.width * sc2, imgs.img2.height * sc2);
      ctx.restore();
    }
  }
  ctx.fillStyle = v.barColor;
  ctx.fillRect(0, H - barH, 14, barH);
  const hl = v.headline.toUpperCase();
  const fs = autoFontSize(ctx, hl, W - 100, 72, font);
  ctx.font = `bold ${fs}px ${font}`;
  ctx.fillStyle = v.textColor;
  ctx.textAlign = "left";
  ctx.fillText(hl, 30, H - barH + fs + 8);
  ctx.font = `bold 32px ${font}`;
  ctx.fillStyle = hexA(v.textColor, 0.7);
  ctx.fillText(v.subline.toUpperCase(), 30, H - 20);
}

function renderBigface(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  ctx.fillStyle = v.bgColor;
  ctx.fillRect(0, 0, W, H);
  if (imgs.img1) {
    const fw = 700;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, fw, H); ctx.clip();
    const sc = Math.max(fw / imgs.img1.width, H / imgs.img1.height);
    ctx.drawImage(imgs.img1, (fw - imgs.img1.width * sc) / 2, (H - imgs.img1.height * sc) / 2, imgs.img1.width * sc, imgs.img1.height * sc);
    ctx.restore();
    const bg = v.bgColor;
    const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
    const grad = ctx.createLinearGradient(400, 0, W, 0);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.4, hexA(v.bgColor, 0.7));
    grad.addColorStop(1, v.bgColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, 500, H);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = `22px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("Upload face photo", 250, H / 2);
  }
  const words = v.headline.toUpperCase().split(/\s+/).slice(0, 3);
  let y = 180;
  words.forEach((w) => {
    const fs = autoFontSize(ctx, w, 560, 180, font);
    ctx.font = `bold ${fs}px ${font}`;
    ctx.textAlign = "right";
    ctx.fillStyle = v.accentColor;
    ctx.fillText(w, W - 40, y);
    ctx.fillStyle = v.textColor;
    ctx.fillText(w, W - 44, y - 4);
    y += fs + 20;
  });
}

function renderVs(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  ctx.fillStyle = v.bgColor;
  ctx.fillRect(0, 0, W, H);
  const hw = W / 2;
  drawFace(ctx, imgs.img1, 0, 0, hw, H, font);
  drawFace(ctx, imgs.img2, hw, 0, hw, H, font);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, hw, H);
  ctx.fillRect(hw, 0, hw, H);
  const vsR = 110;
  ctx.fillStyle = v.accentColor;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, vsR, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `bold 88px ${font}`;
  ctx.fillStyle = v.textColor;
  ctx.textAlign = "center";
  ctx.fillText("VS", W / 2, H / 2 + 28);
  const fs = autoFontSize(ctx, v.headline.toUpperCase(), W - 260, 52, font);
  ctx.font = `bold ${fs}px ${font}`;
  ctx.fillStyle = v.textColor;
  ctx.fillText(v.headline.toUpperCase(), W / 2, 90);
  if (v.subline) {
    const parts = v.subline.split(/vs\.?/i);
    ctx.font = `bold 38px ${font}`;
    ctx.fillStyle = v.barColor;
    ctx.fillText((parts[0] || "Name 1").trim().toUpperCase(), hw / 2, H - 50);
    ctx.fillText((parts[1] || "Name 2").trim().toUpperCase(), hw + hw / 2, H - 50);
  }
}

function renderQuestion(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  if (imgs.img1) {
    const sc = Math.max(W / imgs.img1.width, H / imgs.img1.height);
    ctx.drawImage(imgs.img1, (W - imgs.img1.width * sc) / 2, (H - imgs.img1.height * sc) / 2, imgs.img1.width * sc, imgs.img1.height * sc);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, hexA(v.bgColor, 0.6));
    grad.addColorStop(0.5, hexA(v.bgColor, 0.3));
    grad.addColorStop(1, hexA(v.bgColor, 0.85));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, v.bgColor);
    grad.addColorStop(1, v.accentColor + "88");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = "center";
  const hl = v.headline;
  const fs = autoFontSize(ctx, hl, W - 120, 120, font);
  ctx.font = `bold ${fs}px ${font}`;
  ctx.fillStyle = v.textColor;
  const lines = (hl.match(/.{1,30}(\s|$)/g) || [hl]);
  lines.forEach((l, i) => ctx.fillText(l.trim().toUpperCase(), W / 2, 280 + i * (fs + 20)));
  ctx.fillStyle = v.accentColor;
  ctx.fillRect(W / 2 - 200, H - 110, 400, 5);
  ctx.font = `bold 38px ${font}`;
  ctx.fillStyle = hexA(v.textColor, 0.8);
  ctx.fillText(v.subline.toUpperCase(), W / 2, H - 60);
}

function renderBeforeafter(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  const hw = W / 2;
  if (imgs.img1) {
    const sc = Math.max(hw / imgs.img1.width, H / imgs.img1.height);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, hw, H); ctx.clip();
    ctx.drawImage(imgs.img1, (hw - imgs.img1.width * sc) / 2, (H - imgs.img1.height * sc) / 2, imgs.img1.width * sc, imgs.img1.height * sc);
    ctx.restore();
  } else { ctx.fillStyle = "#374151"; ctx.fillRect(0, 0, hw, H); }
  if (imgs.img2) {
    const sc = Math.max(hw / imgs.img2.width, H / imgs.img2.height);
    ctx.save(); ctx.beginPath(); ctx.rect(hw, 0, hw, H); ctx.clip();
    ctx.drawImage(imgs.img2, hw + (hw - imgs.img2.width * sc) / 2, (H - imgs.img2.height * sc) / 2, imgs.img2.width * sc, imgs.img2.height * sc);
    ctx.restore();
  } else { ctx.fillStyle = "#1f2937"; ctx.fillRect(hw, 0, hw, H); }
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, 0, hw, H);
  ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(hw, 0, hw, H);
  ctx.fillStyle = v.accentColor; ctx.fillRect(hw - 3, 0, 6, H);
  const lH = 80;
  ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, hw, lH); ctx.fillRect(hw, 0, hw, lH);
  ctx.font = `bold 52px ${font}`; ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8"; ctx.fillText("BEFORE", hw / 2, 56);
  ctx.fillStyle = v.accentColor; ctx.fillText("AFTER", hw + hw / 2, 56);
  if (v.headline) {
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, H - 110, W, 110);
    const fs = autoFontSize(ctx, v.headline.toUpperCase(), W - 80, 58, font);
    ctx.font = `bold ${fs}px ${font}`; ctx.textAlign = "center"; ctx.fillStyle = v.textColor;
    ctx.fillText(v.headline.toUpperCase(), W / 2, H - 35);
  }
}

function renderProduct(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  ctx.fillStyle = v.bgColor; ctx.fillRect(0, 0, W, H);
  if (imgs.img1) {
    const maxW = 560, maxH = 440;
    const sc = Math.min(maxW / imgs.img1.width, maxH / imgs.img1.height);
    const iw = imgs.img1.width * sc, ih = imgs.img1.height * sc;
    ctx.drawImage(imgs.img1, (W - iw) / 2, (H - ih) / 2 - 40, iw, ih);
  } else {
    ctx.strokeStyle = v.accentColor + "55"; ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 180, H / 2 - 180 - 40, 360, 360);
    ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(W / 2 - 180, H / 2 - 180 - 40, 360, 360);
    ctx.font = `22px ${font}`; ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.textAlign = "center";
    ctx.fillText("Product image", W / 2, H / 2);
  }
  ctx.textAlign = "center";
  const fs = autoFontSize(ctx, v.headline, W - 200, 80, font);
  ctx.font = `bold ${fs}px ${font}`; ctx.fillStyle = v.textColor;
  ctx.fillText(v.headline, W / 2, H - 90);
  ctx.font = `400 34px ${font}`; ctx.fillStyle = v.accentColor;
  ctx.fillText(v.subline, W / 2, H - 42);
  ctx.strokeStyle = v.accentColor; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W / 2 - 80, H - 112); ctx.lineTo(W / 2 + 80, H - 112); ctx.stroke();
}

function renderListicle(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  drawBg(ctx, W, H, v.bgColor, imgs.img1, v.overlay);
  const num = String(v.bigNum);
  ctx.font = `bold 480px ${font}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = v.accentColor + "22"; ctx.fillText(num, -20, -40);
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold 320px ${font}`;
  ctx.fillStyle = v.barColor + "55"; ctx.fillText(num, -20, H - 60);
  ctx.fillStyle = v.barColor; ctx.fillText(num, -24, H - 64);
  const topicX = num.length > 1 ? 280 : 200;
  ctx.textAlign = "left";
  const fs = autoFontSize(ctx, v.headline.toUpperCase(), W - topicX - 80, 100, font);
  ctx.font = `bold ${fs}px ${font}`; ctx.fillStyle = v.textColor;
  ctx.fillText(v.headline.toUpperCase(), topicX, 300);
  ctx.fillStyle = v.accentColor; ctx.fillRect(topicX, 340, W - topicX - 80, 6);
  if (v.subline) {
    ctx.font = `bold 40px ${font}`; ctx.fillStyle = hexA(v.textColor, 0.65);
    ctx.fillText(v.subline.toUpperCase(), topicX, 420);
  }
}

function renderReaction(ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) {
  ctx.fillStyle = v.bgColor; ctx.fillRect(0, 0, W, H);
  drawFace(ctx, imgs.img1, 0, 0, 800, H, font);
  if (imgs.img1) {
    const grad = ctx.createLinearGradient(600, 0, W, 0);
    grad.addColorStop(0, hexA(v.bgColor, 0));
    grad.addColorStop(1, v.bgColor);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }
  if (imgs.img2) {
    const cW = 380, cH = 280;
    ctx.fillStyle = "#000"; ctx.fillRect(W - cW - 40, 60, cW, cH);
    const sc = Math.max(cW / imgs.img2.width, cH / imgs.img2.height);
    ctx.save(); ctx.beginPath(); ctx.rect(W - cW - 40, 60, cW, cH); ctx.clip();
    ctx.drawImage(imgs.img2, W - cW - 40 + (cW - imgs.img2.width * sc) / 2, 60 + (cH - imgs.img2.height * sc) / 2, imgs.img2.width * sc, imgs.img2.height * sc);
    ctx.restore();
    ctx.strokeStyle = v.accentColor; ctx.lineWidth = 5;
    ctx.strokeRect(W - cW - 40, 60, cW, cH);
  }
  const barH = 120;
  ctx.fillStyle = v.accentColor; ctx.fillRect(0, H - barH, W, barH);
  ctx.textAlign = "left";
  const fs = autoFontSize(ctx, v.headline.toUpperCase(), W - 80, 72, font);
  ctx.font = `bold ${fs}px ${font}`; ctx.fillStyle = v.textColor;
  ctx.fillText(v.headline.toUpperCase(), 30, H - barH + fs + 12);
  ctx.font = `bold 30px ${font}`; ctx.fillStyle = hexA(v.textColor, 0.75);
  ctx.fillText(v.subline.toUpperCase(), 30, H - 18);
}

const RENDERERS: Record<TemplateId, (ctx: CanvasRenderingContext2D, W: number, H: number, v: FormValues, imgs: Record<string, HTMLImageElement | null>, font: string) => void> = {
  news: renderNews,
  bigface: renderBigface,
  vs: renderVs,
  question: renderQuestion,
  beforeafter: renderBeforeafter,
  product: renderProduct,
  listicle: renderListicle,
  reaction: renderReaction,
};

// ─── Upload Button Component ──────────────────────────────────────────────────

function UploadBtn({
  id, label, onLoad,
}: {
  id: string;
  label: string;
  onLoad: (img: HTMLImageElement, src: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => { onLoad(img, src); setPreview(src); };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      {preview ? (
        <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
          <img src={preview} alt="uploaded" className="w-full h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-medium">Change</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-16 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-400 hover:border-slate-400 hover:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex flex-col items-center justify-center gap-1"
        >
          <ImageIcon size={16} />
          <span>Click to upload</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function ThumbnailsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fontFamily, setFontFamily] = useState("Impact, Arial Black, sans-serif");
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement | null>>({ img1: null, img2: null });
  const [form, setForm] = useState<FormValues>({
    headline: "",
    subline: "",
    bigNum: 5,
    ...TEMPLATES[0].defaults,
    overlay: 0.5,
  });

  const t = TEMPLATES[activeIdx];

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 1280, H = 720;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    const fn = RENDERERS[t.id as TemplateId];
    if (fn) fn(ctx, W, H, form, imgs, fontFamily);
  }, [t.id, form, imgs, fontFamily]);

  useEffect(() => { render(); }, [render]);

  const selectTemplate = (idx: number) => {
    setActiveIdx(idx);
    setImgs({ img1: null, img2: null });
    setForm((prev) => ({
      ...prev,
      ...TEMPLATES[idx].defaults,
      headline: "",
      subline: "",
      bigNum: 5,
    }));
  };

  const setField = (key: keyof FormValues, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const exportPNG = () => {
    render();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `thumbnail-${t.id}-1280x720.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const resetAll = () => {
    setImgs({ img1: null, img2: null });
    setForm({ ...TEMPLATES[activeIdx].defaults, headline: "", subline: "", bigNum: 5, overlay: 0.5 });
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-900 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── Template Sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Templates</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">8 styles · 1280×720</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {TEMPLATES.map((tmpl, i) => (
            <button
              key={tmpl.id}
              onClick={() => selectTemplate(i)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                i === activeIdx
                  ? "bg-blue-50 dark:bg-blue-950/50"
                  : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <div
                className="w-11 h-6 rounded flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ background: tmpl.thumbBg }}
              >
                <div className="w-3/5 h-2/3 rounded-sm opacity-80" style={{ background: tmpl.thumbAccent }} />
              </div>
              <span className={`text-xs font-medium leading-tight ${i === activeIdx ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}>
                {tmpl.name}
              </span>
              {i === activeIdx && <ChevronRight size={12} className="ml-auto text-blue-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Canvas Area ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-5 py-2.5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.name}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t.desc}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={exportPNG} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              <Download size={13} /> Export PNG
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <div className="relative shadow-2xl rounded" style={{ maxWidth: "min(640px, 100%)" }}>
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="block w-full h-auto rounded"
            />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
              1280 × 720
            </div>
          </div>
        </div>
      </main>

      {/* ── Controls Panel ── */}
      <aside className="w-64 flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-y-auto flex flex-col">

        {/* Text */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Text</h3>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.labels.h1}</label>
            <textarea
              value={form.headline}
              onChange={(e) => setField("headline", e.target.value)}
              rows={2}
              placeholder="Type headline..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-transparent text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {t.controls.sub && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t.labels.sub}</label>
              <input
                type="text"
                value={form.subline}
                onChange={(e) => setField("subline", e.target.value)}
                placeholder="Supporting text..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}
          {t.controls.num && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Number</label>
              <input
                type="number"
                value={form.bigNum}
                min={1}
                max={99}
                onChange={(e) => setField("bigNum", parseInt(e.target.value) || 5)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}
        </div>

        {/* Colors */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Colors</h3>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Accent presets</label>
            <div className="flex gap-2 flex-wrap">
              {t.presets.map((c) => (
                <button
                  key={c}
                  onClick={() => setField("accentColor", c)}
                  title={c}
                  className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    background: c,
                    borderColor: form.accentColor === c ? "#0f172a" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["accentColor", "textColor", "bgColor", "barColor"] as const).map((key) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 capitalize">
                  {key === "accentColor" ? "Accent" : key === "textColor" ? "Text" : key === "bgColor" ? "Background" : "Bar / Highlight"}
                </label>
                <input
                  type="color"
                  value={form[key] as string}
                  onChange={(e) => setField(key, e.target.value)}
                  className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer p-0.5"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Photos</h3>
          <UploadBtn
            id="img1"
            label={t.labels.img1}
            onLoad={(img) => setImgs((prev) => ({ ...prev, img1: img }))}
          />
          {t.controls.img2 && (
            <UploadBtn
              id="img2"
              label={t.labels.img2}
              onLoad={(img) => setImgs((prev) => ({ ...prev, img2: img }))}
            />
          )}
        </div>

        {/* Font */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Font style</h3>
          <div className="flex gap-1.5">
            {[
              { label: "Impact", value: "Impact, Arial Black, sans-serif" },
              { label: "Bold", value: "Arial Black, sans-serif" },
              { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFontFamily(f.value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                  fontFamily === f.value
                    ? "bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                    : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overlay */}
        <div className="px-4 py-3 space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Overlay</h3>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Darkness: {Math.round(form.overlay * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={90}
              value={Math.round(form.overlay * 100)}
              onChange={(e) => setField("overlay", parseInt(e.target.value) / 100)}
              className="w-full"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}