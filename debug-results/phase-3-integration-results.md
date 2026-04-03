# Phase 3: Integration Test Results

**Date:** 2026-04-02
**Server:** localhost:3000

---

## INTEGRATION TEST RESULTS

### 1. [PASS] EVM auto-detect (Resolver -> Blockscout)
- Input: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (no chain specified)
- Result: `chain=ethereum` correctly auto-detected
- Blockscout resolved address and returned data to analyze pipeline

### 2. [PASS] Solana resolution (Resolver -> Helius)
- Input: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` with `chain=solana`
- Result: `entity=PROTOCOL_CONTRACT`, `txs=20`
- Helius returned 20 transactions, entity classification correct (Jupiter is a protocol contract)

### 3. [PASS] Solana auto-detect (no chain specified)
- Input: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` (no chain)
- Result: `chain=solana` correctly auto-detected
- Base58 address format detected and routed to Solana pipeline

### 4. [PASS] Behavioral profiler -> Solana categorization
- Input: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` (Raydium AMM V4)
- Result: activityBreakdown returned as array with 3 categories:
  - `transfers`: 46% (173 txs) - Associated Token Account, SPL Token Program, System Program
  - `other`: 39% (148 txs) - Compute Budget, misc programs
  - `swapping`: 15% (57 txs) - Raydium AMM V4, Jupiter V6
- protocolLoyalty: "95% of swaps through Raydium AMM V4 -- high protocol loyalty"
- NOTE: `activityBreakdown` is a list (not a dict) and `protocolLoyalty` is a string (not a dict). This is fine but differs from what one might expect as a key-value map.

### 5. [PASS] Invalid chain rejected
- Input: `chain=fakenet`
- Result: `error=invalid_input`
- Correctly returns 400-level error for unsupported chain value

### 6. [PASS] Empty input rejected
- Input: `""`
- Result: `error=invalid_input`
- Correctly validates empty input

### 7. [MIXED] Chain selector -> API route (all chain values accepted)

| Chain     | HTTP Status | Result |
|-----------|-------------|--------|
| base      | 200         | PASS   |
| gnosis    | 200         | PASS   |
| ethereum  | 200         | PASS   |
| arbitrum  | 200         | PASS   |
| optimism  | 200         | PASS   |
| polygon   | 500         | FAIL - Blockscout polygon upstream 503 |
| solana    | 500         | EXPECTED - EVM address sent to Solana chain (invalid address format) |

### 8. [PASS] Entity classifier -> Solana programs
- Jupiter (JUP6...) classified as `PROTOCOL_CONTRACT` -- correct
- Raydium (675k...) behavioral profile identified known programs: Raydium AMM V4, Jupiter V6, SPL Token Program, Associated Token Account, System Program, Compute Budget

---

## Summary

| # | Integration Point | Status |
|---|-------------------|--------|
| 1 | Resolver -> Blockscout (EVM auto-detect) | PASS |
| 2 | Resolver -> Helius (Solana resolution) | PASS |
| 3 | Solana auto-detect (no chain param) | PASS |
| 4 | Behavioral profiler -> Solana categorization | PASS |
| 5 | Invalid chain rejected | PASS |
| 6 | Empty input rejected | PASS |
| 7 | Chain selector -> API route | MIXED (polygon Blockscout 503) |
| 8 | Entity classifier -> Solana programs | PASS |

**Overall: 7/8 PASS, 1 MIXED**

## Issues Found

1. **Polygon Blockscout 503**: The Blockscout API for polygon returns a 503. This is an upstream availability issue, not a code bug. The app correctly surfaces the error message (`Blockscout polygon error (503)`), but returns HTTP 500 instead of a more informative status like 502 (Bad Gateway) or 503 (Service Unavailable).

2. **Solana + EVM address mismatch**: Sending an EVM address with `chain=solana` returns HTTP 500 with a Helius "invalid address" error. This should ideally be caught before the API call and returned as a 400 validation error with a user-friendly message like "Address format does not match selected chain."
