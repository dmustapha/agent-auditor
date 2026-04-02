// File: src/lib/solana-programs.ts
// Known Solana program addresses → readable names + activity categories

import type { ActivityCategory } from "./types";

export interface SolanaProgramInfo {
  readonly name: string;
  readonly category: ActivityCategory["category"];
}

// Key = program address (base58), Value = info
export const SOLANA_PROGRAMS: Record<string, SolanaProgramInfo> = {
  // ─── System Programs ───
  "11111111111111111111111111111111": { name: "System Program", category: "transfers" },
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": { name: "SPL Token Program", category: "transfers" },
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": { name: "SPL Token 2022", category: "transfers" },
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": { name: "Associated Token Account", category: "transfers" },
  "ComputeBudget111111111111111111111111111111": { name: "Compute Budget", category: "other" },

  // ─── DEX / Swapping ───
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { name: "Jupiter V6", category: "swapping" },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": { name: "Jupiter V4", category: "swapping" },
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": { name: "Jupiter Limit Order", category: "swapping" },
  "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23": { name: "Jupiter DCA", category: "swapping" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM V4", category: "swapping" },
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": { name: "Raydium CLMM", category: "swapping" },
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": { name: "Orca Whirlpool", category: "swapping" },
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": { name: "Orca Token Swap V2", category: "swapping" },
  "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ": { name: "Saber Swap", category: "swapping" },
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": { name: "Meteora DLMM", category: "swapping" },

  // ─── Staking ───
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD": { name: "Marinade Finance", category: "staking" },
  "Stake11111111111111111111111111111111111111": { name: "Stake Program", category: "staking" },
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy": { name: "Stake Pool Program", category: "staking" },
  "SVMBSocVcPGfBUMJbRsw2CbPSHZoLAqPnLeDLMHqCAh": { name: "Sanctum (SOL staking)", category: "staking" },

  // ─── Lending / Borrowing ───
  "So1endDq2YkqhipRh3WViPa8hFb54V1mLKwZHjJm3Xd": { name: "Solend", category: "lending" },
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA": { name: "Marginfi", category: "lending" },
  "KLend2g3cP87ez86XkqRChw2EPsPTYkEBeergLpT8eN": { name: "Kamino Lend", category: "lending" },

  // ─── MEV / Tips ───
  "T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt": { name: "Jito Tip Program", category: "keeper_ops" },
  "HFqU5x63VTqvQss8hp11i4bPaBDvtYBXMot1XrHYciP6": { name: "Jito Tip Distribution", category: "keeper_ops" },

  // ─── Governance ───
  "GovER5Lthms3bLBqWub97yVRJ2bJSmd9gknnCpFHEk4T": { name: "Governance V3", category: "governance" },
  "GovHgfDPyQ1GwjFhNkMqZrGNErFqDfoc6xQfLzqxUJB": { name: "Governance V2", category: "governance" },

  // ─── NFT / Metaplex ───
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": { name: "Metaplex Token Metadata", category: "nft_trading" },
  "M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K": { name: "Magic Eden V2", category: "nft_trading" },

  // ─── Bridging ───
  "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb": { name: "Wormhole", category: "bridging" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { name: "deBridge", category: "bridging" },

  // ─── Olas / Agent Registry ───
  "AU428Z7KJErRbtsLmBJEHBaCoaGwqebP3gW6KQH4pFe2": { name: "Olas Registry (Solana)", category: "other" },
};

/**
 * Resolve a Solana program address to its human-readable name.
 * Returns null if unknown.
 */
export function resolveSolanaProgram(address: string): SolanaProgramInfo | null {
  return SOLANA_PROGRAMS[address] ?? null;
}

/**
 * Get the human-readable name for a Solana program address.
 * Returns the address truncated if unknown.
 */
export function getSolanaProgramName(address: string): string {
  return SOLANA_PROGRAMS[address]?.name ?? `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Get the activity category for a Solana program.
 * Returns "other" if unknown.
 */
export function getSolanaProgramCategory(address: string): ActivityCategory["category"] {
  return SOLANA_PROGRAMS[address]?.category ?? "other";
}
