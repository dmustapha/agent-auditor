import { toHex } from "viem";
import type {
  ChainId,
  AgentIdentity,
  FeedbackSummary,
  DiscoveredAgent,
} from "./types";
import { getChainConfig, getPublicClient } from "./chains";
import { sanitizeHtml } from "./sanitize";

// ─── ABI Fragments ───────────────────────────────────────────────────────────

const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getMetadata",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const IDENTITY_REGISTRY_EVENTS = [
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

const REPUTATION_REGISTRY_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "bytes32" },
      { name: "tag2", type: "bytes32" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "getClients",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clients", type: "address[]" },
      { name: "tag1", type: "bytes32" },
      { name: "tag2", type: "bytes32" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int256" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

// ─── Tag Constants ───────────────────────────────────────────────────────────

export const TRUST_TAGS = {
  overall: toHex("trustScore/overall", { size: 32 }),
  security: toHex("trustScore/security", { size: 32 }),
} as const;

// ─── Export ABIs for use by attestation.ts ───────────────────────────────────

export { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI };

// ─── Read Functions ──────────────────────────────────────────────────────────

export async function getAgentIdentity(
  chainId: ChainId,
  agentId: bigint,
): Promise<AgentIdentity> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);
  const registry = config.erc8004.identityRegistry;

  const [tokenURI, wallet, owner] = await Promise.all([
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }) as Promise<string>,
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getAgentWallet",
      args: [agentId],
    }) as Promise<string>,
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    }) as Promise<string>,
  ]);

  // Try to read common metadata keys
  const metadata: Record<string, string> = {};
  try {
    const name = await client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getMetadata",
      args: [agentId, "name"],
    }) as string;
    if (name) metadata["name"] = sanitizeHtml(name);
  } catch {
    // metadata key may not exist — not an error
  }

  return {
    agentId,
    owner,
    tokenURI,
    metadata: Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, sanitizeHtml(String(v))])
    ),
    wallet,
    registrationBlock: 0n, // populated by discovery functions
  };
}

/**
 * Find agent ID for an address on a specific chain.
 * Scans Registered events (no reverse lookup function exists on ERC-8004).
 */
export async function findAgentByAddress(
  chainId: ChainId,
  address: string,
): Promise<bigint | null> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  // ERC-8004 deployed recently — use block 0 on testnets, last 500k blocks on mainnet
  // to avoid "block range too large" RPC errors on free endpoints
  const latestBlock = await client.getBlockNumber();
  const safeFromBlock = latestBlock > 500_000n ? latestBlock - 500_000n : 0n;

  const logs = await client.getLogs({
    address: config.erc8004.identityRegistry,
    event: IDENTITY_REGISTRY_EVENTS[0],
    args: { owner: address as `0x${string}` },
    fromBlock: safeFromBlock,
    toBlock: "latest",
  });

  if (logs.length === 0) return null;
  return logs[0].args.agentId ?? null;
}

/**
 * Find agent across all chains. Returns first match.
 * Sequential to respect rate limits (~2-5s worst case).
 */
export async function findAgentAcrossChains(
  address: string,
): Promise<{ chainId: ChainId; agentId: bigint } | null> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const agentId = await findAgentByAddress(chainId, address);
      if (agentId !== null) return { chainId, agentId };
    } catch {
      continue; // chain unavailable
    }
  }
  return null;
}

/**
 * Search agents by name across all chains.
 * Searches cached Registered events + metadata for matching names.
 */
export async function searchAgentsByName(
  query: string,
): Promise<{ chainId: ChainId; agentId: bigint; name: string }[]> {
  const results: { chainId: ChainId; agentId: bigint; name: string }[] = [];
  const queryLower = query.toLowerCase();
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const client = getPublicClient(chainId);
      const config = getChainConfig(chainId);

      // Get total supply to know range
      const totalSupply = await client.readContract({
        address: config.erc8004.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "totalSupply",
      }) as bigint;

      // Search last 50 agents (most recent registrations)
      const searchLimit = totalSupply < 50n ? totalSupply : 50n;
      const startId = totalSupply - searchLimit + 1n;

      const ids = Array.from({ length: Number(searchLimit) }, (_, i) => startId + BigInt(i));
      const nameResults = await Promise.allSettled(
        ids.map(id =>
          client.readContract({
            address: config.erc8004.identityRegistry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getMetadata",
            args: [id, "name"],
          }) as Promise<string>
        )
      );
      for (let i = 0; i < nameResults.length; i++) {
        const result = nameResults[i];
        if (result.status === "fulfilled" && result.value?.toLowerCase().includes(queryLower)) {
          results.push({ chainId, agentId: ids[i], name: result.value });
        }
      }
    } catch {
      continue; // chain unavailable
    }
  }

  return results;
}

/**
 * Get aggregated feedback for an agent.
 * Two-step: getClients() → getSummary().
 * (getAggregatedFeedback DOES NOT EXIST on ERC-8004 — verified in spike)
 */
export async function getAgentFeedback(
  chainId: ChainId,
  agentId: bigint,
): Promise<FeedbackSummary> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);
  const reputationRegistry = config.erc8004.reputationRegistry;

  // Step 1: Get all client addresses that have given feedback
  const clients = await client.readContract({
    address: reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "getClients",
    args: [agentId],
  }) as readonly string[];

  if (clients.length === 0) {
    return {
      agentId,
      clients: [],
      overallScore: { count: 0n, value: 0n, decimals: 0 },
      securityScore: { count: 0n, value: 0n, decimals: 0 },
    };
  }

  // Step 2: Get summary for overall and security tags
  const [overallResult, securityResult] = await Promise.all([
    client.readContract({
      address: reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [...clients] as `0x${string}`[], TRUST_TAGS.overall, TRUST_TAGS.overall],
    }) as Promise<readonly [bigint, bigint, number]>,
    client.readContract({
      address: reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [...clients] as `0x${string}`[], TRUST_TAGS.security, TRUST_TAGS.security],
    }) as Promise<readonly [bigint, bigint, number]>,
  ]);

  return {
    agentId,
    clients: [...clients],
    overallScore: { count: overallResult[0], value: overallResult[1], decimals: overallResult[2] },
    securityScore: { count: securityResult[0], value: securityResult[1], decimals: securityResult[2] },
  };
}

/**
 * Discover newly registered agents on a specific chain since a block number.
 */
export async function discoverNewAgents(
  chainId: ChainId,
  fromBlock: bigint,
): Promise<DiscoveredAgent[]> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  const logs = await client.getLogs({
    address: config.erc8004.identityRegistry,
    event: IDENTITY_REGISTRY_EVENTS[0],
    fromBlock,
    toBlock: "latest",
  });

  return logs.map((log) => ({
    agentId: log.args.agentId!,
    owner: log.args.owner!,
    blockNumber: log.blockNumber,
    chainId,
    source: "erc8004" as const,
  }));
}
