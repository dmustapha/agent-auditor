import { normalize } from "viem/ens";
import type { ChainId, InputType, ResolvedInput } from "./types";
import { getPublicClient, getAllChainIds } from "./chains";
import { getAgentIdentity, findAgentByAddress, searchAgentsByName } from "./erc8004";
import { detectChainWithActivity } from "./blockscout";
import { isValidSolanaAddress } from "./solana";

// ─── Input Type Detection ────────────────────────────────────────────────────

export function detectInputType(input: string): InputType {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) return "agentId";
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return "address";
  if (trimmed.endsWith(".eth")) return "ens";
  // Solana address detection (base58, 32-44 chars, no 0x prefix)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) && isValidSolanaAddress(trimmed)) return "address";
  return "name";
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export async function resolveInput(
  input: string,
  inputType: InputType,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  switch (inputType) {
    case "agentId":
      return resolveAgentId(input, chain);
    case "address":
      return resolveAddress(input, chain);
    case "name":
      return resolveName(input);
    case "ens":
      return resolveENS(input);
  }
}

async function resolveAgentId(
  input: string,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  const agentId = BigInt(input);

  if (chain !== "all") {
    const identity = await getAgentIdentity(chain, agentId);
    return {
      address: identity.wallet,
      chainId: chain,
      agentId,
      resolvedVia: "agentId",
    };
  }

  // Scan chains for this agent ID
  const chains = getAllChainIds();
  for (const chainId of chains) {
    try {
      const identity = await getAgentIdentity(chainId, agentId);
      if (identity.wallet && identity.wallet !== "0x0000000000000000000000000000000000000000") {
        return {
          address: identity.wallet,
          chainId,
          agentId,
          resolvedVia: "agentId",
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Agent ID ${input} not found on any supported chain`);
}

async function resolveAddress(
  input: string,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  // Solana addresses are case-sensitive base58 — don't lowercase them
  const isSolana = chain === "solana" || isValidSolanaAddress(input.trim());
  const address = isSolana ? input.trim() : input.toLowerCase();

  if (chain !== "all") {
    // Skip ERC-8004 lookup for Solana
    const agentId = isSolana ? null : await findAgentByAddress(chain, address).catch(() => null);
    return {
      address,
      chainId: chain,
      agentId: agentId ?? undefined,
      resolvedVia: "address",
    };
  }

  // Solana addresses skip EVM chain detection — go straight to solana
  if (isSolana) {
    return { address, chainId: "solana", resolvedVia: "address" };
  }

  // Auto-detect chain with activity (EVM only)
  const detectedChain = await detectChainWithActivity(address);
  if (detectedChain) {
    const agentId = await findAgentByAddress(detectedChain, address).catch(() => null);
    return {
      address,
      chainId: detectedChain,
      agentId: agentId ?? undefined,
      resolvedVia: "address",
    };
  }

  // No activity found on any chain — throw instead of wasting a Venice call
  throw new Error(`No transaction activity found for ${address.slice(0, 10)}... on any supported chain`);
}

async function resolveName(input: string): Promise<ResolvedInput> {
  const results = await searchAgentsByName(input);

  if (results.length === 0) {
    throw new Error(`No agent found matching name "${input}" on any supported chain`);
  }

  // Return first match
  const match = results[0];
  const identity = await getAgentIdentity(match.chainId, match.agentId);

  return {
    address: identity.wallet,
    chainId: match.chainId,
    agentId: match.agentId,
    resolvedVia: "name",
  };
}

async function resolveENS(input: string): Promise<ResolvedInput> {
  // ENS resolution happens on Ethereum mainnet
  const client = getPublicClient("ethereum");

  try {
    const address = await client.getEnsAddress({
      name: normalize(input),
    });

    if (!address) {
      throw new Error(`ENS name "${input}" does not resolve to an address`);
    }

    // Once we have the address, detect which chain has activity
    const detectedChain = await detectChainWithActivity(address);

    return {
      address,
      chainId: detectedChain ?? "ethereum",
      resolvedVia: "ens",
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not resolve")) {
      throw error;
    }
    throw new Error(`ENS resolution failed for "${input}"`);
  }
}
