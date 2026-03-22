"use client";

import type { AuditRecord, ChainId } from "@/lib/types";

interface RecentAuditsProps {
  records: readonly AuditRecord[];
  onSelect: (address: string, chainId: ChainId) => void;
  onPin: (record: AuditRecord) => void;
  isPinned: (address: string, chainId: ChainId) => boolean;
}

const DOT_COLORS: Record<string, string> = {
  SAFE: "#22c55e",
  CAUTION: "#eab308",
  BLOCKLIST: "#ef4444",
};

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function RecentAudits({ records, onSelect, onPin, isPinned }: RecentAuditsProps) {
  if (records.length === 0) {
    return (
      <div className="aa-sidebar-panel">
        <h3 className="aa-panel-title">Recent Audits</h3>
        <p className="aa-panel-empty">No audits yet. Run your first audit above.</p>
      </div>
    );
  }

  return (
    <div className="aa-sidebar-panel">
      <h3 className="aa-panel-title">Recent Audits</h3>
      <ul className="aa-panel-list">
        {records.map((r) => (
          <li key={`${r.address}:${r.chainId}`} className="aa-panel-row">
            <button
              className="aa-panel-row-btn"
              onClick={() => onSelect(r.address, r.chainId)}
              title={r.address}
            >
              <span
                className="aa-dot"
                style={{ backgroundColor: DOT_COLORS[r.recommendation] }}
                aria-label={r.recommendation}
              />
              <span className="aa-panel-addr">{truncateAddress(r.address)}</span>
              <span className="aa-panel-chain">{r.chainId}</span>
              <span className="aa-panel-score">{r.score}</span>
            </button>
            <button
              className={`aa-pin-btn ${isPinned(r.address, r.chainId) ? "pinned" : ""}`}
              onClick={() => onPin(r)}
              aria-label={isPinned(r.address, r.chainId) ? "Pinned" : "Pin to watchlist"}
              title={isPinned(r.address, r.chainId) ? "Pinned" : "Pin to watchlist"}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
