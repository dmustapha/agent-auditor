"use client";

import type { ChainId, TransactionSummary } from "@/lib/types";

interface TransactionTableProps {
  transactions: readonly TransactionSummary[];
  chainId: ChainId;
}

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === "true";

const EXPLORER_URLS: Record<ChainId, string> = IS_TESTNET
  ? {
      base: "https://sepolia.basescan.org",
      gnosis: "https://gnosis-chiado.blockscout.com",
      ethereum: "https://sepolia.etherscan.io",
      arbitrum: "https://sepolia.arbiscan.io",
      optimism: "https://sepolia-optimism.etherscan.io",
      polygon: "https://amoy.polygonscan.com",
    }
  : {
      base: "https://basescan.org",
      gnosis: "https://gnosisscan.io",
      ethereum: "https://etherscan.io",
      arbitrum: "https://arbiscan.io",
      optimism: "https://optimistic.etherscan.io",
      polygon: "https://polygonscan.com",
    };

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatValue(wei: string): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return "0";
  if (eth < 0.001) return "<0.001";
  return eth.toFixed(4);
}

export function TransactionTable({ transactions, chainId }: TransactionTableProps) {
  const explorerBase = EXPLORER_URLS[chainId] ?? EXPLORER_URLS.base;

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 text-center text-text-secondary">
        No transactions found
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-medium text-text-secondary border-b border-border">
        Recent Transactions
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-2 font-medium">Hash</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium text-right">Value (ETH)</th>
              <th className="px-4 py-2 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.hash} className="border-b border-border/50 hover:bg-surface-hover">
                <td className="px-4 py-2 font-mono">
                  <a
                    href={`${explorerBase}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {truncateHash(tx.hash)}
                  </a>
                </td>
                <td className="px-4 py-2 font-mono text-text-secondary">{truncateHash(tx.from)}</td>
                <td className="px-4 py-2 font-mono text-text-secondary">{truncateHash(tx.to)}</td>
                <td className="px-4 py-2 text-right">{formatValue(tx.value)}</td>
                <td className="px-4 py-2 text-right text-text-secondary">
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
