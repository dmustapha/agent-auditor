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
      <div className="aa-table-section">
        <div className="aa-table-header">
          <span className="aa-table-title">Recent Transactions</span>
          <span className="aa-table-count">0 transactions</span>
        </div>
        <div
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            color: "#5a5650",
            fontSize: "0.8125rem",
          }}
        >
          No transactions found for this agent.
        </div>
      </div>
    );
  }

  return (
    <div className="aa-table-section">
      <div className="aa-table-header">
        <span className="aa-table-title">Recent Transactions</span>
        <span className="aa-table-count">{transactions.length} transactions</span>
      </div>
      <div className="aa-table-wrap">
        <table className="aa-table" aria-label="Transaction history">
          <thead>
            <tr>
              <th scope="col">Hash</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col" style={{ textAlign: "right" }}>Value (ETH)</th>
              <th scope="col" style={{ textAlign: "right" }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.hash}>
                <td>
                  <a
                    href={`${explorerBase}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aa-tx-hash"
                    aria-label={`View transaction ${tx.hash} on explorer`}
                  >
                    {truncateHash(tx.hash)}
                  </a>
                </td>
                <td className="aa-mono-cell">{truncateHash(tx.from)}</td>
                <td className="aa-mono-cell">{truncateHash(tx.to)}</td>
                <td style={{ textAlign: "right", color: "#e8e5df", fontSize: "0.8125rem" }}>
                  {formatValue(tx.value)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.75rem",
                    color: "#5a5650",
                  }}
                >
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
