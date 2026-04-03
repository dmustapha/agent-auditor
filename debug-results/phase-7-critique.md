# Phase 7 — Senior Dev Critique (Solana Code)

**Reviewer:** Claude Opus 4.6
**Date:** 2026-04-02
**Scope:** Solana-specific code across 7 files

---

## MUST-FIX (Demo Breakers)

### 1. `behavioral-profile.ts:119` — `.toLowerCase()` breaks Solana address matching

```
[MUST-FIX] src/lib/behavioral-profile.ts:119 — Solana addresses are base58 case-sensitive
```

`computeBehavioralProfile` does `const selfLower = address.toLowerCase()` then compares against `tx.from.toLowerCase()` throughout. Solana base58 addresses are case-sensitive — lowercasing them means **no transaction will ever match the agent's own address**. This corrupts:
- Life events (biggest gain/loss detection) — lines 170, 188
- Counterparty resolution — lines 357-362
- Token flow summary — line 498
- First action description — line 637

**Impact:** For any Solana agent, all behavioral analysis based on inbound/outbound direction will be wrong. The profile will look broken during demo.

**Fix:** Guard the lowercase with `isSolanaChain(chainId)` — use raw address for Solana, lowercase for EVM.

---

### 2. `behavioral-profile.ts:175,193,253,639` — `formatWeiToETH` applied to Solana lamport values

```
[MUST-FIX] src/lib/behavioral-profile.ts:175 — Life events display incorrect SOL amounts
```

Helius returns native transfer amounts in **lamports** (1 SOL = 1e9 lamports). `formatWeiToETH` divides by 1e18. A 1 SOL transfer (1,000,000,000 lamports) displays as `0.0000 ETH` instead of `1.0000 SOL`.

Every life event, drain event, and first-action description will show nonsensical near-zero values for Solana agents. The label also says "ETH" instead of "SOL".

**Impact:** Behavioral profile text is factually wrong for Solana agents. Visible in demo.

**Fix:** Create `formatLamportsToSOL` (divide by 1e9) and branch on `chainId` in all display paths. Also change labels from "ETH" to "SOL".

---

### 3. `behavioral-profile.ts:393` — Counterparty volume shows ETH for Solana

```
[MUST-FIX] src/lib/behavioral-profile.ts:393 — volumeETH field uses formatWeiToETH for Solana data
```

`resolveTopCounterparties` always formats volume with `formatWeiToETH`. For Solana, this produces `0.0000` for any realistic SOL amount. The field name `volumeETH` is also misleading.

---

### 4. `api/analyze/route.ts:127` — `detectAllChainsWithActivity` lowercases Solana address

```
[MUST-FIX] src/app/api/analyze/route.ts:127 — When chain="all", detectAllChainsWithActivity is called with resolved.address
```

Looking at the blockscout function (line 333), it only scans EVM chains. So when `chain="all"` and the input is a Solana address, `detectAllChainsWithActivity` will find 0 results, `chainResults` will be empty, and the code falls through to line 182 where `fetchChain = resolved.chainId` ("solana") — this actually works correctly. However, the Solana address gets passed to EVM chain detection unnecessarily (wasted API calls, potential errors).

Downgraded to SHOULD-FIX below.

---

## SHOULD-FIX (Code Quality, No Demo Crash)

### 5. `solana.ts:108` — API key leaked in URL (query param)

```
[SHOULD-FIX] src/lib/solana.ts:108 — Helius API key in URL query string
```

`api-key=${apiKey}` in the URL means the key appears in server logs, error messages, and the `Helius API error` thrown on line 112 (which includes `text`). For a demo this is fine, but if error messages reach the client, the key is exposed.

### 6. `solana.ts:90-98` — Singleton connection never recycles

```
[SHOULD-FIX] src/lib/solana.ts:90 — Global mutable singleton _connection
```

`_connection` is module-level mutable state. In serverless (Vercel), this is fine per-isolate. But if the RPC endpoint goes down, the stale connection is never refreshed. Acceptable for demo.

### 7. `solana.ts:123` — Only first native transfer mapped to `to` field

```
[SHOULD-FIX] src/lib/solana.ts:123 — tx.nativeTransfers?.[0] ignores multi-transfer txs
```

Solana transactions frequently have multiple native transfers. Only the first one's `toUserAccount` is used as the transaction's `to` address, and only its amount as `value`. This under-reports activity but won't crash.

### 8. `api/analyze/route.ts:91` — Solana address lowercased in error recovery path

```
[SHOULD-FIX] src/app/api/analyze/route.ts:91 — detectAllChainsWithActivity(input.trim().toLowerCase())
```

In the error-recovery branch (when resolution fails for a specific chain), the address is lowercased before calling `detectAllChainsWithActivity`. For Solana addresses, this corrupts the address. This path only triggers on error so it won't crash the happy path, but the error message could be confusing.

### 9. `api/analyze/route.ts:127` — Unnecessary EVM scan for Solana addresses

```
[SHOULD-FIX] src/app/api/analyze/route.ts:127 — detectAllChainsWithActivity runs even for Solana addresses on chain="all"
```

When `chain="all"` and the resolved address is Solana, `detectAllChainsWithActivity` fires 6 EVM API calls that will all return 0. Add an early exit: `if (isSolanaChain(resolved.chainId))` skip EVM detection.

### 10. `entity-classifier.ts:29` — `computeFromRatio` lowercases for Solana

```
[SHOULD-FIX] src/lib/entity-classifier.ts:29 — address.toLowerCase() breaks Solana from-ratio calculation
```

Same lowercase issue as behavioral-profile. For Solana, `fromCount` will be 0 (since `tx.from` was never lowercased in the original data), making `fromRatio = 0`. This biases classification toward `PROTOCOL_CONTRACT` (line 128) for any Solana address with 10+ txs. Won't crash but misclassifies.

### 11. `TransactionTable.tsx:23` — SOL formatting divides by 1e9, but Helius may return lamports as integers

```
[SHOULD-FIX] src/app/components/TransactionTable.tsx:23 — formatValue for Solana divides by 1_000_000_000
```

This is actually correct for lamports. But `BigInt(wei || "0")` will throw if Helius returns a decimal string like `"1.5"` for `tokenAmount`. The `catch` handles it gracefully (returns "0"), so no crash — just silent data loss.

### 12. `solana-programs.ts:57` — deBridge address is actually BONK token mint

```
[SHOULD-FIX] src/lib/solana-programs.ts:57 — DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 is BONK, not deBridge
```

`DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` is the BONK token mint address, not deBridge. This will mislabel any BONK-related activity as "deBridge" / "bridging". During demo, if the agent has BONK transfers, the activity breakdown will incorrectly show bridging activity.

---

## NOTE (Future Concerns)

### 13. `solana.ts:108` — Hardcoded limit=100

```
[NOTE] src/lib/solana.ts:108 — limit=100 hardcoded in Helius URL
```

Fine for demo, but should be configurable for production. The EVM side fetches more via pagination.

### 14. `solana.ts:19` — 15s timeout may be tight for Helius under load

```
[NOTE] src/lib/solana.ts:19 — PER_CALL_TIMEOUT_MS = 15_000
```

Helius can be slow during congestion. The `withTimeout` fallback means the demo gracefully degrades (empty data), so this won't crash — just show an incomplete profile.

### 15. `behavioral-profile.ts:209-211` — `BigInt(tx.gasUsed)` for Solana fees

```
[NOTE] src/lib/behavioral-profile.ts:209 — gasUsed is fee in lamports for Solana
```

Solana `gasUsed` contains the fee in lamports (set on solana.ts:129). `BigInt` works fine, but the "gas units" label is misleading for Solana. Minor UX issue.

### 16. `TransactionTable.tsx:182-183` — `toLocaleTimeString()` uses client timezone

```
[NOTE] src/app/components/TransactionTable.tsx:183 — Time display depends on user locale
```

During demo, this shows the presenter's local time. Fine, but inconsistent with the UTC-based timezone fingerprint in the behavioral profile.

---

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 3 (all related to Solana value formatting / case-sensitive address handling in behavioral-profile.ts) |
| SHOULD-FIX | 8 |
| NOTE | 4 |

### Critical Theme

The core issue is that `behavioral-profile.ts` was written for EVM and not adapted for Solana:
1. **Case sensitivity:** `.toLowerCase()` everywhere breaks base58 address matching
2. **Unit conversion:** `formatWeiToETH` (1e18 divisor) applied to lamports (1e9 scale) produces wrong values
3. **Labels:** "ETH" hardcoded in life event descriptions

These three issues combine to make the behavioral profile section look completely wrong for any Solana agent during demo. The transaction table (`TransactionTable.tsx`) actually handles Solana correctly — it branches on `isSolanaChain` for both formatting and labels. The behavioral profile needs the same treatment.

### Recommended Fix Order

1. Add `formatLamportsToSOL` utility and chain-aware formatting in `behavioral-profile.ts`
2. Guard `.toLowerCase()` calls with `isSolanaChain` check
3. Fix the BONK/deBridge mislabel in `solana-programs.ts`
