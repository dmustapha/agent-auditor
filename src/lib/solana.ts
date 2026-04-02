// File: src/lib/solana.ts
// Solana data fetcher: Helius for transactions, Covalent for balances, @solana/web3.js for account info

import { Connection, PublicKey } from "@solana/web3.js";
import type {
  AgentTransactionData,
  TransactionSummary,
  TokenTransfer,
  ContractCall,
  AddressInfo,
} from "./types";
import { getSolanaConfig } from "./chains";
import { getSolanaProgramCategory, getSolanaProgramName, resolveSolanaProgram } from "./solana-programs";
import { computeMetrics } from "./metrics";

// ─── Constants ──────────────────────────────────────────────────────────────

const COVALENT_BASE_URL = "https://api.covalenthq.com/v1";
const PER_CALL_TIMEOUT_MS = 15_000;

// ─── Helius Response Types ──────────────────────────────────────────────────

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  fee: number;
  feePayer: string;
  type: string;
  source: string;
  description?: string;
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  tokenTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
    tokenStandard?: string;
  }[];
  accountData?: { account: string; nativeBalanceChange: number }[];
  transactionError?: unknown;
  instructions?: { programId: string; innerInstructions?: { programId: string }[] }[];
}

// ─── Covalent Types (balances only) ─────────────────────────────────────────

interface CovalentTokenBalance {
  contract_address: string;
  contract_ticker_symbol: string;
  balance: string;
  quote: number;
}

interface CovalentPaginatedResponse<T> {
  data: {
    address: string;
    chain_id: number;
    chain_name: string;
    items: T[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHeliusApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("HELIUS_API_KEY environment variable not set");
  return key;
}

function getCovalentApiKey(): string {
  const key = process.env.COVALENT_API_KEY;
  if (!key) throw new Error("COVALENT_API_KEY environment variable not set");
  return key;
}

function withTimeout<T>(promise: Promise<T>, fallback: T, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        if (label) console.warn(`[solana] ${label} timed out after ${PER_CALL_TIMEOUT_MS}ms — using fallback`);
        resolve(fallback);
      }, PER_CALL_TIMEOUT_MS),
    ),
  ]);
}

// ─── Solana RPC Connection ─────────────────────────────────────────────────

let _connection: Connection | null = null;

function getSolanaConnection(): Connection {
  if (!_connection) {
    const config = getSolanaConfig();
    _connection = new Connection(config.solanaRpcUrl, "confirmed");
  }
  return _connection;
}

// ─── Fetch Functions ────────────────────────────────────────────────────────

async function getSolanaTransactions(address: string): Promise<{
  transactions: TransactionSummary[];
  tokenTransfers: TokenTransfer[];
  contractCalls: ContractCall[];
}> {
  const apiKey = getHeliusApiKey();
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Helius API error (${res.status}): ${text}`);
  }
  const heliusTxs: HeliusTransaction[] = await res.json();

  const transactions: TransactionSummary[] = [];
  const tokenTransfers: TokenTransfer[] = [];
  const contractCalls: ContractCall[] = [];
  const seenPrograms = new Set<string>();

  for (const tx of heliusTxs) {
    // Map to TransactionSummary
    const nativeTransfer = tx.nativeTransfers?.[0];
    transactions.push({
      hash: tx.signature,
      from: tx.feePayer ?? address,
      to: nativeTransfer?.toUserAccount ?? "",
      value: String(nativeTransfer?.amount ?? 0),
      gasUsed: String(tx.fee ?? 0),
      timestamp: (tx.timestamp ?? 0) * 1000, // Helius returns seconds, we need ms
      methodId: tx.type ?? "",
      success: !tx.transactionError,
    });

    // Extract token transfers
    for (const tt of tx.tokenTransfers ?? []) {
      tokenTransfers.push({
        token: tt.mint,
        from: tt.fromUserAccount ?? "",
        to: tt.toUserAccount ?? "",
        value: String(tt.tokenAmount ?? 0),
        timestamp: (tx.timestamp ?? 0) * 1000,
      });
    }

    // Extract program interactions (contract calls)
    for (const ix of tx.instructions ?? []) {
      const programId = ix.programId;
      if (!programId) continue;
      const key = `${tx.signature}:${programId}`;
      if (seenPrograms.has(key)) continue;
      seenPrograms.add(key);

      const programInfo = resolveSolanaProgram(programId);
      contractCalls.push({
        contract: programId,
        method: programInfo?.name ?? programId.slice(0, 8),
        timestamp: (tx.timestamp ?? 0) * 1000,
      });

      // Also include inner instructions
      for (const inner of ix.innerInstructions ?? []) {
        const innerKey = `${tx.signature}:${inner.programId}`;
        if (seenPrograms.has(innerKey)) continue;
        seenPrograms.add(innerKey);
        const innerInfo = resolveSolanaProgram(inner.programId);
        contractCalls.push({
          contract: inner.programId,
          method: innerInfo?.name ?? inner.programId.slice(0, 8),
          timestamp: (tx.timestamp ?? 0) * 1000,
        });
      }
    }
  }

  return {
    transactions: transactions.filter((tx) => tx.timestamp > 0),
    tokenTransfers: tokenTransfers.filter((t) => t.timestamp > 0),
    contractCalls: contractCalls.filter((c) => c.timestamp > 0),
  };
}

async function getSolanaAccountInfo(address: string): Promise<AddressInfo> {
  const connection = getSolanaConnection();
  try {
    const pubkey = new PublicKey(address);
    const accountInfo = await connection.getAccountInfo(pubkey);

    if (!accountInfo) {
      return {
        isContract: false,
        addressType: "EOA",
        implementationAddress: null,
        ensName: null,
        transactionsCount: 0,
      };
    }

    const isProgram = accountInfo.executable;
    const ownerStr = accountInfo.owner.toBase58();
    const isProgramByOwner = ownerStr === "BPFLoaderUpgradeab1e11111111111111111111111" || ownerStr === "BPFLoader2111111111111111111111111111111111";

    return {
      isContract: isProgram || isProgramByOwner,
      addressType: isProgram || isProgramByOwner ? "contract" : "EOA",
      implementationAddress: null,
      ensName: null,
      transactionsCount: 0,
    };
  } catch {
    return {
      isContract: false,
      addressType: "EOA",
      implementationAddress: null,
      ensName: null,
      transactionsCount: 0,
    };
  }
}

async function getSolanaBalances(address: string): Promise<{ solBalance: string; tokenCount: number }> {
  try {
    const chainName = getSolanaConfig().covalentChainName;
    const apiKey = getCovalentApiKey();
    const url = `${COVALENT_BASE_URL}/${chainName}/address/${address}/balances_v2/`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return { solBalance: "0", tokenCount: 0 };
    const data: CovalentPaginatedResponse<CovalentTokenBalance> = await res.json();
    const items = data.data?.items ?? [];
    const solItem = items.find((i) => i.contract_ticker_symbol === "SOL");
    return {
      solBalance: solItem?.balance ?? "0",
      tokenCount: items.length,
    };
  } catch {
    return { solBalance: "0", tokenCount: 0 };
  }
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────

export async function fetchSolanaAgentData(address: string): Promise<AgentTransactionData> {
  const [txData, accountInfo, _balances] = await Promise.all([
    withTimeout(getSolanaTransactions(address), { transactions: [], tokenTransfers: [], contractCalls: [] }, "getSolanaTransactions"),
    withTimeout(getSolanaAccountInfo(address), {
      isContract: false, addressType: "EOA" as const, implementationAddress: null, ensName: null, transactionsCount: 0,
    }, "getSolanaAccountInfo"),
    withTimeout(getSolanaBalances(address), { solBalance: "0", tokenCount: 0 }, "getSolanaBalances"),
  ]);

  const { transactions, tokenTransfers, contractCalls } = txData;

  const addressInfoWithCount: AddressInfo = {
    ...accountInfo,
    transactionsCount: transactions.length,
  };

  const computedMetrics = computeMetrics({
    address,
    chainId: "solana",
    transactions,
    tokenTransfers,
    contractCalls,
    coinBalanceHistory: [],
    addressInfo: addressInfoWithCount,
  });

  return {
    address,
    chainId: "solana",
    transactions,
    tokenTransfers,
    contractCalls,
    computedMetrics,
    smartContractData: undefined,
    coinBalanceHistory: [],
    eventLogs: [],
    addressInfo: addressInfoWithCount,
  };
}

/**
 * Validate a Solana address (base58, 32-44 chars).
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
