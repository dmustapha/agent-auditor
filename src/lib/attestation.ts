import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainId, TrustScore, AttestationResult } from "./types";
import { getChainConfig, getViemChain, getPublicClient } from "./chains";
import { REPUTATION_REGISTRY_ABI } from "./erc8004";
import { formatForAttestation } from "./trust-score";

// ─── AgentBlocklist ABI (for blocklist writes on Base) ───────────────────────

const AGENT_BLOCKLIST_ABI = [
  {
    name: "blockAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "isBlocked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ─── Wallet Client Factory ───────────────────────────────────────────────────

function getWalletClient(chainId: ChainId) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY env var required for attestation writes");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const config = getChainConfig(chainId);

  return createWalletClient({
    account,
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });
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

  const feedbackHash = toHex(
    BigInt(new TextEncoder().encode(feedbackURI).reduce((h, b) => ((h << 5) - h + b) | 0, 0) >>> 0),
    { size: 32 },
  );

  const txHash = await wallet.writeContract({
    address: config.erc8004.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "giveFeedback",
    args: [
      agentId,
      value,
      decimals,
      tag1,
      tag2,
      "https://agentauditor.xyz",   // endpoint
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

    // Check if our address is in the clients list
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) return false;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return clients.some((c) => c.toLowerCase() === account.address.toLowerCase());
  } catch {
    return false;
  }
}

// ─── Blocklist Operations ────────────────────────────────────────────────────

export async function addToBlocklist(
  agentAddress: string,
  reason: string,
): Promise<`0x${string}`> {
  const blocklistAddress = process.env.BLOCKLIST_CONTRACT_ADDRESS;
  if (!blocklistAddress) throw new Error("BLOCKLIST_CONTRACT_ADDRESS env var required");

  const wallet = getWalletClient("base");

  // Check if already blocked
  const client = getPublicClient("base");
  const alreadyBlocked = await client.readContract({
    address: blocklistAddress as `0x${string}`,
    abi: AGENT_BLOCKLIST_ABI,
    functionName: "isBlocked",
    args: [agentAddress as `0x${string}`],
  });

  if (alreadyBlocked) {
    console.log(`[attestation] ${agentAddress} already on blocklist`);
    return "0x0" as `0x${string}`;
  }

  const txHash = await wallet.writeContract({
    address: blocklistAddress as `0x${string}`,
    abi: AGENT_BLOCKLIST_ABI,
    functionName: "blockAgent",
    args: [agentAddress as `0x${string}`, reason],
  });

  return txHash;
}
