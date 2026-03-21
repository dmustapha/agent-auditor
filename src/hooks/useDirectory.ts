"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { DirectoryAgent, AgentType, SortField } from "@/lib/types";

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

export function useDirectory(filter: AgentType | null, sort: SortField): UseDirectoryReturn {
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

  const agents = useMemo(() => {
    const filtered = filter
      ? allAgents.filter((a) => a.agentType === filter)
      : allAgents;
    return sortAgents(filtered, sort);
  }, [allAgents, filter, sort]);

  return { agents, allAgents, loading, error, lastSynced };
}
