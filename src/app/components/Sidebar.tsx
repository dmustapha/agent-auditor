"use client";

import { useMemo } from "react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useThreatFeed } from "@/hooks/useThreatFeed";
import { computeSessionStats } from "@/hooks/useSessionStats";
import { RecentAudits } from "./RecentAudits";
import { Watchlist } from "./Watchlist";
import { ThreatFeed } from "./ThreatFeed";
import { SessionStats } from "./SessionStats";
import { AgentEcosystem } from "./AgentEcosystem";
import type { AuditRecord, ChainId, DirectoryAgent, AgentType, ThreatFeedEntry } from "@/lib/types";
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

  // Merge synthetic BLOCKLIST entries from recent audits into threat feed
  const mergedThreats = useMemo(() => {
    const syntheticThreats: ThreatFeedEntry[] = recentAudits
      .filter(r => r.recommendation === "BLOCKLIST")
      .map(r => ({
        agentAddress: r.address,
        reason: `BLOCKLIST: score ${r.score}/100 (${r.agentType})`,
        blockNumber: 0n,
        txHash: "local",
        timestamp: r.timestamp,
      }));
    return [...threatEntries, ...syntheticThreats]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }, [recentAudits, threatEntries]);

  const handleSelect = (address: string, chainId: ChainId) => {
    onSelectAudit?.(address, chainId);
  };

  return (
    <aside className="aa-sidebar" role="navigation" aria-label="Primary navigation">
      <div className="aa-sidebar-logo">
        <img src="/logo.png" alt="AgentAuditor" width={36} height={36} className="aa-sidebar-logo-img" />
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
        <ThreatFeed entries={mergedThreats} error={threatError} />
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

      <a
        href="https://t.me/agentauditor_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="aa-telegram-banner"
        aria-label="Open AgentAuditor Telegram bot"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
        <div className="aa-telegram-banner-text">
          <span className="aa-telegram-banner-title">Audit on Telegram</span>
          <span className="aa-telegram-banner-desc">Run audits on the go via @agentauditor_bot</span>
        </div>
      </a>

      <div className="aa-sidebar-footer" aria-label="Application version">
        <SessionStats stats={stats} />
        <span>v{pkg.version}</span>
      </div>
    </aside>
  );
}
