"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { TrustFlag, AgentType } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHAIN_EXPLORER: Record<string, string> = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  gnosis: "https://gnosis.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
  optimism: "https://optimism.blockscout.com",
  polygon: "https://polygon.blockscout.com",
};

export type Recommendation = "SAFE" | "CAUTION" | "BLOCKLIST";

export const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  SAFE: "#22c55e",
  CAUTION: "#eab308",
  BLOCKLIST: "#ef4444",
};

export const RECOMMENDATION_BADGE_CLASS: Record<Recommendation, string> = {
  SAFE: "aa-badge-pill aa-badge-safe",
  CAUTION: "aa-badge-pill aa-badge-caution",
  BLOCKLIST: "aa-badge-pill aa-badge-blocklist",
};

export const VERDICT_ICONS: Record<Recommendation, React.ReactNode> = {
  SAFE: (
    React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true" },
      React.createElement("path", { d: "M20 6L9 17l-5-5" })
    )
  ),
  CAUTION: (
    React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true" },
      React.createElement("path", { d: "M12 9v4M12 17h.01" }),
      React.createElement("path", { d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" })
    )
  ),
  BLOCKLIST: (
    React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true" },
      React.createElement("circle", { cx: "12", cy: "12", r: "10" }),
      React.createElement("path", { d: "M15 9l-6 6M9 9l6 6" })
    )
  ),
};

export const AGENT_TYPE_META: Record<AgentType, { label: string; shape: string; color: string }> = {
  KEEPER:         { label: "Keeper",         shape: "hexagon",  color: "#9070d4" },
  ORACLE:         { label: "Oracle",         shape: "diamond",  color: "#60a5fa" },
  LIQUIDATOR:     { label: "Liquidator",     shape: "triangle", color: "#f97316" },
  MEV_BOT:        { label: "MEV Bot",        shape: "star",     color: "#ef4444" },
  BRIDGE_RELAYER: { label: "Bridge Relayer", shape: "octagon",  color: "#22c55e" },
  DEX_TRADER:      { label: "DEX Trader",      shape: "pentagon", color: "#eab308" },
  GOVERNANCE:      { label: "Governance",      shape: "shield",   color: "#60a5fa" },
  YIELD_OPTIMIZER: { label: "Yield Optimizer", shape: "gear",     color: "#34d399" },
  UNKNOWN:         { label: "Unknown",         shape: "circle",   color: "#78716c" },
};

export const SEVERITY_SHAPE: Record<TrustFlag["severity"], string> = {
  CRITICAL: "aa-sev-diamond",
  HIGH:     "aa-sev-triangle",
  MEDIUM:   "aa-sev-square",
  LOW:      "aa-sev-circle",
};

export const FLAG_CARD_CLASS: Record<TrustFlag["severity"], string> = {
  CRITICAL: "aa-flag-card aa-flag-critical",
  HIGH:     "aa-flag-card aa-flag-high",
  MEDIUM:   "aa-flag-card aa-flag-medium",
  LOW:      "aa-flag-card aa-flag-low",
};

export const BREAKDOWN_EXPLANATIONS: Record<string, string> = {
  "Transaction Patterns": "Timing regularity, gas efficiency, volume consistency, and nonce sequence analysis",
  "Contract Interactions": "Protocol diversity, verified vs unverified contracts, and proxy usage patterns",
  "Fund Flow": "Source legitimacy, destination analysis, circular patterns, and sudden large transfers",
  "Behavioral Consistency": "Alignment between declared purpose and actual on-chain behavior over time",
};

export const TREND_META = {
  accumulating: { icon: "\u2197", color: "#22c55e", label: "Accumulating" },
  depleting: { icon: "\u2198", color: "#ef4444", label: "Depleting" },
  stable: { icon: "\u2192", color: "var(--color-text-dim)", label: "Stable" },
} as const;

export const SPRING_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatIntervalHours(hours: number): string {
  if (hours < 1) return `every ${Math.round(hours * 60)}m`;
  if (hours < 24) return `every ${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  const days = hours / 24;
  return `every ${days % 1 === 0 ? days : days.toFixed(1)}d`;
}

export function netFlowSign(val: string): "positive" | "negative" | "neutral" {
  const n = parseFloat(val);
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
}

export function gasLabel(ethValue: number): string {
  if (ethValue < 0.01) return "Minimal activity";
  if (ethValue < 0.1) return "Light spender";
  if (ethValue < 1.0) return "Moderate spender";
  if (ethValue < 10) return "Heavy spender";
  return "Whale-tier gas usage";
}

export function netFlowLabel(ethValue: number): { text: string; color: string; arrow: string } {
  if (Math.abs(ethValue) < 0.001) return { text: "Neutral flow", color: "var(--color-text-dim)", arrow: "—" };
  if (ethValue > 0) return { text: "Net accumulator", color: "#22c55e", arrow: "\u2191" };
  return { text: "Net spender", color: "#ef4444", arrow: "\u2193" };
}

export function txSizeLabel(ethValue: number): string {
  if (ethValue < 0.01) return "Micro transactions";
  if (ethValue < 1) return "Standard range";
  if (ethValue < 10) return "Significant";
  return "Whale-sized";
}

export function formatGasUI(gas: number): string {
  if (gas >= 1_000_000) return `${(gas / 1_000_000).toFixed(1)}M`;
  if (gas >= 1_000) return `${(gas / 1_000).toFixed(1)}k`;
  return `${Math.round(gas)}`;
}

export function relativeTimeUI(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1hr ago";
  if (hours < 24) return `${hours}hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ageDaysUI(firstMs: number, lastMs: number): number {
  return Math.max(1, Math.round((lastMs - firstMs) / 86_400_000));
}

// ─── WAAPI Helpers ────────────────────────────────────────────────────────────

export function animateIn(el: Element, delay = 0): Animation {
  return el.animate(
    [
      { opacity: "0", transform: "translateY(24px) scale(0.98)" },
      { opacity: "1", transform: "translateY(0) scale(1)" },
    ],
    { duration: 500, delay, easing: SPRING_EASING, fill: "forwards" }
  );
}

export function useScrollReveal(deps: unknown[]): React.RefCallback<HTMLElement> {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.style.opacity = "0";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animateIn(el);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function AgentTypeShape({ type }: { type: AgentType }) {
  const meta = AGENT_TYPE_META[type] ?? AGENT_TYPE_META.UNKNOWN;
  const size = 28;

  const shapes: Record<string, React.ReactNode> = {
    hexagon: (
      React.createElement("polygon", {
        points: "14,2 25,8 25,20 14,26 3,20 3,8",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    diamond: (
      React.createElement("polygon", {
        points: "14,2 26,14 14,26 2,14",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    triangle: (
      React.createElement("polygon", {
        points: "14,3 26,25 2,25",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    star: (
      React.createElement("polygon", {
        points: "14,2 17,10 26,10 19,16 22,25 14,19 6,25 9,16 2,10 11,10",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    octagon: (
      React.createElement("polygon", {
        points: "9,2 19,2 26,9 26,19 19,26 9,26 2,19 2,9",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    pentagon: (
      React.createElement("polygon", {
        points: "14,2 26,10 21,24 7,24 2,10",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
      })
    ),
    circle: (
      React.createElement("circle", { cx: "14", cy: "14", r: "11", fill: "none", stroke: meta.color, strokeWidth: "1.5" })
    ),
    shield: (
      React.createElement("path", {
        d: "M14 2L4 6v7c0 5.5 4.4 9.7 10 11 5.6-1.3 10-5.5 10-11V6L14 2z",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
        strokeLinejoin: "round",
      })
    ),
    gear: (
      React.createElement("polygon", {
        points: "14,3 16,7 20,5 22,9 18,12 20,16 16,18 14,25 12,18 8,16 10,12 6,9 8,5 12,7",
        fill: "none",
        stroke: meta.color,
        strokeWidth: "1.5",
        strokeLinejoin: "round",
      })
    ),
  };

  return React.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      "aria-hidden": "true",
      style: { filter: `drop-shadow(0 0 4px ${meta.color}55)` },
    },
    shapes[meta.shape]
  );
}

export function SeverityShape({ severity }: { severity: TrustFlag["severity"] }) {
  const shapes: Record<TrustFlag["severity"], React.ReactNode> = {
    CRITICAL: (
      React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true" },
        React.createElement("polygon", { points: "7,1 13,13 1,13", fill: "none", stroke: "#ef4444", strokeWidth: "1.5" })
      )
    ),
    HIGH: (
      React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true" },
        React.createElement("polygon", { points: "7,1 13,7 7,13 1,7", fill: "none", stroke: "#eab308", strokeWidth: "1.5" })
      )
    ),
    MEDIUM: (
      React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true" },
        React.createElement("rect", { x: "2", y: "2", width: "10", height: "10", fill: "none", stroke: "#9070d4", strokeWidth: "1.5" })
      )
    ),
    LOW: (
      React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true" },
        React.createElement("circle", { cx: "7", cy: "7", r: "5.5", fill: "none", stroke: "#78716c", strokeWidth: "1.5" })
      )
    ),
  };
  return React.createElement(React.Fragment, null, shapes[severity]);
}

export function HumanWalletIndicator({ isHuman }: { isHuman: boolean }) {
  if (!isHuman) return null;
  return React.createElement(
    "div",
    { className: "aa-human-wallet", role: "alert", "aria-label": "Likely human-controlled wallet detected" },
    React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "#eab308", strokeWidth: "1.75", "aria-hidden": "true" },
      React.createElement("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
      React.createElement("circle", { cx: "12", cy: "7", r: "4" })
    ),
    React.createElement("span", null, "Likely human-controlled wallet")
  );
}

export function FlagCard({ flag }: { flag: TrustFlag }) {
  const [expanded, setExpanded] = useState(false);
  const hasLongEvidence = flag.evidence ? flag.evidence.length > 120 : false;

  return React.createElement(
    "div",
    { className: FLAG_CARD_CLASS[flag.severity], role: "listitem" },
    React.createElement(
      "div",
      { className: "aa-flag-sev-shape", "aria-label": `Severity: ${flag.severity}` },
      React.createElement(SeverityShape, { severity: flag.severity }),
      React.createElement("span", { className: SEVERITY_SHAPE[flag.severity] + " aa-sev-label" }, flag.severity)
    ),
    React.createElement(
      "div",
      { style: { flex: 1 } },
      React.createElement("p", { className: "aa-flag-desc" }, flag.description),
      flag.evidence && React.createElement(
        "div",
        { className: "aa-flag-evidence-wrap" },
        React.createElement(
          "p",
          { className: `aa-flag-evidence${!expanded && hasLongEvidence ? " aa-flag-evidence--clamped" : ""}` },
          flag.evidence
        ),
        hasLongEvidence && React.createElement(
          "button",
          {
            className: "aa-flag-toggle",
            onClick: () => setExpanded(!expanded),
            "aria-expanded": expanded,
            "aria-label": expanded ? "Show less evidence" : "Show more evidence",
          },
          expanded ? "Show less" : "Show more"
        )
      )
    )
  );
}

export function CountUpNumber({ target, color, duration = 1200 }: { target: number; color: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // cubic-bezier(0.16,1,0.3,1) approximation via ease-out-expo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return React.createElement("span", { className: "aa-score-val", style: { color } }, display);
}

export function ActivityHeatmap({ peakHours }: { peakHours: readonly number[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const peakSet = new Set(peakHours);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cells = Array.from(grid.querySelectorAll<HTMLElement>(".aa-heatmap-cell"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    cells.forEach((cell, i) => {
      cell.style.opacity = "0";
      timers.push(setTimeout(() => {
        cell.animate(
          [{ opacity: "0", transform: "scale(0.4)" }, { opacity: "1", transform: "scale(1)" }],
          { duration: 250, easing: SPRING_EASING, fill: "forwards" }
        );
      }, i * 30));
    });
    return () => timers.forEach(clearTimeout);
  }, [peakHours]);

  return React.createElement(
    "div",
    { ref: gridRef, className: "aa-heatmap", role: "img", "aria-label": `Peak activity hours UTC: ${peakHours.join(", ")}` },
    Array.from({ length: 24 }, (_, h) =>
      React.createElement("div", {
        key: h,
        className: `aa-heatmap-cell${peakSet.has(h) ? " aa-heatmap-cell--peak" : ""}`,
        title: `${String(h).padStart(2, "0")}:00 UTC${peakSet.has(h) ? " (peak)" : ""}`,
      })
    )
  );
}

export function BreakdownBar({
  axis,
  strokeColor,
  animated,
  delay,
}: {
  axis: { label: string; value: number; max: number };
  strokeColor: string;
  animated: boolean;
  delay: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pct = (axis.value / axis.max) * 100;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !animated) return;
    bar.animate(
      [
        { width: "0%" },
        { width: `${pct * 1.05}%` },
        { width: `${pct}%` },
      ],
      { duration: 900, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );
  }, [animated, pct, delay]);

  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { className: "aa-breakdown-label" },
      React.createElement("span", null, axis.label),
      React.createElement("span", { className: "aa-breakdown-score", "aria-label": `${axis.value} out of ${axis.max}` }, `${axis.value}/${axis.max}`)
    ),
    React.createElement(
      "div",
      { className: "aa-bar-track", role: "progressbar", "aria-valuenow": axis.value, "aria-valuemin": 0, "aria-valuemax": axis.max },
      React.createElement("div", {
        ref: barRef,
        className: "aa-bar-fill",
        style: { width: "0%", backgroundColor: strokeColor },
      })
    )
  );
}
