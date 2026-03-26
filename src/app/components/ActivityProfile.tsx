"use client";

import type { ActivityProfile as ActivityProfileType } from "../../lib/types";
import { cleanProtocols } from "@/lib/sanitize";

interface ActivityProfileProps {
  readonly profile?: ActivityProfileType;
  readonly narrativeFallback?: string;
}

export function ActivityProfile({ profile, narrativeFallback }: ActivityProfileProps) {
  if (!profile) {
    // Fallback to behavioral narrative blockquote
    return narrativeFallback ? (
      <blockquote style={{
        borderLeft: "3px solid var(--color-accent)",
        paddingLeft: "1rem",
        margin: "0.75rem 0",
        color: "var(--color-text-muted)",
        fontSize: "0.85rem",
        fontStyle: "italic",
      }}>
        {narrativeFallback}
      </blockquote>
    ) : null;
  }

  return (
    <div>
      {/* Primary Activity */}
      <p className="aa-activity-primary">{profile.primaryActivity}</p>

      {/* Strategy Tags */}
      {profile.strategies.length > 0 && (
        <div className="aa-strategy-tags">
          {profile.strategies.map((s) => (
            <span key={s} className="aa-strategy-tag">{s}</span>
          ))}
        </div>
      )}

      {/* Protocol Breakdown */}
      {profile.protocolBreakdown.length > 0 && (
        <div className="aa-protocol-bar">
          {profile.protocolBreakdown.filter((entry) => cleanProtocols([entry.protocol]).length > 0).map((entry) => (
            <div key={entry.protocol} className="aa-protocol-entry">
              <span className="aa-protocol-name">{entry.protocol}</span>
              <div className="aa-protocol-pct-bar">
                <div
                  className="aa-protocol-pct-fill"
                  style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-text-dim)", minWidth: "2.5rem", textAlign: "right" }}>
                {entry.percentage}%
              </span>
              <span className="aa-protocol-action">{entry.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Success Metrics */}
      {profile.successMetrics && (
        <p className="aa-success-metrics">{profile.successMetrics}</p>
      )}

      {/* Risk Behaviors */}
      {profile.riskBehaviors.length > 0 && (
        <div className="aa-strategy-tags">
          {profile.riskBehaviors.map((r) => (
            <span key={r} className="aa-risk-tag">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}
