"use client";

import { useWatchlist } from "@/hooks/useWatchlist";
import { useThreatFeed } from "@/hooks/useThreatFeed";
import { computeSessionStats } from "@/hooks/useSessionStats";
import { RecentAudits } from "./RecentAudits";
import { Watchlist } from "./Watchlist";
import { ThreatFeed } from "./ThreatFeed";
import { SessionStats } from "./SessionStats";
import { AgentEcosystem } from "./AgentEcosystem";
import type { AuditRecord, ChainId, DirectoryAgent, AgentType } from "@/lib/types";
import pkg from "../../../package.json";

interface SidebarProps {
  activeItem?: "dashboard" | "history" | "settings";
  recentAudits: readonly AuditRecord[];
  onSelectAudit?: (address: string, chainId: ChainId) => void;
  directoryAgents: readonly DirectoryAgent[];
  activeFilter: AgentType | null;
  onFilterChange: (type: AgentType | null) => void;
}

export function Sidebar({ activeItem = "dashboard", recentAudits, onSelectAudit, directoryAgents, activeFilter, onFilterChange }: SidebarProps) {
  const { entries: watchlistEntries, pin, unpin, isPinned } = useWatchlist();
  const { entries: threatEntries, error: threatError } = useThreatFeed();
  const stats = computeSessionStats(recentAudits);

  const handleSelect = (address: string, chainId: ChainId) => {
    onSelectAudit?.(address, chainId);
  };

  return (
    <aside className="aa-sidebar" role="navigation" aria-label="Primary navigation">
      <div className="aa-sidebar-logo">
        <div className="aa-wordmark">AgentAuditor</div>
        <div className="aa-tagline">Trust Intelligence</div>
      </div>

      <nav className="aa-sidebar-nav" aria-label="Site navigation">
        <button
          className={`aa-nav-item ${activeItem === "dashboard" ? "active" : ""}`}
          aria-current={activeItem === "dashboard" ? "page" : undefined}
          aria-label="Dashboard"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span>Dashboard</span>
        </button>

        <button
          className={`aa-nav-item ${activeItem === "history" ? "active" : ""}`}
          aria-current={activeItem === "history" ? "page" : undefined}
          aria-label="History"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          <span>History</span>
        </button>

        <button
          className={`aa-nav-item ${activeItem === "settings" ? "active" : ""}`}
          aria-current={activeItem === "settings" ? "page" : undefined}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </nav>

      {/* ─── Sidebar Panels ─── */}
      <div className="aa-sidebar-panels">
        <AgentEcosystem
          agents={directoryAgents}
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
        />
        <ThreatFeed entries={threatEntries} error={threatError} />
        <RecentAudits
          records={recentAudits}
          onSelect={handleSelect}
          onPin={pin}
          isPinned={isPinned}
        />
        <Watchlist
          entries={watchlistEntries}
          onSelect={handleSelect}
          onUnpin={unpin}
        />
      </div>

      <div className="aa-sidebar-footer" aria-label="Application version">
        <SessionStats stats={stats} />
        <span>v{pkg.version}</span>
      </div>
    </aside>
  );
}
