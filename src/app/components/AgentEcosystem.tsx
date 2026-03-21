"use client";

import { useRef, useEffect, useMemo } from "react";
import type { DirectoryAgent, AgentType } from "@/lib/types";
import { AGENT_TYPE_LABELS, AGENT_TYPE_COLORS } from "@/lib/directory-seed";

interface AgentEcosystemProps {
  readonly agents: readonly DirectoryAgent[];
  readonly activeFilter: AgentType | null;
  readonly onFilterChange: (type: AgentType | null) => void;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const DISPLAY_ORDER: AgentType[] = ["KEEPER", "ORACLE", "BRIDGE_RELAYER", "LIQUIDATOR", "MEV_BOT", "DEX_TRADER"];

export function AgentEcosystem({ agents, activeFilter, onFilterChange }: AgentEcosystemProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Count agents per type
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<AgentType, number>> = {};
    for (const agent of agents) {
      counts[agent.agentType] = (counts[agent.agentType] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  const total = agents.length;

  // Donut segment data
  const segments = useMemo(() => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return DISPLAY_ORDER
      .filter((type) => (typeCounts[type] ?? 0) > 0)
      .map((type) => {
        const count = typeCounts[type] ?? 0;
        const fraction = count / (total || 1);
        const length = fraction * circumference;
        const seg = { type, count, color: AGENT_TYPE_COLORS[type], dasharray: `${length} ${circumference - length}`, dashoffset: -offset, circumference };
        offset += length;
        return seg;
      });
  }, [typeCounts, total]);

  // Animate donut segments on mount
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const circles = svg.querySelectorAll<SVGCircleElement>(".aa-ecosystem-segment");
    circles.forEach((circle, i) => {
      const targetDasharray = circle.getAttribute("data-dasharray") ?? "";
      const [filled] = targetDasharray.split(" ").map(Number);
      const circumference = parseFloat(circle.getAttribute("data-circumference") ?? "264");
      circle.style.strokeDasharray = `0 ${circumference}`;
      circle.animate(
        [
          { strokeDasharray: `0 ${circumference}` },
          { strokeDasharray: targetDasharray },
        ],
        { duration: 400, delay: i * 60, easing: EASING, fill: "forwards" },
      );
    });
  }, [segments]);

  if (total === 0) return null;

  return (
    <div className="aa-ecosystem">
      <div className="aa-ecosystem-header">Agent Ecosystem</div>

      {/* Donut Ring */}
      <div className="aa-ecosystem-donut">
        <svg ref={svgRef} width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="42" fill="none" stroke="var(--color-border-subtle)" strokeWidth="12" />
          {segments.map((seg) => (
            <circle
              key={seg.type}
              className="aa-ecosystem-segment"
              cx="60" cy="60" r="42"
              fill="none"
              stroke={seg.color}
              strokeWidth="12"
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
              strokeLinecap="round"
              data-dasharray={seg.dasharray}
              data-circumference={seg.circumference}
              style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
            />
          ))}
        </svg>
        <div className="aa-ecosystem-center">
          <span className="aa-ecosystem-total">{total}</span>
          <span className="aa-ecosystem-label">agents</span>
        </div>
      </div>

      {/* Type Filter Rows */}
      <div className="aa-ecosystem-filters">
        <button
          className={`aa-ecosystem-row ${activeFilter === null ? "aa-ecosystem-row--active" : ""}`}
          onClick={() => onFilterChange(null)}
        >
          <span className="aa-ecosystem-dot" style={{ background: "var(--color-text-secondary)" }} />
          <span className="aa-ecosystem-type-label">All Agents</span>
          <span className="aa-ecosystem-count">{total}</span>
        </button>
        {DISPLAY_ORDER.map((type) => {
          const count = typeCounts[type] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={type}
              className={`aa-ecosystem-row ${activeFilter === type ? "aa-ecosystem-row--active" : ""}`}
              onClick={() => onFilterChange(activeFilter === type ? null : type)}
            >
              <span className="aa-ecosystem-dot" style={{ background: AGENT_TYPE_COLORS[type] }} />
              <span className="aa-ecosystem-type-label">{AGENT_TYPE_LABELS[type]}</span>
              <span className="aa-ecosystem-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
