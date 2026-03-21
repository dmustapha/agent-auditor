"use client";

import { useState, useEffect } from "react";

type Updater<T> = T | ((prev: T) => T);

export function useLocalStorage<T>(key: string, initial: T): [T, (updater: Updater<T>) => void] {
  const [state, setState] = useState<T>(initial);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(initial) && !Array.isArray(parsed)) return;
      setState(parsed as T);
    } catch { /* corrupted data — keep initial */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (updater: Updater<T>) => {
    setState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch { /* quota exceeded — silently fail */ }
      return next;
    });
  };

  return [state, set];
}
