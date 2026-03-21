"use client";

import type { SessionStats as SessionStatsType } from "@/lib/types";

interface SessionStatsProps {
  stats: SessionStatsType;
}

export function SessionStats({ stats }: SessionStatsProps) {
  if (stats.totalAudited === 0) {
    return (
      <div className="aa-session-stats aa-session-stats--empty">
        <span className="aa-stats-empty-label">No audits this session</span>
      </div>
    );
  }

  return (
    <div className="aa-session-stats" aria-label="Session statistics">
      <span>{stats.totalAudited} audited</span>
      <span className="aa-stat-sep" aria-hidden="true">&middot;</span>
      <span>
        <span className="aa-dot" style={{ backgroundColor: "#22c55e" }} aria-hidden="true" />
        {stats.bySafe}
      </span>
      <span className="aa-stat-sep" aria-hidden="true">&middot;</span>
      <span>
        <span className="aa-dot" style={{ backgroundColor: "#eab308" }} aria-hidden="true" />
        {stats.byCaution}
      </span>
      <span className="aa-stat-sep" aria-hidden="true">&middot;</span>
      <span>
        <span className="aa-dot" style={{ backgroundColor: "#ef4444" }} aria-hidden="true" />
        {stats.byBlocklist}
      </span>
    </div>
  );
}
