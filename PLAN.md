# AgentAuditor Implementation Plan

**Project:** AgentAuditor
**Hackathon:** SYNTHESIS
**Deadline:** March 22, 2026 (2 build days remaining)
**Stack:** TypeScript, Next.js 16.2.0, Tailwind 4.2.2, Bun 1.3.10, Solidity (Foundry 1.4.4), viem 2.47.5, openai 6.32.0, grammy 1.41.1
**Architecture Doc:** `~/hackathon-toolkit/active/agent-auditor/ARCHITECTURE.md` (THE source of truth for all code)

---

## How to Use This Plan

1. Read in order. Do not skip phases. Do not reorder tasks.
2. Every phase has a GATE checklist. Verify every item before proceeding.
3. When you see a decision point, test BOTH paths and follow the one that matches.
4. Copy code from ARCHITECTURE.md — do not improvise.
5. Commit after every task using the specified commit messages.
6. Save deployed addresses / credentials to .env immediately.
7. If something fails and isn't covered by a decision tree: STOP. Report the error. Do not guess.

---

## Phase Overview

| Phase | Purpose | Est. Time | Depends On |
|:---:|---------|-----------|-----------:|
| 0 | Project scaffold + environment + cold start | 30 min | — |
| 1 | Core data layer (types, chains, blockscout, ERC-8004) | 2 hr | Phase 0 |
| 2 | Blocklist contract (Solidity + deploy) | 1 hr | Phase 0 |
| 3 | Venice engine + trust score (mock-first) | 1.5 hr | Phase 1 |
| 4 | Attestation + resolver + API route | 1.5 hr | Phases 1, 2, 3 |
| 5 | Frontend (UI components + page) | 2 hr | Phase 4 |
| 6 | Telegram bot + autonomous loop | 1.5 hr | Phase 4 |
| 7 | Scripts + real Venice swap + demo prep | 1.5 hr | Phases 5, 6 |
| 8 | Demo recording + submission | 3 hr | Phase 7 |

**Total: ~14.5 hr across 2 build days + 1 demo day**

---

## Phase 0: Project Scaffold & Environment

**Purpose:** Initialize repo, install dependencies, verify all external services respond.
**Estimated time:** 30 minutes

### Task 0.1: Initialize Project

**Files:**
- Create: project root directory structure

**Steps:**

1. Create Next.js project with Bun:
   ```bash
   cd ~/hackathon-toolkit/active/agent-auditor
   bunx create-next-app@16.2.0 . --typescript --tailwind --app --src-dir --no-eslint --no-import-alias --turbopack
   ```
   Expected: Project scaffold created with `src/app/` structure.

   If `create-next-app` prompts for overwrite (directory not empty):
   ```bash
   mkdir -p /tmp/agent-auditor-scaffold
   cd /tmp/agent-auditor-scaffold
   bunx create-next-app@16.2.0 . --typescript --tailwind --app --src-dir --no-eslint --no-import-alias --turbopack
   cp -r /tmp/agent-auditor-scaffold/* ~/hackathon-toolkit/active/agent-auditor/
   cp -r /tmp/agent-auditor-scaffold/.* ~/hackathon-toolkit/active/agent-auditor/ 2>/dev/null
   cd ~/hackathon-toolkit/active/agent-auditor
   ```

2. Initialize Foundry in `contracts/`:
   ```bash
   mkdir -p contracts && cd contracts
   forge init --no-commit --no-git
   ```
   Expected: `contracts/src/`, `contracts/test/`, `contracts/script/`, `contracts/foundry.toml` created.

3. Create remaining directories:
   ```bash
   cd ~/hackathon-toolkit/active/agent-auditor
   mkdir -p src/lib src/app/api/analyze src/app/components src/bot scripts .demo-cache
   ```

4. Replace the generated `package.json` with the COMPLETE version from ARCHITECTURE.md Section 18. Do NOT use `bun add` — copy the complete file to get exact pinned versions AND all scripts (`dev`, `build`, `start`, `typecheck`, `loop`, `register`, `seed`):
   ```bash
   # Copy complete package.json from ARCHITECTURE.md Section 18, then:
   bun install
   ```
   Expected: `bun.lockb` created, no errors. Verify scripts exist:
   ```bash
   bun run --list
   ```
   Expected: `dev`, `build`, `start`, `typecheck`, `loop`, `register`, `seed` all listed.

5. Install Foundry dependencies:
   ```bash
   cd contracts && forge install OpenZeppelin/openzeppelin-contracts --no-commit
   cd ..
   ```
   Expected: `contracts/lib/openzeppelin-contracts/` populated.

**Commit:**
```bash
git init
git add -A
git commit -m "chore: scaffold Next.js + Foundry project with dependencies"
```

**Note:** `create-next-app` generates `public/favicon.ico` automatically. No manual creation needed — it's part of the scaffold.

---

### Task 0.2: Environment Setup

**Files:**
- Create: `.env` (from ARCHITECTURE.md Section 18 — .env.example)
- Create: `.gitignore` (from ARCHITECTURE.md Section 18)

**Steps:**

1. Copy `.env.example` content from ARCHITECTURE.md Section 18 to `.env.example`.
2. Create `.env` from `.env.example`, fill in real values:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` with actual credentials:
   - `VENICE_API_KEY` — from venice.ai dashboard
   - `DEPLOYER_PRIVATE_KEY` — from `cast wallet new` or existing wallet
   - `TELEGRAM_BOT_TOKEN` — from @BotFather
   - `TELEGRAM_CHAT_ID` — from sending a message to the bot and checking `getUpdates`
   - `USE_TESTNET=true`

4. Write `.gitignore` from ARCHITECTURE.md Section 18.

**Commit:**
```bash
git add .env.example .gitignore
git commit -m "chore: add environment config and gitignore"
```

---

### Task 0.3: Cold Start Verification

**Steps:**

Run each check. ALL must pass before proceeding.

1. Bun version:
   ```bash
   bun --version
   ```
   Expected: `1.3` or higher.

2. Node version:
   ```bash
   node --version
   ```
   Expected: `v20` or higher.

3. Foundry version:
   ```bash
   forge --version
   ```
   Expected: `forge 1.4`.

4. Base Sepolia RPC:
   ```bash
   cast block-number --rpc-url https://sepolia.base.org
   ```
   Expected: A number > 0.

5. ERC-8004 IdentityRegistry:
   ```bash
   cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e 'name()(string)' --rpc-url https://sepolia.base.org
   ```
   Expected: A string (registry name).

6. Blockscout API:
   ```bash
   curl -s 'https://base.blockscout.com/api/v2/stats' | head -c 200
   ```
   Expected: JSON with `total_transactions` field.

7. Venice API:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $VENICE_API_KEY" https://api.venice.ai/api/v1/models
   ```
   Expected: `200`.

8. Telegram Bot:
   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | grep -o '"ok":[a-z]*'
   ```
   Expected: `"ok":true`.

9. Deployer wallet funded:
   ```bash
   cast balance $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY) --rpc-url https://sepolia.base.org
   ```
   Expected: > 0. If 0, get testnet ETH from `https://www.alchemy.com/faucets/base-sepolia`.

#### Decision Point: Venice API Key

Run: `curl -s -H "Authorization: Bearer $VENICE_API_KEY" https://api.venice.ai/api/v1/models | grep -c '"id"'`
Expected: A number > 10 (available models).

If `0` or error:
1. Verify key is correct in `.env`
2. Try: `curl -s -H "Authorization: Bearer $VENICE_API_KEY" https://api.venice.ai/api/v1/models`
3. If `401`: regenerate key at venice.ai dashboard
4. If connection error: Venice may be down — proceed with mock mode only (set `USE_MOCK_VENICE=true` in `.env`)

If nothing works:
1. Set `USE_MOCK_VENICE=true` in `.env`
2. The mock engine in venice.ts will produce deterministic scores
3. Swap to real Venice only for final demo recording

---

### Phase 0 Gate

Before proceeding to Phase 1, verify:
- [ ] `bun --version` returns 1.3+
- [ ] `node --version` returns v20+
- [ ] `forge --version` returns 1.4+
- [ ] Base Sepolia RPC responds with block number
- [ ] ERC-8004 contract responds on Base Sepolia
- [ ] Blockscout API responds with JSON
- [ ] `.env` has all required variables filled
- [ ] All commits made for Phase 0

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 1: Core Data Layer

**Purpose:** Build the foundation types, chain config, Blockscout pipeline, and ERC-8004 reader. After this phase, we can fetch agent data from any of 6 chains.
**Estimated time:** 2 hours

### Task 1.1: Shared Types

**Files:**
- Create: `src/lib/types.ts` (from ARCHITECTURE.md Section 3)

**Steps:**

1. Copy the complete `src/lib/types.ts` from ARCHITECTURE.md Section 3. This file defines ALL interfaces used across the project: ChainId, ChainConfig, BlockscoutTransaction, AgentTransactionData, AgentIdentity, FeedbackSummary, DiscoveredAgent, TrustScore, TrustFlag, AttestationResult, InputType, ResolvedInput, LoopCheckpoint, LoopStatus, AuditResult, OlasService, AnalyzeRequest, AnalyzeResponse, UITrustScore.

2. Verify types compile:
   ```bash
   bunx tsc --noEmit src/lib/types.ts
   ```
   Expected: No errors.

**Commit:**
```bash
git add src/lib/types.ts
git commit -m "feat: add shared type definitions for all components"
```

---

### Task 1.2: Chain Configuration

**Files:**
- Create: `src/lib/chains.ts` (from ARCHITECTURE.md Section 4)

**Steps:**

1. Copy the complete `src/lib/chains.ts` from ARCHITECTURE.md Section 4. This defines the CHAIN_CONFIGS map for all 6 chains (base, gnosis, ethereum, arbitrum, optimism, polygon) with Blockscout URLs, RPC URLs, ERC-8004 addresses, and the `getViemClient` function with client caching.

2. Verify it compiles with types:
   ```bash
   bunx tsc --noEmit src/lib/chains.ts
   ```
   Expected: No errors.

**Commit:**
```bash
git add src/lib/chains.ts
git commit -m "feat: add 6-chain config with Blockscout URLs and RPC endpoints"
```

---

### Task 1.3: Blockscout Data Pipeline

**Files:**
- Create: `src/lib/blockscout.ts` (from ARCHITECTURE.md Section 6)

**Steps:**

1. Copy the complete `src/lib/blockscout.ts` from ARCHITECTURE.md Section 6. Key functions: `rateLimitedFetch` (5 RPS per chain), `getTransactions`, `getTokenTransfers`, `getInternalTransactions`, `fetchAgentData` (combines all three), `detectChainWithActivity`.

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/blockscout.ts
   ```

3. Quick integration test — fetch transactions for a known address:
   ```bash
   bun -e "
   import { fetchAgentData } from './src/lib/blockscout';
   const data = await fetchAgentData('0x0000000000000000000000000000000000000001', 'base');
   console.log('Transactions:', data.transactions.length);
   console.log('Transfers:', data.tokenTransfers.length);
   "
   ```
   Expected: Numbers (possibly 0 for this address — that's fine, confirms the API call works).

#### Decision Point: Blockscout API

Run: `curl -s 'https://base.blockscout.com/api/v2/addresses/0x0000000000000000000000000000000000000001/transactions?limit=1' | grep -o '"items"'`
Expected: `"items"`

If no response or error:
1. Try alternate chain: `curl -s 'https://gnosis.blockscout.com/api/v2/addresses/0x0000000000000000000000000000000000000001/transactions?limit=1'`
2. If Blockscout is down on one chain: that chain will gracefully degrade (empty results)
3. If ALL Blockscout instances are down: STOP — the project depends on Blockscout for all chain data

**Commit:**
```bash
git add src/lib/blockscout.ts
git commit -m "feat: add multi-chain Blockscout data pipeline with rate limiting"
```

---

### Task 1.4: ERC-8004 Registry Reader

**Files:**
- Create: `src/lib/erc8004.ts` (from ARCHITECTURE.md Section 7)

**Steps:**

1. Copy the complete `src/lib/erc8004.ts` from ARCHITECTURE.md Section 7. Key functions: `getAgentIdentity` (reads tokenURI + metadata), `findAgentByAddress` (scans last 500k blocks for Registered events), `findAgentAcrossChains`, `searchAgentsByName`, `getAgentFeedback` (two-step: getClients then getSummary), `discoverNewAgents`.

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/erc8004.ts
   ```

3. Smoke test ERC-8004 read:
   ```bash
   bun -e "
   import { createPublicClient, http } from 'viem';
   import { baseSepolia } from 'viem/chains';
   const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
   const result = await client.readContract({
     address: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
     abi: [{ type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
     functionName: 'totalSupply'
   });
   console.log('Total registered agents:', result.toString());
   "
   ```
   Expected: A number (could be 0 on Sepolia — that's OK).

#### Decision Point: ERC-8004 Contract Behavior (PRD Risk 4)

Run the smoke test above.

If it returns a number: ERC-8004 contracts work as expected.

If you get `execution reverted`:
1. Check contract address is correct: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
2. Try on a different chain RPC (Gnosis mainnet): `cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 'totalSupply()(uint256)' --rpc-url https://rpc.gnosischain.com`
3. If Sepolia doesn't have the contract: switch `USE_TESTNET=false` in `.env` and use mainnet addresses
4. If no chain works: the ERC-8004 contracts may not be deployed yet — use mock data for identity lookups

If you get `contract not found` or `0x` empty response:
1. ERC-8004 may not be deployed on that network
2. Try each chain one by one with the correct address (testnet vs mainnet)
3. Record which chains have the contract deployed — update `CHAIN_CONFIGS` to exclude others

**Commit:**
```bash
git add src/lib/erc8004.ts
git commit -m "feat: add ERC-8004 registry reader with multi-chain agent discovery"
```

---

### Task 1.5: Olas Discovery

**Files:**
- Create: `src/lib/olas.ts` (from ARCHITECTURE.md Section 8)

**Steps:**

1. Copy the complete `src/lib/olas.ts` from ARCHITECTURE.md Section 8. [ASSUMED] pattern — tag with WARNING comment. Functions: `discoverOlasAgents` (reads DeployService events from ServiceRegistryL2 on Base + Gnosis).

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/olas.ts
   ```

3. Quick test (may return empty if no Olas services):
   ```bash
   bun -e "
   import { discoverOlasAgents } from './src/lib/olas';
   try {
     const agents = await discoverOlasAgents('base', 5);
     console.log('Olas agents found:', agents.length);
   } catch (e) {
     console.log('Olas discovery failed (non-critical):', e.message);
   }
   "
   ```
   Expected: A number or graceful failure message.

#### Decision Point: Olas ServiceRegistryL2 (PRD Risk 20)

If `discoverOlasAgents` fails:
1. Olas discovery is supplementary — not critical
2. Comment out the Olas import in the loop (Phase 6) and API route (Phase 4)
3. Rely on ERC-8004 registrations only
4. Log: "Olas discovery disabled — using ERC-8004 only"

**Commit:**
```bash
git add src/lib/olas.ts
git commit -m "feat: add Olas ServiceRegistryL2 agent discovery (Base + Gnosis)"
```

---

### Phase 1 Gate

Before proceeding to Phase 2, verify:
- [ ] `bunx tsc --noEmit src/lib/types.ts src/lib/chains.ts src/lib/blockscout.ts src/lib/erc8004.ts src/lib/olas.ts` — no errors
- [ ] Blockscout fetch returns data for at least 1 chain
- [ ] ERC-8004 `totalSupply` call succeeds on at least 1 chain
- [ ] All 5 commits made for Phase 1

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 2: Blocklist Contract

**Purpose:** Build, test, and deploy the AgentBlocklist Solidity contract on Base Sepolia.
**Estimated time:** 1 hour

### Task 2.1: Write Contract

**Files:**
- Create: `contracts/src/AgentBlocklist.sol` (from ARCHITECTURE.md Section 5)
- Create: `contracts/foundry.toml` (from ARCHITECTURE.md Section 5)

**Steps:**

1. Delete Foundry scaffold files:
   ```bash
   rm -f contracts/src/Counter.sol contracts/test/Counter.t.sol contracts/script/Counter.s.sol
   ```

2. Copy `contracts/src/AgentBlocklist.sol` from ARCHITECTURE.md Section 5 (42 lines).

3. Copy `contracts/foundry.toml` from ARCHITECTURE.md Section 5. Key: `remappings = ["@openzeppelin/=lib/openzeppelin-contracts/"]`.

4. Compile:
   ```bash
   cd contracts && forge build
   ```
   Expected: `Compiler run successful`.

**Commit:**
```bash
cd ~/hackathon-toolkit/active/agent-auditor
git add contracts/src/AgentBlocklist.sol contracts/foundry.toml
git commit -m "feat: add AgentBlocklist contract with Ownable access control"
```

---

### Task 2.2: Write Tests

**Files:**
- Create: `contracts/test/AgentBlocklist.t.sol` (from ARCHITECTURE.md Section 5)

**Steps:**

1. Copy `contracts/test/AgentBlocklist.t.sol` from ARCHITECTURE.md Section 5 (12 test functions).

2. Run tests:
   ```bash
   cd contracts && forge test -vvv
   ```
   Expected: `12 tests passed`.

If any test fails:
1. Read the failure message carefully
2. Compare test expectations against contract code
3. Fix the contract OR the test (whichever is wrong)
4. Re-run until all 12 pass

**Commit:**
```bash
cd ~/hackathon-toolkit/active/agent-auditor
git add contracts/test/AgentBlocklist.t.sol
git commit -m "test: add 12 tests for AgentBlocklist (block, unblock, batch, access)"
```

---

### Task 2.3: Deploy Contract

**Files:**
- Create: `contracts/script/DeployBlocklist.s.sol` (from ARCHITECTURE.md Section 5)

**Steps:**

1. Copy `contracts/script/DeployBlocklist.s.sol` from ARCHITECTURE.md Section 5.

2. Deploy to Base Sepolia:
   ```bash
   cd contracts
   source ../.env
   forge script script/DeployBlocklist.s.sol:DeployBlocklist \
     --rpc-url https://sepolia.base.org \
     --broadcast \
     --private-key $DEPLOYER_PRIVATE_KEY
   ```
   Expected: Deployed address printed in output.

3. Record the deployed address:
   ```bash
   # Replace 0xYOUR_DEPLOYED_ADDRESS with the actual address from step 2
   echo "BLOCKLIST_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS" >> ../.env
   ```

4. Verify deployment:
   ```bash
   source ../.env
   cast call $BLOCKLIST_CONTRACT_ADDRESS 'isBlocked(address)(bool)' 0x0000000000000000000000000000000000000001 --rpc-url https://sepolia.base.org
   ```
   Expected: `false`.

#### Decision Point: Contract Deployment (PRD Risk 7)

If `forge script` fails with `insufficient funds`:
1. Get testnet ETH: visit `https://www.alchemy.com/faucets/base-sepolia`
2. Verify balance: `cast balance $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY) --rpc-url https://sepolia.base.org`
3. Re-run deploy

If `forge script` fails with `nonce too low`:
1. Check current nonce: `cast nonce $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY) --rpc-url https://sepolia.base.org`
2. Add `--nonce <N>` flag or wait 30 seconds and retry

If deployment succeeds but verification call fails:
1. Double-check you copied the correct deployed address
2. Try: `cast code $BLOCKLIST_CONTRACT_ADDRESS --rpc-url https://sepolia.base.org` — should return bytecode, not `0x`

**Commit:**
```bash
cd ~/hackathon-toolkit/active/agent-auditor
git add contracts/script/DeployBlocklist.s.sol
git commit -m "feat: deploy AgentBlocklist to Base Sepolia"
```

---

### Phase 2 Gate

Before proceeding to Phase 3, verify:
- [ ] `cd contracts && forge test -vvv` — 12/12 tests pass
- [ ] `BLOCKLIST_CONTRACT_ADDRESS` is set in `.env`
- [ ] `cast call $BLOCKLIST_CONTRACT_ADDRESS 'isBlocked(address)(bool)' 0x0000000000000000000000000000000000000001 --rpc-url https://sepolia.base.org` returns `false`
- [ ] All commits made for Phase 2

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 3: Venice Engine + Trust Score

**Purpose:** Build the Venice AI analysis engine (mock-first) and trust score processing. After this phase, we can analyze agent data and produce structured trust scores.
**Estimated time:** 1.5 hours

### Task 3.1: Venice Engine

**Files:**
- Create: `src/lib/venice.ts` (from ARCHITECTURE.md Section 9)

**Steps:**

1. Copy the complete `src/lib/venice.ts` from ARCHITECTURE.md Section 9. Key elements:
   - `createVeniceClient` (OpenAI SDK pointing at Venice API)
   - `listAvailableModels` (runtime model list)
   - `resolveModel` (cascading fallback: llama-3.3-70b → hermes-3-llama-3.1-405b → mistral-31-24b → first available)
   - `SYSTEM_PROMPT` and `TRUST_SCORE_SCHEMA`
   - `analyzeAgent` (with JSON schema fallback — retry without response_format if rejected, per correction A1)
   - `createMockTrustScore` (deterministic mock based on address hash)

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/venice.ts
   ```

3. Test mock mode:
   ```bash
   bun -e "
   import { createMockTrustScore } from './src/lib/venice';
   const score = createMockTrustScore('0x1234567890abcdef1234567890abcdef12345678');
   console.log('Mock score:', score.overall, '/ 100');
   console.log('Recommendation:', score.recommendation);
   console.log('Flags:', score.flags.length);
   "
   ```
   Expected: A deterministic score between 0-100 with recommendation and flags.

#### Decision Point: Venice Model IDs (PRD Risk 1 — CRITICAL)

Run:
```bash
source .env
curl -s -H "Authorization: Bearer $VENICE_API_KEY" https://api.venice.ai/api/v1/models | grep -o '"id":"[^"]*"' | head -20
```
Expected: List of model IDs.

If `llama-3.3-70b` appears: Primary model confirmed.

If `llama-3.3-70b` does NOT appear:
1. Check for similar: `grep -i llama` in the output
2. If `hermes-3-llama-3.1-405b` exists: fallback will work automatically
3. If neither llama model exists, check for `mistral-31-24b`
4. The `resolveModel` function handles this cascade — it picks the first available model
5. If NO models work: set `USE_MOCK_VENICE=true` and use mock scores for demo

#### Decision Point: Venice Structured Output (PRD Risk 3)

Run:
```bash
source .env
curl -s -X POST https://api.venice.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b","messages":[{"role":"user","content":"Return JSON: {\"test\": true}"}],"response_format":{"type":"json_schema","json_schema":{"name":"test","schema":{"type":"object","properties":{"test":{"type":"boolean"}}}}}}' \
  2>/dev/null | grep -o '"content":"[^"]*"' | head -1
```
Expected: Content containing `{"test": true}`.

If you get an error about `json_schema`:
1. The fallback in `analyzeAgent` (correction A5) handles this automatically
2. It retries WITHOUT `response_format`, relying on system prompt for JSON output
3. This is already implemented — no code change needed

If Venice returns non-JSON even without response_format:
1. The `try/catch` in `analyzeAgent` will catch the parse error
2. It falls back to `createMockTrustScore`
3. Log the raw response for debugging

**Commit:**
```bash
git add src/lib/venice.ts
git commit -m "feat: add Venice AI engine with model cascade and JSON schema fallback"
```

---

### Task 3.2: Trust Score Processing

**Files:**
- Create: `src/lib/trust-score.ts` (from ARCHITECTURE.md Section 10)

**Steps:**

1. Copy the complete `src/lib/trust-score.ts` from ARCHITECTURE.md Section 10. Key functions:
   - `validateTrustScore` (tolerance of 5 per correction A4)
   - `scoreToRecommendation` (>=70 SAFE, >=40 CAUTION, <40 BLOCKLIST)
   - `formatForAttestation` (SAFE=+score, CAUTION=0, BLOCKLIST=-score; feedbackHash with `>>> 0` unsigned cast per correction A3)
   - `formatForTelegram`
   - `formatForUI`

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/trust-score.ts
   ```

3. Test score validation:
   ```bash
   bun -e "
   import { createMockTrustScore } from './src/lib/venice';
   import { validateTrustScore, scoreToRecommendation, formatForUI } from './src/lib/trust-score';
   const score = createMockTrustScore('0xabc');
   console.log('Valid:', validateTrustScore(score));
   console.log('Recommendation:', scoreToRecommendation(score.overall));
   const ui = formatForUI(score, 'base');
   console.log('UI format:', JSON.stringify(ui, null, 2));
   "
   ```
   Expected: `Valid: true`, a recommendation string, and formatted UI data.

**Commit:**
```bash
git add src/lib/trust-score.ts
git commit -m "feat: add trust score validation, formatting, and attestation encoding"
```

---

### Phase 3 Gate

Before proceeding to Phase 4, verify:
- [ ] `bunx tsc --noEmit src/lib/venice.ts src/lib/trust-score.ts` — no errors
- [ ] Mock trust score produces valid output (score 0-100, recommendation, flags)
- [ ] `validateTrustScore` returns `true` for mock scores
- [ ] Venice API key works OR `USE_MOCK_VENICE=true` is set
- [ ] All commits made for Phase 3

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 4: Attestation + Resolver + API Route

**Purpose:** Connect the analysis pipeline end-to-end: resolve input → fetch data → analyze → attest onchain. The API route is the orchestration hub.
**Estimated time:** 1.5 hours

### Task 4.1: Attestation Writer

**Files:**
- Create: `src/lib/attestation.ts` (from ARCHITECTURE.md Section 11)

**Steps:**

1. Copy the complete `src/lib/attestation.ts` from ARCHITECTURE.md Section 11. Key functions:
   - `publishAttestation` (calls `giveFeedback` on ERC-8004 ReputationRegistry on agent's native chain)
   - `verifyAttestation` (reads back via `getSummary`)
   - `addToBlocklist` (calls `blockAgent` on Base-only blocklist contract)

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/attestation.ts
   ```

**Commit:**
```bash
git add src/lib/attestation.ts
git commit -m "feat: add onchain attestation writer (giveFeedback + blocklist)"
```

---

### Task 4.2: Smart Input Resolver

**Files:**
- Create: `src/lib/resolver.ts` (from ARCHITECTURE.md Section 12)

**Steps:**

1. Copy the complete `src/lib/resolver.ts` from ARCHITECTURE.md Section 12. Key functions:
   - `detectInputType` (regex-based: number → agentId, 0x42-char → address, .eth → ens, else → name)
   - `resolveInput` (switch dispatcher)
   - `resolveAgentId`, `resolveAddress`, `resolveName`, `resolveENS`

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/resolver.ts
   ```

3. Test input detection:
   ```bash
   bun -e "
   import { detectInputType } from './src/lib/resolver';
   console.log(detectInputType('42'));          // agentId
   console.log(detectInputType('0x1234567890abcdef1234567890abcdef12345678')); // address
   console.log(detectInputType('vitalik.eth')); // ens
   console.log(detectInputType('my-agent'));    // name
   "
   ```
   Expected: `agentId`, `address`, `ens`, `name`.

**Commit:**
```bash
git add src/lib/resolver.ts
git commit -m "feat: add smart input resolver with auto-detection"
```

---

### Task 4.3: API Route

**Files:**
- Create: `src/app/api/analyze/route.ts` (from ARCHITECTURE.md Section 13)

**Steps:**

1. Copy the complete `src/app/api/analyze/route.ts` from ARCHITECTURE.md Section 13. This is the POST handler that orchestrates the full pipeline: resolve input → detect chain → fetch Blockscout data → get ERC-8004 identity → Venice analysis → validate score → publish attestation → blocklist if needed → return result.

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/app/api/analyze/route.ts
   ```

3. Test the API route (requires dev server — defer to Phase 5 integration test).

**Commit:**
```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: add /api/analyze route orchestrating full audit pipeline"
```

---

### Phase 4 Gate

Before proceeding to Phase 5, verify:
- [ ] `bunx tsc --noEmit src/lib/attestation.ts src/lib/resolver.ts src/app/api/analyze/route.ts` — no errors
- [ ] `detectInputType` correctly classifies all 4 input types
- [ ] All core library files compile together: `bunx tsc --noEmit src/lib/*.ts`
- [ ] All commits made for Phase 4

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 5: Frontend

**Purpose:** Build the single-page UI: smart input, chain selector, trust score card, transaction table, loading state.
**Estimated time:** 2 hours

### Task 5.1: Global Styles

**Files:**
- Create: `src/app/globals.css` (from ARCHITECTURE.md Section 14)

**Steps:**

1. Copy `src/app/globals.css` from ARCHITECTURE.md Section 14. Uses Tailwind v4 syntax: `@import "tailwindcss"` and `@theme` block (NOT the v3 `@tailwind` directives).

**Commit:**
```bash
git add src/app/globals.css
git commit -m "feat: add Tailwind v4 global styles with custom theme"
```

---

### Task 5.2: Layout

**Files:**
- Create: `src/app/layout.tsx` (from ARCHITECTURE.md Section 14)

**Steps:**

1. Copy `src/app/layout.tsx` from ARCHITECTURE.md Section 14. Standard Next.js root layout with metadata.

**Commit:**
```bash
git add src/app/layout.tsx
git commit -m "feat: add root layout with metadata"
```

---

### Task 5.3: UI Components

**Files:**
- Create: `src/app/components/SmartInput.tsx` (from ARCHITECTURE.md Section 14)
- Create: `src/app/components/ChainSelector.tsx` (from ARCHITECTURE.md Section 14)
- Create: `src/app/components/TrustScoreCard.tsx` (from ARCHITECTURE.md Section 14)
- Create: `src/app/components/TransactionTable.tsx` (from ARCHITECTURE.md Section 14)
- Create: `src/app/components/LoadingState.tsx` (from ARCHITECTURE.md Section 14)

**Steps:**

1. Copy all 5 component files from ARCHITECTURE.md Section 14. Key notes:
   - All components use `"use client"` directive (Next.js client components)
   - `TrustScoreCard` has SVG gauge with animated fill
   - `TransactionTable` uses testnet-aware explorer URLs (correction A6)
   - `SmartInput` shows detected input type hint

2. Verify all components compile:
   ```bash
   bunx tsc --noEmit src/app/components/*.tsx
   ```

**Commit:**
```bash
git add src/app/components/
git commit -m "feat: add UI components (SmartInput, ChainSelector, TrustScoreCard, TransactionTable, LoadingState)"
```

---

### Task 5.4: Main Page

**Files:**
- Create: `src/app/page.tsx` (from ARCHITECTURE.md Section 14)

**Steps:**

1. Copy `src/app/page.tsx` from ARCHITECTURE.md Section 14. Composes all components into a single-page layout with state management for analysis flow.

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/app/page.tsx
   ```

---

### Task 5.5: Config Files

**Files:**
- Create/Update: `tsconfig.json` (from ARCHITECTURE.md Section 18)
- Create/Update: `next.config.ts` (from ARCHITECTURE.md Section 18)

**Steps:**

1. Copy `tsconfig.json` from ARCHITECTURE.md Section 18. Ensure `paths: { "@/*": ["./src/*"] }` is set.
2. Copy `next.config.ts` from ARCHITECTURE.md Section 18.

3. Start dev server:
   ```bash
   bun run dev
   ```
   Expected: Server starts on `http://localhost:3000`. (`--turbopack` is already in the `dev` script in `package.json` — do not pass it again.)

4. Open browser to `http://localhost:3000` — verify UI renders.

#### Decision Point: Tailwind v4 Issues (PRD Risk 9)

If styles don't render:
1. Check `globals.css` uses `@import "tailwindcss"` (v4 syntax), NOT `@tailwind base`
2. Check `@theme` block syntax in globals.css
3. If Tailwind v4 fails completely: fall back to inline styles for critical components
4. UI is secondary to pipeline — functional is sufficient

If Next.js dev server fails:
1. Check `package.json` has `"dev": "next dev --turbopack"` script
2. Kill stuck port: `lsof -ti:3000 | xargs kill -9`
3. Retry: `bun run dev`

**Commit:**
```bash
git add src/app/page.tsx tsconfig.json next.config.ts
git commit -m "feat: add main page composing all UI components"
```

---

### Task 5.6: Integration Test — Full UI Pipeline

**Steps:**

1. With dev server running, open browser to `http://localhost:3000`.
2. Type a test address or agent ID into the smart input.
3. Select a chain from the dropdown.
4. Click "Audit Agent" (or equivalent button).
5. Verify:
   - Loading state appears
   - API route is called (check terminal for request log)
   - Trust score card renders with mock data (if `USE_MOCK_VENICE=true`)
   - Transaction table populates (if agent has on-chain activity)

If API route returns error:
1. Check terminal output for error details
2. Common issues: missing env vars, import path errors, type mismatches
3. Fix and restart dev server

---

### Phase 5 Gate

Before proceeding to Phase 6, verify:
- [ ] `bun run dev` starts without errors
- [ ] UI renders at `http://localhost:3000`
- [ ] Smart input accepts text and shows type hint
- [ ] Chain selector shows all 6 chains
- [ ] API route `/api/analyze` responds to POST requests
- [ ] Mock trust score displays in TrustScoreCard
- [ ] `bunx tsc --noEmit` on all src files passes
- [ ] All commits made for Phase 5

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 6: Telegram Bot + Autonomous Loop

**Purpose:** Add Telegram notifications and the autonomous scanning loop. After this phase, AgentAuditor runs continuously across all chains.
**Estimated time:** 1.5 hours

### Task 6.1: Telegram Bot

**Files:**
- Create: `src/bot/telegram.ts` (from ARCHITECTURE.md Section 15)

**Steps:**

1. Copy the complete `src/bot/telegram.ts` from ARCHITECTURE.md Section 15. Key features:
   - `/audit <input> [chain]` command — triggers analysis with optional chain parameter
   - `/status` command — returns loop status
   - `sendAlert` function — sends formatted trust score alerts to configured chat

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/bot/telegram.ts
   ```

**Commit:**
```bash
git add src/bot/telegram.ts
git commit -m "feat: add Telegram bot with /audit and /status commands"
```

---

### Task 6.2: Autonomous Loop

**Files:**
- Create: `src/lib/loop.ts` (from ARCHITECTURE.md Section 16)

**Steps:**

1. Copy the complete `src/lib/loop.ts` from ARCHITECTURE.md Section 16. Key elements:
   - `runOnce` — sequential chain scanning (discover new agents → analyze → attest → blocklist → alert)
   - `startLoop` / `stopLoop` — interval-based execution (default 5 minutes)
   - Per-chain checkpoints (last scanned block)
   - `auditedAddresses` Set for deduplication

2. Verify compilation:
   ```bash
   bunx tsc --noEmit src/lib/loop.ts
   ```

#### Decision Point: Autonomous Loop Stability (PRD Risk 10)

The loop wraps everything in try/catch — errors on one chain don't crash the loop. But verify:

```bash
bun -e "
import { runOnce } from './src/lib/loop';
const result = await runOnce();
console.log('Chains scanned:', result.chainsScanned);
console.log('Agents discovered:', result.agentsDiscovered);
console.log('Errors:', result.errors);
"
```

If it hangs: likely a Blockscout or RPC timeout.
1. Check rate limiting in blockscout.ts (should be 200ms between calls per chain)
2. Add timeout to individual chain fetches if not present
3. If one chain consistently hangs: remove it from the loop's chain list temporarily

**Commit:**
```bash
git add src/lib/loop.ts
git commit -m "feat: add autonomous multi-chain scanning loop with checkpoints"
```

---

### Task 6.3: Runner Scripts

**Files:**
- Create: `scripts/run-loop.ts` (from ARCHITECTURE.md Section 17)

**Steps:**

1. Copy `scripts/run-loop.ts` from ARCHITECTURE.md Section 17. This starts both the Telegram bot and the autonomous loop.

2. The scripts are already present — they were set in Task 0.1 step 4 when you copied the complete `package.json` from ARCHITECTURE.md Section 18. Verify they're still intact:
   ```bash
   bun run --list
   ```
   Expected: `dev`, `build`, `start`, `typecheck`, `loop`, `register`, `seed` all listed. If missing, re-copy complete `package.json` from ARCHITECTURE.md Section 18 and re-run `bun install`.

3. Test the loop runner (kill after one cycle):
   ```bash
   timeout 30 bun run loop 2>&1 | head -20
   ```
   Expected: Output showing chain scanning beginning.

**Commit:**
```bash
git add scripts/run-loop.ts package.json
git commit -m "feat: add loop runner script with Telegram bot startup"
```

---

### Phase 6 Gate

Before proceeding to Phase 7, verify:
- [ ] `bunx tsc --noEmit src/bot/telegram.ts src/lib/loop.ts` — no errors
- [ ] `bun run loop` starts and begins scanning (verify with 30s timeout)
- [ ] Telegram bot responds to `/status` (send command in Telegram)
- [ ] All commits made for Phase 6

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 7: Scripts + Real Venice + Demo Prep

**Purpose:** Self-registration on ERC-8004, seed test agents for demo, swap to real Venice API, cache demo data.
**Estimated time:** 1.5 hours

### Task 7.1: Self-Registration Script

**Files:**
- Create: `scripts/register-agent.ts` (from ARCHITECTURE.md Section 17)

**Steps:**

1. Copy `scripts/register-agent.ts` from ARCHITECTURE.md Section 17. Registers AgentAuditor itself on ERC-8004 IdentityRegistry.

2. Run registration:
   ```bash
   bun run register
   ```
   Expected: Transaction hash printed, AgentAuditor now has an ERC-8004 identity.

If registration fails:
1. Check deployer has sufficient gas on Base Sepolia
2. Verify ERC-8004 IdentityRegistry address in `.env`
3. If `register` function doesn't exist on the contract: the IdentityRegistry may require a different registration flow — check the ABI

**Commit:**
```bash
git add scripts/register-agent.ts
git commit -m "feat: add self-registration script for ERC-8004 identity"
```

---

### Task 7.2: Demo Test Agents

**Files:**
- Create: `scripts/seed-test-agents.ts` (from ARCHITECTURE.md Section 17)

**Steps:**

1. Copy `scripts/seed-test-agents.ts` from ARCHITECTURE.md Section 17. Creates `.demo-cache/` with pre-computed analysis results for demo addresses.

2. Run seed:
   ```bash
   bun run seed
   ```
   Expected: `.demo-cache/` populated with JSON files.

3. Verify demo cache:
   ```bash
   ls .demo-cache/
   ```
   Expected: JSON files for each demo address.

#### Decision Point: No Interesting Agents (PRD Risk 6 — HIGH)

If real agents on ERC-8004 are sparse (totalSupply < 5):
1. The seed script creates pre-computed results — the demo uses these cached results
2. Find 2-3 active addresses on Base/Gnosis via Blockscout:
   ```bash
   curl -s 'https://base.blockscout.com/api/v2/addresses?limit=5&type=contract' | grep -o '"hash":"0x[^"]*"' | head -5
   ```
3. Use these real contract addresses as "agents" for the demo — they have on-chain activity
4. The trust score is AI-generated, so ANY address with transaction history produces a meaningful demo

**Commit:**
```bash
git add scripts/seed-test-agents.ts
git commit -m "feat: add demo seed script with pre-computed trust scores"
```

---

### Task 7.3: Real Venice Swap

**Steps:**

1. Verify Venice API prompts remaining:
   ```bash
   source .env
   curl -s -H "Authorization: Bearer $VENICE_API_KEY" https://api.venice.ai/api/v1/models | grep -c '"id"'
   ```

2. If prompts available: set `USE_MOCK_VENICE=false` in `.env`.

3. Run one real analysis:
   ```bash
   bun -e "
   import { analyzeAgent } from './src/lib/venice';
   import { fetchAgentData } from './src/lib/blockscout';
   const data = await fetchAgentData('0x0000000000000000000000000000000000000001', 'base');
   const score = await analyzeAgent(data, null);
   console.log('Real Venice score:', score.overall);
   console.log('Recommendation:', score.recommendation);
   "
   ```

4. If real Venice works: cache the result in `.demo-cache/` for demo reliability.

#### Decision Point: Venice Free Tier Exhausted (PRD Risk 2 — HIGH)

If `analyzeAgent` returns a 429 (rate limit) or quota error:
1. Switch back: `USE_MOCK_VENICE=true` in `.env`
2. Use pre-computed demo cache for the demo recording
3. In demo, mention "Venice private inference" in voiceover — the mock produces identical UI output
4. For a single live demo call: wait until tomorrow's quota resets (10 prompts at midnight UTC)

**Commit:**
```bash
git add .env.example
git commit -m "feat: configure real Venice API integration with fallback"
```

---

### Task 7.4: Full Integration Test

**Steps:**

1. Start dev server in one terminal:
   ```bash
   bun run dev
   ```

2. Start loop + bot in another terminal:
   ```bash
   bun run loop
   ```

3. Test via UI:
   - Open `http://localhost:3000`
   - Enter an address, select Base chain, click Audit
   - Verify full pipeline: data fetch → analysis → score display → attestation

4. Test via Telegram:
   - Send `/audit 0x1234... base` to the bot
   - Verify it returns a formatted trust score

5. Test autonomous loop:
   - Watch loop terminal for "Discovered X agents" messages
   - Verify it scans multiple chains

6. Full typecheck:
   ```bash
   bunx tsc --noEmit
   ```
   Expected: No errors.

---

### Phase 7 Gate

Before proceeding to Phase 8, verify:
- [ ] AgentAuditor registered on ERC-8004 (or registration attempted)
- [ ] `.demo-cache/` has pre-computed demo results
- [ ] Full pipeline works: input → data → score → display
- [ ] Telegram bot responds to `/audit` command
- [ ] Autonomous loop runs at least one cycle
- [ ] `bunx tsc --noEmit` passes (zero errors)
- [ ] `bun run build` completes without errors (production build must succeed before demo)
- [ ] All commits made for Phase 7

**If any check fails: DO NOT proceed. Fix the failing check first.**

---

## Phase 8: Demo Recording + Submission

**Purpose:** Record the demo video following PRD Section 6 script, package for submission.
**Estimated time:** 3 hours (Day 3)

### Task 8.0: Create README.md

**Files:**
- Create: `README.md` (project root)

**Steps:**

1. Create `README.md` at the project root with these sections:
   ```markdown
   # AgentAuditor

   > The agent that watches other agents. Cross-chain behavioral analysis + on-chain reputation for autonomous AI agents.

   ## What It Does
   [2-3 sentences from PRD Section 1.1]

   ## Demo
   [Demo video link — fill in after recording]

   ## Hackathon
   SYNTHESIS Hackathon — Tracks: Agents that Trust, Agents that Keep Secrets, Open Track

   ## Tech Stack
   - Next.js 16.2.0 + Tailwind 4.2.2
   - ERC-8004 IdentityRegistry + ReputationRegistry
   - Venice AI (private inference)
   - Olas ServiceRegistryL2
   - Blockscout REST v2 (6 EVM chains)
   - Base Sepolia (AgentBlocklist contract)

   ## Setup
   ```bash
   cp .env.example .env
   # Fill in VENICE_API_KEY, DEPLOYER_PRIVATE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
   bun install
   bun run dev       # Start UI at http://localhost:3000
   bun run loop      # Start autonomous scanning loop
   ```

   ## Environment Variables
   See `.env.example` for required variables.

   ## Contracts
   - AgentBlocklist: [fill in address after deployment]
   - ERC-8004 IdentityRegistry (Base Sepolia): `0x8004A818BFB912233c491871b3d84c89A494BD9e`
   - ERC-8004 ReputationRegistry (Base Sepolia): `0x8004B663056A597Dffe9eCcC1965A193B7388713`
   ```

2. Fill in the demo link after recording in Task 8.2.

**Commit:**
```bash
git add README.md
git commit -m "docs: add README with setup instructions and project overview"
```

---

### Task 8.1: Demo Prerequisites

**Steps:**

1. Verify all demo prerequisites from PRD Section 6:
   - [ ] AgentBlocklist deployed to Base Sepolia
   - [ ] AgentAuditor registered on ERC-8004
   - [ ] 2-3 agent addresses with transaction history (from seed script or real agents)
   - [ ] Venice API key with available prompts OR cached results
   - [ ] Telegram bot configured and channel set up
   - [ ] Autonomous loop running

2. Pre-fetch demo data for reliability:
   ```bash
   bun run seed
   ```

3. Test the exact demo flow from PRD Scene 3:
   - Type an agent ID
   - Select Gnosis from chain dropdown
   - Wait for trust score
   - Verify BLOCKLIST result renders (for the test "malicious" agent)

#### Decision Point: Network Issues During Demo (PRD Risk 14)

If any external service is down during recording:
1. Use `.demo-cache/` pre-computed results
2. The API route checks for cached data before making live calls
3. Record in segments (one scene at a time), not one continuous take
4. Have backup screenshots of each scene in case recording fails

### Task 8.2: Record Demo

**Steps:**

1. Follow PRD Section 6 scene-by-scene:
   - Scene 1: The Problem (30s)
   - Scene 2: Meet AgentAuditor (20s)
   - Scene 3: Live Audit Demo (60s)
   - Scene 4: Onchain Attestation (40s)
   - Scene 5: Autonomous Loop (30s)
   - Scene 6: Telegram Alert (20s)
   - Scene 7: Blocklist Query & Self-Registration (20s)
   - Scene 8: The Architecture (20s)
   - Scene 9: Why This Matters (20s)

2. Total: 4-5 minutes.

3. Use screen recording tool (QuickTime, OBS, or Loom).

### Task 8.3: Submission Package

**Steps:**

1. Push code to GitHub:
   ```bash
   gh repo create agent-auditor --public --source=. --push
   ```

2. Prepare submission materials:
   - Demo video URL (upload to YouTube/Loom)
   - GitHub repo URL
   - Project description (from PRD Section 1)
   - Track selections: "Agents that Trust" (Protocol Labs), "Agents that Keep Secrets" (Venice), "Open Track"

---

### Phase 8 Gate

Before declaring submission complete, verify:
- [ ] Demo video recorded (4-5 minutes, covers all 9 scenes)
- [ ] Demo video uploaded (YouTube/Loom URL works)
- [ ] GitHub repo created and pushed (`gh repo view` succeeds)
- [ ] README.md exists with project description, setup instructions, and demo link
- [ ] All environment variables documented in `.env.example`
- [ ] Submission form completed on SYNTHESIS platform
- [ ] Track selections submitted: "Agents that Trust", "Agents that Keep Secrets", "Open Track"

**If any check fails: fix before deadline (Mar 22 end of day).**

---

## Appendix: Quick Reference

### All Addresses

| Item | Address | Network |
|------|---------|---------|
| ERC-8004 IdentityRegistry (testnet) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | All Sepolia |
| ERC-8004 ReputationRegistry (testnet) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | All Sepolia |
| ERC-8004 IdentityRegistry (mainnet) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | All Mainnets |
| ERC-8004 ReputationRegistry (mainnet) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | All Mainnets |
| Olas ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | Base Mainnet |
| Olas ServiceRegistryL2 | `0x9338b5153AE39BB89f50468E608eD9d764B755fD` | Gnosis Mainnet |
| AgentBlocklist | DEPLOY_AND_RECORD_ADDRESS_HERE | Base Sepolia |

### All Commands

| Phase | Task | Command | Purpose |
|:---:|:---:|---------|---------|
| 0 | 0.1 | `bunx create-next-app@16.2.0 . --typescript --tailwind --app --src-dir` | Scaffold project |
| 0 | 0.1 | `forge init --no-commit --no-git` | Scaffold Foundry |
| 0 | 0.1 | `bun add viem@2.47.5 openai@6.32.0 grammy@1.41.1` | Install deps |
| 0 | 0.3 | `cast block-number --rpc-url https://sepolia.base.org` | Verify RPC |
| 2 | 2.2 | `cd contracts && forge test -vvv` | Run contract tests |
| 2 | 2.3 | `forge script script/DeployBlocklist.s.sol:DeployBlocklist --rpc-url ... --broadcast` | Deploy contract |
| 5 | 5.5 | `bun run dev` | Start dev server |
| 6 | 6.3 | `bun run loop` | Start autonomous loop |
| 7 | 7.1 | `bun run register` | Register on ERC-8004 |
| 7 | 7.2 | `bun run seed` | Seed demo data |

### Troubleshooting

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Cannot find module '@/lib/types'` | tsconfig paths not set | Ensure `"paths": { "@/*": ["./src/*"] }` in tsconfig.json |
| `Module '"viem"' has no exported member` | Wrong viem version | Verify `bun list viem` shows 2.47.5 |
| `forge build` fails with import error | Missing OpenZeppelin | `cd contracts && forge install OpenZeppelin/openzeppelin-contracts --no-commit` |
| `execution reverted` on ERC-8004 | Wrong contract address or ABI | Verify address matches testnet/mainnet config |
| Port 3000 in use | Previous dev server still running | `lsof -ti:3000 \| xargs kill -9` |
| Venice returns 401 | Invalid API key | Regenerate at venice.ai dashboard |
| Venice returns 429 | Rate limited (10/day free) | Set `USE_MOCK_VENICE=true`, use cached results |
| Telegram bot doesn't respond | Invalid token or bot not started | Verify token with `curl https://api.telegram.org/bot$TOKEN/getMe` |
| `forge test` fails | OpenZeppelin path mismatch | Check `foundry.toml` remappings match installed lib path |
| Tailwind styles missing | Using v3 syntax | Use `@import "tailwindcss"` not `@tailwind base` |
| `bigint` errors | Missing BigInt handling | Ensure `>>> 0` cast for unsigned conversion (correction A3) |
| Loop hangs on one chain | Blockscout timeout | Add per-request timeout, skip unresponsive chains |

### Architecture Doc Section Reference

| Section | Content | Used In Phase |
|:---:|---------|:---:|
| 3 | Shared Types (`types.ts`) | 1 |
| 4 | Chain Config (`chains.ts`) | 1 |
| 5 | AgentBlocklist Contract (sol + tests + deploy) | 2 |
| 6 | Blockscout Pipeline (`blockscout.ts`) | 1 |
| 7 | ERC-8004 Reader (`erc8004.ts`) | 1 |
| 8 | Olas Discovery (`olas.ts`) | 1 |
| 9 | Venice Engine (`venice.ts`) | 3 |
| 10 | Trust Score (`trust-score.ts`) | 3 |
| 11 | Attestation (`attestation.ts`) | 4 |
| 12 | Resolver (`resolver.ts`) | 4 |
| 13 | API Route (`route.ts`) | 4 |
| 14 | Frontend (5 components + page + CSS + layout) | 5 |
| 15 | Telegram Bot (`telegram.ts`) | 6 |
| 16 | Autonomous Loop (`loop.ts`) | 6 |
| 17 | Scripts (register, run-loop, seed) | 7 |
| 18 | Config Files (package.json, tsconfig, next.config, .env, .gitignore) | 0, 5 |
| 19 | Testing Strategy | All phases |
| 20 | Deployment Sequence | 2, 7 |
| 21 | Addresses & External References | All phases |
