import type { AgentMetrics, AgentTransactionData } from "./types";
import { classifyAgentType, detectERC4337, inferProtocols, computeWalletClassification, computeConsistencyScore } from "./agent-classifier";

export function computeMetrics(data: Pick<AgentTransactionData, "address" | "chainId" | "transactions" | "tokenTransfers" | "contractCalls" | "coinBalanceHistory" | "addressInfo">): AgentMetrics {
  const { address, transactions } = data;

  // Gas metrics (BigInt to avoid precision loss on high-volume agents)
  const totalGasWei = transactions.reduce((sum, tx) => {
    try { return sum + BigInt(tx.gasUsed); } catch { return sum; }
  }, 0n);
  const avgGasPerTx = transactions.length > 0
    ? Number(totalGasWei / BigInt(transactions.length))
    : 0;

  // Timestamps (filter out invalid zero/NaN values)
  const timestamps = transactions
    .map(tx => tx.timestamp)
    .filter(ts => ts > 0 && Number.isFinite(ts))
    .sort((a, b) => a - b);
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
  const successRate = transactions.length > 0 ? successCount / transactions.length : 0;

  // Most interacted addresses (top 5, excluding self — bidirectional)
  const contractCounts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.to && tx.to !== "CONTRACT_CREATION") {
      const toAddr = tx.to.toLowerCase();
      if (toAddr !== selfLower) {
        contractCounts.set(toAddr, (contractCounts.get(toAddr) ?? 0) + 1);
      }
    }
    const fromAddr = tx.from.toLowerCase();
    if (fromAddr !== selfLower) {
      contractCounts.set(fromAddr, (contractCounts.get(fromAddr) ?? 0) + 1);
    }
  }
  const mostCalledContracts = Array.from(contractCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([addr]) => addr);

  // Net ETH flow: latest balance minus earliest balance
  const balanceHistory = data.coinBalanceHistory ?? [];
  let netFlowETH = "0";
  if (balanceHistory.length >= 2) {
    const sorted = [...balanceHistory].sort((a, b) => a.timestamp - b.timestamp);
    try {
      const earliest = BigInt(sorted[0].value || "0");
      const latest = BigInt(sorted[sorted.length - 1].value || "0");
      const diff = latest - earliest;
      const sign = diff < 0n ? "-" : "";
      const abs = diff < 0n ? -diff : diff;
      const whole = abs / 1000000000000000000n;
      const frac = abs % 1000000000000000000n;
      netFlowETH = `${sign}${whole}.${frac.toString().padStart(18, "0").slice(0, 6)}`;
    } catch { /* non-numeric balance value from Blockscout, keep "0" */ }
  }

  return {
    avgGasPerTx,
    totalGasSpentWei: totalGasWei.toString(),
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
    netFlowETH,
    protocolsUsed: inferProtocols(transactions),
    walletClassification: computeWalletClassification(transactions, data.addressInfo),
    consistencyScore: computeConsistencyScore(transactions),
  };
}
