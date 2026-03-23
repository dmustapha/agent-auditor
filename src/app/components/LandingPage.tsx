"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface LandingPageProps {
  onLaunch: () => void;
  agentCount: number;
}

const KICKER_TEXT = "// Forensic Trust Analysis";
const KICKER_CHAR_DELAY = 40;
const KICKER_DURATION = KICKER_TEXT.length * KICKER_CHAR_DELAY;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const EASE_SNAP: [number, number, number, number] = [0.22, 1, 0.36, 1];

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_SNAP } },
};

const pillContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const pillItem = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_SNAP } },
};

function TypewriterKicker() {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (displayCount >= KICKER_TEXT.length) return;
    const timer = setTimeout(
      () => setDisplayCount((c) => c + 1),
      KICKER_CHAR_DELAY,
    );
    return () => clearTimeout(timer);
  }, [displayCount]);

  return (
    <p className="aa-hero-kicker" aria-label={KICKER_TEXT}>
      <span aria-hidden="true">
        {KICKER_TEXT.slice(0, displayCount)}
      </span>
      <span className="aa-cursor" aria-hidden="true" />
    </p>
  );
}

export function LandingPage({ onLaunch, agentCount }: LandingPageProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const kickerDoneDelay = (KICKER_DURATION + 100) / 1000;

  useEffect(() => {
    const revealSection = (el: Element) => {
      el.classList.add("revealed");
      const children = el.querySelectorAll(".aa-stagger-child");
      children.forEach((child, i) => {
        (child as HTMLElement).style.transitionDelay = `${i * 100}ms`;
        child.classList.add("revealed");
      });
    };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            revealSection(entry.target);
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
    );

    const sections = document.querySelectorAll(".aa-reveal-section");
    sections.forEach((el) => {
      // Immediately reveal if already in viewport (handles production hydration timing)
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      if (inViewport) {
        revealSection(el);
      } else {
        observerRef.current?.observe(el);
      }
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="aa-landing">
      {/* Hero */}
      <section className="aa-landing-hero">
        <div className="aa-hero-sunburst-wrap" aria-hidden="true">
          <div className="aa-hero-sunburst-outer" />
          <div className="aa-hero-sunburst-inner" />
          <div className="aa-hero-sunburst-glow" />
        </div>

        <div className="aa-hero-logo">
          <img src="/logo.png" alt="" width={72} height={72} className="aa-hero-logo-img" />
          AgentAuditor
        </div>

        <div className="aa-hero-content">
          <TypewriterKicker />

          <motion.h1
            className="aa-hero-headline"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: kickerDoneDelay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            Know every agent <em>before you trust it.</em>
          </motion.h1>

          <motion.p
            className="aa-hero-subtitle"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: kickerDoneDelay + 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            Real-time onchain trust scoring across EVM chains. Transaction patterns,
            fund flows, contract interactions — distilled into one authoritative score.
          </motion.p>

          <motion.div
            className="aa-landing-hero-stats"
            aria-label="Platform statistics"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            transition={{ delayChildren: kickerDoneDelay + 0.35 }}
          >
            <motion.div className="aa-landing-hero-stat" variants={staggerItem}>
              <div className="aa-landing-hero-stat-value">
                <HeroCounter end={agentCount} duration={1400} />
              </div>
              <div className="aa-landing-hero-stat-label">Agents Indexed</div>
            </motion.div>
            <motion.div className="aa-landing-hero-stat" variants={staggerItem}>
              <div className="aa-landing-hero-stat-value">
                <HeroCounter end={6} duration={1400} />
              </div>
              <div className="aa-landing-hero-stat-label">EVM Chains</div>
            </motion.div>
            <motion.div className="aa-landing-hero-stat" variants={staggerItem}>
              <div className="aa-landing-hero-stat-value">LIVE</div>
              <div className="aa-landing-hero-stat-label">Analysis</div>
            </motion.div>
          </motion.div>

          <motion.div
            className="aa-hero-cta-wrap"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: kickerDoneDelay + 0.7, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              className="aa-hero-cta"
              onClick={onLaunch}
              aria-label="Launch Dashboard"
            >
              Launch Dashboard
            </button>
          </motion.div>

          <motion.div
            className="aa-hero-examples"
            aria-label="Example agents"
            variants={pillContainer}
            initial="hidden"
            animate="visible"
            transition={{ delayChildren: kickerDoneDelay + 0.9 }}
          >
            <motion.span className="aa-hero-pill" variants={pillItem}>Olas Keeper (Gnosis)</motion.span>
            <motion.span className="aa-hero-pill" variants={pillItem}>MEV Bot (Ethereum)</motion.span>
            <motion.span className="aa-hero-pill" variants={pillItem}>Aave Liquidator (Base)</motion.span>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="aa-landing-section aa-reveal-section">
        <div className="aa-section-header">
          <p className="aa-section-eyebrow">{"// Process"}</p>
          <h2 className="aa-section-title">How It Works</h2>
          <div className="aa-section-divider" />
        </div>
        <div className="aa-how-grid">
          <div className="aa-how-step aa-stagger-child">
            <div className="aa-how-number">01</div>
            <svg
              className="aa-how-icon"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="32" height="32" rx="4" />
              <path d="M16 24h16M24 16v16" />
            </svg>
            <h3 className="aa-how-title">Input Address</h3>
            <p className="aa-how-desc">
              Paste any EVM address or ENS name. Select your target chain from six supported networks.
            </p>
          </div>
          <div className="aa-how-step aa-stagger-child">
            <div className="aa-how-number">02</div>
            <svg
              className="aa-how-icon"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="16" />
              <path d="M24 16v8l6 4" />
            </svg>
            <h3 className="aa-how-title">AI Analysis</h3>
            <p className="aa-how-desc">
              Our engine scans transaction history, fund flows, contract interactions, and behavioral patterns in real-time.
            </p>
          </div>
          <div className="aa-how-step aa-stagger-child">
            <div className="aa-how-number">03</div>
            <svg
              className="aa-how-icon"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 36l8-12 6 8 10-20" />
              <rect x="8" y="8" width="32" height="32" rx="4" />
            </svg>
            <h3 className="aa-how-title">Trust Score</h3>
            <p className="aa-how-desc">
              Receive a comprehensive 0-100 trust score with risk flags, behavioral narrative, and actionable recommendations.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        className="aa-landing-section aa-reveal-section aa-landing-section--raised"
      >
        <div className="aa-section-header">
          <p className="aa-section-eyebrow">{"// Capabilities"}</p>
          <h2 className="aa-section-title">Built for DeFi Intelligence</h2>
          <div className="aa-section-divider" />
        </div>
        <div className="aa-features-grid">
          <div className="aa-feature-card aa-feature-card--hero aa-stagger-child">
            <div className="aa-feature-label">Core Engine</div>
            <div className="aa-feature-title">Multi-Chain Trust Scoring</div>
            <p className="aa-feature-desc">
              Cross-chain behavioral analysis powered by AI. Aggregate transaction patterns, fund flows,
              and contract interactions across Ethereum, Base, Gnosis, Arbitrum, Optimism, and Polygon
              into a single authoritative trust score.
            </p>
          </div>
          <div className="aa-feature-card aa-stagger-child">
            <div className="aa-feature-label">Detection</div>
            <div className="aa-feature-title">Agent Classification</div>
            <p className="aa-feature-desc">
              Automatically identify agent types — keepers, oracles, bridge relayers, liquidators,
              MEV bots, and more — using onchain behavioral signatures.
            </p>
          </div>
          <div className="aa-feature-card aa-stagger-child">
            <div className="aa-feature-label">Analysis</div>
            <div className="aa-feature-title">Risk Profiling</div>
            <p className="aa-feature-desc">
              Decompose risk into contract, behavioral, financial, and network dimensions with
              anomaly detection and threat intelligence.
            </p>
          </div>
          <div className="aa-feature-card aa-stagger-child">
            <div className="aa-feature-label">Monitoring</div>
            <div className="aa-feature-title">Live Threat Feed</div>
            <p className="aa-feature-desc">
              Real-time alerts for suspicious activity, blocklisted addresses, and emerging
              threat patterns across monitored chains.
            </p>
          </div>
        </div>
      </section>

      {/* Supported Chains */}
      <section className="aa-landing-section aa-reveal-section">
        <div className="aa-section-header">
          <p className="aa-section-eyebrow">{"// Coverage"}</p>
          <h2 className="aa-section-title">Supported Chains</h2>
          <div className="aa-section-divider" />
        </div>
        <div className="aa-chains-grid">
          {(["Ethereum", "Base", "Gnosis", "Arbitrum", "Optimism", "Polygon"] as const).map(
            (chain) => (
              <div key={chain} className="aa-chain-item aa-stagger-child">
                <div className="aa-chain-name">{chain}</div>
                <div className="aa-chain-status">● Active</div>
              </div>
            )
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="aa-landing-cta-section aa-reveal-section">
        <div className="aa-cta-glow-orb" aria-hidden="true" />
        <h2 className="aa-cta-title">Start Auditing Agents</h2>
        <p className="aa-cta-subtitle">Free, real-time, no account required.</p>
        <button
          className="aa-cta-btn"
          onClick={onLaunch}
          aria-label="Launch Dashboard"
        >
          Launch Dashboard
        </button>
        <p className="aa-cta-tagline">Powered by onchain data. Trust verified, not assumed.</p>
      </section>

      {/* Footer */}
      <footer className="aa-landing-footer">
        <span className="aa-footer-brand">AgentAuditor · Trust Intelligence</span>
        <nav className="aa-footer-links" aria-label="Site links">
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Twitter</a>
        </nav>
      </footer>
    </div>
  );
}

function HeroCounter({ end, duration = 1400 }: { end: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current || !ref.current) return;
    counted.current = true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      ref.current.textContent = String(end);
      return;
    }
    const el = ref.current;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration]);

  return <span ref={ref}>0</span>;
}
