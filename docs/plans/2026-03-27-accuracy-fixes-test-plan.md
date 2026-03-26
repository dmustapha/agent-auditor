# Accuracy Fixes — Validation Test Plan

**Date:** 2026-03-27
**What we're validating:** Work Items A (sample awareness) + B (entity classifier) + the 3 critical fixes from code review.

---

## Test Addresses

| Label | Address | Chain | Why |
|-------|---------|-------|-----|
| **MEGA** | `0x1111111254EEB25477B68fb85Ed929f73A960582` | ethereum | 1inch V5 Router. ~9.7M txs. Coverage will be <0.01%. Triggers CRITICAL DATA WINDOW. Known protocol in registry. |
| **PROTOCOL** | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | ethereum | Uniswap V3 Router. Known protocol. Should classify as PROTOCOL_CONTRACT. |
| **AGENT** | `0x77af31De935740567Cf4fF1986D04B2c964A786a` | gnosis | Olas keeper. Confirmed working (11.8s). Should classify as AUTONOMOUS_AGENT. |
| **HUMAN** | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | ethereum | vitalik.eth. ~4,567 txs. Should classify as USER_WALLET. |

---

## Layer 1 — Data Pipeline (programmatic, no Venice needed)

These tests verify the data flows correctly from Blockscout → computation → API response. Run with `VENICE_MOCK=true` to skip the AI call and isolate the data layer.

### Test 1.1 — SampleContext appears in response

```bash
# Start server with mock Venice
VENICE_MOCK=true bun run dev

# Hit API with MEGA address
curl -s http://localhost:3000/api/analyze \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input":"0x1111111254EEB25477B68fb85Ed929f73A960582","chain":"ethereum"}' \
  | jq '{sampleContext, entityType, entityClassification}'
```

**Expected:**
- `sampleContext.totalTransactionCount` >> 100 (should be ~9.7M)
- `sampleContext.sampleSize` ≈ 100
- `sampleContext.sampleCoveragePercent` < 0.01
- `sampleContext.isSampleDerived` = true
- `entityType` = "PROTOCOL_CONTRACT"
- `entityClassification.confidence` = "DEFINITIVE" (registry match)

### Test 1.2 — EntityClassification for each address type

Run the same curl for each test address and verify:

| Address | Expected entityType | Expected confidence | Expected primarySignal |
|---------|--------------------|--------------------|----------------------|
| MEGA | PROTOCOL_CONTRACT | DEFINITIVE | protocol_registry |
| PROTOCOL | PROTOCOL_CONTRACT | DEFINITIVE | protocol_registry |
| AGENT | AUTONOMOUS_AGENT | HIGH or MEDIUM | erc8004_registered OR high_from_ratio OR low_human_score |
| HUMAN | USER_WALLET | HIGH or MEDIUM | high_human_score |

### Test 1.3 — Full-coverage address has isSampleDerived=false

Use an address with very few txs (find one with <100 total). The `sampleContext.isSampleDerived` should be `false` and no DATA WINDOW section should appear.

### Test 1.4 — Multi-chain sort fix

```bash
curl -s http://localhost:3000/api/analyze \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","chain":"all"}' \
  | jq '[.transactions[:5][] | .timestamp]'
```

**Expected:** Timestamps in descending order (each ≥ next). No `NaN` or unexpected values.

### Test 1.5 — AuditRecord entityType persistence

After running an audit in the dashboard, check localStorage:

```js
// In browser console after running an audit
JSON.parse(localStorage.getItem('agent-auditor-recent') || '[]')
  .map(r => ({ address: r.address.slice(0,10), entityType: r.entityType }))
```

**Expected:** `entityType` field present on the most recent record.

---

## Layer 2 — Venice Prompt Quality (requires real API key)

These are the critical tests. They verify Venice actually produces better output because of the new prompt sections. **Must run with real `VENICE_API_KEY`.**

### Test 2.1 — MEGA address: no false age/frequency claims

Run audit on `0x1111111254EEB25477B68fb85Ed929f73A960582` (ethereum).

**Check Venice summary for:**
- [ ] Does NOT claim "0-day-old" or any specific wallet age derived from the 100-tx sample
- [ ] References total transaction count (~9.7M) or acknowledges massive scale
- [ ] Uses language like "sample" or "recent transactions" rather than "all transactions"
- [ ] Does NOT claim specific daily frequency calculated from sample window
- [ ] Mentions it's a protocol/router, not an autonomous agent

**Fail condition:** Venice says anything like "wallet created X days ago" where X is derived from the sample window, or "processes Y transactions per day" calculated from sample ÷ sample_window.

### Test 2.2 — Protocol contract framing

Run audit on Uniswap V3 Router (`0xE592427A0AEce92De3Edee1F18E0157C05861564`, ethereum).

**Check Venice summary for:**
- [ ] Frames as infrastructure/protocol, not as an "agent"
- [ ] Does not assign behavioral intent ("this agent decides to...")
- [ ] Title in Telegram format would be "Protocol Health Check" not "Agent Trust Score"

### Test 2.3 — Human wallet framing

Run audit on vitalik.eth (`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, ethereum).

**Check Venice summary for:**
- [ ] Frames as wallet review, not agent audit
- [ ] Does not attribute autonomous behavior
- [ ] Title in Telegram format would be "Wallet Analysis"

### Test 2.4 — Known agent (control — should be unchanged)

Run audit on Olas keeper (`0x77af31De935740567Cf4fF1986D04B2c964A786a`, gnosis).

**Check Venice summary for:**
- [ ] Standard agent trust score format (unchanged from before)
- [ ] Behavioral analysis present
- [ ] No "this is a protocol" or "this is a wallet" framing

### Test 2.5 — Before/after comparison (gold standard)

Pick one address (MEGA recommended). Compare Venice output from:
- **Before:** `git stash && git checkout v2-stable-timeout-fix` → run audit → save output
- **After:** `git checkout main` → run audit → save output

Side-by-side diff to confirm the new prompt sections produce measurably different/better output.

---

## Layer 3 — UI Verification (browser)

### Test 3.1 — Entity banner displays

1. Audit the MEGA address in dashboard
2. **Expected:** Yellow banner below TrustScoreCard: "⚙️ This is a protocol contract, not an autonomous agent."

3. Audit vitalik.eth
4. **Expected:** Yellow banner: "👤 This appears to be a human wallet, not an autonomous agent."

5. Audit Olas keeper
6. **Expected:** NO banner (it's an agent — banner only shows for non-agents)

### Test 3.2 — Sample coverage indicator

1. Audit the MEGA address
2. **Expected:** Below TransactionTable: "(sample of 9,700,000 total — 0.00% coverage)" or similar

3. Audit an address with <100 txs
4. **Expected:** No coverage indicator (isSampleDerived is false)

### Test 3.3 — No visual regressions

Quick visual pass on:
- [ ] TrustScoreCard renders normally for all 4 test addresses
- [ ] Transaction table loads
- [ ] Sidebar audit history populates
- [ ] Loading states work
- [ ] No console errors

---

## Execution Order

1. **Start with Layer 1** (VENICE_MOCK=true) — fastest, catches data bugs
2. **Then Layer 3** (browser, still mock) — catches UI bugs without burning API credits
3. **Finally Layer 2** (real Venice) — most expensive, do last
4. **Test 2.5 (before/after)** — optional but highest-signal single test

## Pass Criteria

- **Ship-ready:** All Layer 1 + Layer 3 pass, AND Tests 2.1 + 2.4 pass (the two extremes)
- **Gold:** All tests pass including 2.5 before/after comparison

---

## Quick-Run Script

```bash
# Layer 1 — data pipeline (mock mode)
cd ~/hackathon-toolkit/active/agent-auditor
VENICE_MOCK=true bun run dev &
sleep 3

# 1.1 + 1.2: MEGA
echo "=== MEGA (1inch) ==="
curl -s http://localhost:3000/api/analyze \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input":"0x1111111254EEB25477B68fb85Ed929f73A960582","chain":"ethereum"}' \
  | jq '{sampleContext, entityType, ec: .entityClassification | {entityType, confidence, primarySignal}}'

# 1.2: AGENT
echo "=== AGENT (Olas keeper) ==="
curl -s http://localhost:3000/api/analyze \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input":"0x77af31De935740567Cf4fF1986D04B2c964A786a","chain":"gnosis"}' \
  | jq '{sampleContext, entityType, ec: .entityClassification | {entityType, confidence, primarySignal}}'

# 1.2: HUMAN
echo "=== HUMAN (vitalik.eth) ==="
curl -s http://localhost:3000/api/analyze \
  -X POST -H 'Content-Type: application/json' \
  -d '{"input":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","chain":"ethereum"}' \
  | jq '{sampleContext, entityType, ec: .entityClassification | {entityType, confidence, primarySignal}}'

kill %1
```
