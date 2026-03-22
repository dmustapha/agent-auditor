const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10; // per IP per window

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();

  // Lazy cleanup: evict expired entries on access
  const entry = requestCounts.get(ip);
  if (entry && now > entry.resetAt) {
    requestCounts.delete(ip);
  }

  const current = requestCounts.get(ip);
  if (!current) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (current.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }

  current.count++;
  return { allowed: true, retryAfterMs: 0 };
}
