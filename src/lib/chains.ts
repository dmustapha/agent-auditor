import {
  base,
  gnosis,
  mainnet,
  arbitrum,
  optimism,
  polygon,
  baseSepolia,
  gnosisChiado,
  sepolia,
  arbitrumSepolia,
  optimismSepolia,
} from "viem/chains";
import { createPublicClient, http, type Chain } from "viem";
import type { ChainId, ChainConfig, SolanaChainConfig } from "./types";

// ─── Use testnet flag from environment ───────────────────────────────────────

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === "true";

// ─── ERC-8004 Contract Addresses (CREATE2 — identical on all chains) ─────────

const ERC8004_MAINNET = {
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`,
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as `0x${string}`,
} as const;

const ERC8004_TESTNET = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`,
} as const;

const ERC8004 = IS_TESTNET ? ERC8004_TESTNET : ERC8004_MAINNET;

// ─── Chain Configurations ────────────────────────────────────────────────────

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  base: {
    id: "base",
    name: "Base",
    blockscoutUrl: "https://base.blockscout.com/api/v2",
    rpcUrl: IS_TESTNET ? "https://sepolia.base.org" : "https://mainnet.base.org",
    chainIdNum: IS_TESTNET ? 84532 : 8453,
    erc8004: ERC8004,
    olasRegistry: "0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE",
    explorer: IS_TESTNET ? "https://sepolia.basescan.org" : "https://basescan.org",
  },
  gnosis: {
    id: "gnosis",
    name: "Gnosis",
    blockscoutUrl: "https://gnosis.blockscout.com/api/v2",
    rpcUrl: "https://rpc.gnosischain.com",
    chainIdNum: 100,
    erc8004: ERC8004,
    olasRegistry: "0x9338b5153AE39BB89f50468E608eD9d764B755fD",
    explorer: "https://gnosisscan.io",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    blockscoutUrl: "https://eth.blockscout.com/api/v2",
    rpcUrl: "https://eth.llamarpc.com",
    chainIdNum: IS_TESTNET ? 11155111 : 1,
    erc8004: ERC8004,
    explorer: IS_TESTNET ? "https://sepolia.etherscan.io" : "https://etherscan.io",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    blockscoutUrl: "https://arbitrum.blockscout.com/api/v2",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    chainIdNum: 42161,
    erc8004: ERC8004,
    explorer: "https://arbiscan.io",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    blockscoutUrl: "https://optimism.blockscout.com/api/v2",
    rpcUrl: "https://mainnet.optimism.io",
    chainIdNum: 10,
    erc8004: ERC8004,
    explorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    blockscoutUrl: "https://polygon.blockscout.com/api/v2",
    rpcUrl: "https://polygon.llamarpc.com",
    chainIdNum: 137,
    erc8004: ERC8004,
    explorer: "https://polygonscan.com",
  },
} as const;

// ─── Solana Chain Configuration ─────────────────────────────────────────────

export const SOLANA_CHAIN_CONFIG: SolanaChainConfig = {
  id: "solana",
  name: "Solana",
  covalentChainName: "solana-mainnet",
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  explorer: "https://solscan.io",
};

export function isSolanaChain(chainId: string): chainId is "solana" {
  return chainId === "solana";
}

export function getSolanaConfig(): SolanaChainConfig {
  return SOLANA_CHAIN_CONFIG;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return config;
}

export function getAllChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS);
}

export function getAllChainIds(): ChainId[] {
  return [...Object.keys(SUPPORTED_CHAINS) as ChainId[], "solana"];
}

// ─── Viem Chain Object Map ───────────────────────────────────────────────────

const VIEM_CHAINS: Record<string, Chain> = {
  base: IS_TESTNET ? baseSepolia : base,
  gnosis: IS_TESTNET ? gnosisChiado : gnosis,
  ethereum: IS_TESTNET ? sepolia : mainnet,
  arbitrum: IS_TESTNET ? arbitrumSepolia : arbitrum,
  optimism: IS_TESTNET ? optimismSepolia : optimism,
  polygon: polygon, // no standard Sepolia for Polygon in viem
};

export function getViemChain(chainId: ChainId): Chain {
  return VIEM_CHAINS[chainId];
}

// ─── Public Client Factory ───────────────────────────────────────────────────

const clientCache = new Map<ChainId, ReturnType<typeof createPublicClient>>();

export function getPublicClient(chainId: ChainId) {
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const config = getChainConfig(chainId);
  const client = createPublicClient({
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });

  clientCache.set(chainId, client);
  return client;
}
