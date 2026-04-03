/**
 * Query mainnet ERC-8004 Identity Registry for real registered agents.
 * Bypasses the app's testnet config — hits mainnet directly.
 */
import { createPublicClient, http, parseAbiItem } from "viem";
import { base, gnosis, mainnet } from "viem/chains";

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
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const REGISTERED_EVENT = parseAbiItem(
  "event Registered(uint256 indexed agentId, address indexed owner)"
);

const chains = [
  { name: "base", chain: base, rpc: "https://mainnet.base.org" },
  { name: "gnosis", chain: gnosis, rpc: "https://rpc.gnosischain.com" },
  { name: "ethereum", chain: mainnet, rpc: "https://eth.llamarpc.com" },
];

async function scanChain(chainInfo: (typeof chains)[number]) {
  const client = createPublicClient({
    chain: chainInfo.chain,
    transport: http(chainInfo.rpc),
  });

  console.log(`\n=== ${chainInfo.name.toUpperCase()} ===`);

  // Try totalSupply first
  try {
    const supply = await client.readContract({
      address: MAINNET_REGISTRY,
      abi: ABI,
      functionName: "totalSupply",
    });
    console.log(`totalSupply: ${supply}`);
  } catch (e) {
    console.log("totalSupply reverted, trying event scan...");
  }

  // Scan recent Registered events
  const latest = await client.getBlockNumber();
  const fromBlock = latest > 50000n ? latest - 50000n : 0n;

  try {
    const logs = await client.getLogs({
      address: MAINNET_REGISTRY,
      event: REGISTERED_EVENT,
      fromBlock,
      toBlock: "latest",
    });

    console.log(`Found ${logs.length} Registered events in last 50k blocks`);

    for (const log of logs.slice(0, 20)) {
      const agentId = log.args.agentId!;
      const owner = log.args.owner!;

      try {
        const wallet = await client.readContract({
          address: MAINNET_REGISTRY,
          abi: ABI,
          functionName: "getAgentWallet",
          args: [agentId],
        });

        let name = "";
        try {
          name = await client.readContract({
            address: MAINNET_REGISTRY,
            abi: ABI,
            functionName: "getMetadata",
            args: [agentId, "name"],
          }) as string;
        } catch {}

        console.log(
          `  Agent #${agentId} | owner: ${owner} | wallet: ${wallet} | name: ${name || "(none)"}`
        );
      } catch (e) {
        console.log(`  Agent #${agentId} | owner: ${owner} | wallet fetch failed`);
      }
    }
  } catch (e: any) {
    console.log(`Event scan failed: ${e.message?.slice(0, 100)}`);

    // Fallback: brute force IDs 1-20
    console.log("Trying brute force IDs 1-20...");
    for (let id = 1n; id <= 20n; id++) {
      try {
        const wallet = await client.readContract({
          address: MAINNET_REGISTRY,
          abi: ABI,
          functionName: "getAgentWallet",
          args: [id],
        });

        if (wallet !== "0x0000000000000000000000000000000000000000") {
          let name = "";
          try {
            name = await client.readContract({
              address: MAINNET_REGISTRY,
              abi: ABI,
              functionName: "getMetadata",
              args: [id, "name"],
            }) as string;
          } catch {}
          console.log(`  Agent #${id} | wallet: ${wallet} | name: ${name || "(none)"}`);
        }
      } catch {
        // ID doesn't exist
      }
    }
  }
}

async function main() {
  for (const chain of chains) {
    await scanChain(chain);
  }
}

main().catch(console.error);
