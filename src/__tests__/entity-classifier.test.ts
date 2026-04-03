import { describe, test, expect } from "bun:test";
import { computeFromRatio, classifyEntityType } from "../lib/entity-classifier";
import type { TransactionSummary, AddressInfo, SmartContractData, WalletClassification } from "../lib/types";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionSummary> = {}): TransactionSummary {
  return {
    hash: "0xabc",
    from: "0xSELF",
    to: "0xOTHER",
    value: "0",
    gasUsed: "21000",
    gasLimit: "21000",
    methodId: "0xa9059cbb",
    timestamp: 1700000000,
    success: true,
    nonce: 0,
    ...overrides,
  };
}

function makeTxs(count: number, from: string, to: string): readonly TransactionSummary[] {
  return Array.from({ length: count }, (_, i) =>
    makeTx({ from, to, nonce: i, timestamp: 1700000000 + i * 60, hash: `0x${i}` }),
  );
}

const CONTRACT_ADDRESS_INFO: AddressInfo = {
  isContract: true,
  addressType: "contract",
  implementationAddress: null,
  ensName: null,
  transactionsCount: 100,
};

const EOA_ADDRESS_INFO: AddressInfo = {
  isContract: false,
  addressType: "EOA",
  implementationAddress: null,
  ensName: null,
  transactionsCount: 100,
};

const HIGH_HUMAN_WALLET: WalletClassification = {
  isDefinitelyContract: false,
  isERC4337: false,
  humanScore: 85,
  signals: ["diverse counterparties"],
  tier1Decisive: false,
  confidence: "HIGH",
};

const LOW_HUMAN_WALLET: WalletClassification = {
  isDefinitelyContract: false,
  isERC4337: false,
  humanScore: 15,
  signals: ["automated patterns"],
  tier1Decisive: false,
  confidence: "HIGH",
};

// ─── computeFromRatio ──────────────────────────────────────────────────────

describe("computeFromRatio", () => {
  test("empty txs → 0", () => {
    expect(computeFromRatio("0xSELF", [])).toBe(0);
  });

  test("all from self → 1.0", () => {
    const txs = makeTxs(10, "0xSELF", "0xOTHER");
    expect(computeFromRatio("0xSELF", txs)).toBe(1.0);
  });

  test("all to self (none from) → 0.0", () => {
    const txs = makeTxs(10, "0xOTHER", "0xSELF");
    expect(computeFromRatio("0xSELF", txs)).toBe(0.0);
  });

  test("mixed 50/50 → 0.5", () => {
    const txs = [
      ...makeTxs(5, "0xSELF", "0xOTHER"),
      ...makeTxs(5, "0xOTHER", "0xSELF"),
    ];
    expect(computeFromRatio("0xSELF", txs)).toBe(0.5);
  });

  test("case insensitive address matching", () => {
    const txs = makeTxs(10, "0xself", "0xOTHER");
    expect(computeFromRatio("0xSELF", txs)).toBe(1.0);
  });
});

// ─── classifyEntityType ────────────────────────────────────────────────────

describe("classifyEntityType", () => {
  test("protocol registry match → PROTOCOL_CONTRACT/DEFINITIVE", () => {
    const result = classifyEntityType({
      address: "0x1111111254eeb25477b68fb85ed929f73a960582",
      transactions: makeTxs(10, "0xOTHER", "0x1111111254eeb25477b68fb85ed929f73a960582"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("DEFINITIVE");
    expect(result.primarySignal).toContain("protocol registry");
  });

  test("contract name pattern → PROTOCOL_CONTRACT/HIGH", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(10, "0xOTHER", "0xABC"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      smartContractData: { isVerified: true, name: "UniswapV3Router", abi: null, sourceCode: null } as SmartContractData,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("HIGH");
    expect(result.primarySignal).toContain("contract name");
  });

  test("contract + low from ratio → PROTOCOL_CONTRACT/HIGH", () => {
    const txs = [
      ...makeTxs(1, "0xABC", "0xOTHER"),
      ...makeTxs(19, "0xOTHER", "0xABC"),
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("HIGH");
  });

  test("ERC-8004 registered → AUTONOMOUS_AGENT/DEFINITIVE", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(10, "0xABC", "0xOTHER"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: true,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("DEFINITIVE");
  });

  test("contract + high from ratio → AUTONOMOUS_AGENT/HIGH", () => {
    const txs = [
      ...makeTxs(18, "0xABC", "0xOTHER"),
      ...makeTxs(2, "0xOTHER", "0xABC"),
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("HIGH");
  });

  test("EOA + high humanScore → USER_WALLET/MEDIUM", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: HIGH_HUMAN_WALLET,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("MEDIUM");
  });

  test("EOA + low humanScore → AUTONOMOUS_AGENT/MEDIUM", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: LOW_HUMAN_WALLET,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("MEDIUM");
  });

  test("EOA with ambiguous humanScore (30-70) → USER_WALLET/LOW via EOA fallback", () => {
    const midWallet: WalletClassification = { ...HIGH_HUMAN_WALLET, humanScore: 50 };
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: midWallet,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("LOW");
    expect(result.primarySignal).toBe("EOA without strong classification signals");
  });

  test("contract with ambiguous signals → UNKNOWN/LOW", () => {
    const midWallet: WalletClassification = { ...HIGH_HUMAN_WALLET, humanScore: 50, isDefinitelyContract: true };
    const txs = [
      ...makeTxs(10, "0xABC", "0xOTHER"),
      ...makeTxs(10, "0xOTHER", "0xABC"),
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      walletClassification: midWallet,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");
  });

  test("< 10 txs → skips from-ratio heuristics", () => {
    const txs = makeTxs(5, "0xOTHER", "0xABC");
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("UNKNOWN");
  });

  test("waterfall priority: registry wins over ERC-8004", () => {
    const result = classifyEntityType({
      address: "0x1111111254eeb25477b68fb85ed929f73a960582",
      transactions: makeTxs(10, "0xOTHER", "0x1111111254eeb25477b68fb85ed929f73a960582"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: true,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("DEFINITIVE");
  });

  test("ERC-8004 beats low from-ratio heuristic", () => {
    // Contract with 0% from-ratio BUT is ERC-8004 registered → agent wins
    const txs = makeTxs(20, "0xOTHER", "0xABC");
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: true,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("DEFINITIVE");
    expect(result.primarySignal).toBe("ERC-8004 registered");
  });

  test("Blockscout isContract=true but walletClassification says not a contract → uses humanScore", () => {
    // Edge case: Blockscout flags as contract (e.g. vitalik.eth) but behavioral analysis disagrees
    // Use moderate from-ratio (50%) so from-ratio heuristics don't fire first
    const txs = [
      ...makeTxs(10, "0xABC", "0xOTHER"),
      ...makeTxs(10, "0xOTHER", "0xABC"),
    ];
    const contractButNotReally: AddressInfo = { ...CONTRACT_ADDRESS_INFO, isContract: true };
    const notReallyContract: WalletClassification = { ...HIGH_HUMAN_WALLET, isDefinitelyContract: false, humanScore: 85 };
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: contractButNotReally,
      walletClassification: notReallyContract,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("MEDIUM");
  });

  test("EOA without walletClassification → USER_WALLET/LOW via EOA fallback", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("LOW");
  });

  test("contract without walletClassification and < 10 txs → UNKNOWN", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(5, "0xOTHER", "0xABC"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("UNKNOWN");
  });

  test("EOA with humanScore 40 → USER_WALLET/LOW (edge case)", () => {
    const lowMidWallet: WalletClassification = { ...HIGH_HUMAN_WALLET, humanScore: 40 };
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: lowMidWallet,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("LOW");
  });

  test("Blockscout false positive: isContract=true but isDefinitelyContract=false → USER_WALLET/LOW", () => {
    // vitalik.eth scenario: Blockscout says contract, behavioral analysis disagrees, humanScore in ambiguous zone
    const midWallet: WalletClassification = { ...HIGH_HUMAN_WALLET, humanScore: 50, isDefinitelyContract: false };
    const txs = [
      ...makeTxs(5, "0xABC", "0xOTHER"),
      ...makeTxs(5, "0xOTHER", "0xABC"),
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO, // isContract: true
      walletClassification: midWallet,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("LOW");
    expect(result.primarySignal).toBe("behavioral analysis overrides Blockscout isContract flag");
  });
});
