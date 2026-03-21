import { NextResponse } from "next/server";
import { SEED_AGENTS } from "@/lib/directory-seed";
import type { DirectoryResponse } from "@/lib/types";

let cachedResponse: { data: DirectoryResponse; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET(): Promise<NextResponse<DirectoryResponse>> {
  const now = Date.now();

  if (cachedResponse && now < cachedResponse.expiresAt) {
    return NextResponse.json(cachedResponse.data);
  }

  const response: DirectoryResponse = {
    agents: [...SEED_AGENTS],
    timestamp: now,
  };

  cachedResponse = { data: response, expiresAt: now + CACHE_TTL_MS };

  return NextResponse.json(response);
}
