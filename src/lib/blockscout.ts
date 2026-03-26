import type {
  ChainId,
  AgentTransactionData,
  TransactionSummary,
  TokenTransfer,
  ContractCall,
  SmartContractData,
  CoinBalancePoint,
  EventLog,
  BlockscoutTransaction,
  BlockscoutTokenTransfer,
  BlockscoutInternalTx,
  BlockscoutPaginatedResponse,
  BlockscoutSmartContract,
  BlockscoutCoinBalanceHistoryItem,
  BlockscoutLog,
  AddressInfo,
} from "./types";
import { getChainConfig } from "./chains";
import { computeMetrics } from "./metrics";

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT_DELAY_MS = 220; // ~4.5 RPS per chain (under 5 RPS limit)
const lastRequestTime = new Map<ChainId, number>();

async function rateLimitedFetch(chainId: ChainId, url: string): Promise<Response> {
  const now = Date.now();
  const lastTime = lastRequestTime.get(chainId) ?? 0;
  const elapsed = now - lastTime;

  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }

  lastRequestTime.set(chainId, Date.now());

  const res = await fetch(url);
  if (res.status === 429) {
    // Back off and retry once on rate limit
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS * 3));
    lastRequestTime.set(chainId, Date.now());
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(`Blockscout rate limited on ${chainId}. Try again shortly.`);
    }
    return retry;
  }
  if (!res.ok) {
    throw new Error(`Blockscout ${chainId} error (${res.status})`);
  }
  return res;
}

// ─── Fetch Functions ─────────────────────────────────────────────────────────

export async function getTransactions(
  chainId: ChainId,
  address: string,
): Promise<TransactionSummary[]> {
  const config = getChainConfig(chainId);
  const baseUrl = `${config.blockscoutUrl}/addresses/${address}/transactions`;
  const all: TransactionSummary[] = [];

  let url = baseUrl;
  for (let page = 0; page < 3; page++) {
    const res = await rateLimitedFetch(chainId, url);
    const data: BlockscoutPaginatedResponse<BlockscoutTransaction> = await res.json();

    const mapped = (data.items ?? []).map((tx) => ({
      hash: tx.hash,
      from: tx.from.hash,
      to: tx.to?.hash ?? "CONTRACT_CREATION",
      value: tx.value,
      gasUsed: tx.gas_used,
      gasLimit: tx.gas_limit,
      nonce: tx.nonce,
      timestamp: new Date(tx.timestamp).getTime(),
      methodId: tx.decoded_input?.method_id ?? tx.method ?? "0x",
      success: tx.result === "success" || tx.status === "ok",
    }));
    all.push(...mapped);

    if (!data.next_page_params) break;
    url = `${baseUrl}?block_number=${data.next_page_params.block_number}&index=${data.next_page_params.index}`;
  }

  return all;
}

export async function getTokenTransfers(
  chainId: ChainId,
  address: string,
): Promise<TokenTransfer[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/token-transfers`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutTokenTransfer> = await res.json();

  return (data.items ?? []).map((t) => ({
    token: `${t.token.symbol}:${t.token.address}`,
    from: t.from.hash,
    to: t.to.hash,
    value: t.total.value,
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

export async function getInternalTransactions(
  chainId: ChainId,
  address: string,
): Promise<ContractCall[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/internal-transactions`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutInternalTx> = await res.json();

  return (data.items ?? []).filter((t): t is BlockscoutInternalTx & { to: { hash: string } } => t.to !== null).map((t) => ({
    contract: t.to.hash,
    method: t.type,
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

export async function getSmartContractData(
  chainId: ChainId,
  address: string,
): Promise<SmartContractData | null> {
  try {
    const config = getChainConfig(chainId);
    const url = `${config.blockscoutUrl}/smart-contracts/${address}`;
    const res = await rateLimitedFetch(chainId, url);
    const data: BlockscoutSmartContract = await res.json();
    return {
      isVerified: data.is_verified,
      name: data.name,
      abi: data.abi,
      sourceCode: data.source_code,
    };
  } catch {
    return null;
  }
}

export async function getCoinBalanceHistory(
  chainId: ChainId,
  address: string,
): Promise<CoinBalancePoint[]> {
  try {
    const config = getChainConfig(chainId);
    const url = `${config.blockscoutUrl}/addresses/${address}/coin-balance-history`;
    const res = await rateLimitedFetch(chainId, url);
    const data: { items?: BlockscoutCoinBalanceHistoryItem[] } = await res.json();
    return (data.items ?? []).map((item) => ({
      timestamp: new Date(item.block_timestamp).getTime(),
      value: item.value,
      blockNumber: item.block_number,
    }));
  } catch {
    return [];
  }
}

export async function getEventLogs(
  chainId: ChainId,
  address: string,
): Promise<EventLog[]> {
  try {
    const config = getChainConfig(chainId);
    const url = `${config.blockscoutUrl}/addresses/${address}/logs`;
    const res = await rateLimitedFetch(chainId, url);
    const data: { items?: BlockscoutLog[] } = await res.json();
    return (data.items ?? []).map((log) => ({
      txHash: log.transaction_hash,
      topics: log.topics,
      data: log.data,
      timestamp: new Date(log.block_timestamp).getTime(),
      contractAddress: log.address.hash,
    }));
  } catch {
    return [];
  }
}

export async function getAddressInfo(
  chainId: ChainId,
  address: string,
): Promise<AddressInfo | null> {
  try {
    const config = getChainConfig(chainId);
    const url = `${config.blockscoutUrl}/addresses/${address}`;
    const res = await rateLimitedFetch(chainId, url);
    const data = (await res.json()) as Record<string, unknown>;

    const isContract = data.is_contract === true;

    return {
      isContract,
      addressType: isContract
        ? data.token
          ? "token"
          : data.implementation_address
            ? "proxy"
            : "contract"
        : "EOA",
      implementationAddress: (data.implementation_address as string) ?? null,
      ensName: (data.ens_domain_name as string) ?? null,
      transactionsCount: Number(data.transactions_count) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a contract address to its name via Blockscout.
 * Tries smart-contract endpoint first (verified name), falls back to address info.
 * Returns null if no name found. Non-throwing.
 */
export async function getContractName(
  chainId: ChainId,
  address: string,
): Promise<string | null> {
  try {
    const config = getChainConfig(chainId);
    // Try smart contract endpoint first (has verified name)
    const scUrl = `${config.blockscoutUrl}/smart-contracts/${address}`;
    const scRes = await rateLimitedFetch(chainId, scUrl);
    const scData = (await scRes.json()) as Record<string, unknown>;
    if (scData.name && typeof scData.name === "string") return scData.name;
  } catch { /* not a verified contract */ }
  return null;
}

export async function fetchAgentData(
  chainId: ChainId,
  address: string,
): Promise<AgentTransactionData> {
  const [transactions, tokenTransfers, contractCalls, smartContractData, coinBalanceHistory, eventLogs, addressInfo] =
    await Promise.all([
      getTransactions(chainId, address),
      getTokenTransfers(chainId, address),
      getInternalTransactions(chainId, address),
      getSmartContractData(chainId, address),
      getCoinBalanceHistory(chainId, address),
      getEventLogs(chainId, address),
      getAddressInfo(chainId, address),
    ]);

  const resolvedAddressInfo = addressInfo ?? undefined;
  const computedMetrics = computeMetrics({ address, chainId, transactions, tokenTransfers, contractCalls, coinBalanceHistory, addressInfo: resolvedAddressInfo });

  return {
    address,
    chainId,
    transactions,
    tokenTransfers,
    contractCalls,
    computedMetrics,
    smartContractData: smartContractData ?? undefined,
    coinBalanceHistory,
    eventLogs,
    addressInfo: resolvedAddressInfo,
  };
}

/**
 * Detect which chain has the most activity for an address.
 * Checks transaction count on each chain via Blockscout and returns the
 * chain with the highest transactions_count, or null if none found.
 */
export async function detectChainWithActivity(
  address: string,
): Promise<ChainId | null> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  const results = await Promise.allSettled(
    chains.map(async (chainId) => {
      const config = getChainConfig(chainId);
      const url = `${config.blockscoutUrl}/addresses/${address}/counters`;
      const res = await rateLimitedFetch(chainId, url);
      const data: { transactions_count?: string } = await res.json();
      const count = parseInt(data.transactions_count ?? "0");
      return { chainId, count };
    })
  );

  let best: { chainId: ChainId; count: number } | null = null;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.count > 0) {
      if (!best || result.value.count > best.count) {
        best = result.value;
      }
    }
  }
  return best?.chainId ?? null;
}

export async function detectAllChainsWithActivity(
  address: string,
): Promise<{ chainId: ChainId; txCount: number }[]> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  const results = await Promise.allSettled(
    chains.map(async (chainId) => {
      const config = getChainConfig(chainId);
      const url = `${config.blockscoutUrl}/addresses/${address}/counters`;
      const res = await rateLimitedFetch(chainId, url);
      const data: { transactions_count?: string } = await res.json();
      const count = parseInt(data.transactions_count ?? "0");
      return { chainId, txCount: count };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<{ chainId: ChainId; txCount: number }> =>
      r.status === "fulfilled" && r.value.txCount > 0)
    .map(r => r.value)
    .sort((a, b) => b.txCount - a.txCount);
}
