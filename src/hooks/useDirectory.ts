"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { DirectoryAgent, AgentType, SortField, AuditRecord } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

interface UseDirectoryReturn {
  readonly agents: readonly DirectoryAgent[];
  readonly allAgents: readonly DirectoryAgent[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastSynced: number | null;
}

function sortAgents(agents: readonly DirectoryAgent[], field: SortField): readonly DirectoryAgent[] {
  const sorted = [...agents];
  switch (field) {
    case "score":
      return sorted.sort((a, b) => b.score - a.score);
    case "activity":
      return sorted.sort((a, b) => b.txCount - a.txCount);
    case "gas":
      return sorted.sort((a, b) => parseFloat(b.financialSummary.totalGasSpentETH) - parseFloat(a.financialSummary.totalGasSpentETH));
    case "lastActive":
      return sorted.sort((a, b) => b.lastActive - a.lastActive);
    default:
      return sorted;
  }
}

function auditToDirectoryAgent(record: AuditRecord): DirectoryAgent {
  return {
    address: record.address,
    chainId: record.chainId,
    name: `${record.agentType} ${record.address.slice(0, 8)}`,
    agentType: record.agentType,
    score: record.score,
    recommendation: record.recommendation,
    behavioralNarrative: "",
    financialSummary: { totalGasSpentETH: "0", netFlowETH: "0" },
    operationalPattern: { peakHoursUTC: [], consistencyScore: 0 },
    protocolsUsed: [],
    funFact: "",
    anomalies: [],
    txCount: 0,
    lastActive: record.timestamp,
    source: "live",
  };
}

export function useDirectory(filter: AgentType | null, sort: SortField, recentAudits?: readonly AuditRecord[]): UseDirectoryReturn {
  const [allAgents, setAllAgents] = useState<readonly DirectoryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fetchDirectory() {
      try {
        const res = await fetch("/api/directory");
        if (!res.ok) throw new Error("Failed to fetch directory");
        const data = await res.json();
        if (!mountedRef.current) return;
        setAllAgents(data.agents);
        setLastSynced(data.timestamp);
        setError(null);
      } catch {
        if (mountedRef.current) setError("Directory temporarily unavailable");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchDirectory().then(() => {
      if (mountedRef.current) {
        intervalId = setInterval(fetchDirectory, POLL_INTERVAL_MS);
      }
    });

    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Merge seed agents with live audit records (deduplicate by address)
  const allMerged = useMemo(() => {
    if (!recentAudits?.length) return allAgents;
    const seen = new Set(allAgents.map(a => a.address.toLowerCase()));
    const liveAgents = recentAudits
      .filter(r => !seen.has(r.address.toLowerCase()))
      .map(auditToDirectoryAgent);
    return [...allAgents, ...liveAgents];
  }, [allAgents, recentAudits]);

  const agents = useMemo(() => {
    const filtered = filter
      ? allMerged.filter((a) => a.agentType === filter)
      : allMerged;
    return sortAgents(filtered, sort);
  }, [allMerged, filter, sort]);

  return { agents, allAgents: allMerged, loading, error, lastSynced };
}
