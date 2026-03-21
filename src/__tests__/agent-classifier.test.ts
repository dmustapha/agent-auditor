import { describe, test, expect } from "bun:test";
import { computeWalletClassification } from "../lib/agent-classifier";
import type { TransactionSummary } from "../lib/types";

function makeTxs(
  overrides: Partial<TransactionSummary>[],
  count?: number,
): readonly TransactionSummary[] {
  const base: TransactionSummary = {
    hash: "0xabc",
    from: "0xSELF",
    to: "0xTARGET1",
    value: "0",
    gasUsed: "21000",
    gasLimit: "21000",
    methodId: "0xa9059cbb",
    timestamp: 1700000000,
    success: true,
    nonce: 0,
  };
  const txs = (overrides.length > 0 ? overrides : Array(count ?? 1).fill({})).map(
    (o, i) => ({
      ...base,
      nonce: i,
      timestamp: base.timestamp + i * 3600,
      hash: `0x${i}`,
      ...o,
    }),
  );
  return txs as readonly TransactionSummary[];
}

describe("Counterparty concentration (Herfindahl)", () => {
  test("highly concentrated (1 counterparty) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ to: "0xSAME" }));
    const result = computeWalletClassification(txs);
    expect(result.humanScore).toBeLessThan(50);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("counterparty")),
    ).toBe(true);
  });

  test("diverse counterparties raises humanScore", () => {
    // Use diverse methods + diverse counterparties + diverse values to avoid other heuristics dragging score down
    const methods = ["0xa9059cbb", "0x095ea7b3", "0x7ff36ab5", "0x38ed1739", "0x"];
    const values = ["0", "1000000000000000000", "500000000000000000", "100000000000000", "2000000000000000000"];
    const txs = makeTxs(
      Array(20)
        .fill(null)
        .map((_, i) => ({
          to: `0xADDR${i}`,
          methodId: methods[i % methods.length],
          value: values[i % values.length],
          gasLimit: String(21000 + i * 1000),
        })),
    );
    const result = computeWalletClassification(txs);
    expect(result.humanScore).toBeGreaterThanOrEqual(50);
  });
});

describe("Contract vs EOA call ratio", () => {
  test("all contract calls (methodId present) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ methodId: "0xa9059cbb", value: "0" }));
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("contract")),
    ).toBe(true);
  });

  test("mostly plain ETH transfers produces human signal", () => {
    const txs = makeTxs(
      Array(20)
        .fill(null)
        .map((_, i) => ({
          methodId: "0x",
          value: "1000000000000000000",
          to: `0xADDR${i}`,
        })),
    );
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("low contract call ratio")),
    ).toBe(true);
  });
});

describe("Gas limit consistency", () => {
  test("identical gas limits lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ gasLimit: "100000" }));
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("gas")),
    ).toBe(true);
  });
});

describe("Value entropy", () => {
  test("identical values (zero entropy) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ value: "1000000000000000000" }));
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some(
        (s: string) =>
          s.toLowerCase().includes("value") || s.toLowerCase().includes("entropy"),
      ),
    ).toBe(true);
  });
});

describe("Nonce gap rate", () => {
  test("zero nonce gaps with 50+ txs lowers humanScore", () => {
    const txs = makeTxs(
      Array(60)
        .fill(null)
        .map((_, i) => ({ nonce: i })),
    );
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("nonce")),
    ).toBe(true);
  });
});

describe("Burst detection", () => {
  test("regular bursts lowers humanScore", () => {
    const txs = makeTxs(
      Array(20)
        .fill(null)
        .map((_, i) => ({
          timestamp: 1700000000 + Math.floor(i / 4) * 3600 + (i % 4) * 10,
        })),
    );
    const result = computeWalletClassification(txs);
    expect(
      result.signals.some((s: string) => s.toLowerCase().includes("burst")),
    ).toBe(true);
  });
});

describe("Confidence", () => {
  test("< 10 txs → LOW confidence", () => {
    const txs = makeTxs(Array(5).fill({}));
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("LOW");
  });

  test("10-50 txs → MEDIUM confidence", () => {
    const txs = makeTxs(
      Array(25)
        .fill(null)
        .map((_, i) => ({ nonce: i })),
    );
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("MEDIUM");
  });

  test("> 50 txs → HIGH confidence", () => {
    const txs = makeTxs(
      Array(60)
        .fill(null)
        .map((_, i) => ({ nonce: i })),
    );
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("HIGH");
  });
});
