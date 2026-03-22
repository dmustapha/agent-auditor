"use client";

import { useLocalStorage } from "./useLocalStorage";
import type { AuditRecord, ChainId, WatchlistEntry } from "@/lib/types";

export function useWatchlist() {
  const [entries, setEntries] = useLocalStorage<WatchlistEntry[]>("aa:watchlist", []);

  function pin(record: AuditRecord) {
    setEntries((prev) => {
      if (prev.some((e) => e.address === record.address && e.chainId === record.chainId)) {
        return prev;
      }
      return [...prev, { ...record, pinnedAt: Date.now() }];
    });
  }

  function unpin(address: string, chainId: ChainId) {
    setEntries((prev) =>
      prev.filter((e) => !(e.address === address && e.chainId === chainId)),
    );
  }

  function isPinned(address: string, chainId: ChainId): boolean {
    return entries.some((e) => e.address === address && e.chainId === chainId);
  }

  return { entries, pin, unpin, isPinned };
}
