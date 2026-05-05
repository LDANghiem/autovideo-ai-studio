"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Ripple — Reach Multiplier for creators with expertise
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main style={styles.main}>
      <BackgroundFX />
      <Nav />
      <Hero />
      <ScriptToVideoSection />
      <DubSection />
      <SupportingSection />
      <PricingSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reveal-on-scroll wrapper (subtle fade + lift)
// ─────────────────────────────────────────────────────────────────────────────

function Reveal({
  children,
  delay = 0,
  style: extraStyle,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 0.7s ease-out ${delay}ms, transform 0.7s ease-out ${delay}ms`,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Background atmosphere — single soft violet bloom in upper-third
// ─────────────────────────────────────────────────────────────────────────────

function BackgroundFX() {
  return (
    <div aria-hidden style={styles.bgWrap}>
      <div style={styles.bgBloom} />
      <div style={styles.bgGrain} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav
// ─────────────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header style={styles.nav}>
      <div style={styles.navInner}>
        <Link href="/" style={styles.brand}>
          <span style={styles.brandDot} />
          <span style={styles.brandText}>Ripple</span>
        </Link>
        <nav style={styles.navLinks}>
          <a href="#pricing" style={styles.navLink}>Pricing</a>
          <Link href="/login" style={styles.navLink}>Sign in</Link>
          <Link href="/login" style={styles.navCta}>
            Start free <span>→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — Section 2
// ─────────────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={styles.heroSection}>
      <div style={styles.container}>
        <Reveal>
          <h1 style={styles.heroH1}>
            Built for creators<br />
            who already know<br />
            <em style={styles.heroEm}>their stuff.</em>
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p style={styles.heroSub}>
            Your expertise. Every language. Zero edit time. One subscription
            replaces your video editor, voice actor, thumbnail designer,
            and translator.
          </p>
        </Reveal>

        <Reveal delay={220}>
          <div style={styles.ctaRow}>
            <Link href="/login" style={styles.btnPrimary}>
              Start free <span>→</span>
            </Link>
            <a href="#how-it-works" style={styles.btnSecondary}>
              See how it works
            </a>
          </div>
        </Reveal>

        <Reveal delay={340}>
          <p style={styles.heroFinePrint}>
            Free forever. No credit card. Upgrade only when you ship more.
          </p>
        </Reveal>

        <Reveal delay={460}>
          <DemoFrame />
        </Reveal>
      </div>
    </section>
  );
}

// Visual placeholder — script panel → finished video panel
function DemoFrame() {
  return (
    <div style={styles.demoWrap} id="how-it-works">
      <div style={styles.demoBrowserChrome}>
        <span style={{ ...styles.demoDot, background: "#3a3a45" }} />
        <span style={{ ...styles.demoDot, background: "#3a3a45" }} />
        <span style={{ ...styles.demoDot, background: "#3a3a45" }} />
      </div>
      <div style={styles.demoBody}>
        <div style={styles.demoLeft}>
          <div style={styles.demoLabel}>YOUR SCRIPT</div>
          <div style={styles.demoScript}>
            <span style={styles.scriptLine}>Most people think of compound interest as a savings concept.</span>
            <span style={styles.scriptLine}>But the same math runs in reverse on every dollar of debt you carry.</span>
            <span style={styles.scriptLine}>Here&rsquo;s what that looks like over ten years…</span>
            <span style={{ ...styles.scriptLine, color: "rgba(167,139,250,0.6)" }}>▎</span>
          </div>
        </div>
        <div style={styles.demoArrow}>
          <ArrowRight />
        </div>
        <div style={styles.demoRight}>
          <div style={styles.demoLabel}>FINISHED VIDEO</div>
          <div style={styles.demoVideo}>
            <div style={styles.demoVideoInner}>
              <div style={styles.playButton}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div style={styles.demoCaption}>The hidden cost of credit card debt</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Script to Video
// ─────────────────────────────────────────────────────────────────────────────

function ScriptToVideoSection() {
  return (
    <section style={styles.section}>
      <div style={styles.container}>
        <Reveal>
          <div style={styles.eyebrow}>01 / SCRIPT TO VIDEO</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 style={styles.sectionH2}>
            You write.<br />
            <em style={styles.sectionEm}>Ripple produces.</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p style={styles.sectionLead}>
            Paste a script. Pick a style. Ripple generates the visuals,
            narrates with a voice you choose, syncs captions, and renders
            a publish-ready video. No timeline. No B-roll hunting.
            No render queue at 2&nbsp;a.m.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <ul style={styles.specList}>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Average production time</span>
              <span style={styles.specValue}>~4 minutes</span>
            </li>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Voices</span>
              <span style={styles.specValue}>20+ presets, or clone your own</span>
            </li>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Output</span>
              <span style={styles.specValue}>1080p, captions, intro/outro included</span>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Dub Video
// ─────────────────────────────────────────────────────────────────────────────

function DubSection() {
  return (
    <section style={{ ...styles.section, ...styles.sectionAlt }}>
      <div style={styles.container}>
        <Reveal>
          <div style={styles.eyebrow}>02 / DUB INTO ANY LANGUAGE</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 style={styles.sectionH2}>
            Now make it<br />
            <em style={styles.sectionEm}>speak every language.</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p style={styles.sectionLead}>
            Drop your finished video into Ripple Dub. Get the same video back
            in Spanish, Vietnamese, Hindi, Portuguese, Mandarin — 29 languages
            in total — with your own cloned voice. Lip-sync matched. Captions
            translated. Ready to upload as a separate channel or a
            multi-language playlist.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <blockquote style={styles.pullQuote}>
            <span style={styles.pullQuoteText}>
              One video in. Twenty-nine videos out.<br />
              <span style={styles.pullQuoteAccent}>That&rsquo;s a 29× return on the same script.</span>
            </span>
          </blockquote>
        </Reveal>

        <Reveal delay={320}>
          <ul style={styles.specList}>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Languages</span>
              <span style={styles.specValue}>29, including Vietnamese, Hindi, Mandarin</span>
            </li>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Voice</span>
              <span style={styles.specValue}>Your own, cloned and translated</span>
            </li>
            <li style={styles.specItem}>
              <span style={styles.specLabel}>Time per language</span>
              <span style={styles.specValue}>Minutes, not hours</span>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Supporting cast
// ─────────────────────────────────────────────────────────────────────────────

function SupportingSection() {
  const items = [
    {
      title: "Thumbnails",
      copy: "Click-worthy thumbnails generated from your video. A/B variants on demand. No Canva. No Photoshop. No designer.",
    },
    {
      title: "AI Shorts",
      copy: "Long-form videos cut into vertical clips for Shorts and TikTok. Auto-captioned. Auto-cropped. Hook-aware.",
    },
    {
      title: "SEO Generator",
      copy: "Title, description, tags, and timestamps tuned for search. Multilingual. Built in.",
    },
  ];

  return (
    <section style={styles.section}>
      <div style={styles.container}>
        <Reveal>
          <div style={styles.eyebrow}>EVERYTHING YOUR VIDEO NEEDS</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 style={styles.sectionH2}>
            Built for the parts<br />
            <em style={styles.sectionEm}>you shouldn&rsquo;t have to do.</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p style={styles.sectionLead}>
            Beyond the script, every video needs a thumbnail that earns
            the click, shorts that catch the algorithm, and metadata
            that gets it found. Ripple handles all three.
          </p>
        </Reveal>

        <div style={styles.featureGrid}>
          {items.map((item, i) => (
            <Reveal key={item.title} delay={240 + i * 80}>
              <div style={styles.featureCard}>
                <h3 style={styles.featureTitle}>{item.title}</h3>
                <p style={styles.featureCopy}>{item.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Pricing
// ─────────────────────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <section style={{ ...styles.section, ...styles.sectionAlt }} id="pricing">
      <div style={styles.container}>
        <Reveal>
          <div style={styles.eyebrow}>PRICING</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 style={styles.sectionH2}>
            Pay for output,<br />
            <em style={styles.sectionEm}>not for promises.</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p style={styles.sectionLead}>
            Free to start. Upgrade only when you ship more than 3 videos
            a month. No seats, no quotas you can&rsquo;t see, no enterprise
            sales call before you can try it.
          </p>
        </Reveal>

        <div style={styles.pricingGrid}>
          <Reveal delay={240}>
            <PricingCard
              name="Free"
              price="$0"
              period="/month"
              tagline="For trying Ripple before you trust it."
              features={[
                "3 AI Shorts per month",
                "2 Dub videos per month",
                "2 Create videos per month",
                "Thumbnail creator",
                "720p export",
                "Ripple watermark",
              ]}
              ctaLabel="Start free"
              ctaHref="/login"
              variant="default"
            />
          </Reveal>
          <Reveal delay={320}>
            <PricingCard
              name="Creator"
              price="$19"
              period="/month"
              tagline="For solo creators publishing weekly."
              badge="Most popular"
              features={[
                "30 AI Shorts per month",
                "20 Dub videos per month",
                "15 Create videos per month",
                "No watermark",
                "1080p export",
                "Up to 3 min videos",
                "YouTube auto-publish",
                "Custom intro/outro",
                "Multilingual SEO generator",
                "Unified video library",
              ]}
              ctaLabel="Start Creator"
              ctaHref="/login"
              variant="featured"
            />
          </Reveal>
          <Reveal delay={400}>
            <PricingCard
              name="Studio"
              price="$49"
              period="/month"
              tagline="For creators running a real channel."
              features={[
                "Everything in Creator",
                "100 Dub videos per month",
                "Unlimited Create videos",
                "Voice cloning (your voice)",
                "Dub into 29 languages",
                "Up to 10 min videos",
                "Priority rendering",
                "Early access to new features",
              ]}
              ctaLabel="Start Studio"
              ctaHref="/login"
              variant="default"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  name,
  price,
  period,
  tagline,
  badge,
  features,
  ctaLabel,
  ctaHref,
  variant,
}: {
  name: string;
  price: string;
  period: string;
  tagline: string;
  badge?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  variant: "default" | "featured";
}) {
  const cardStyle = variant === "featured" ? styles.priceCardFeatured : styles.priceCard;
  const ctaStyle = variant === "featured" ? styles.priceCtaFeatured : styles.priceCta;
  return (
    <div style={cardStyle}>
      {badge && <div style={styles.priceBadge}>{badge}</div>}
      <div style={styles.priceName}>{name}</div>
      <div style={styles.priceRow}>
        <span style={styles.pricePrice}>{price}</span>
        <span style={styles.pricePeriod}>{period}</span>
      </div>
      <p style={styles.priceTagline}>{tagline}</p>
      <ul style={styles.priceFeatures}>
        {features.map((f) => (
          <li key={f} style={styles.priceFeature}>
            <span style={styles.priceCheck}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link href={ctaHref} style={ctaStyle}>
        {ctaLabel} <span style={{ marginLeft: 6 }}>→</span>
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Final CTA
// ─────────────────────────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section style={styles.finalSection}>
      <div style={styles.container}>
        <Reveal>
          <h2 style={styles.finalH2}>
            Built for creators<br />
            who already know<br />
            <em style={styles.heroEm}>their stuff.</em>
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p style={styles.finalSub}>
            Stop renting an editor. Stop limiting yourself to one language.
            Start shipping the videos you should have been making for years.
          </p>
        </Reveal>
        <Reveal delay={220}>
          <div style={{ ...styles.ctaRow, justifyContent: "center" }}>
            <Link href="/login" style={styles.btnPrimary}>
              Start free <span>→</span>
            </Link>
            <a href="#pricing" style={styles.btnSecondary}>
              See pricing
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        <div style={styles.footerInner}>
          <div style={styles.footerLeft}>
            <div style={styles.footerBrand}>
              <span style={styles.brandDot} />
              <span style={styles.brandText}>Ripple</span>
            </div>
            <p style={styles.footerTag}>Reach Multiplier for creators.</p>
          </div>
          <div style={styles.footerRight}>
            <a href="#pricing" style={styles.footerLink}>Pricing</a>
            <Link href="/login" style={styles.footerLink}>Sign in</Link>
            <a href="#" style={styles.footerLink}>Privacy</a>
            <a href="#" style={styles.footerLink}>Terms</a>
          </div>
        </div>
        <div style={styles.footerBottom}>
          <span>© 2026 Ripple</span>
          <span>Built with care.</span>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — design tokens inline so this page is self-contained
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS = {
  bg: "#08080c",
  bgAlt: "#0c0c12",
  surface: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  ink: "#f4f3f8",
  ink80: "#cdcbd9",
  ink60: "#9492a6",
  ink40: "#5c5b6c",
  accent: "#a78bfa",
  accentSoft: "rgba(167,139,250,0.14)",
  accentBorder: "rgba(167,139,250,0.45)",
  containerMax: 1080,
  containerPad: 24,
  fontDisplay: '"Fraunces", "Times New Roman", Georgia, serif',
  fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: TOKENS.bg,
    color: TOKENS.ink,
    fontFamily: TOKENS.fontBody,
    fontFeatureSettings: '"ss01", "cv11"',
    WebkitFontSmoothing: "antialiased",
    position: "relative",
    overflow: "hidden",
  },

  // Background atmosphere
  bgWrap: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    overflow: "hidden",
  },
  bgBloom: {
    position: "absolute",
    top: -200,
    left: "50%",
    transform: "translateX(-50%)",
    width: 1200,
    height: 800,
    background:
      "radial-gradient(ellipse at center, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0) 60%)",
    filter: "blur(40px)",
  },
  bgGrain: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
    opacity: 0.04,
    mixBlendMode: "overlay",
  },

  // Container helper
  container: {
    maxWidth: TOKENS.containerMax,
    margin: "0 auto",
    padding: `0 ${TOKENS.containerPad}px`,
    position: "relative",
    zIndex: 1,
  },

  // Nav
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "rgba(8,8,12,0.72)",
    backdropFilter: "saturate(180%) blur(12px)",
    WebkitBackdropFilter: "saturate(180%) blur(12px)",
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  navInner: {
    maxWidth: TOKENS.containerMax,
    margin: "0 auto",
    padding: `16px ${TOKENS.containerPad}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: TOKENS.ink,
  },
  brandDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: TOKENS.accent,
    boxShadow: `0 0 12px ${TOKENS.accent}`,
    display: "inline-block",
  },
  brandText: {
    fontFamily: TOKENS.fontDisplay,
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: "-0.01em",
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: 28,
  },
  navLink: {
    fontSize: 14,
    color: TOKENS.ink60,
    textDecoration: "none",
    transition: "color 0.15s ease",
  },
  navCta: {
    fontSize: 14,
    fontWeight: 500,
    padding: "8px 16px",
    borderRadius: 8,
    background: TOKENS.ink,
    color: TOKENS.bg,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  },

  // Hero
  heroSection: {
    paddingTop: 96,
    paddingBottom: 96,
    position: "relative",
    zIndex: 1,
  },
  heroH1: {
    fontFamily: TOKENS.fontDisplay,
    fontWeight: 400,
    fontSize: "clamp(44px, 7.6vw, 88px)",
    lineHeight: 1.02,
    letterSpacing: "-0.025em",
    margin: 0,
    color: TOKENS.ink,
  },
  heroEm: {
    fontStyle: "italic",
    color: TOKENS.accent,
    fontWeight: 400,
  },
  heroSub: {
    fontSize: "clamp(16px, 1.6vw, 19px)",
    lineHeight: 1.55,
    color: TOKENS.ink80,
    maxWidth: 620,
    marginTop: 28,
    marginBottom: 0,
  },
  ctaRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 36,
    flexWrap: "wrap",
  },
  btnPrimary: {
    fontSize: 15,
    fontWeight: 500,
    padding: "13px 22px",
    borderRadius: 10,
    background: TOKENS.ink,
    color: TOKENS.bg,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px -10px rgba(167,139,250,0.4)",
  },
  btnSecondary: {
    fontSize: 15,
    fontWeight: 500,
    padding: "13px 18px",
    borderRadius: 10,
    color: TOKENS.ink80,
    textDecoration: "none",
    border: `1px solid ${TOKENS.border}`,
    background: "transparent",
    transition: "border-color 0.15s ease, color 0.15s ease",
  },
  heroFinePrint: {
    fontSize: 13,
    color: TOKENS.ink40,
    marginTop: 18,
    marginBottom: 0,
  },

  // Demo frame
  demoWrap: {
    marginTop: 72,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    overflow: "hidden",
    boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.04)",
  },
  demoBrowserChrome: {
    display: "flex",
    gap: 6,
    padding: "12px 16px",
    borderBottom: `1px solid ${TOKENS.border}`,
    background: "rgba(0,0,0,0.25)",
  },
  demoDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  demoBody: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 0,
    minHeight: 280,
  },
  demoLeft: {
    padding: "26px 24px",
    borderRight: `1px solid ${TOKENS.border}`,
  },
  demoRight: {
    padding: "26px 24px",
    background: "rgba(167,139,250,0.03)",
  },
  demoArrow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: TOKENS.accent,
    padding: "0 18px",
    borderRight: `1px solid ${TOKENS.border}`,
    background: "rgba(0,0,0,0.18)",
  },
  demoLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: TOKENS.ink40,
    marginBottom: 16,
  },
  demoScript: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    fontSize: 13,
    lineHeight: 1.55,
    color: TOKENS.ink80,
  },
  scriptLine: {
    display: "block",
  },
  demoVideo: {
    aspectRatio: "16 / 9",
    background: "linear-gradient(135deg, #1a1a26 0%, #0d0d16 100%)",
    borderRadius: 8,
    border: `1px solid ${TOKENS.border}`,
    overflow: "hidden",
    position: "relative",
  },
  demoVideoInner: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: TOKENS.accent,
    color: TOKENS.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
    boxShadow: `0 0 32px ${TOKENS.accentSoft}`,
  },
  demoCaption: {
    fontSize: 13,
    color: TOKENS.ink80,
    fontWeight: 500,
    fontFamily: TOKENS.fontDisplay,
    fontStyle: "italic",
    padding: "0 16px",
    textAlign: "center",
  },

  // Generic section
  section: {
    paddingTop: 120,
    paddingBottom: 120,
    position: "relative",
    zIndex: 1,
  },
  sectionAlt: {
    background: TOKENS.bgAlt,
    borderTop: `1px solid ${TOKENS.border}`,
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: TOKENS.accent,
    marginBottom: 24,
  },
  sectionH2: {
    fontFamily: TOKENS.fontDisplay,
    fontWeight: 400,
    fontSize: "clamp(36px, 5.4vw, 64px)",
    lineHeight: 1.04,
    letterSpacing: "-0.02em",
    margin: 0,
    color: TOKENS.ink,
  },
  sectionEm: {
    fontStyle: "italic",
    color: TOKENS.accent,
    fontWeight: 400,
  },
  sectionLead: {
    fontSize: "clamp(15px, 1.4vw, 18px)",
    lineHeight: 1.6,
    color: TOKENS.ink80,
    maxWidth: 640,
    marginTop: 28,
    marginBottom: 0,
  },
  specList: {
    listStyle: "none",
    padding: 0,
    margin: "56px 0 0",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    maxWidth: 640,
  },
  specItem: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 24,
    padding: "20px 0",
    borderTop: `1px solid ${TOKENS.border}`,
  },
  specLabel: {
    fontSize: 13,
    color: TOKENS.ink60,
    letterSpacing: "0.02em",
  },
  specValue: {
    fontSize: 15,
    color: TOKENS.ink,
    fontWeight: 500,
    textAlign: "right",
  },

  // Pull quote
  pullQuote: {
    margin: "64px 0 0",
    padding: "32px 0 32px 32px",
    borderLeft: `2px solid ${TOKENS.accent}`,
    maxWidth: 720,
  },
  pullQuoteText: {
    fontFamily: TOKENS.fontDisplay,
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: "clamp(22px, 2.6vw, 30px)",
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    color: TOKENS.ink,
    display: "block",
  },
  pullQuoteAccent: {
    color: TOKENS.accent,
  },

  // Feature grid (Section 5)
  featureGrid: {
    marginTop: 64,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 1,
    background: TOKENS.border,
    border: `1px solid ${TOKENS.border}`,
    borderRadius: 14,
    overflow: "hidden",
  },
  featureCard: {
    padding: "32px 28px",
    background: TOKENS.bg,
    height: "100%",
  },
  featureTitle: {
    fontFamily: TOKENS.fontDisplay,
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: "-0.01em",
    margin: 0,
    marginBottom: 12,
    color: TOKENS.ink,
  },
  featureCopy: {
    fontSize: 14,
    lineHeight: 1.55,
    color: TOKENS.ink60,
    margin: 0,
  },

  // Pricing
  pricingGrid: {
    marginTop: 64,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  priceCard: {
    border: `1px solid ${TOKENS.border}`,
    borderRadius: 14,
    padding: "32px 28px",
    background: TOKENS.surface,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
  },
  priceCardFeatured: {
    border: `1px solid ${TOKENS.accentBorder}`,
    borderRadius: 14,
    padding: "32px 28px",
    background:
      "linear-gradient(180deg, rgba(167,139,250,0.08) 0%, rgba(167,139,250,0.02) 100%)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
    boxShadow: "0 24px 60px -30px rgba(167,139,250,0.4)",
  },
  priceBadge: {
    position: "absolute",
    top: -12,
    left: 24,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    padding: "4px 10px",
    borderRadius: 999,
    background: TOKENS.accent,
    color: TOKENS.bg,
  },
  priceName: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: TOKENS.ink60,
    marginBottom: 16,
  },
  priceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 8,
  },
  pricePrice: {
    fontFamily: TOKENS.fontDisplay,
    fontSize: 44,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    color: TOKENS.ink,
    lineHeight: 1,
  },
  pricePeriod: {
    fontSize: 14,
    color: TOKENS.ink60,
  },
  priceTagline: {
    fontSize: 14,
    color: TOKENS.ink80,
    margin: "0 0 24px",
    lineHeight: 1.45,
  },
  priceFeatures: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    marginBottom: 28,
  },
  priceFeature: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 14,
    color: TOKENS.ink80,
    lineHeight: 1.4,
  },
  priceCheck: {
    color: TOKENS.accent,
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
    marginTop: 2,
  },
  priceCta: {
    fontSize: 14,
    fontWeight: 500,
    padding: "12px 18px",
    borderRadius: 10,
    border: `1px solid ${TOKENS.border}`,
    color: TOKENS.ink,
    textDecoration: "none",
    textAlign: "center",
    transition: "border-color 0.15s ease, background 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  priceCtaFeatured: {
    fontSize: 14,
    fontWeight: 500,
    padding: "12px 18px",
    borderRadius: 10,
    background: TOKENS.ink,
    color: TOKENS.bg,
    textDecoration: "none",
    textAlign: "center",
    transition: "transform 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Final section
  finalSection: {
    paddingTop: 140,
    paddingBottom: 140,
    textAlign: "center",
    position: "relative",
    zIndex: 1,
  },
  finalH2: {
    fontFamily: TOKENS.fontDisplay,
    fontWeight: 400,
    fontSize: "clamp(40px, 6.4vw, 76px)",
    lineHeight: 1.04,
    letterSpacing: "-0.025em",
    margin: 0,
    color: TOKENS.ink,
  },
  finalSub: {
    fontSize: "clamp(16px, 1.6vw, 19px)",
    lineHeight: 1.55,
    color: TOKENS.ink80,
    maxWidth: 580,
    margin: "28px auto 0",
  },

  // Footer
  footer: {
    paddingTop: 64,
    paddingBottom: 40,
    borderTop: `1px solid ${TOKENS.border}`,
    background: TOKENS.bg,
    position: "relative",
    zIndex: 1,
  },
  footerInner: {
    display: "flex",
    flexWrap: "wrap",
    gap: 32,
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 40,
    borderBottom: `1px solid ${TOKENS.border}`,
  },
  footerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  footerBrand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  footerTag: {
    fontSize: 13,
    color: TOKENS.ink60,
    margin: 0,
  },
  footerRight: {
    display: "flex",
    flexWrap: "wrap",
    gap: 28,
  },
  footerLink: {
    fontSize: 13,
    color: TOKENS.ink60,
    textDecoration: "none",
  },
  footerBottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 24,
    fontSize: 12,
    color: TOKENS.ink40,
    flexWrap: "wrap",
    gap: 12,
  },
};