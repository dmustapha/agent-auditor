import type {
  ChainId,
  AgentTransactionData,
  TransactionSummary,
  TokenTransfer,
  ContractCall,
  BlockscoutTransaction,
  BlockscoutTokenTransfer,
  BlockscoutInternalTx,
  BlockscoutPaginatedResponse,
} from "./types";
import { getChainConfig } from "./chains";

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
  if (!res.ok) {
    throw new Error(`Blockscout ${chainId} ${res.status}: ${url}`);
  }
  return res;
}

// ─── Fetch Functions ─────────────────────────────────────────────────────────

export async function getTransactions(
  chainId: ChainId,
  address: string,
): Promise<TransactionSummary[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/transactions`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutTransaction> = await res.json();

  return data.items.map((tx) => ({
    hash: tx.hash,
    from: tx.from.hash,
    to: tx.to?.hash ?? "CONTRACT_CREATION",
    value: tx.value,
    gasUsed: tx.gas_used,
    timestamp: new Date(tx.timestamp).getTime(),
    methodId: tx.decoded_input?.method_id ?? tx.method ?? "0x",
  }));
}

export async function getTokenTransfers(
  chainId: ChainId,
  address: string,
): Promise<TokenTransfer[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/token-transfers`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutTokenTransfer> = await res.json();

  return data.items.map((t) => ({
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

  return data.items.map((t) => ({
    contract: t.to.hash,
    method: t.type,
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

export async function fetchAgentData(
  chainId: ChainId,
  address: string,
): Promise<AgentTransactionData> {
  const [transactions, tokenTransfers, contractCalls] = await Promise.all([
    getTransactions(chainId, address),
    getTokenTransfers(chainId, address),
    getInternalTransactions(chainId, address),
  ]);

  return { address, chainId, transactions, tokenTransfers, contractCalls };
}

/**
 * Detect which chains have activity for an address.
 * Checks transaction count on each chain via Blockscout counters endpoint.
 * Returns first chain with activity, or null.
 */
export async function detectChainWithActivity(
  address: string,
): Promise<ChainId | null> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const config = getChainConfig(chainId);
      const url = `${config.blockscoutUrl}/addresses/${address}`;
      const res = await rateLimitedFetch(chainId, url);
      const data: { transactions_count?: string } = await res.json();
      if (data.transactions_count && parseInt(data.transactions_count) > 0) {
        return chainId;
      }
    } catch {
      continue; // chain unavailable, skip
    }
  }

  return null;
}
