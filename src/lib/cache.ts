import type { AnalyzeResponse } from "./types";

const MAX_ENTRIES = 100;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export class LRUCache<T> {
  private map = new Map<string, { value: T; expiresAt: number }>();

  get(key: string): T | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // Move to end (LRU refresh)
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    if (this.map.size >= MAX_ENTRIES) {
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }
}

export const analysisCache = new LRUCache<AnalyzeResponse>();
