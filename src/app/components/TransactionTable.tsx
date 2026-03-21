"use client";

import type { ChainId, TransactionSummary } from "@/lib/types";
import { getChainConfig } from "@/lib/chains";

interface TransactionTableProps {
  transactions: readonly TransactionSummary[];
  chainId: ChainId;
  totalCount?: number;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatValue(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  if (eth === 0) return "0";
  if (eth >= 0.001) return eth.toFixed(4);
  if (eth >= 0.000001) return eth.toExponential(3);
  return eth.toExponential(2);
}

export function TransactionTable({ transactions, chainId, totalCount }: TransactionTableProps) {
  const explorerBase = getChainConfig(chainId).explorer;

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
            color: "#78716c",
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
        <span className="aa-table-count">
          {totalCount && totalCount > transactions.length
            ? `${transactions.length} of ${totalCount} transactions`
            : `${transactions.length} transactions`}
        </span>
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
            {transactions.map((tx, i) => (
              <tr key={tx.hash} className="aa-table-row-enter" style={{ animationDelay: `${i * 30}ms` }}>
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
                <td style={{ textAlign: "right", color: "#f2f0eb", fontSize: "0.8125rem" }}>
                  {formatValue(tx.value)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.75rem",
                    color: "#78716c",
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
