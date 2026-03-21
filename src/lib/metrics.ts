import type { AgentMetrics, AgentTransactionData } from "./types";
import { classifyAgentType, detectERC4337 } from "./agent-classifier";

export function computeMetrics(data: Pick<AgentTransactionData, "address" | "chainId" | "transactions" | "tokenTransfers" | "contractCalls">): AgentMetrics {
  const { address, transactions } = data;

  // Gas metrics
  const gasValues = transactions.map(tx => Number(tx.gasUsed));
  const totalGas = gasValues.reduce((sum, g) => sum + g, 0);
  const avgGasPerTx = transactions.length > 0 ? totalGas / transactions.length : 0;

  // Timestamps
  const timestamps = transactions.map(tx => tx.timestamp).sort((a, b) => a - b);
  const firstSeen = timestamps.length > 0 ? timestamps[0] : null;
  const lastSeen = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  // Tx frequency
  const daySpan = firstSeen && lastSeen && lastSeen > firstSeen
    ? (lastSeen - firstSeen) / (1000 * 60 * 60 * 24)
    : 1;
  const txFrequencyPerDay = transactions.length / Math.max(daySpan, 1);

  // Active hours histogram (24 buckets)
  const activeHoursUTC = new Array(24).fill(0) as number[];
  for (const ts of timestamps) {
    const hour = new Date(ts).getUTCHours();
    activeHoursUTC[hour]++;
  }

  // Unique counterparties
  const selfLower = address.toLowerCase();
  const counterparties = new Set<string>();
  for (const tx of transactions) {
    if (tx.from.toLowerCase() !== selfLower) counterparties.add(tx.from.toLowerCase());
    if (tx.to && tx.to !== "CONTRACT_CREATION" && tx.to.toLowerCase() !== selfLower) {
      counterparties.add(tx.to.toLowerCase());
    }
  }

  // Largest single tx
  let largestTxWei = 0n;
  for (const tx of transactions) {
    try {
      const val = BigInt(tx.value);
      if (val > largestTxWei) largestTxWei = val;
    } catch { /* non-numeric value, skip */ }
  }

  // Nonce gaps
  let nonceGaps = 0;
  const nonces = transactions
    .filter(tx => tx.nonce !== undefined)
    .map(tx => tx.nonce!)
    .sort((a, b) => a - b);
  for (let i = 1; i < nonces.length; i++) {
    if (nonces[i] - nonces[i - 1] > 1) nonceGaps++;
  }

  // Real success rate from Blockscout result field
  const successCount = transactions.filter(tx => tx.success).length;
  const successRate = transactions.length > 0 ? successCount / transactions.length : 1.0;

  // Most called contracts (top 5)
  const contractCounts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.to && tx.to !== "CONTRACT_CREATION") {
      const addr = tx.to.toLowerCase();
      contractCounts.set(addr, (contractCounts.get(addr) ?? 0) + 1);
    }
  }
  const mostCalledContracts = Array.from(contractCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([addr]) => addr);

  return {
    avgGasPerTx,
    totalGasSpentWei: totalGas.toString(),
    txFrequencyPerDay,
    activeHoursUTC,
    successRate,
    uniqueCounterparties: counterparties.size,
    largestSingleTxWei: largestTxWei.toString(),
    nonceGaps,
    firstSeenTimestamp: firstSeen,
    lastSeenTimestamp: lastSeen,
    mostCalledContracts,
    agentType: classifyAgentType(transactions),
    isERC4337: detectERC4337(transactions),
  };
}
