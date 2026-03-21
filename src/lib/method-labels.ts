export interface MethodLabel {
  readonly verb: string;
  readonly protocol: string;
}

export const METHOD_LABELS: Record<string, MethodLabel> = {
  "0xa9059cbb": { verb: "Transferred", protocol: "ERC-20" },
  "0x095ea7b3": { verb: "Approved", protocol: "ERC-20" },
  "0x23b872dd": { verb: "Transferred (from)", protocol: "ERC-20" },
  "0x7ff36ab5": { verb: "Swapped ETH ->", protocol: "Uniswap V2" },
  "0x38ed1739": { verb: "Swapped tokens", protocol: "Uniswap V2" },
  "0x18cbafe5": { verb: "Swapped -> ETH", protocol: "Uniswap V2" },
  "0x414bf389": { verb: "Swapped (exact)", protocol: "Uniswap V3" },
  "0xc04b8d59": { verb: "Swapped (multi-hop)", protocol: "Uniswap V3" },
  "0x5ae401dc": { verb: "Multicall swap", protocol: "Uniswap V3" },
  "0x617ba037": { verb: "Supplied collateral", protocol: "Aave V3" },
  "0xa415bcad": { verb: "Borrowed", protocol: "Aave V3" },
  "0x69328dec": { verb: "Withdrew", protocol: "Aave V3" },
  "0xe8eda9df": { verb: "Repaid", protocol: "Aave V3" },
  "0xf2b9fdb8": { verb: "Supplied", protocol: "Compound V3" },
  "0xf3fef3a3": { verb: "Withdrew", protocol: "Compound V3" },
  "0xd0e30db0": { verb: "Wrapped ETH", protocol: "WETH" },
  "0x2e1a7d4d": { verb: "Unwrapped ETH", protocol: "WETH" },
  "0x12aa3caf": { verb: "Swapped", protocol: "1inch" },
  "0xe449022e": { verb: "Swapped (Unoswap)", protocol: "1inch" },
  "0x6a761202": { verb: "Executed multisig tx", protocol: "Gnosis Safe" },
  "0x4585e33b": { verb: "Performed upkeep", protocol: "Chainlink" },
  "0x1fad948c": { verb: "Handled user op", protocol: "ERC-4337" },
};

export function getMethodLabel(methodId: string | undefined): MethodLabel | null {
  if (!methodId) return null;
  const key = methodId.slice(0, 10).toLowerCase();
  return METHOD_LABELS[key] ?? null;
}
