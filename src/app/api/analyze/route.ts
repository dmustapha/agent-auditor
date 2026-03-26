import { NextRequest, NextResponse } from "next/server";
import type { ChainId, InputType, AnalyzeRequest, AnalyzeResponse, AnalyzeErrorResponse, TransactionSummary } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData, detectAllChainsWithActivity } from "@/lib/blockscout";
import { getAgentIdentity, findAgentByAddress } from "@/lib/erc8004";
import { publishAttestation } from "@/lib/attestation";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "@/lib/venice";
import { computeBehavioralProfile } from "@/lib/behavioral-profile";
import { validateTrustScore } from "@/lib/trust-score";
import { analysisCache } from "@/lib/cache";
import { getETHPrice } from "@/lib/price";
import { checkRateLimit } from "@/lib/rate-limit";

const USE_MOCK = process.env.VENICE_MOCK === "true";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many requests. Try again shortly." } satisfies AnalyzeErrorResponse,
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
      );
    }

    const body: AnalyzeRequest = await request.json();
    const { input, chain } = body;

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return NextResponse.json(
        { error: "invalid_input", message: "Input is required" } satisfies AnalyzeErrorResponse,
        { status: 400 },
      );
    }

    if (input.trim().length > 200) {
      return NextResponse.json(
        { error: "invalid_input", message: "Input must be 200 characters or less" } satisfies AnalyzeErrorResponse,
        { status: 400 },
      );
    }

    // 1. Detect input type (or use provided)
    const inputType: InputType = body.inputType ?? detectInputType(input);

    const VALID_CHAINS = new Set<ChainId | "all">(["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon", "all"]);
    if (chain && !VALID_CHAINS.has(chain as ChainId | "all")) {
      return NextResponse.json(
        { error: "invalid_input", message: "Invalid chain" } satisfies AnalyzeErrorResponse,
        { status: 400 },
      );
    }
    const selectedChain: ChainId | "all" = chain ?? "all";

    // 2. Resolve input to address + chain
    let resolved;
    try {
      resolved = await resolveInput(input, inputType, selectedChain);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : `No agent found matching "${input}" on any supported chain.`;

      // If searching a specific chain and it's an address, check if other chains have activity
      if (selectedChain !== "all" && inputType === "address") {
        try {
          const otherChains = await detectAllChainsWithActivity(input.trim().toLowerCase());
          const activeOnOther = otherChains.filter(c => c.chainId !== selectedChain && c.txCount > 0);
          if (activeOnOther.length > 0) {
            const chainNames = activeOnOther.map(c => c.chainId).join(", ");
            return NextResponse.json(
              {
                error: "no_activity_on_chain",
                message: `No transactions found for this address on ${selectedChain}.`,
                suggestion: `Try scanning all chains — this address has activity on ${chainNames}.`,
                activeChains: activeOnOther.map(c => c.chainId),
              } satisfies AnalyzeErrorResponse,
              { status: 404 },
            );
          }
        } catch { /* chain detection failed — fall through to generic error */ }
      }

      // Generic no-activity error
      const isNoActivity = errMsg.includes("No transaction activity") || errMsg.includes("No agent found");
      return NextResponse.json(
        {
          error: isNoActivity ? "no_activity" : "agent_not_found",
          message: isNoActivity
            ? "This address has no transaction history on any supported chain."
            : errMsg,
          suggestion: isNoActivity
            ? "Double-check the address or try a different agent."
            : undefined,
        } satisfies AnalyzeErrorResponse,
        { status: 404 },
      );
    }

    // Multi-chain discovery when chain=all (cap at top 2 by tx count to stay within 60s)
    let chainResults: { chainId: ChainId; txCount: number }[] = [];
    if (selectedChain === "all") {
      const allChains = await detectAllChainsWithActivity(resolved.address);
      chainResults = allChains.slice(0, 2);
    }

    // 2.5. Check cache
    const cacheKey = selectedChain === "all"
      ? `${resolved.address}:all`
      : `${resolved.address}:${resolved.chainId}`;
    const cached = analysisCache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // 3. Fetch onchain data — start ETH price fetch in parallel to save time
    const ethPricePromise = getETHPrice();

    let agentData;
    if (selectedChain === "all" && chainResults.length > 1) {
      // Fetch from all active chains in parallel (allSettled so one flaky chain doesn't kill the request)
      const allChainSettled = await Promise.allSettled(
        chainResults.map(cr => fetchAgentData(cr.chainId as ChainId, resolved.address)),
      );
      const allChainData = allChainSettled
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchAgentData>>> => r.status === "fulfilled")
        .map(r => r.value);
      if (allChainData.length === 0) {
        return NextResponse.json(
          { error: "fetch_failed", message: "Failed to fetch transaction data from any chain." } satisfies AnalyzeErrorResponse,
          { status: 502 },
        );
      }
      // Merge: use primary chain's base data, combine transaction arrays
      const primary = allChainData[0];
      const mergedTransactions = allChainData.flatMap(d =>
        d.transactions.map(tx => ({ ...tx, chainId: d.chainId } as TransactionSummary & { chainId: string })),
      );
      // Sort by timestamp descending
      mergedTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const mergedTokenTransfers = allChainData.flatMap(d => d.tokenTransfers);
      const mergedContractCalls = allChainData.flatMap(d => d.contractCalls);
      const mergedCoinBalance = allChainData.flatMap(d => d.coinBalanceHistory ?? []);

      agentData = {
        ...primary,
        transactions: mergedTransactions,
        tokenTransfers: mergedTokenTransfers,
        contractCalls: mergedContractCalls,
        coinBalanceHistory: mergedCoinBalance,
        computedMetrics: primary.computedMetrics, // from primary chain only — behavioral profile below uses merged txs
      };
    } else {
      const fetchChain = chainResults.length === 1 ? chainResults[0].chainId as ChainId : resolved.chainId;
      agentData = await fetchAgentData(fetchChain, resolved.address);
    }
    const ethPrice = await ethPricePromise;

    // 3.5. Compute behavioral profile (local analysis, no new external APIs)
    const behavioralProfile = await computeBehavioralProfile(
      agentData.address, agentData.chainId,
      agentData.transactions, agentData.tokenTransfers,
      agentData.contractCalls, agentData.coinBalanceHistory ?? [],
    );
    const enrichedData = { ...agentData, behavioralProfile };

    // 4. Try to get agent identity (may not be registered on ERC-8004)
    let agentIdentity = null;
    let effectiveAgentId: bigint | null = resolved.agentId ?? null;
    if (resolved.agentId) {
      try {
        agentIdentity = await getAgentIdentity(resolved.chainId, resolved.agentId);
      } catch {
        // Not registered — that's fine
      }
    }

    // 4.1. Discover agent ID via reverse lookup if not resolved (3s timeout — non-blocking)
    // Skip when resolveInput already tried findAgentByAddress for this chain+address
    if (effectiveAgentId === null && resolved.resolvedVia !== "address") {
      try {
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
        const discoveredId = await Promise.race([findAgentByAddress(resolved.chainId, resolved.address), timeout]);
        if (discoveredId !== null) {
          effectiveAgentId = discoveredId;
          try {
            agentIdentity = await getAgentIdentity(resolved.chainId, discoveredId);
          } catch { /* metadata read failed — still use the ID */ }
        }
      } catch { /* reverse lookup failed — non-fatal */ }
    }

    // 5. Analyze via Venice (or mock)
    let trustScore;
    if (USE_MOCK) {
      trustScore = createMockTrustScore(
        resolved.address,
        resolved.chainId,
        enrichedData.transactions.length,
      );
    } else {
      const apiKey = process.env.VENICE_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "analysis_unavailable",
            message: "AI analysis unavailable. Raw data returned.",
            transactions: enrichedData.transactions.slice(0, 20),
          } satisfies AnalyzeErrorResponse,
          { status: 503 },
        );
      }

      const client = createVeniceClient(apiKey);
      const model = await resolveModel(client);
      const rawScore = await analyzeAgent(client, enrichedData, model);
      trustScore = validateTrustScore(rawScore);
    }

    // 6. Attempt on-chain attestation (non-blocking)
    let attestationTxHash: string | undefined;
    if (effectiveAgentId !== null && process.env.PRIVATE_KEY) {
      try {
        const result = await publishAttestation(resolved.chainId, effectiveAgentId, trustScore);
        attestationTxHash = result.txHash;
      } catch (attestErr) {
        console.warn("[/api/analyze] Attestation failed (non-fatal):", attestErr);
      }
    }

    // 7. Return response
    const response: AnalyzeResponse = {
      trustScore,
      agentIdentity,
      transactions: enrichedData.transactions.slice(0, 20),
      totalTransactionCount: enrichedData.transactions.length,
      walletClassification: enrichedData.computedMetrics?.walletClassification,
      successRate: enrichedData.computedMetrics?.successRate,
      ethPrice: ethPrice ?? undefined,
      attestationTxHash,
      behavioralProfile,
      ensName: agentData.addressInfo?.ensName || null,
      chainResults: chainResults.length > 0 ? chainResults : undefined,
    };

    analysisCache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/analyze] Error:", err);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "internal_error",
        message: isDev && err instanceof Error ? err.message : "An unexpected error occurred",
      } satisfies AnalyzeErrorResponse,
      { status: 500 },
    );
  }
}
