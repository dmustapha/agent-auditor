import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { enrichAndAnalyze } from "../lib/analyze-pipeline";
import type { AgentTransactionData, TransactionSummary, ChainId } from "../lib/types";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionSummary> = {}): TransactionSummary {
  return {
    hash: "0xabc",
    from: "0xAgent",
    to: "0xOther",
    value: "0",
    gasUsed: "21000",
    gasLimit: "21000",
    methodId: "0x4585e33b", // keeper performUpkeep
    timestamp: 1700000000,
    success: true,
    nonce: 0,
    ...overrides,
  };
}

function makeAgentData(overrides: Partial<AgentTransactionData> = {}): AgentTransactionData {
  const address = "0xAgent";
  return {
    address,
    chainId: "optimism" as ChainId,
    transactions: Array.from({ length: 20 }, (_, i) =>
      makeTx({ hash: `0x${i}`, nonce: i, timestamp: 1700000000 + i * 3600, from: address }),
    ),
    tokenTransfers: [],
    contractCalls: [],
    coinBalanceHistory: [],
    addressInfo: {
      isContract: false,
      addressType: "EOA",
      implementationAddress: null,
      ensName: null,
      transactionsCount: 500,
    },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

// Force mock mode for all tests
let origMock: string | undefined;
beforeAll(() => {
  origMock = process.env.VENICE_MOCK;
  process.env.VENICE_MOCK = "true";
});
afterAll(() => {
  if (origMock === undefined) delete process.env.VENICE_MOCK;
  else process.env.VENICE_MOCK = origMock;
});

describe("enrichAndAnalyze", () => {
  test("returns valid TrustScore in mock mode", async () => {
    const result = await enrichAndAnalyze({ agentData: makeAgentData() });

    expect(result.trustScore).toBeDefined();
    expect(result.trustScore.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.trustScore.overallScore).toBeLessThanOrEqual(100);
    expect(result.trustScore.agentAddress).toBe("0xAgent");
    expect(result.trustScore.recommendation).toMatch(/^(SAFE|CAUTION|BLOCKLIST)$/);
  });

  test("computes behavioralProfile", async () => {
    const result = await enrichAndAnalyze({ agentData: makeAgentData() });

    expect(result.behavioralProfile).toBeDefined();
    expect(result.behavioralProfile.activityBreakdown).toBeInstanceOf(Array);
    expect(result.behavioralProfile.timezoneFingerprint).toBeDefined();
    expect(result.behavioralProfile.walletAgeDays).toBeGreaterThanOrEqual(0);
  });

  test("computes entityClassification", async () => {
    const result = await enrichAndAnalyze({ agentData: makeAgentData() });

    expect(result.entityClassification).toBeDefined();
    expect(result.entityClassification.entityType).toMatch(
      /^(AUTONOMOUS_AGENT|PROTOCOL_CONTRACT|USER_WALLET|UNKNOWN)$/,
    );
    expect(result.entityClassification.confidence).toMatch(/^(LOW|MEDIUM|HIGH|DEFINITIVE)$/);
    expect(typeof result.entityClassification.fromRatio).toBe("number");
  });

  test("isERC8004Registered=true → AUTONOMOUS_AGENT", async () => {
    const result = await enrichAndAnalyze({
      agentData: makeAgentData(),
      isERC8004Registered: true,
    });

    expect(result.entityClassification.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.entityClassification.confidence).toBe("DEFINITIVE");
  });

  test("handles empty transactions array", async () => {
    const agentData = makeAgentData({ transactions: [] });
    const result = await enrichAndAnalyze({ agentData });

    expect(result.trustScore).toBeDefined();
    expect(result.behavioralProfile).toBeDefined();
    expect(result.entityClassification).toBeDefined();
  });

  test("handles missing addressInfo", async () => {
    const agentData = makeAgentData({ addressInfo: undefined });
    const result = await enrichAndAnalyze({ agentData });

    expect(result.trustScore).toBeDefined();
    expect(result.entityClassification).toBeDefined();
  });

  test("totalTxCount flows through to sampleContext", async () => {
    const result = await enrichAndAnalyze({
      agentData: makeAgentData(),
      totalTxCount: 1000,
    });

    if (result.behavioralProfile.sampleContext) {
      expect(result.behavioralProfile.sampleContext.totalTransactionCount).toBe(1000);
      expect(result.behavioralProfile.sampleContext.isSampleDerived).toBe(true);
    }
  });
});
