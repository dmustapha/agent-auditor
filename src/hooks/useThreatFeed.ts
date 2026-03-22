"use client";

import { useState, useEffect, useRef } from "react";
import { parseAbiItem } from "viem";
import { getPublicClient } from "@/lib/chains";
import type { ThreatFeedEntry } from "@/lib/types";

const BLOCKLIST_ADDRESS = (process.env.NEXT_PUBLIC_BLOCKLIST_ADDRESS ?? "0x1E3ba77E2D73B5B70a6D534454305b02e425abBA") as `0x${string}`;
const EVENT = parseAbiItem("event AgentBlocked(address indexed agent, string reason)");
const POLL_INTERVAL_MS = 30_000;
const INITIAL_LOOKBACK_BLOCKS = 1000n;
const MAX_ENTRIES = 100;

export function useThreatFeed() {
  const [entries, setEntries] = useState<ThreatFeedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastBlockRef = useRef<bigint>(0n);

  useEffect(() => {
    const client = getPublicClient("base");
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    async function fetchLogs(fromBlock: bigint, toBlock: bigint) {
      const logs = await client.getLogs({
        address: BLOCKLIST_ADDRESS,
        event: EVENT,
        fromBlock,
        toBlock,
      });

      if (!mounted) return;

      const newEntries: ThreatFeedEntry[] = logs.map((log) => ({
        agentAddress: (log.args as { agent: string }).agent,
        reason: (log.args as { reason: string }).reason ?? "Unknown",
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
        timestamp: Date.now() - Number(toBlock - (log.blockNumber ?? toBlock)) * 2000,
      }));

      if (newEntries.length > 0) {
        setEntries((prev) => [...newEntries, ...prev].slice(0, MAX_ENTRIES));
      }

      lastBlockRef.current = toBlock;
    }

    async function init() {
      try {
        const currentBlock = await client.getBlockNumber();
        const fromBlock = currentBlock > INITIAL_LOOKBACK_BLOCKS
          ? currentBlock - INITIAL_LOOKBACK_BLOCKS
          : 0n;
        await fetchLogs(fromBlock, currentBlock);
        setError(null);
      } catch {
        if (mounted) setError("Feed temporarily unavailable");
      }
    }

    async function poll() {
      try {
        const currentBlock = await client.getBlockNumber();
        if (currentBlock > lastBlockRef.current) {
          await fetchLogs(lastBlockRef.current + 1n, currentBlock);
          setError(null);
        }
      } catch {
        if (mounted) setError("Feed temporarily unavailable");
      }
    }

    init().then(() => {
      if (mounted) {
        intervalId = setInterval(poll, POLL_INTERVAL_MS);
      }
    });

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { entries, error };
}
