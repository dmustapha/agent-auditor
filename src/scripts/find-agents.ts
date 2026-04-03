import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

const ABI = [
  { name: "getAgentWallet", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { name: "getMetadata", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }] },
] as const;

const REGISTERED_EVENT = parseAbiItem("event Registered(uint256 indexed agentId, address indexed owner)");

async function main() {
  const client = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
  const latestBlock = await client.getBlockNumber();
  console.log("Latest block:", latestBlock.toString());

  // Scan in 10k block chunks, last 100k blocks
  const allLogs: any[] = [];
  const scanFrom = latestBlock > 100_000n ? latestBlock - 100_000n : 0n;
  
  for (let from = scanFrom; from < latestBlock; from += 9_999n) {
    const to = from + 9_998n > latestBlock ? latestBlock : from + 9_998n;
    try {
      const logs = await client.getLogs({
        address: IDENTITY_REGISTRY as any,
        event: REGISTERED_EVENT,
        fromBlock: from,
        toBlock: to,
      });
      allLogs.push(...logs);
    } catch { /* skip */ }
  }

  console.log("Found", allLogs.length, "registered agents in last 100k blocks\n");

  if (allLogs.length === 0) {
    // Try brute force: check IDs 1-20
    console.log("Trying brute force IDs 1-20...\n");
    for (let id = 1n; id <= 20n; id++) {
      try {
        const wallet = await client.readContract({ address: IDENTITY_REGISTRY as any, abi: ABI, functionName: "getAgentWallet", args: [id] });
        let name = "(no name)";
        try { name = await client.readContract({ address: IDENTITY_REGISTRY as any, abi: ABI, functionName: "getMetadata", args: [id, "name"] }) as string; } catch {}
        console.log("Agent #" + id + ": wallet=" + wallet + ", name=" + name);
      } catch {
        console.log("Agent #" + id + ": does not exist");
        break;
      }
    }
    return;
  }

  for (const log of allLogs) {
    const agentId = log.args.agentId!;
    const owner = log.args.owner!;
    try {
      const wallet = await client.readContract({ address: IDENTITY_REGISTRY as any, abi: ABI, functionName: "getAgentWallet", args: [agentId] });
      let name = "(no name)";
      try { name = await client.readContract({ address: IDENTITY_REGISTRY as any, abi: ABI, functionName: "getMetadata", args: [agentId, "name"] }) as string; } catch {}
      console.log("Agent #" + agentId + ": wallet=" + wallet + ", owner=" + owner + ", name=" + name);
    } catch (e: any) {
      console.log("Agent #" + agentId + ": owner=" + owner + ", error");
    }
  }
}

main().catch(console.error);
