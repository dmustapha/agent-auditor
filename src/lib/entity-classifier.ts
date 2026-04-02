import type {
  EntityClassification,
  TransactionSummary,
  AddressInfo,
  SmartContractData,
  WalletClassification,
} from "./types";
import { resolveProtocolName } from "./protocol-registry";
import { resolveSolanaProgram } from "./solana-programs";

// ─── Input Interface ────────────────────────────────────────────────────────

export interface EntityClassifierInput {
  readonly address: string;
  readonly transactions: readonly TransactionSummary[];
  readonly addressInfo?: AddressInfo;
  readonly smartContractData?: SmartContractData;
  readonly walletClassification?: WalletClassification;
  readonly isERC8004Registered: boolean;
}

// ─── From Ratio ─────────────────────────────────────────────────────────────

export function computeFromRatio(
  address: string,
  transactions: readonly TransactionSummary[],
): number {
  if (transactions.length === 0) return 0;
  const selfLower = address.toLowerCase();
  const fromCount = transactions.filter(
    (tx) => tx.from.toLowerCase() === selfLower,
  ).length;
  return fromCount / transactions.length;
}

// ─── Protocol Name Patterns ─────────────────────────────────────────────────

const PROTOCOL_NAME_PATTERNS = [
  "router",
  "pool",
  "vault",
  "factory",
  "proxy",
  "registry",
  "controller",
  "comptroller",
  "aggregator",
  "exchange",
  "bridge",
  "gateway",
  "inbox",
  "spoke",
];

function matchesProtocolPattern(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTOCOL_NAME_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ─── Classifier ─────────────────────────────────────────────────────────────

export function classifyEntityType(
  input: EntityClassifierInput,
): EntityClassification {
  const {
    address,
    transactions,
    addressInfo,
    smartContractData,
    walletClassification,
    isERC8004Registered,
  } = input;
  const isContract = addressInfo?.isContract ?? false;
  const fromRatio = computeFromRatio(address, transactions);
  const signals: string[] = [];

  // ─── Solana-Specific Classification ──────────────────────────────────
  const solanaProgram = resolveSolanaProgram(address);
  if (solanaProgram) {
    signals.push(`solana program registry: ${solanaProgram.name}`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: `solana program: ${solanaProgram.name}`,
    };
  }

  // Step 1: Protocol registry match
  const protocolName = resolveProtocolName(address);
  if (protocolName) {
    signals.push(`protocol registry: ${protocolName}`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: `protocol registry: ${protocolName}`,
    };
  }

  // Step 2: Contract name matches protocol patterns
  if (smartContractData?.name && matchesProtocolPattern(smartContractData.name)) {
    signals.push(`contract name: ${smartContractData.name}`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "HIGH",
      signals,
      fromRatio,
      primarySignal: `contract name: ${smartContractData.name}`,
    };
  }

  // Step 3: ERC-8004 registered (definitive — beats heuristics)
  if (isERC8004Registered) {
    signals.push("ERC-8004 registered");
    return {
      entityType: "AUTONOMOUS_AGENT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: "ERC-8004 registered",
    };
  }

  // Step 4: Contract + low from ratio (requires >= 10 txs)
  if (isContract && transactions.length >= 10 && fromRatio <= 0.05) {
    const pct = (fromRatio * 100).toFixed(1);
    signals.push(`contract with low from ratio (${pct}%)`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "HIGH",
      signals,
      fromRatio,
      primarySignal: `low from ratio: ${pct}%`,
    };
  }

  // Step 5: Contract + high from ratio (requires >= 10 txs)
  if (isContract && transactions.length >= 10 && fromRatio > 0.7) {
    const pct = (fromRatio * 100).toFixed(1);
    signals.push(`contract with high from ratio (${pct}%)`);
    return {
      entityType: "AUTONOMOUS_AGENT",
      confidence: "HIGH",
      signals,
      fromRatio,
      primarySignal: `high from ratio: ${pct}%`,
    };
  }

  // Steps 6-7: humanScore-based (requires walletClassification, skip for definite contracts)
  const definitelyContract = walletClassification?.isDefinitelyContract ?? isContract;
  if (!definitelyContract && walletClassification) {
    if (walletClassification.humanScore > 70) {
      signals.push(`human score: ${walletClassification.humanScore}/100`);
      return {
        entityType: "USER_WALLET",
        confidence: "MEDIUM",
        signals,
        fromRatio,
        primarySignal: `human score: ${walletClassification.humanScore}/100`,
      };
    }

    if (walletClassification.humanScore < 30) {
      signals.push(`low human score: ${walletClassification.humanScore}/100`);
      return {
        entityType: "AUTONOMOUS_AGENT",
        confidence: "MEDIUM",
        signals,
        fromRatio,
        primarySignal: `low human score: ${walletClassification.humanScore}/100`,
      };
    }
  }

  // Step 7.5: EOA/wallet fallback
  // Catches true EOAs and Blockscout false positives (isContract=true but behavioral analysis disagrees)
  const likelyEOA = !isContract || (isContract && walletClassification && !walletClassification.isDefinitelyContract);
  if (likelyEOA) {
    const signal = !isContract
      ? "EOA without strong classification signals"
      : "behavioral analysis overrides Blockscout isContract flag";
    signals.push(signal);
    return {
      entityType: "USER_WALLET",
      confidence: "LOW",
      signals,
      fromRatio,
      primarySignal: signal,
    };
  }

  // Step 8: Unknown (contracts with ambiguous signals)
  signals.push("no definitive signals");
  return {
    entityType: "UNKNOWN",
    confidence: "LOW",
    signals,
    fromRatio,
    primarySignal: "no definitive signals",
  };
}
