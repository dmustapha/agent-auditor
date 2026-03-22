import { createWalletClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainId, TrustScore, AttestationResult } from "./types";
import { getChainConfig, getViemChain, getPublicClient } from "./chains";
import { REPUTATION_REGISTRY_ABI } from "./erc8004";
import { formatForAttestation } from "./trust-score";

// ─── Wallet Client Factory (cached at module level) ─────────────────────────

let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;
const walletClientCache = new Map<ChainId, ReturnType<typeof createWalletClient>>();

function getAccount() {
  if (cachedAccount) return cachedAccount;
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY env var required for attestation writes");
  cachedAccount = privateKeyToAccount(pk as `0x${string}`);
  return cachedAccount;
}

function getWalletClient(chainId: ChainId) {
  const existing = walletClientCache.get(chainId);
  if (existing) return existing;

  const config = getChainConfig(chainId);
  const client = createWalletClient({
    account: getAccount(),
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });
  walletClientCache.set(chainId, client);
  return client;
}

// ─── Publish Attestation ─────────────────────────────────────────────────────

export async function publishAttestation(
  chainId: ChainId,
  agentId: bigint,
  trustScore: TrustScore,
): Promise<AttestationResult> {
  const wallet = getWalletClient(chainId);
  const config = getChainConfig(chainId);
  const { value, decimals, tag1, tag2 } = formatForAttestation(trustScore);

  const feedbackURI = JSON.stringify({
    auditor: "AgentAuditor",
    score: trustScore.overallScore,
    recommendation: trustScore.recommendation,
    chain: chainId,
    timestamp: trustScore.analysisTimestamp,
  });

  const feedbackHash = keccak256(toHex(feedbackURI));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentauditor.vercel.app";

  const txHash = await wallet.writeContract({
    account: getAccount(),
    chain: getViemChain(chainId),
    address: config.erc8004.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "giveFeedback",
    args: [
      agentId,
      value,
      decimals,
      tag1,
      tag2,
      appUrl,
      feedbackURI,
      feedbackHash,
    ],
  });

  return { txHash, chainId, agentId, value };
}

// ─── Verify Attestation ──────────────────────────────────────────────────────

export async function verifyAttestation(
  chainId: ChainId,
  agentId: bigint,
): Promise<boolean> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  try {
    const clients = await client.readContract({
      address: config.erc8004.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getClients",
      args: [agentId],
    }) as readonly string[];

    const account = getAccount();
    return clients.some((c) => c.toLowerCase() === account.address.toLowerCase());
  } catch {
    return false;
  }
}

