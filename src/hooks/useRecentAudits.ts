"use client";

import { useLocalStorage } from "./useLocalStorage";
import type { AuditRecord } from "@/lib/types";

const MAX_RECENT = 50;

export function useRecentAudits() {
  const [records, setRecords] = useLocalStorage<AuditRecord[]>("aa:recentAudits", []);

  function addAudit(record: AuditRecord) {
    setRecords((prev) => {
      const filtered = prev.filter(
        (r) => !(r.address === record.address && r.chainId === record.chainId),
      );
      return [record, ...filtered].slice(0, MAX_RECENT);
    });
  }

  return { records, addAudit };
}
