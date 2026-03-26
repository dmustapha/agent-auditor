import type {
  TransactionSummary, TokenTransfer, ContractCall, CoinBalancePoint,
  BehavioralProfile, LifeEvent, ActivityCategory, ResolvedCounterparty,
  FailedTxAnalysis, TimezoneFingerprint, TokenFlowSummary, BalanceStory,
  ChainId,
} from "./types";
import { METHOD_REGISTRY } from "./agent-classifier";
import { resolveProtocolName } from "./protocol-registry";

// ─── Activity Category Mapping ──────────────────────────────────────────────

const METHOD_TO_CATEGORY: Record<string, ActivityCategory["category"]> = {
  // Swapping
  "0x38ed1739": "swapping", "0x7ff36ab5": "swapping", "0x18cbafe5": "swapping",
  "0x414bf389": "swapping", "0xc04b8d59": "swapping", "0x5ae401dc": "swapping",
  "0x04e45aaf": "swapping", "0x3593564c": "swapping", "0xe449022e": "swapping",
  "0x13d79a0b": "swapping", "0x569d3489": "swapping",
  "0x52bbbe29": "swapping", "0x945bcec9": "swapping",
  "0x3df02124": "swapping", "0xa6417ed6": "swapping",
  // Lending / Borrowing
  "0xe8eda9df": "lending", "0x69328dec": "lending",    // Aave supply/withdraw
  "0xa415bcad": "borrowing", "0x573ade81": "borrowing", // Aave borrow/repay
  "0xf2b9fdb8": "lending", "0xdb006a75": "lending",    // Compound
  "0xac9650d8": "lending", "0xb66503cf": "lending", "0xa99aad89": "lending", // Morpho
  "0x20b76e81": "borrowing", "0x2644131b": "lending",   // Morpho
  // LP Provision
  "0xe8e33700": "lp_provision", "0xbaa2abde": "lp_provision", // V2 add/remove
  "0x88316456": "lp_provision", "0x0c49ccbe": "lp_provision", // V3 mint/burn
  // Staking
  "0xa1903eab": "staking", "0xf638e5e0": "staking",    // Lido
  "0xe7a050aa": "staking", "0x0dd8dd02": "staking", "0x54b2bf29": "staking", // EigenLayer
  // Bridging
  "0xfa31de01": "bridging", "0x56d5d475": "bridging",  // Hyperlane
  "0x7b939232": "bridging", "0xe63d38ed": "bridging",  // Across
  // Keeper
  "0x4585e33b": "keeper_ops", "0x6e04ff0d": "keeper_ops",
  // Oracle
  "0x202ee0ed": "oracle_ops", "0xfeaf968c": "oracle_ops",
  // Governance
  "0x6a761202": "governance", "0xf6d0f5c4": "governance",
  // Pendle
  "0x90d25074": "swapping", "0xdcb5e4b6": "swapping", "0x7b1a4f09": "swapping",
  // GMX
  "0x11d62ed7": "swapping", "0xf242432a": "swapping", "0x0d4d1513": "swapping",
};

// ─── Main Function ──────────────────────────────────────────────────────────

export async function computeBehavioralProfile(
  address: string,
  chainId: ChainId,
  transactions: readonly TransactionSummary[],
  tokenTransfers: readonly TokenTransfer[],
  _contractCalls: readonly ContractCall[],
  coinBalanceHistory: readonly CoinBalancePoint[],
): Promise<BehavioralProfile> {
  const selfLower = address.toLowerCase();
  const validTxs = transactions.filter(tx => tx.timestamp > 0);
  const sortedTxs = [...validTxs].sort((a, b) => a.timestamp - b.timestamp);

  return {
    lifeEvents: computeLifeEvents(sortedTxs, coinBalanceHistory, selfLower),
    activityBreakdown: computeActivityBreakdown(validTxs),
    topCounterparties: await resolveTopCounterparties(validTxs, selfLower, chainId),
    failedTxAnalysis: computeFailedTxAnalysis(validTxs),
    timezoneFingerprint: computeTimezoneFingerprint(validTxs),
    tokenFlowSummary: computeTokenFlowSummary(tokenTransfers, selfLower),
    balanceStory: computeBalanceStory(coinBalanceHistory),
    contractsDeployed: validTxs.filter(tx => tx.to === "CONTRACT_CREATION").length,
    walletAgeDays: sortedTxs.length >= 2
      ? Math.round((sortedTxs[sortedTxs.length - 1].timestamp - sortedTxs[0].timestamp) / 86_400_000)
      : 0,
    firstAction: describeFirstAction(sortedTxs[0], selfLower),
    protocolLoyalty: computeProtocolLoyalty(validTxs),
    busiestDay: computeBusiestDay(sortedTxs),
    longestDormancy: computeLongestDormancy(sortedTxs),
  };
}

// ─── Life Events ────────────────────────────────────────────────────────────

function computeLifeEvents(
  txs: readonly TransactionSummary[],
  balanceHistory: readonly CoinBalancePoint[],
  selfLower: string,
): LifeEvent[] {
  const events: LifeEvent[] = [];
  if (txs.length === 0) return events;

  // First action
  const first = txs[0];
  events.push({
    date: new Date(first.timestamp).toISOString().split("T")[0],
    type: "first_action",
    description: describeFirstAction(first, selfLower),
    txHash: first.hash,
  });

  // Biggest ETH gain (largest inbound value tx)
  const inboundTxs = txs.filter(tx => tx.from.toLowerCase() !== selfLower && tx.value !== "0");
  if (inboundTxs.length > 0) {
    const biggest = inboundTxs.reduce((max, tx) => {
      try { return BigInt(tx.value) > BigInt(max.value) ? tx : max; } catch { return max; }
    });
    const ethVal = formatWeiToETH(biggest.value);
    if (parseFloat(ethVal) > 0.001) {
      events.push({
        date: new Date(biggest.timestamp).toISOString().split("T")[0],
        type: "biggest_gain",
        description: `Received ${ethVal} ETH in a single transaction`,
        value: `${ethVal} ETH`,
        txHash: biggest.hash,
      });
    }
  }

  // Biggest ETH loss (largest outbound value tx)
  const outboundTxs = txs.filter(tx => tx.from.toLowerCase() === selfLower && tx.value !== "0");
  if (outboundTxs.length > 0) {
    const biggest = outboundTxs.reduce((max, tx) => {
      try { return BigInt(tx.value) > BigInt(max.value) ? tx : max; } catch { return max; }
    });
    const ethVal = formatWeiToETH(biggest.value);
    if (parseFloat(ethVal) > 0.001) {
      events.push({
        date: new Date(biggest.timestamp).toISOString().split("T")[0],
        type: "biggest_loss",
        description: `Sent ${ethVal} ETH in a single transaction`,
        value: `${ethVal} ETH`,
        txHash: biggest.hash,
      });
    }
  }

  // Costliest failure
  const failedTxs = txs.filter(tx => !tx.success);
  if (failedTxs.length > 0) {
    const costliest = failedTxs.reduce((max, tx) => {
      try { return BigInt(tx.gasUsed) > BigInt(max.gasUsed) ? tx : max; } catch { return max; }
    });
    const gasUnits = Number(BigInt(costliest.gasUsed)).toLocaleString();
    events.push({
      date: new Date(costliest.timestamp).toISOString().split("T")[0],
      type: "costliest_failure",
      description: `Failed transaction consumed ${gasUnits} gas units`,
      value: `${gasUnits} gas`,
      txHash: costliest.hash,
    });
  }

  // Peak balance
  if (balanceHistory.length > 0) {
    const sorted = [...balanceHistory].sort((a, b) => a.timestamp - b.timestamp);
    let peakIdx = 0;
    let peakVal = 0n;
    for (let i = 0; i < sorted.length; i++) {
      try {
        const val = BigInt(sorted[i].value || "0");
        if (val > peakVal) { peakVal = val; peakIdx = i; }
      } catch { /* skip */ }
    }
    if (peakVal > 0n) {
      const peakETH = formatWeiToETH(peakVal.toString());
      events.push({
        date: new Date(sorted[peakIdx].timestamp).toISOString().split("T")[0],
        type: "peak_balance",
        description: `Peak balance reached: ${peakETH} ETH`,
        value: `${peakETH} ETH`,
      });
    }
  }

  // Drain event (single tx moving >30% of total outbound volume)
  if (outboundTxs.length > 1) {
    const totalOutbound = outboundTxs.reduce((sum, tx) => {
      try { return sum + BigInt(tx.value); } catch { return sum; }
    }, 0n);
    if (totalOutbound > 0n) {
      for (const tx of outboundTxs) {
        try {
          const val = BigInt(tx.value);
          if (val * 100n / totalOutbound > 30n) {
            const ethVal = formatWeiToETH(tx.value);
            events.push({
              date: new Date(tx.timestamp).toISOString().split("T")[0],
              type: "drain_event",
              description: `Large outflow: ${ethVal} ETH (${Number(val * 100n / totalOutbound)}% of total outbound)`,
              value: `${ethVal} ETH`,
              txHash: tx.hash,
            });
            break; // only report the largest drain
          }
        } catch { /* skip */ }
      }
    }
  }

  // Contract deployments
  const deployTxs = txs.filter(tx => tx.to === "CONTRACT_CREATION");
  if (deployTxs.length > 0) {
    events.push({
      date: new Date(deployTxs[0].timestamp).toISOString().split("T")[0],
      type: "contract_deployment",
      description: `Deployed ${deployTxs.length} contract${deployTxs.length > 1 ? "s" : ""}`,
      txHash: deployTxs[0].hash,
    });
  }

  // Sort by date
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Activity Breakdown ─────────────────────────────────────────────────────

function computeActivityBreakdown(txs: readonly TransactionSummary[]): ActivityCategory[] {
  const categoryMap = new Map<ActivityCategory["category"], { count: number; protocols: Set<string> }>();

  for (const tx of txs) {
    const rawSel = tx.methodId?.toLowerCase().replace(/^0x/, "") ?? "";
    const sel = rawSel.length >= 8 && rawSel !== "00000000" ? `0x${rawSel.slice(0, 8)}` : null;

    let category: ActivityCategory["category"] = "other";
    let protocol = "";

    if (tx.to === "CONTRACT_CREATION") {
      category = "contract_creation";
    } else if (sel) {
      category = METHOD_TO_CATEGORY[sel] ?? "other";
      const reg = METHOD_REGISTRY[sel];
      if (reg) protocol = reg.protocol;
    }

    // Fallback: infer category from target address when selector isn't mapped
    if (category === "other" && tx.to && tx.to !== "CONTRACT_CREATION") {
      const protocolName = resolveProtocolName(tx.to);
      if (protocolName) {
        const nameLower = protocolName.toLowerCase();
        if (nameLower.includes("uniswap") || nameLower.includes("sushiswap") || nameLower.includes("1inch") || nameLower.includes("curve") || nameLower.includes("balancer") || nameLower.includes("cow") || nameLower.includes("0x exchange") || nameLower.includes("kyberswap") || nameLower.includes("aerodrome") || nameLower.includes("banana gun") || nameLower.includes("maestro") || nameLower.includes("metamask swap")) {
          category = "swapping";
        } else if (nameLower.includes("aave") || nameLower.includes("compound") || nameLower.includes("morpho") || nameLower.includes("agave")) {
          category = "lending";
        } else if (nameLower.includes("lido") || nameLower.includes("eigenlayer") || nameLower.includes("pendle")) {
          category = "staking";
        } else if (nameLower.includes("bridge") || nameLower.includes("across") || nameLower.includes("stargate") || nameLower.includes("hyperlane") || nameLower.includes("portal") || nameLower.includes("gateway") || nameLower.includes("inbox")) {
          category = "bridging";
        } else if (nameLower.includes("seaport") || nameLower.includes("opensea") || nameLower.includes("looksrare") || nameLower.includes("x2y2") || nameLower.includes("blur")) {
          category = "nft_trading";
        } else if (nameLower.includes("safe") || nameLower.includes("omen")) {
          category = "governance";
        }
        if (category !== "other" && !protocol) protocol = protocolName;
      }
    }

    // Fallback: plain ETH transfers
    if (category === "other" && (!sel || sel === "0x00000000") && tx.value !== "0") {
      category = "transfers";
    }

    const entry = categoryMap.get(category) ?? { count: 0, protocols: new Set<string>() };
    entry.count++;
    if (protocol) entry.protocols.add(protocol);
    categoryMap.set(category, entry);
  }

  const total = txs.length || 1;
  return Array.from(categoryMap.entries())
    .map(([category, { count, protocols }]) => ({
      category,
      percentage: Math.round((count / total) * 100),
      txCount: count,
      protocols: [...protocols],
    }))
    .sort((a, b) => b.txCount - a.txCount);
}

// ─── Top Counterparties ─────────────────────────────────────────────────────

async function resolveTopCounterparties(
  txs: readonly TransactionSummary[],
  selfLower: string,
  _chainId: ChainId,
): Promise<ResolvedCounterparty[]> {
  const counterpartyData = new Map<string, { count: number; inbound: bigint; outbound: bigint }>();

  for (const tx of txs) {
    const isOutbound = tx.from.toLowerCase() === selfLower;
    const counterparty = isOutbound
      ? (tx.to && tx.to !== "CONTRACT_CREATION" ? tx.to.toLowerCase() : null)
      : tx.from.toLowerCase();

    if (!counterparty || counterparty === selfLower) continue;

    const entry = counterpartyData.get(counterparty) ?? { count: 0, inbound: 0n, outbound: 0n };
    entry.count++;
    try {
      const val = BigInt(tx.value);
      if (isOutbound) entry.outbound += val;
      else entry.inbound += val;
    } catch { /* skip non-numeric */ }
    counterpartyData.set(counterparty, entry);
  }

  // Get top 5 by transaction count
  const top5 = Array.from(counterpartyData.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  // Resolve names via static registry only (no Blockscout API calls — saves 3-8s per request)
  return top5.map(([addr, data]) => {
    const name = resolveProtocolName(addr);

    const totalVolume = data.inbound + data.outbound;
    const direction: ResolvedCounterparty["direction"] =
      data.outbound > data.inbound * 2n ? "mostly_outbound"
      : data.inbound > data.outbound * 2n ? "mostly_inbound"
      : "balanced";

    return {
      address: addr,
      name,
      txCount: data.count,
      volumeETH: formatWeiToETH(totalVolume.toString()),
      direction,
    };
  });
}

// ─── Failed Transaction Analysis ────────────────────────────────────────────

function computeFailedTxAnalysis(txs: readonly TransactionSummary[]): FailedTxAnalysis {
  const failed = txs.filter(tx => !tx.success);
  let totalGasWasted = 0n;
  let worstFailure: FailedTxAnalysis["worstFailure"] = null;
  let worstGas = 0n;

  for (const tx of failed) {
    try {
      const gas = BigInt(tx.gasUsed);
      totalGasWasted += gas;
      if (gas > worstGas) {
        worstGas = gas;
        worstFailure = {
          txHash: tx.hash,
          gasUnits: gas.toString(),
          date: new Date(tx.timestamp).toISOString().split("T")[0],
        };
      }
    } catch { /* skip */ }
  }

  // Infer most common failure reason from patterns
  const zeroValueFails = failed.filter(tx => tx.value === "0").length;
  const highGasFails = failed.filter(tx => {
    try { return BigInt(tx.gasUsed) > 100000n; } catch { return false; }
  }).length;
  const mostCommonReason = failed.length === 0 ? "none"
    : highGasFails > failed.length * 0.5 ? "Complex call reverted (likely slippage/conditions not met)"
    : zeroValueFails > failed.length * 0.7 ? "Keeper/automation check reverted (expected behavior)"
    : "Transaction reverted";

  return {
    totalFailed: failed.length,
    totalGasUnitsWasted: totalGasWasted.toString(),
    mostCommonReason,
    worstFailure,
  };
}

// ─── Timezone Fingerprint ───────────────────────────────────────────────────

function computeTimezoneFingerprint(txs: readonly TransactionSummary[]): TimezoneFingerprint {
  const hourCounts = new Array(24).fill(0) as number[];
  for (const tx of txs) {
    if (tx.timestamp > 0) hourCounts[new Date(tx.timestamp).getUTCHours()]++;
  }

  const total = hourCounts.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return { peakWindowUTC: "N/A", deadZoneUTC: "N/A", inference: "No transactions", is24x7: false };
  }

  const avg = total / 24;
  const activeHours = hourCounts.filter(c => c > avg * 0.5).length;
  const is24x7 = activeHours >= 20;

  // Find peak window (consecutive 8-hour block with most txs)
  let bestSum = 0, bestStart = 0;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += hourCounts[(start + i) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = start; }
  }
  const peakEnd = (bestStart + 8) % 24;

  // Dead zone = opposite 8-hour window
  const deadStart = (bestStart + 12) % 24;
  const deadEnd = (deadStart + 8) % 24;

  // Timezone inference
  const formatHour = (h: number) => `${h.toString().padStart(2, "0")}:00`;
  let inference = "Indeterminate timezone";
  if (is24x7) {
    inference = "24/7 operation — automated bot with no sleep pattern";
  } else if (bestStart >= 0 && bestStart <= 8) {
    inference = "Likely East Asian timezone operator (peak activity in UTC morning)";
  } else if (bestStart >= 9 && bestStart <= 12) {
    inference = "Likely European timezone operator (peak activity in UTC daytime)";
  } else if (bestStart >= 13 && bestStart <= 21) {
    inference = "Likely Americas timezone operator (peak activity in UTC afternoon/evening)";
  }

  return {
    peakWindowUTC: `${formatHour(bestStart)}-${formatHour(peakEnd)}`,
    deadZoneUTC: `${formatHour(deadStart)}-${formatHour(deadEnd)}`,
    inference,
    is24x7,
  };
}

// ─── Token Flow Summary ─────────────────────────────────────────────────────

function computeTokenFlowSummary(transfers: readonly TokenTransfer[], selfLower: string): TokenFlowSummary {
  const tokenCounts = new Map<string, { count: number; inbound: number; outbound: number }>();

  for (const t of transfers) {
    const symbol = t.token.split(":")[0] || "UNKNOWN";
    const isInbound = t.to.toLowerCase() === selfLower;
    const entry = tokenCounts.get(symbol) ?? { count: 0, inbound: 0, outbound: 0 };
    entry.count++;
    if (isInbound) entry.inbound++; else entry.outbound++;
    tokenCounts.set(symbol, entry);
  }

  const topTokens = Array.from(tokenCounts.entries())
    .map(([symbol, data]) => ({ symbol, txCount: data.count }))
    .sort((a, b) => b.txCount - a.txCount);

  const totalInbound = Array.from(tokenCounts.values()).reduce((s, v) => s + v.inbound, 0);
  const totalOutbound = Array.from(tokenCounts.values()).reduce((s, v) => s + v.outbound, 0);
  const netDirection: TokenFlowSummary["netDirection"] =
    totalOutbound > totalInbound * 1.5 ? "outbound"
    : totalInbound > totalOutbound * 1.5 ? "inbound"
    : "balanced";

  return {
    dominantToken: topTokens.length > 0 ? topTokens[0] : null,
    uniqueTokens: tokenCounts.size,
    netDirection,
    topTokens: topTokens.slice(0, 5),
  };
}

// ─── Balance Story ──────────────────────────────────────────────────────────

function computeBalanceStory(history: readonly CoinBalancePoint[]): BalanceStory {
  if (history.length === 0) {
    return { peakBalanceETH: "0", peakDate: null, currentBalanceETH: "0", drawdownFromPeak: "0%", trend: "stable" };
  }

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  let peakVal = 0n, peakIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    try {
      const val = BigInt(sorted[i].value || "0");
      if (val > peakVal) { peakVal = val; peakIdx = i; }
    } catch { /* skip */ }
  }

  const currentVal = (() => {
    try { return BigInt(sorted[sorted.length - 1].value || "0"); } catch { return 0n; }
  })();

  const drawdown = peakVal > 0n
    ? peakVal >= currentVal
      ? `-${Number((peakVal - currentVal) * 100n / peakVal)}%`
      : `+${Number((currentVal - peakVal) * 100n / peakVal)}%`
    : "0%";

  // Determine trend from balance curve
  const midIdx = Math.floor(sorted.length / 2);
  const firstHalfAvg = sorted.slice(0, midIdx).reduce((s, p) => {
    try { return s + BigInt(p.value || "0"); } catch { return s; }
  }, 0n) / BigInt(Math.max(midIdx, 1));
  const secondHalfAvg = sorted.slice(midIdx).reduce((s, p) => {
    try { return s + BigInt(p.value || "0"); } catch { return s; }
  }, 0n) / BigInt(Math.max(sorted.length - midIdx, 1));

  let trend: BalanceStory["trend"] = "stable";
  if (secondHalfAvg > firstHalfAvg * 11n / 10n) trend = "accumulating";
  else if (secondHalfAvg < firstHalfAvg * 9n / 10n) trend = "depleting";

  // Check volatility: if peak is >3x current, it's volatile
  if (peakVal > currentVal * 3n && currentVal > 0n) trend = "volatile";

  return {
    peakBalanceETH: formatWeiToETH(peakVal.toString()),
    peakDate: new Date(sorted[peakIdx].timestamp).toISOString().split("T")[0],
    currentBalanceETH: formatWeiToETH(currentVal.toString()),
    drawdownFromPeak: drawdown,
    trend,
  };
}

// ─── Protocol Loyalty ───────────────────────────────────────────────────────

function computeProtocolLoyalty(txs: readonly TransactionSummary[]): string {
  const swapProtocols = new Map<string, number>();
  let totalSwaps = 0;
  for (const tx of txs) {
    const rawSel = tx.methodId?.toLowerCase().replace(/^0x/, "") ?? "";
    const sel = rawSel.length >= 8 ? `0x${rawSel.slice(0, 8)}` : null;
    if (!sel) continue;
    const cat = METHOD_TO_CATEGORY[sel];
    if (cat === "swapping") {
      totalSwaps++;
      const reg = METHOD_REGISTRY[sel];
      const protocol = reg?.protocol ?? "Unknown DEX";
      swapProtocols.set(protocol, (swapProtocols.get(protocol) ?? 0) + 1);
    }
  }

  if (totalSwaps === 0) return "No swap activity detected";
  const top = Array.from(swapProtocols.entries()).sort((a, b) => b[1] - a[1]);
  const topPct = Math.round((top[0][1] / totalSwaps) * 100);
  if (topPct >= 80) return `${topPct}% of swaps through ${top[0][0]} — high protocol loyalty`;
  if (top.length >= 3) return `Diversified: ${top.slice(0, 3).map(([p, c]) => `${p} (${Math.round((c / totalSwaps) * 100)}%)`).join(", ")}`;
  return `Primary DEX: ${top[0][0]} (${topPct}%)`;
}

// ─── Busiest Day ────────────────────────────────────────────────────────────

function computeBusiestDay(txs: readonly TransactionSummary[]): BehavioralProfile["busiestDay"] {
  if (txs.length === 0) return null;
  const dayCounts = new Map<string, number>();
  for (const tx of txs) {
    if (tx.timestamp <= 0) continue;
    const day = new Date(tx.timestamp).toISOString().split("T")[0];
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const busiest = Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  return busiest ? { date: busiest[0], txCount: busiest[1] } : null;
}

// ─── Longest Dormancy ───────────────────────────────────────────────────────

function computeLongestDormancy(txs: readonly TransactionSummary[]): BehavioralProfile["longestDormancy"] {
  if (txs.length < 2) return null;
  let maxGap = 0, maxFrom = 0, maxTo = 0;
  for (let i = 1; i < txs.length; i++) {
    const gap = txs[i].timestamp - txs[i - 1].timestamp;
    if (gap > maxGap) { maxGap = gap; maxFrom = txs[i - 1].timestamp; maxTo = txs[i].timestamp; }
  }
  const days = Math.round(maxGap / 86_400_000);
  if (days < 1) return null;
  return {
    days,
    from: new Date(maxFrom).toISOString().split("T")[0],
    to: new Date(maxTo).toISOString().split("T")[0],
  };
}

// ─── First Action Description ───────────────────────────────────────────────

function describeFirstAction(tx: TransactionSummary | undefined, selfLower: string): string {
  if (!tx) return "No transactions recorded";
  const isOutbound = tx.from.toLowerCase() === selfLower;
  if (tx.to === "CONTRACT_CREATION") return "Deployed a contract";
  const ethVal = formatWeiToETH(tx.value);
  if (isOutbound) {
    const rawSel = tx.methodId?.toLowerCase().replace(/^0x/, "") ?? "";
    const sel = rawSel.length >= 8 && rawSel !== "00000000" ? `0x${rawSel.slice(0, 8)}` : null;
    const reg = sel ? METHOD_REGISTRY[sel] : undefined;
    if (reg) return `Called ${reg.protocol} (${ethVal} ETH)`;
    return `Sent ${ethVal} ETH`;
  }
  return `Received ${ethVal} ETH`;
}

// ─── Utility ────────────────────────────────────────────────────────────────

const ETH_WEI = 1_000_000_000_000_000_000n;

function formatWeiToETH(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    const sign = wei < 0n ? "-" : "";
    const abs = wei < 0n ? -wei : wei;
    const whole = abs / ETH_WEI;
    const frac = abs % ETH_WEI;
    return `${sign}${whole}.${frac.toString().padStart(18, "0").slice(0, 4)}`;
  } catch {
    return "0.0000";
  }
}
