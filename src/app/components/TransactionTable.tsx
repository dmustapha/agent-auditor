"use client";

import { useState, useRef, useEffect } from "react";
import type { ChainId, TransactionSummary } from "@/lib/types";
import { getChainConfig } from "@/lib/chains";
import { getMethodLabel } from "../../lib/method-labels";

interface TransactionTableProps {
  transactions: readonly TransactionSummary[];
  chainId: ChainId;
  totalCount?: number;
  agentAddress?: string;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatValue(wei: string): string {
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    if (eth === 0) return "0";
    if (eth >= 0.001) return eth.toFixed(4);
    if (eth >= 0.000001) return eth.toExponential(3);
    return eth.toExponential(2);
  } catch {
    return "0";
  }
}

function CopyCell({ address, display }: { address: string; display: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard API may fail in some contexts */ }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <span className="aa-copy-cell">
      <span className="aa-mono-cell">{display}</span>
      <button
        className="aa-copy-mini"
        onClick={handleCopy}
        aria-label={`Copy address ${address}`}
        title="Copy full address"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

export function TransactionTable({ transactions, chainId, totalCount, agentAddress }: TransactionTableProps) {
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
              <th scope="col">Action</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col" style={{ textAlign: "right" }}>Value (ETH)</th>
              <th scope="col" style={{ width: "2rem" }}></th>
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
                <td>
                  {(() => {
                    const label = getMethodLabel(tx.methodId);
                    if (label) {
                      return (
                        <span style={{ fontSize: "0.75rem" }}>
                          <span style={{ color: "var(--color-accent)" }}>{label.verb}</span>
                          <span style={{ color: "var(--color-text-dim)" }}> on {label.protocol}</span>
                        </span>
                      );
                    }
                    return (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-text-dim)" }}>
                        {tx.methodId ? tx.methodId.slice(0, 10) : "0x"}
                      </span>
                    );
                  })()}
                </td>
                <td><CopyCell address={tx.from} display={truncateHash(tx.from)} /></td>
                <td><CopyCell address={tx.to} display={truncateHash(tx.to)} /></td>
                <td style={{ textAlign: "right", color: "#f2f0eb", fontSize: "0.8125rem" }}>
                  {formatValue(tx.value)}
                </td>
                <td style={{ textAlign: "center" }}>
                  <span
                    role="img"
                    aria-label={tx.success ? "Success" : "Failed"}
                    style={{
                      display: "inline-block",
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: tx.success ? "var(--color-safe)" : "var(--color-blocklist)",
                    }}
                    title={tx.success ? "Success" : "Failed"}
                  />
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
      {totalCount && totalCount > transactions.length && (
        <div className="aa-table-footer">
          <p className="aa-table-limit-note">
            Showing {transactions.length} of {totalCount.toLocaleString()} transactions.
            Full history available on{" "}
            <a
              href={`${explorerBase}/address/${agentAddress || transactions[0]?.from || ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="aa-table-explorer-link"
            >
              block explorer ↗
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
