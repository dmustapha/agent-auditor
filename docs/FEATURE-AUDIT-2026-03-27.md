# AgentAuditor Feature Audit — 2026-03-27

## Overall Rating: 6/10

---

## 1. Core Analysis Pipeline — 7/10

**Good:** Venice prompt engineering is excellent — banned-phrases list forcing analyst voice, `_thinking` scratchpad technique, benchmark comparison tables, auto-correction of AI recommendation drift (`validateTrustScore`). 10x better than typical hackathon LLM integrations.

**Bad:** Only fetches ~100 transactions (2 pages from Blockscout). For Chainlink keeper with 1.4M txs = 0.007% of history, yet makes definitive claims. No retry on Venice malformed JSON. `resolveModel` fallback chain is dead code.

---

## 2. Data Sources & Enrichment — 6/10

**Good:** 7 distinct Blockscout endpoint types per analysis. `computeBehavioralProfile` is genuinely rich — timezone fingerprint, life event chronology, protocol loyalty, HHI counterparty concentration, balance trend detection, longest dormancy.

**Bad:** Internal transactions fetched but never used (prefixed `_contractCalls`). Multi-chain caps at 2 chains. Directory API returns static fabricated data.

---

## 3. Entity Classification — 7/10

**Good:** Most technically clean module. Waterfall priority is sound. Blockscout false-positive handling (Step 7.5) is clever. HHI counterparty concentration for human-vs-bot scoring. Strongest test suite in the project — 16 cases.

**Bad:** 10-tx minimum means new contracts fall to UNKNOWN. From-ratio dead zone (0.05–0.70) leaves many contracts unclassified.

---

## 4. Frontend / Dashboard — 6/10

**Good:** Deep component library — AnimatedScoreRing, ActivityHeatmap, BreakdownBar, FlagCard, DossierCard. Loading messages communicate state. SmartInput accepts addresses, agent IDs, ENS. Cross-chain suggestion errors.

**Bad:** AgentDirectory backed by static seed data with fabricated scores. `agentCount || 1` cosmetic hack. No error boundary for Venice timeouts.

---

## 5. API Design — 6/10

**Good:** 8 distinct error codes with appropriate HTTP statuses. Cross-chain suggestion ("No activity on Base. Try Ethereum, Arbitrum") is standout UX.

**Bad:** All-or-nothing architecture — 8-10 external calls under 60s, no streaming, no partial results. Cache key for `chain=all` doesn't account for which chains were analyzed (correctness bug).

---

## 6. Telegram Bot — 5/10

**Good:** Well-formatted output with score bars, check/cross indicators, severity-flagged alerts. Group chat compatibility. Command menu registration.

**Bad:** Bypasses behavioral enrichment pipeline — goes straight to Venice without `computeBehavioralProfile` or `classifyEntityType`. Produces shallower analysis than web. No rate limiting.

---

## 7. Agent Discovery / Directory — 4/10

**Good:** Dual-source discovery (ERC-8004 + Olas). Block-range capping for free RPCs. Attestation write-back loop works.

**Bad:** Directory seed is fabricated data — 20+ agents with hardcoded scores and marketing copy. Single biggest credibility risk. A judge who asks "how did you compute this score?" gets no good answer.

---

## 8. Testing — 5/10

**Good:** Entity-classifier tests thorough (boundary conditions, priority conflicts, false-positives). Agent-classifier HHI tests non-trivial.

**Bad:** Zero tests for Venice prompt construction. No integration tests for Blockscout, analyze route, or attestation. Telegram bot has zero coverage.

---

## Top 3 Strengths
1. Venice prompt engineering (analyst voice, benchmarks, auto-correction)
2. Behavioral profile depth (timezone, HHI, protocol loyalty, life events)
3. Entity classification system (clean waterfall, false-positive handling, strong tests)

## Top 3 Weaknesses
1. Directory is fabricated data presented as computed results
2. 100-transaction sample ceiling — definitive claims from 0.007% of data
3. Telegram bot skips behavioral enrichment (second-class citizen)

## Judge Perspective
Initially impressed — populated directory, analyst-voice summaries, multi-chain, ERC-8004. 15 min in, output is solid. Then they click a directory entry, notice the score/copy don't match system output, and wonder if those entries were ever analyzed. That question during Q&A is hard to answer. Scores well on technical depth and UX polish. Directory fabrication is a liability.
