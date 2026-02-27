// src/app/dashboard/Sidebar.tsx
// ------------------------------------------------------------
// AutoVideo AI Studio — Professional Dashboard Sidebar
// Featured items: Dub a Video, Thumbnail Creator, SEO Generator
// get glowing icons, gradient hover, and micro-animations
// ------------------------------------------------------------

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";

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

function IconProjects() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

function IconShorts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
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

/* ── Featured item themes ─────────────────────────────────── */
const FEATURED_THEMES: Record<string, {
  gradient: string;
  glow: string;
  hoverBg: string;
  iconColor: string;
  badgeText: string;
  badgeBg: string;
  badgeBorder: string;
}> = {
  "/dashboard/dub-video/new": {
    gradient: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.08) 100%)",
    glow: "0 0 16px rgba(59,130,246,0.15)",
    hoverBg: "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(99,102,241,0.15) 100%)",
    iconColor: "#60a5fa",
    badgeText: "NEW",
    badgeBg: "rgba(16,185,129,0.15)",
    badgeBorder: "rgba(16,185,129,0.3)",
  },
  "/dashboard/thumbnails": {
    gradient: "linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(244,114,182,0.08) 100%)",
    glow: "0 0 16px rgba(236,72,153,0.12)",
    hoverBg: "linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(244,114,182,0.15) 100%)",
    iconColor: "#f472b6",
    badgeText: "PRO",
    badgeBg: "rgba(168,85,247,0.12)",
    badgeBorder: "rgba(168,85,247,0.3)",
  },
  "/dashboard/seo": {
    gradient: "linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(16,185,129,0.08) 100%)",
    glow: "0 0 16px rgba(34,197,94,0.12)",
    hoverBg: "linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(16,185,129,0.15) 100%)",
    iconColor: "#4ade80",
    badgeText: "PRO",
    badgeBg: "rgba(168,85,247,0.12)",
    badgeBorder: "rgba(168,85,247,0.3)",
  },
  "/dashboard/shorts": {
    gradient: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.08) 100%)",
    glow: "0 0 16px rgba(245,158,11,0.15)",
    hoverBg: "linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(251,191,36,0.15) 100%)",
    iconColor: "#fbbf24",
    badgeText: "NEW",
    badgeBg: "rgba(245,158,11,0.15)",
    badgeBorder: "rgba(251,191,36,0.35)",
  },
};

/* ── Navigation Config ────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/dashboard/projects", label: "Projects", Icon: IconProjects },
  { href: "/dashboard/create", label: "Create Project", Icon: IconCreate },
  { href: "/dashboard/dub-video/new", label: "Dub a Video", Icon: IconDub, featured: true },
  { href: "/dashboard/shorts", label: "AI Shorts", Icon: IconShorts, featured: true },
  { href: "/dashboard/thumbnails", label: "Thumbnail Creator", Icon: IconThumbnail, featured: true, proOnly: true },
  { href: "/dashboard/seo", label: "SEO Generator", Icon: IconSeo, featured: true, proOnly: true },
  { href: "/dashboard/library", label: "Library", Icon: IconLibrary },
  { href: "/dashboard/settings", label: "Settings", Icon: IconSettings },
];

/* ── Sidebar Component ────────────────────────────────────── */
export default function Sidebar() {
  const pathname = usePathname();
  const userTier = useUserTier();

  return (
    <aside
      className="w-64 min-h-screen flex flex-col border-r border-gray-800/50"
      style={{
        background: "linear-gradient(180deg, #120e1e 0%, #15112a 50%, #120e1e 100%)",
      }}
    >
      {/* Keyframe animations */}
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

      {/* ── Brand ──────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-800/50">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              boxShadow: "0 2px 10px rgba(99, 102, 241, 0.35)",
            }}
          >
            <span className="text-white">A</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-white tracking-tight group-hover:text-blue-400 transition-colors duration-200">
              AutoVideo AI
            </div>
            <div className="text-[9px] text-gray-600 font-semibold tracking-[0.2em] uppercase">
              Studio
            </div>
          </div>
        </Link>
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const { Icon } = item;
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname?.startsWith(item.href);

          const isPro = item.proOnly;
          const isLocked = isPro && userTier !== "pro" && userTier !== "loading";
          const theme = FEATURED_THEMES[item.href];
          const isFeatured = item.featured && theme;

          /* ── Featured items (Dub, Thumbnail, SEO) ──────── */
          if (isFeatured) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="featured-item group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 text-white"
                style={{
                  background: isActive ? theme.hoverBg : theme.gradient,
                  boxShadow: isActive ? theme.glow : "none",
                  border: isActive ? `1px solid ${theme.iconColor}33` : "1px solid transparent",
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
                {/* Glowing icon */}
                <span
                  className="featured-icon flex-shrink-0"
                  style={{
                    color: theme.iconColor,
                    filter: `drop-shadow(0 0 6px ${theme.iconColor}80)`,
                  }}
                >
                  <Icon />
                </span>
                <span className="flex-1 truncate">{item.label}</span>

                {/* Badge */}
                <span
                  className="featured-glow text-[8px] font-bold px-1.5 py-0.5 rounded-full tracking-wider"
                  style={{
                    backgroundColor: theme.badgeBg,
                    color: theme.badgeText === "NEW" ? "#34d399" : "#c084fc",
                    border: `1px solid ${theme.badgeBorder}`,
                  }}
                >
                  {isLocked ? "🔒" : theme.badgeText}
                </span>
              </Link>
            );
          }

          /* ── Regular items ─────────────────────────────── */
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 " +
                (isActive
                  ? "bg-white/[0.07] text-white"
                  : "text-gray-500 hover:text-gray-200 hover:bg-white/[0.03]")
              }
              style={
                isActive
                  ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.2)" }
                  : undefined
              }
            >
              <span
                className={
                  "flex-shrink-0 transition-colors duration-200 " +
                  (isActive
                    ? "text-blue-400"
                    : "text-gray-600 group-hover:text-gray-400")
                }
              >
                <Icon />
              </span>
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Tier / Upgrade ─────────────────────────────────── */}
      <div className="px-3 pb-5">
        {userTier === "loading" ? (
          <div className="px-3 py-2 text-[11px] text-gray-700">Loading...</div>
        ) : userTier === "pro" ? (
          <div
            className="rounded-xl px-4 py-3.5 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.08) 100%)",
              border: "1px solid rgba(139,92,246,0.18)",
              boxShadow: "0 0 24px rgba(139,92,246,0.06), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm">⭐</span>
              <span className="text-[11px] font-bold text-purple-300 tracking-wide uppercase">
                Pro Plan
              </span>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              All features unlocked
            </div>
          </div>
        ) : (
          <Link
            href="/dashboard/settings"
            className="group block rounded-xl px-4 py-3.5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.06) 100%)",
              border: "1px solid rgba(59,130,246,0.12)",
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-blue-400 group-hover:text-blue-300 transition-colors">
                <IconUpgrade />
              </span>
              <span className="text-[11px] font-bold text-blue-400 group-hover:text-blue-300 tracking-wide uppercase transition-colors">
                Upgrade to Pro
              </span>
            </div>
            <div className="text-[10px] text-gray-600 mt-1 text-center">
              Unlock thumbnails, SEO & more
            </div>
          </Link>
        )}

        <div className="text-center mt-3">
          <span className="text-[9px] text-gray-800 tracking-wider font-medium">v2.0</span>
        </div>
      </div>
    </aside>
  );
}
