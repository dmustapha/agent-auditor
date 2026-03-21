"use client";

import { useState, useEffect, useRef } from "react";
import { DossierCard } from "./DossierCard";
import type { DirectoryAgent, ChainId, SortField } from "@/lib/types";

interface AgentDirectoryProps {
  readonly agents: readonly DirectoryAgent[];
  readonly sortField: SortField;
  readonly onSortChange: (field: SortField) => void;
  readonly onSelectAgent: (address: string, chainId: ChainId) => void;
  readonly lastSynced: number | null;
  readonly loading: boolean;
  readonly error: string | null;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "score", label: "Trust Score" },
  { value: "activity", label: "Activity" },
  { value: "gas", label: "Gas Burned" },
  { value: "lastActive", label: "Recently Active" },
];

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export function AgentDirectory({
  agents,
  sortField,
  onSortChange,
  onSelectAgent,
  lastSynced,
  loading,
  error,
}: AgentDirectoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [syncAgo, setSyncAgo] = useState("—");

  // Update "synced Xs ago" every second
  useEffect(() => {
    if (!lastSynced) return;
    function update() {
      const seconds = Math.round((Date.now() - lastSynced!) / 1000);
      setSyncAgo(`${seconds}s ago`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const handleSelect = (address: string, chainId: ChainId) => {
    // Exit animation
    const el = containerRef.current;
    if (el) {
      el.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(8px)" },
        ],
        { duration: 200, easing: EASING, fill: "forwards" },
      );
      setTimeout(() => onSelectAgent(address, chainId), 200);
    } else {
      onSelectAgent(address, chainId);
    }
  };

  if (loading) {
    return (
      <div className="aa-directory" ref={containerRef}>
        <div className="aa-directory-toolbar">
          <div className="aa-directory-shimmer" style={{ width: "200px", height: "14px" }} />
          <div style={{ flex: 1 }} />
          <div className="aa-directory-shimmer" style={{ width: "100px", height: "14px" }} />
        </div>
        <div className="aa-directory-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aa-dossier-skeleton">
              <div className="aa-directory-shimmer" style={{ width: "48px", height: "48px", borderRadius: "50%" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="aa-directory-shimmer" style={{ width: "60%", height: "12px" }} />
                <div className="aa-directory-shimmer" style={{ width: "80%", height: "10px" }} />
                <div className="aa-directory-shimmer" style={{ width: "40%", height: "10px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && agents.length === 0) {
    return (
      <div className="aa-directory" ref={containerRef}>
        <p className="aa-directory-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="aa-directory" ref={containerRef}>
      {/* Toolbar */}
      <div className="aa-directory-toolbar">
        <span className="aa-directory-pulse" aria-hidden="true" />
        <span className="aa-directory-stat">Monitoring 7 chains</span>
        <span className="aa-directory-sep" aria-hidden="true" />
        <span className="aa-directory-stat">{agents.length} agents indexed</span>
        <div style={{ flex: 1 }} />
        <select
          className="aa-directory-sort"
          value={sortField}
          onChange={(e) => onSortChange(e.target.value as SortField)}
          aria-label="Sort agents by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="aa-directory-sync">Synced {syncAgo}</span>
      </div>

      {error && (
        <p className="aa-directory-warning">Live discovery unavailable — showing cached agents</p>
      )}

      {/* Dossier List */}
      {agents.length === 0 ? (
        <p className="aa-directory-empty">No agents match this filter</p>
      ) : (
        <div className="aa-directory-list">
          {agents.map((agent, i) => (
            <DossierCard
              key={`${agent.chainId}-${agent.address}`}
              agent={agent}
              index={i}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
