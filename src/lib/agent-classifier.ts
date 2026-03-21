import type { AgentType, TransactionSummary } from "./types";

const ENTRY_POINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789".toLowerCase();
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032".toLowerCase();

const METHOD_REGISTRY: Record<string, { type: AgentType; protocol: string }> = {
  // ERC-20
  "0xa9059cbb": { type: "DEX_TRADER", protocol: "ERC20" },
  "0x095ea7b3": { type: "DEX_TRADER", protocol: "ERC20" },
  // Uniswap V2
  "0x7ff36ab5": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  "0x38ed1739": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  "0x18cbafe5": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  // Uniswap V3
  "0x414bf389": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  "0xc04b8d59": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  "0x5ae401dc": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  // Aave V3
  "0x617ba037": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0xa415bcad": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0x69328dec": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0xe8eda9df": { type: "LIQUIDATOR", protocol: "Aave V3" },
  // Compound V3
  "0xf2b9fdb8": { type: "YIELD_OPTIMIZER", protocol: "Compound V3" },
  "0xf3fef3a3": { type: "YIELD_OPTIMIZER", protocol: "Compound V3" },
  // WETH
  "0xd0e30db0": { type: "DEX_TRADER", protocol: "WETH" },
  "0x2e1a7d4d": { type: "DEX_TRADER", protocol: "WETH" },
  // 1inch
  "0x12aa3caf": { type: "DEX_TRADER", protocol: "1inch" },
  "0xe449022e": { type: "DEX_TRADER", protocol: "1inch" },
  // Gnosis Safe
  "0x6a761202": { type: "GOVERNANCE", protocol: "Gnosis Safe" },
  // Chainlink
  "0x4c26a0b6": { type: "ORACLE", protocol: "Chainlink" },
  "0x50d25bcd": { type: "ORACLE", protocol: "Chainlink" },
  // Chainlink Automation / Gelato
  "0x1e83409a": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4585e33b": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4b64e492": { type: "KEEPER", protocol: "Gelato" },
  // ERC-4337
  "0x1fad948c": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  "0x765e827f": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  // Bridge
  "0x0f5287b0": { type: "BRIDGE_RELAYER", protocol: "Bridge" },
};

export function classifyAgentType(txs: readonly TransactionSummary[]): AgentType {
  const counts: Partial<Record<AgentType, number>> = {};
  for (const tx of txs) {
    const sel = tx.methodId?.slice(0, 10).toLowerCase();
    const match = sel ? METHOD_REGISTRY[sel] : undefined;
    if (match) counts[match.type] = (counts[match.type] ?? 0) + 1;
  }
  if (!Object.keys(counts).length) return "UNKNOWN";
  return (Object.entries(counts) as [AgentType, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

export function detectERC4337(txs: readonly TransactionSummary[]): boolean {
  return txs.some(
    tx =>
      tx.to?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.to?.toLowerCase() === ENTRY_POINT_V07 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V07
  );
}

export function inferProtocols(txs: readonly TransactionSummary[]): string[] {
  const protocols = new Set<string>();
  for (const tx of txs) {
    const sel = tx.methodId?.slice(0, 10).toLowerCase();
    const match = sel ? METHOD_REGISTRY[sel] : undefined;
    if (match) protocols.add(match.protocol);
  }
  return Array.from(protocols);
}
