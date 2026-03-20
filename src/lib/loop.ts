import type { LoopStatus, AuditResult, TrustScore } from "./types";
import { getAllChainIds, getPublicClient } from "./chains";
import { fetchAgentData } from "./blockscout";
import { discoverNewAgents, getAgentIdentity } from "./erc8004";
import { discoverOlasAgents, isOlasChain } from "./olas";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "./venice";
import { validateTrustScore } from "./trust-score";
import { publishAttestation, addToBlocklist } from "./attestation";

// ─── State ───────────────────────────────────────────────────────────────────

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastRun: string | null = null;
let agentsAudited = 0;
const checkpoints: { [chainId: string]: bigint } = {};
const auditedAddresses = new Set<string>(); // avoid re-auditing in same session

// ─── Core Loop ───────────────────────────────────────────────────────────────

export async function runOnce(
  sendAlert: (msg: string) => Promise<void>,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const useMock = process.env.VENICE_MOCK === "true";
  const veniceClient = !useMock && process.env.VENICE_API_KEY
    ? createVeniceClient(process.env.VENICE_API_KEY)
    : null;
  const model = veniceClient ? await resolveModel(veniceClient) : null;

  const chains = getAllChainIds();

  for (const chainId of chains) {
    try {
      console.log(`[loop] Scanning ${chainId}...`);

      // Get current block for checkpoint
      const client = getPublicClient(chainId);
      const currentBlock = await client.getBlockNumber();
      const fromBlock = checkpoints[chainId] ?? (currentBlock - 10000n); // last ~10k blocks if no checkpoint

      // Discover new agents from ERC-8004
      const erc8004Agents = await discoverNewAgents(chainId, fromBlock);

      // Discover Olas agents (Base + Gnosis only)
      const olasAgents = isOlasChain(chainId)
        ? await discoverOlasAgents(chainId, fromBlock)
        : [];

      const allAgents = [...erc8004Agents, ...olasAgents];
      console.log(`[loop] ${chainId}: discovered ${allAgents.length} agents`);

      // Analyze each new agent
      for (const agent of allAgents) {
        // Get agent's wallet address
        let agentAddress: string;
        if (agent.source === "erc8004") {
          try {
            const identity = await getAgentIdentity(chainId, agent.agentId);
            agentAddress = identity.wallet;
          } catch {
            agentAddress = agent.owner;
          }
        } else {
          agentAddress = agent.owner; // Olas: multisig is the operational address
        }

        // Skip if already audited this session
        const key = `${chainId}:${agentAddress.toLowerCase()}`;
        if (auditedAddresses.has(key)) continue;
        auditedAddresses.add(key);

        try {
          // Fetch onchain data
          const agentData = await fetchAgentData(chainId, agentAddress);

          // Analyze
          let trustScore: TrustScore;
          if (useMock || !veniceClient || !model) {
            trustScore = createMockTrustScore(agentAddress, chainId, agentData.transactions.length);
          } else {
            const raw = await analyzeAgent(veniceClient, agentData, model);
            trustScore = validateTrustScore(raw);
          }

          console.log(`[loop] ${chainId} ${agentAddress}: ${trustScore.overallScore}/100 ${trustScore.recommendation}`);

          // Act based on recommendation
          let attestationTx: `0x${string}` | null = null;
          let blocklistTx: `0x${string}` | null = null;
          let telegramSent = false;

          // Publish attestation (on agent's native chain)
          try {
            const result = await publishAttestation(chainId, agent.agentId, trustScore);
            attestationTx = result.txHash;
          } catch (err) {
            console.error(`[loop] Attestation failed for ${agentAddress}:`, err);
          }

          // Blocklist + alert for CAUTION and BLOCKLIST
          if (trustScore.recommendation === "BLOCKLIST") {
            try {
              blocklistTx = await addToBlocklist(
                agentAddress,
                `Score: ${trustScore.overallScore}/100 on ${chainId}. ${trustScore.summary}`,
              );
            } catch (err) {
              console.error(`[loop] Blocklist failed for ${agentAddress}:`, err);
            }
          }

          if (trustScore.recommendation !== "SAFE") {
            try {
              const { formatForTelegram } = await import("./trust-score");
              await sendAlert(formatForTelegram(trustScore));
              telegramSent = true;
            } catch (err) {
              console.error(`[loop] Telegram alert failed:`, err);
            }
          }

          results.push({ agent, trustScore, attestationTx, blocklistTx, telegramSent });
          agentsAudited++;
        } catch (err) {
          console.error(`[loop] Failed to audit ${agentAddress} on ${chainId}:`, err);
        }
      }

      // Update checkpoint for this chain
      checkpoints[chainId] = currentBlock;
    } catch (err) {
      console.error(`[loop] Chain ${chainId} scan failed:`, err);
      // Continue to next chain — one failure doesn't stop the loop
    }
  }

  lastRun = new Date().toISOString();
  return results;
}

// ─── Start / Stop ────────────────────────────────────────────────────────────

export function startLoop(
  sendAlert: (msg: string) => Promise<void>,
  intervalMs = 5 * 60 * 1000, // 5 minutes default
) {
  if (running) {
    console.warn("[loop] Already running");
    return;
  }

  running = true;
  console.log(`[loop] Starting autonomous loop (interval: ${intervalMs / 1000}s)`);

  // Run immediately, then on interval
  runOnce(sendAlert).catch((err) => console.error("[loop] Initial run failed:", err));

  intervalHandle = setInterval(() => {
    runOnce(sendAlert).catch((err) => console.error("[loop] Interval run failed:", err));
  }, intervalMs);
}

export function stopLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  running = false;
  console.log("[loop] Stopped");
}

export function getStatus(): LoopStatus {
  return {
    running,
    lastRun,
    agentsAudited,
    checkpoints: { ...checkpoints },
    nextRun: running && lastRun
      ? new Date(new Date(lastRun).getTime() + 5 * 60 * 1000).toISOString()
      : null,
  };
}
