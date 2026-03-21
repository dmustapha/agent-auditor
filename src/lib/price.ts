let cachedPrice: { readonly usd: number; readonly timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getETHPrice(): Promise<number | null> {
  if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_TTL) {
    return cachedPrice.usd;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return cachedPrice?.usd ?? null;
    const data = await res.json();
    const usd = data?.ethereum?.usd;
    if (typeof usd !== "number") return cachedPrice?.usd ?? null;
    cachedPrice = { usd, timestamp: Date.now() };
    return usd;
  } catch {
    return cachedPrice?.usd ?? null;
  }
}
