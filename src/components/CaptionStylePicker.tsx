// ============================================================
// FILE: src/components/CaptionStylePicker.tsx
// Shared caption style + position picker used by:
//   - AI Shorts  (shorts/page.tsx)
//   - Dub Video  (dub-video/new/page.tsx)
//   - Create Video (create/page.tsx)
// ============================================================

"use client";

export type CaptionStyleId = "classic" | "highlight" | "fade" | "karaoke" | "none";
export type CaptionPosition = "bottom" | "middle" | "top";

export interface CaptionConfig {
  style: CaptionStyleId;
  position: CaptionPosition;
}

interface StyleDef {
  id: CaptionStyleId;
  label: string;
  desc: string;
  preview: React.ReactNode;
}

interface Props {
  value: CaptionConfig;
  onChange: (v: CaptionConfig) => void;
  disabled?: boolean;
  /** Hide position picker for vertical (9:16) pipelines like AI Shorts */
  hidePosition?: boolean;
  /** Color theme — Ripple coral by default */
  accent?: string;
}

const STYLES: StyleDef[] = [
  {
    id: "classic",
    label: "Bold Classic",
    desc: "White text, black outline",
    preview: (
      <div className="flex items-end justify-center h-10 pb-1">
        <span style={{
          fontSize: 11, fontWeight: 900, color: "#fff",
          textShadow: "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000",
          letterSpacing: 0.5,
        }}>CAPTION TEXT</span>
      </div>
    ),
  },
  {
    id: "highlight",
    label: "Yellow Bar",
    desc: "News-style highlight",
    preview: (
      <div className="flex items-end justify-center h-10 pb-1">
        <span style={{
          fontSize: 10, fontWeight: 800, color: "#000",
          background: "#facc15", padding: "1px 5px", borderRadius: 2,
        }}>CAPTION TEXT</span>
      </div>
    ),
  },
  {
    id: "fade",
    label: "Minimal Fade",
    desc: "Clean lowercase style",
    preview: (
      <div className="flex items-end justify-center h-10 pb-1">
        <span style={{
          fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.85)",
          letterSpacing: 1, fontStyle: "italic",
        }}>caption text</span>
      </div>
    ),
  },
  {
    id: "karaoke",
    label: "Karaoke",
    desc: "Word-by-word highlight",
    preview: (
      <div className="flex items-end justify-center h-10 pb-1 gap-0.5">
        <span style={{ fontSize: 10, fontWeight: 800, color: "#facc15",
          textShadow: "0 0 6px rgba(250,204,21,0.6)" }}>WORD</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}> BY </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#facc15",
          textShadow: "0 0 6px rgba(250,204,21,0.6)" }}>WORD</span>
      </div>
    ),
  },
  {
    id: "none",
    label: "No Captions",
    desc: "Clean, no text overlay",
    preview: (
      <div className="flex items-center justify-center h-10">
        <div style={{ width: 28, height: 1.5, background: "rgba(255,255,255,0.2)", borderRadius: 1 }} />
      </div>
    ),
  },
];

const POSITIONS: { id: CaptionPosition; label: string; icon: string }[] = [
  { id: "bottom", label: "Bottom", icon: "▁" },
  { id: "middle", label: "Middle", icon: "▬" },
  { id: "top",    label: "Top",    icon: "▔" },
];

export default function CaptionStylePicker({
  value, onChange, disabled = false, hidePosition = false, accent = "#FF6B5A",
}: Props) {
  const accentRgb = accent;

  return (
    <div className="space-y-3">
      {/* Style grid */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Caption Style
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {STYLES.map((s) => {
            const active = value.style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => !disabled && onChange({ ...value, style: s.id })}
                disabled={disabled}
                title={s.desc}
                className="flex flex-col rounded-lg overflow-hidden transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  border: active ? `1.5px solid ${accentRgb}` : "1px solid rgba(255,255,255,0.08)",
                  background: active ? `${accentRgb}18` : "rgba(15,12,28,0.7)",
                  boxShadow: active ? `0 0 10px ${accentRgb}30` : "none",
                }}
              >
                {/* Mini preview canvas */}
                <div style={{
                  background: "rgba(0,0,0,0.6)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {s.preview}
                </div>
                {/* Label */}
                <div className="px-1 py-1.5 text-center">
                  <div className="text-[10px] font-semibold leading-tight"
                    style={{ color: active ? "#fff" : "#9ca3af" }}>
                    {s.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Position picker — hidden for vertical video pipelines */}
      {!hidePosition && value.style !== "none" && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Caption Position
          </p>
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => {
              const active = value.position === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => !disabled && onChange({ ...value, position: p.id })}
                  disabled={disabled}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                  style={{
                    border: active ? `1.5px solid ${accentRgb}` : "1px solid rgba(255,255,255,0.08)",
                    background: active ? `${accentRgb}18` : "rgba(15,12,28,0.7)",
                    color: active ? "#fff" : "#9ca3af",
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{p.icon}</span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}