import type { ChainId, DiscoveredAgent } from "./types";
import { getPublicClient, getChainConfig } from "./chains";

// ─── ABI Fragments [ASSUMED — verify against deployed bytecode] ──────────────

const SERVICE_REGISTRY_ABI = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getService",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [
      { name: "securityDeposit", type: "uint96" },
      { name: "multisig", type: "address" },
      { name: "configHash", type: "bytes32" },
      { name: "threshold", type: "uint32" },
      { name: "maxNumAgentInstances", type: "uint32" },
      { name: "numAgentInstances", type: "uint32" },
      { name: "state", type: "uint8" },
    ],
  },
  {
    name: "getAgentInstances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [
      { name: "numAgentInstances", type: "uint256" },
      { name: "agentInstances", type: "address[]" },
    ],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const DEPLOY_SERVICE_EVENT = {
  name: "DeployService",
  type: "event" as const,
  inputs: [
    { name: "serviceId", type: "uint256" as const, indexed: true },
    { name: "multisig", type: "address" as const, indexed: false },
  ],
};

// ─── Chains with Olas Registries ─────────────────────────────────────────────

const OLAS_CHAINS: ChainId[] = ["base", "gnosis"];

export function isOlasChain(chainId: ChainId): boolean {
  return OLAS_CHAINS.includes(chainId);
}

// ─── Discovery Functions ─────────────────────────────────────────────────────

/**
 * Discover deployed Olas services via DeployService events since a block.
 * Only works on Base and Gnosis.
 */
export async function discoverOlasAgents(
  chainId: ChainId,
  fromBlock: bigint,
): Promise<DiscoveredAgent[]> {
  const config = getChainConfig(chainId);
  if (!config.olasRegistry) return [];

  const client = getPublicClient(chainId);

  try {
    const logs = await client.getLogs({
      address: config.olasRegistry,
      event: DEPLOY_SERVICE_EVENT,
      fromBlock,
      toBlock: "latest",
    });

    const agents: DiscoveredAgent[] = [];

    for (const log of logs) {
      const args = log.args as { serviceId?: bigint; multisig?: string };
      const serviceId = Number(args.serviceId);
      const multisig = (args.multisig ?? "") as string;

      // Get agent instance addresses for this service
      try {
        const result = await client.readContract({
          address: config.olasRegistry!,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getAgentInstances",
          args: [BigInt(serviceId)],
        });

        const [, agentInstances] = result as [bigint, readonly string[]];
        if (!Array.isArray(agentInstances)) continue; // Guard against ABI mismatch

        for (const addr of agentInstances) {
          agents.push({
            agentId: BigInt(serviceId),
            owner: addr as `0x${string}`,
            blockNumber: log.blockNumber,
            chainId,
            source: "olas",
          });
        }

        // Also add the multisig itself as a monitorable address
        if (multisig !== "0x0000000000000000000000000000000000000000") {
          agents.push({
            agentId: BigInt(serviceId),
            owner: multisig,
            blockNumber: log.blockNumber,
            chainId,
            source: "olas",
          });
        }
      } catch {
        // Service may have been terminated — skip
        continue;
      }
    }

    return agents;
  } catch {
    // Olas registry unavailable — non-fatal
    console.warn(`[olas] Failed to discover agents on ${chainId}`);
    return [];
  }
}
