import type { AuditRecord, SessionStats } from "@/lib/types";

export function computeSessionStats(records: readonly AuditRecord[]): SessionStats {
  return {
    totalAudited: records.length,
    bySafe: records.filter((r) => r.recommendation === "SAFE").length,
    byCaution: records.filter((r) => r.recommendation === "CAUTION").length,
    byBlocklist: records.filter((r) => r.recommendation === "BLOCKLIST").length,
  };
}
