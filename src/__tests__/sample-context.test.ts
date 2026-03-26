import { describe, test, expect } from "bun:test";
import { computeSampleContext } from "../lib/metrics";

describe("computeSampleContext", () => {
  test("100 sample from 9.7M total → tiny coverage, isSampleDerived=true", () => {
    const ctx = computeSampleContext(100, 9_700_000);
    expect(ctx.totalTransactionCount).toBe(9_700_000);
    expect(ctx.sampleSize).toBe(100);
    expect(ctx.sampleCoveragePercent).toBeCloseTo(0.001, 2);
    expect(ctx.isSampleDerived).toBe(true);
  });

  test("100/100 → full coverage, isSampleDerived=false", () => {
    const ctx = computeSampleContext(100, 100);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("100 sample but totalTransactionCount=0 → effectiveTotal=100, full coverage", () => {
    const ctx = computeSampleContext(100, 0);
    expect(ctx.totalTransactionCount).toBe(100);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("50/50 → 100%", () => {
    const ctx = computeSampleContext(50, 50);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("100/150 → ~66.67%", () => {
    const ctx = computeSampleContext(100, 150);
    expect(ctx.sampleCoveragePercent).toBeCloseTo(66.67, 1);
    expect(ctx.isSampleDerived).toBe(true);
  });
});
