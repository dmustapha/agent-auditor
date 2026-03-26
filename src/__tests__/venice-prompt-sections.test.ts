import { describe, test, expect } from "bun:test";

function buildDataWindowSection(sampleContext?: {
  isSampleDerived: boolean;
  totalTransactionCount: number;
  sampleSize: number;
  sampleCoveragePercent: number;
}): string {
  if (!sampleContext?.isSampleDerived) return "";
  const coverage = sampleContext.sampleCoveragePercent;
  let warning = "";
  if (coverage < 10) {
    warning = "\n⚠ CRITICAL: Sample is <10% of total history. DO NOT infer wallet age, daily frequency, or busiest day from this sample. Use total count for scale. Sample shows recent patterns only.";
  } else if (coverage < 50) {
    warning = "\n⚠ Sample covers <50% of history. Exercise caution with age-based and frequency metrics.";
  }
  return `\n=== DATA WINDOW (READ THIS FIRST) ===\nTotal transactions on-chain (Blockscout): ${sampleContext.totalTransactionCount}\nSample fetched: ${sampleContext.sampleSize} (most recent)\nSample coverage: ${coverage}%${warning}\n`;
}

function buildEntitySection(entityClassification?: {
  entityType: string;
  confidence: string;
  fromRatio: number;
  primarySignal: string;
  signals: readonly string[];
}): string {
  if (!entityClassification) return "";
  const framingByType: Record<string, string> = {
    AUTONOMOUS_AGENT: "Produce a standard agent trust score audit.",
    PROTOCOL_CONTRACT: "Frame as protocol health check. Note this is infrastructure, not an agent. User may have mistakenly submitted this.",
    USER_WALLET: "Frame as wallet security review. Note this appears to be a personal wallet. User may have mistakenly submitted this.",
    UNKNOWN: "Entity type could not be determined. Analyze based on data patterns. Do not assume this is an agent.",
  };
  return `\n=== ENTITY CLASSIFICATION ===\nEntity type: ${entityClassification.entityType}\nClassification confidence: ${entityClassification.confidence}\nFrom ratio: ${Math.round(entityClassification.fromRatio * 100)}%\nPrimary signal: ${entityClassification.primarySignal}\nAll signals: ${entityClassification.signals.join(", ")}\n${framingByType[entityClassification.entityType] ?? ""}\n`;
}

describe("Venice prompt — DATA WINDOW section", () => {
  test("isSampleDerived=true → includes DATA WINDOW", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true, totalTransactionCount: 9_700_000,
      sampleSize: 100, sampleCoveragePercent: 0.001,
    });
    expect(section).toContain("DATA WINDOW");
    expect(section).toContain("9700000");
  });

  test("isSampleDerived=false → empty string", () => {
    const section = buildDataWindowSection({
      isSampleDerived: false, totalTransactionCount: 100,
      sampleSize: 100, sampleCoveragePercent: 100,
    });
    expect(section).toBe("");
  });

  test("coverage <10% → hard warning", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true, totalTransactionCount: 50000,
      sampleSize: 100, sampleCoveragePercent: 0.2,
    });
    expect(section).toContain("CRITICAL");
  });

  test("coverage 10-50% → soft warning", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true, totalTransactionCount: 300,
      sampleSize: 100, sampleCoveragePercent: 33.33,
    });
    expect(section).toContain("Exercise caution");
    expect(section).not.toContain("CRITICAL");
  });
});

describe("Venice prompt — ENTITY CLASSIFICATION section", () => {
  test("PROTOCOL_CONTRACT → health check framing", () => {
    const section = buildEntitySection({
      entityType: "PROTOCOL_CONTRACT", confidence: "DEFINITIVE",
      fromRatio: 0.02, primarySignal: "protocol registry: 1inch V5",
      signals: ["protocol registry: 1inch V5"],
    });
    expect(section).toContain("health check");
  });

  test("UNKNOWN → 'could not be determined'", () => {
    const section = buildEntitySection({
      entityType: "UNKNOWN", confidence: "LOW",
      fromRatio: 0.5, primarySignal: "no definitive signals",
      signals: ["no definitive signals"],
    });
    expect(section).toContain("could not be determined");
  });

  test("undefined → empty string", () => {
    expect(buildEntitySection(undefined)).toBe("");
  });
});
