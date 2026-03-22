"use client";

import type { ThreatFeedEntry } from "@/lib/types";

interface ThreatFeedProps {
  entries: readonly ThreatFeedEntry[];
  error: string | null;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ThreatFeed({ entries, error }: ThreatFeedProps) {
  return (
    <div className="aa-sidebar-panel">
      <h3 className="aa-panel-title">
        <span className="aa-threat-dot" aria-hidden="true" />
        Threat Feed
      </h3>

      {error && (
        <p className="aa-panel-error">{error}</p>
      )}

      {!error && entries.length === 0 && (
        <p className="aa-panel-empty">No threats detected</p>
      )}

      {entries.length > 0 && (
        <ul className="aa-panel-list aa-threat-list">
          {entries.map((e, i) => (
            <li key={`${e.txHash}:${i}`} className="aa-panel-row aa-threat-row">
              <span className="aa-panel-addr">{truncateAddress(e.agentAddress)}</span>
              <span className="aa-threat-reason" title={e.reason}>
                {e.reason.length > 40 ? `${e.reason.slice(0, 40)}...` : e.reason}
              </span>
              <span className="aa-threat-block">#{e.blockNumber.toString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
