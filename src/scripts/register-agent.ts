import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, getViemChain } from "../lib/chains";
import { IDENTITY_REGISTRY_ABI } from "../lib/erc8004";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY required");

  const chainId = "base" as const;
  const config = getChainConfig(chainId);
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const wallet = createWalletClient({
    account,
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });

  const agentJson = {
    type: "auditor",
    name: "AgentAuditor",
    description: "Autonomous trust evaluation agent for EVM chain AI agents. Monitors Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon.",
    services: ["audit", "blocklist", "trust-score"],
    supportedChains: ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"],
    supportedTrust: ["trustScore/overall", "trustScore/security", "trustScore/reliability", "trustScore/quality"],
  };

  // Encode as base64 data URI
  const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(agentJson)).toString("base64")}`;

  console.log("Registering AgentAuditor on ERC-8004 IdentityRegistry...");
  console.log("Chain:", config.name);
  console.log("Registry:", config.erc8004.identityRegistry);
  console.log("Account:", account.address);

  const txHash = await wallet.writeContract({
    address: config.erc8004.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
  });

  console.log("Transaction:", txHash);
  console.log("AgentAuditor registered successfully!");
}

main().catch(console.error);
