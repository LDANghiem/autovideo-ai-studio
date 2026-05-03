// ============================================================
// FILE: src/app/dashboard/Sidebar.tsx
// ============================================================
// Ripple — Dashboard Sidebar (post-demolition)
//
// Removed: Channel Cloner, ReCreate, Article → Video, Bulk Factory
// Reason: Off-strategy for Ripple's "Reach Multiplier" positioning.
// These features attract slop-risk customers (per YouTube's 2026
// Inauthentic Content Policy) and don't serve Type 1 creators
// who already have expertise to share.
//
// REMAINING SECTIONS:
//   CREATE:    Create Video, Dub Video (HERO)
//   REPURPOSE: AI Shorts
//   OPTIMIZE:  Thumbnails, SEO Generator
//   MANAGE:    My Projects, Library, Settings
// ============================================================

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";
import RippleLogo from "@/components/RippleLogo";

/* ── SVG Icon Components ──────────────────────────────────── */
function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconCreate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconDub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function IconShorts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
    </svg>
  );
}

function IconThumbnail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconSeo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconProjects() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconUpgrade() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

/* ── Featured item themes — Ripple palette ────────────────── */
const THEMES: Record<string, {
  gradient: string;
  glow: string;
  hoverBg: string;
  iconColor: string;
  badgeText: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
}> = {
  // HERO: Dub — coral
  "/dashboard/dub-video/new": {
    gradient: "linear-gradient(135deg, rgba(255,107,90,0.12) 0%, rgba(255,169,77,0.06) 100%)",
    glow: "0 0 16px rgba(255,107,90,0.18)",
    hoverBg: "linear-gradient(135deg, rgba(255,107,90,0.22) 0%, rgba(255,169,77,0.12) 100%)",
    iconColor: "#FF6B5A",
    badgeText: "HERO",
    badgeBg: "rgba(255,107,90,0.15)",
    badgeBorder: "rgba(255,107,90,0.35)",
    badgeColor: "#FF8B7A",
  },
  // AI Shorts — amber
  "/dashboard/shorts": {
    gradient: "linear-gradient(135deg, rgba(255,169,77,0.10) 0%, rgba(255,193,116,0.04) 100%)",
    glow: "0 0 14px rgba(255,169,77,0.18)",
    hoverBg: "linear-gradient(135deg, rgba(255,169,77,0.20) 0%, rgba(255,193,116,0.10) 100%)",
    iconColor: "#FFA94D",
    badgeText: "",
    badgeBg: "transparent",
    badgeBorder: "transparent",
    badgeColor: "#FFA94D",
  },
  // Thumbnails — pink + PRO
  "/dashboard/thumbnails": {
    gradient: "linear-gradient(135deg, rgba(244,114,182,0.08) 0%, rgba(244,114,182,0.03) 100%)",
    glow: "0 0 12px rgba(244,114,182,0.15)",
    hoverBg: "linear-gradient(135deg, rgba(244,114,182,0.16) 0%, rgba(244,114,182,0.08) 100%)",
    iconColor: "#F472B6",
    badgeText: "PRO",
    badgeBg: "rgba(255,107,90,0.12)",
    badgeBorder: "rgba(255,107,90,0.3)",
    badgeColor: "#FF8B7A",
  },
  // SEO — green + PRO
  "/dashboard/seo": {
    gradient: "linear-gradient(135deg, rgba(93,211,158,0.08) 0%, rgba(93,211,158,0.03) 100%)",
    glow: "0 0 12px rgba(93,211,158,0.15)",
    hoverBg: "linear-gradient(135deg, rgba(93,211,158,0.16) 0%, rgba(93,211,158,0.08) 100%)",
    iconColor: "#5DD39E",
    badgeText: "PRO",
    badgeBg: "rgba(255,107,90,0.12)",
    badgeBorder: "rgba(255,107,90,0.3)",
    badgeColor: "#FF8B7A",
  },
};

/* ── Navigation sections ──────────────────────────────────── */
type NavItem = {
  href: string;
  label: string;
  Icon: () => React.ReactElement;
  featured?: boolean;
  proOnly?: boolean;
  studioOnly?: boolean;
};

type NavSection = {
  title: string | null;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
    ],
  },
  {
    title: "CREATE",
    items: [
      { href: "/dashboard/create", label: "Create Video", Icon: IconCreate },
      { href: "/dashboard/dub-video/new", label: "Dub Video", Icon: IconDub, featured: true },
    ],
  },
  {
    title: "REPURPOSE",
    items: [
      { href: "/dashboard/shorts", label: "AI Shorts", Icon: IconShorts, featured: true },
    ],
  },
  {
    title: "OPTIMIZE",
    items: [
      { href: "/dashboard/thumbnails", label: "Thumbnails", Icon: IconThumbnail, featured: true, proOnly: true },
      { href: "/dashboard/seo", label: "SEO Generator", Icon: IconSeo, featured: true, proOnly: true },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { href: "/dashboard/projects", label: "My Projects", Icon: IconProjects },
      { href: "/dashboard/library", label: "Library", Icon: IconLibrary },
      { href: "/dashboard/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];

/* ── Sidebar Component ────────────────────────────────────── */
export default function Sidebar() {
  const pathname = usePathname();
  const userTier = useUserTier();

  return (
    <aside
      className="w-64 min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0C0B16 0%, #100E1C 50%, #0C0B16 100%)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Animations */}
      <style>{`
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes iconFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1px); }
        }
        .featured-glow {
          animation: glowPulse 3s ease-in-out infinite;
        }
        .featured-icon {
          animation: iconFloat 3s ease-in-out infinite;
        }
        .featured-item:hover .featured-icon {
          animation: iconFloat 1s ease-in-out infinite;
        }
      `}</style>

      {/* ── Brand: Ripple ────────────────────────────────── */}
      <div
        className="px-5 pt-5 pb-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Link href="/dashboard" className="flex items-center group">
          <RippleLogo size="base" />
        </Link>
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx}>
            {/* Section header */}
            {section.title && (
              <div
                className="px-3 pt-4 pb-1.5 text-[9px] font-bold tracking-[0.15em] uppercase"
                style={{ color: "#5A5762" }}
              >
                {section.title}
              </div>
            )}

            {/* Section items */}
            {section.items.map((item) => {
              const { Icon } = item;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname?.startsWith(item.href);

              const isPro = item.proOnly;
              const isStudioOnly = (item as any).studioOnly;
              const isLocked = (isPro && (userTier === "free" || userTier === "loading")) || (isStudioOnly && userTier !== "studio" && userTier !== "loading");
              const theme = THEMES[item.href];
              const isFeatured = item.featured && theme;

              /* Featured items */
              if (isFeatured) {
                const showBadge = theme.badgeText.length > 0 || isLocked;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="featured-item group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300"
                    style={{
                      background: isActive ? theme.hoverBg : theme.gradient,
                      boxShadow: isActive ? theme.glow : "none",
                      border: isActive ? `1px solid ${theme.iconColor}33` : "1px solid transparent",
                      color: "#F5F2ED",
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.hoverBg;
                      e.currentTarget.style.boxShadow = theme.glow;
                      e.currentTarget.style.border = `1px solid ${theme.iconColor}33`;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = theme.gradient;
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.border = "1px solid transparent";
                      }
                    }}
                  >
                    <span
                      className="featured-icon flex-shrink-0"
                      style={{
                        color: theme.iconColor,
                        filter: `drop-shadow(0 0 6px ${theme.iconColor}66)`,
                      }}
                    >
                      <Icon />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {showBadge && (
                      <span
                        className="featured-glow text-[8px] font-bold px-1.5 py-0.5 rounded-full tracking-wider"
                        style={{
                          backgroundColor: theme.badgeBg,
                          color: theme.badgeColor,
                          border: `1px solid ${theme.badgeBorder}`,
                        }}
                      >
                        {isLocked ? "🔒" : theme.badgeText}
                      </span>
                    )}
                  </Link>
                );
              }

              /* Regular items */
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    background: isActive ? "rgba(255,107,90,0.08)" : "transparent",
                    color: isActive ? "#F5F2ED" : "#8B8794",
                    boxShadow: isActive ? "inset 0 0 0 1px rgba(255,107,90,0.15), 0 1px 3px rgba(0,0,0,0.2)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.color = "#F5F2ED";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#8B8794";
                    }
                  }}
                >
                  <span
                    className="flex-shrink-0 transition-colors duration-200"
                    style={{
                      color: isActive ? "#FF8B7A" : "#5A5762",
                    }}
                  >
                    <Icon />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Tier / Upgrade ─────────────────────────────────── */}
      <div className="px-3 pb-5">
        {userTier === "loading" ? (
          <div className="px-3 py-2 text-[11px]" style={{ color: "#3A3845" }}>Loading...</div>
        ) : userTier === "studio" ? (
          <div
            className="rounded-xl px-4 py-3.5 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,90,0.15) 0%, rgba(255,169,77,0.08) 100%)",
              border: "1px solid rgba(255,107,90,0.25)",
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm">🚀</span>
              <span
                className="text-[11px] font-bold tracking-wide uppercase"
                style={{
                  color: "#FF8B7A",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Studio Plan
              </span>
            </div>
            <div className="text-[10px] mt-1" style={{ color: "#5A5762" }}>All features unlocked</div>
          </div>
        ) : userTier === "creator" ? (
          <div
            className="rounded-xl px-4 py-3.5 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,169,77,0.12) 0%, rgba(255,107,90,0.06) 100%)",
              border: "1px solid rgba(255,169,77,0.2)",
              boxShadow: "0 0 24px rgba(255,169,77,0.05), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm">⭐</span>
              <span
                className="text-[11px] font-bold tracking-wide uppercase"
                style={{
                  color: "#FFA94D",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Creator Plan
              </span>
            </div>
            <div className="text-[10px] mt-1" style={{ color: "#5A5762" }}>All features unlocked</div>
          </div>
        ) : (
          <Link
            href="/dashboard/billing"
            className="group block rounded-xl px-4 py-3.5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,90,0.10) 0%, rgba(255,169,77,0.06) 100%)",
              border: "1px solid rgba(255,107,90,0.15)",
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span style={{ color: "#FF8B7A" }} className="group-hover:opacity-90 transition-colors">
                <IconUpgrade />
              </span>
              <span
                className="text-[11px] font-bold tracking-wide uppercase transition-colors"
                style={{
                  color: "#FF8B7A",
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                Upgrade Plan
              </span>
            </div>
            <div className="text-[10px] mt-1 text-center" style={{ color: "#5A5762" }}>
              Starter → Creator from $19/mo
            </div>
          </Link>
        )}

        <div className="text-center mt-3">
          <span
            className="text-[9px] tracking-wider font-medium"
            style={{
              color: "#3A3845",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Ripple v3.0
          </span>
        </div>
      </div>
    </aside>
  );
}