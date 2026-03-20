/**
 * Seed test agents for demo purposes.
 * This script doesn't deploy real agents — it pre-caches mock analysis results
 * for known addresses so the demo is reliable and repeatable.
 */

import { writeFileSync, mkdirSync } from "fs";
import { createMockTrustScore } from "../lib/venice";
import type { ChainId } from "../lib/types";

interface TestAgent {
  name: string;
  address: string;
  chainId: ChainId;
  expectedScore: "high" | "medium" | "low";
}

// Pre-selected addresses with known transaction patterns
const TEST_AGENTS: TestAgent[] = [
  {
    name: "Safe Olas Agent",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: "gnosis",
    expectedScore: "high",
  },
  {
    name: "Suspicious Agent",
    address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    chainId: "base",
    expectedScore: "medium",
  },
  {
    name: "Malicious Drainer",
    address: "0x0000000000000000000000000000000000000bad",
    chainId: "base",
    expectedScore: "low",
  },
];

function main() {
  mkdirSync(".demo-cache", { recursive: true });

  for (const agent of TEST_AGENTS) {
    const score = createMockTrustScore(agent.address, agent.chainId, 50);
    const cacheKey = `${agent.chainId}-${agent.address}`;
    writeFileSync(
      `.demo-cache/${cacheKey}.json`,
      JSON.stringify({ agent, score }, null, 2),
    );
    console.log(`Cached: ${agent.name} → ${score.overallScore}/100 ${score.recommendation}`);
  }

  console.log(`\nSeeded ${TEST_AGENTS.length} test agents to .demo-cache/`);
}

main();
