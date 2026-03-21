import { NextRequest, NextResponse } from "next/server";
import type { ChainId, InputType, AnalyzeRequest, AnalyzeResponse, AnalyzeErrorResponse } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData } from "@/lib/blockscout";
import { getAgentIdentity } from "@/lib/erc8004";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "@/lib/venice";
import { validateTrustScore } from "@/lib/trust-score";
import { analysisCache } from "@/lib/cache";

const USE_MOCK = process.env.VENICE_MOCK === "true";

export async function POST(request: NextRequest) {
  try {
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
    const selectedChain: ChainId | "all" = chain ?? "all";

    // 2. Resolve input to address + chain
    let resolved;
    try {
      resolved = await resolveInput(input, inputType, selectedChain);
    } catch (err) {
      return NextResponse.json(
        {
          error: "agent_not_found",
          message: err instanceof Error ? err.message : `No agent found matching "${input}" on any supported chain.`,
        } satisfies AnalyzeErrorResponse,
        { status: 404 },
      );
    }

    // 2.5. Check cache
    const cacheKey = `${resolved.address}:${resolved.chainId}`;
    const cached = analysisCache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // 3. Fetch onchain data from resolved chain
    const agentData = await fetchAgentData(resolved.chainId, resolved.address);

    // 4. Try to get agent identity (may not be registered on ERC-8004)
    let agentIdentity = null;
    if (resolved.agentId) {
      try {
        agentIdentity = await getAgentIdentity(resolved.chainId, resolved.agentId);
      } catch {
        // Not registered — that's fine
      }
    }

    // 5. Analyze via Venice (or mock)
    let trustScore;
    if (USE_MOCK) {
      trustScore = createMockTrustScore(
        resolved.address,
        resolved.chainId,
        agentData.transactions.length,
      );
    } else {
      const apiKey = process.env.VENICE_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "analysis_unavailable",
            message: "AI analysis unavailable. Raw data returned.",
            transactions: agentData.transactions.slice(0, 20),
          } satisfies AnalyzeErrorResponse,
          { status: 503 },
        );
      }

      const client = createVeniceClient(apiKey);
      const model = await resolveModel(client);
      const rawScore = await analyzeAgent(client, agentData, model);
      trustScore = validateTrustScore(rawScore);
    }

    // 6. Return response
    const response: AnalyzeResponse = {
      trustScore,
      agentIdentity,
      transactions: agentData.transactions.slice(0, 20),
      totalTransactionCount: agentData.transactions.length,
      walletClassification: agentData.computedMetrics?.walletClassification,
    };

    analysisCache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/analyze] Error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: err instanceof Error ? err.message : "Unexpected error",
      } satisfies AnalyzeErrorResponse,
      { status: 500 },
    );
  }
}
