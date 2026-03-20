"use client";

import type { ChainId } from "@/lib/types";

interface ChainSelectorProps {
  value: ChainId | "all";
  onChange: (chain: ChainId | "all") => void;
  disabled?: boolean;
}

const CHAIN_OPTIONS: { value: ChainId | "all"; label: string }[] = [
  { value: "all", label: "All Chains" },
  { value: "base", label: "Base" },
  { value: "gnosis", label: "Gnosis" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "polygon", label: "Polygon" },
];

export function ChainSelector({ value, onChange, disabled }: ChainSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChainId | "all")}
      disabled={disabled}
      aria-label="Select blockchain network"
      className="aa-chain-select"
    >
      {CHAIN_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
