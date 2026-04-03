/**
 * Extended mainnet ERC-8004 scan — more chains, higher ID range.
 */
import { createPublicClient, http } from "viem";
import { base, gnosis, mainnet, arbitrum, optimism, polygon } from "viem/chains";

const MAINNET_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const ABI = [
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
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
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

const chains = [
  { name: "gnosis", chain: gnosis, rpc: "https://rpc.gnosischain.com", maxId: 50 },
  { name: "base", chain: base, rpc: "https://mainnet.base.org", maxId: 50 },
  { name: "arbitrum", chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc", maxId: 30 },
  { name: "optimism", chain: optimism, rpc: "https://mainnet.optimism.io", maxId: 30 },
  { name: "polygon", chain: polygon, rpc: "https://polygon.llamarpc.com", maxId: 30 },
];

const allAgents: { chain: string; id: bigint; wallet: string; name: string }[] = [];

async function scanChain(chainInfo: (typeof chains)[number]) {
  const client = createPublicClient({
    chain: chainInfo.chain,
    transport: http(chainInfo.rpc),
  });

  console.log(`\n=== ${chainInfo.name.toUpperCase()} (IDs 1-${chainInfo.maxId}) ===`);

  for (let id = 1n; id <= BigInt(chainInfo.maxId); id++) {
    try {
      const wallet = await client.readContract({
        address: MAINNET_REGISTRY,
        abi: ABI,
        functionName: "getAgentWallet",
        args: [id],
      }) as string;

      if (wallet !== ZERO) {
        let name = "";
        try {
          name = await client.readContract({
            address: MAINNET_REGISTRY,
            abi: ABI,
            functionName: "getMetadata",
            args: [id, "name"],
          }) as string;
        } catch {}

        allAgents.push({ chain: chainInfo.name, id, wallet, name });
        console.log(`  #${id} → ${wallet} ${name ? `(${name})` : ""}`);
      }
    } catch {
      // ID doesn't exist — stop scanning this chain
      if (id > 5n) break; // Give a few tries then bail
    }
  }
}

async function main() {
  for (const chain of chains) {
    await scanChain(chain);
  }

  console.log(`\n=== UNIQUE AGENT WALLETS ===`);
  const unique = new Map<string, { chain: string; name: string }>();
  for (const a of allAgents) {
    if (!unique.has(a.wallet.toLowerCase())) {
      unique.set(a.wallet.toLowerCase(), { chain: a.chain, name: a.name });
    }
  }
  for (const [wallet, info] of unique) {
    console.log(`${wallet} (${info.chain}) ${info.name || ""}`);
  }
  console.log(`\nTotal unique wallets: ${unique.size}`);
}

main().catch(console.error);
