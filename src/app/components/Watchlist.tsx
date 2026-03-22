"use client";

import type { ChainId, WatchlistEntry } from "@/lib/types";

interface WatchlistProps {
  entries: readonly WatchlistEntry[];
  onSelect: (address: string, chainId: ChainId) => void;
  onUnpin: (address: string, chainId: ChainId) => void;
}

const DOT_COLORS: Record<string, string> = {
  SAFE: "#22c55e",
  CAUTION: "#eab308",
  BLOCKLIST: "#ef4444",
};

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function Watchlist({ entries, onSelect, onUnpin }: WatchlistProps) {
  if (entries.length === 0) {
    return (
      <div className="aa-sidebar-panel">
        <h3 className="aa-panel-title">Watchlist</h3>
        <div className="aa-panel-empty-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <p className="aa-panel-empty">Pin agents you want to monitor</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aa-sidebar-panel">
      <h3 className="aa-panel-title">Watchlist</h3>
      <ul className="aa-panel-list">
        {entries.map((e) => (
          <li key={`${e.address}:${e.chainId}`} className="aa-panel-row">
            <button
              className="aa-panel-row-btn"
              onClick={() => onSelect(e.address, e.chainId)}
              title={e.address}
            >
              <span
                className="aa-dot"
                style={{ backgroundColor: DOT_COLORS[e.recommendation] }}
                aria-label={e.recommendation}
              />
              <span className="aa-panel-addr">{truncateAddress(e.address)}</span>
              <span className="aa-panel-chain">{e.chainId}</span>
              <span className="aa-panel-score">{e.score}</span>
            </button>
            <button
              className="aa-pin-btn pinned"
              onClick={() => onUnpin(e.address, e.chainId)}
              aria-label="Unpin from watchlist"
              title="Unpin"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
