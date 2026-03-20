# AgentAuditor — Product Requirements Document

**Hackathon:** SYNTHESIS
**Track:** Agents that Trust (Protocol Labs) + Agents that Keep Secrets (Venice) + Open Track
**Deadline:** 2026-03-22 (3 days remaining, 2 build days)
**Version:** V2

---

## 1. Project Overview

### One-Liner

A meta-agent that watches other AI agents across EVM chains — analyzing their onchain behavior, scoring their trustworthiness via Venice private inference, publishing trust attestations to ERC-8004, and maintaining a queryable blocklist contract.

### Problem Statement

There are over 11 million autonomous agent transactions across EVM chains — Olas alone has 4M+ on Base, 9M+ on Gnosis, plus Virtuals Protocol has 18,000+ agents on Base — and zero standardized way to evaluate whether those agents are trustworthy. Any agent can register on ERC-8004 (deployed on 18+ chains), claim capabilities, and start transacting. Nobody verifies whether their onchain behavior matches their claims. The result: a trust vacuum where users, protocols, and other agents have no reliable signal to distinguish legitimate autonomous agents from malicious or incompetent ones.

### Solution

AgentAuditor is an autonomous agent that continuously monitors other AI agents across EVM chains. It fetches transaction histories via Blockscout's unified API (identical endpoints on Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon), reads agent identity claims from ERC-8004's IdentityRegistry (same contract addresses on all chains via CREATE2), and sends behavioral data to Venice AI for private inference analysis. Venice returns a structured trust score (0-100) across four axes: transaction patterns, contract interactions, fund flow, and behavioral consistency. AgentAuditor then publishes these scores as onchain attestations via ERC-8004's ReputationRegistry on the agent's native chain, maintains a blocklist smart contract that any protocol can query, and notifies a Telegram channel when risky agents are detected. The entire loop runs autonomously: discover → analyze → score → act → verify.

### Why This Wins

| Judging Criterion | Weight | How We Excel |
|---|:---:|---|
| Correctness | HIGH | Trust scores are structured, reproducible, and backed by real onchain data. Attestations are verifiable on-chain. Blocklist is queryable by any smart contract. |
| Autonomy | HIGH | Full autonomous loop: agent discovers targets, fetches data, runs analysis, publishes results, and verifies attestations — no human in the loop after deployment. |
| Real-world viability | HIGH | Addresses a real problem: 11M+ agent transactions across EVM chains with zero trust verification. Uses existing infrastructure (ERC-8004 on 18+ chains, Blockscout, Venice) — not hypothetical. Any protocol can integrate the blocklist contract today. |

### Sponsor Alignment

| Sponsor | Prize Pool | How AgentAuditor Aligns |
|---|:---:|---|
| Protocol Labs | $16,000 | Deep ERC-8004 integration — reads IdentityRegistry, writes ReputationRegistry, self-registers as an agent. Demonstrates the trust infrastructure working as intended. |
| Venice | $11,500 | Venice private inference is the analysis engine. Uses E2EE for privacy. Demonstrates AI agents that keep data private while producing public trust scores. |
| Open Track | $14,500 | Meta-agent concept — an agent that evaluates agents. Cross-sponsor integration. Novel category that doesn't exist yet. |

---

## 2. System Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTONOMOUS LOOP                              │
│                                                                     │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────────┐         │
│  │ Discovery │───▶│ Multi-Chain Data  │───▶│ Venice Engine  │         │
│  │ Module    │    │ Pipeline          │    │ (Private AI)   │         │
│  │ (per-chain│    │ (Blockscout ×6)   │    └───────┬───────┘         │
│  │  scanning)│    └──────────────────┘            │                 │
│  └──────────┘                                     │                 │
│       │          ┌────────────────────────────────┘                 │
│       │          ▼                                                   │
│       │    ┌───────────┐    ┌──────────────┐    ┌──────────────┐   │
│       │    │ Trust Score│───▶│ ERC-8004     │    │ Blocklist    │   │
│       │    │ System     │    │ Attestation  │    │ Contract     │   │
│       │    └───────────┘    │ (native chain)│    │ (Base)       │   │
│       │          │          └──────────────┘    └──────────────┘   │
│       │          ▼                                      │           │
│       │    ┌───────────┐                               │           │
│       │    │ Telegram   │◀──────────────────────────────┘           │
│       │    │ Notifier   │                                           │
│       │    └───────────┘                                           │
│       │                                                             │
│       │    ┌───────────────┐    ┌──────────────┐                   │
│       └───▶│ ERC-8004      │    │ Chain Config  │                   │
│            │ Registry      │◀───│ (6 chains)    │                   │
│            │ (per-chain)   │    └──────────────┘                   │
│            └───────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Next.js Single-Page UI                                      │   │
│  │  [Smart Input: Agent ID | Address | Name] [Chain Selector]   │   │
│  │  → [Trust Score Card] → [History Table]                      │   │
│  │  Calls: /api/analyze (server route → Venice)                 │   │
│  │  Reads: Blockscout API + ERC-8004 contracts (client-side)    │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

Supported Chains:
  Base ─── Gnosis ─── Ethereum ─── Arbitrum ─── Optimism ─── Polygon
  (primary)  (Olas)    (mainnet)   (Morpheus)
```

### Component Table

| # | Component | Type | Purpose | Key Dependencies |
|---|-----------|------|---------|-----------------|
| 1 | Chain Config | Module | Chain definitions (name, Blockscout URL, RPC, ERC-8004 addresses) for 6 EVM chains | Static config map |
| 2 | Onchain Data Pipeline | Service | Fetch tx histories, token transfers, internal txns from Blockscout on any supported chain | Chain Config, Blockscout REST API v2, viem (fallback RPC) |
| 3 | ERC-8004 Registry Reader | Service | Read agent identities, metadata, existing feedback from IdentityRegistry + ReputationRegistry on any chain | Chain Config, viem, ERC-8004 contracts (same addresses on all chains via CREATE2) |
| 4 | Venice Analysis Engine | Service | Send behavioral data to Venice AI, receive structured trust scores | openai SDK (Venice-compatible), Venice API |
| 5 | Trust Score System | Module | Normalize, validate, and format trust scores from Venice responses | Venice Analysis Engine output |
| 6 | Onchain Attestations | Service | Publish trust scores as ERC-8004 feedback on the agent's native chain | Chain Config, viem, ERC-8004 ReputationRegistry |
| 7 | Blocklist Contract | Smart Contract | Maintain blocklist of flagged agent addresses, queryable by other contracts | Solidity, OpenZeppelin Ownable (deployed on Base) |
| 8 | Single-Page UI | Frontend | Smart input (Agent ID / Address / Name / ENS) + chain selector → trust score display → audit history | Next.js, Tailwind, Chain Config, Blockscout API, ERC-8004 |
| 9 | Telegram Bot | Service | Send alerts when risky agents detected, accept `/audit` commands with chain param | grammy, Chain Config |
| 10 | Agent Identity | Config | AgentAuditor's own ERC-8004 registration with agent.json | ERC-8004 IdentityRegistry |
| 11 | Autonomous Loop | Orchestrator | Discover → analyze → score → act → verify cycle across all chains | All other components |

### Data Flow

1. **Discovery:** The autonomous loop iterates through supported chains, querying each chain's ERC-8004 IdentityRegistry for newly registered agents (via `Registered` events). On Base, it also queries Olas ServiceRegistryL2 for active mech services. On Gnosis, it queries Olas ServiceRegistryL2 for prediction market agents.

2. **Data Collection:** For each discovered agent, the Chain Config module resolves the correct Blockscout URL and RPC endpoint. The Onchain Data Pipeline fetches the last 50 transactions, token transfers, and internal transactions from that chain's Blockscout REST API v2 (identical endpoints, different base URLs). The ERC-8004 Registry Reader fetches the agent's identity from the same contract addresses on that chain (CREATE2 vanity addresses `0x8004...` are identical across all chains).

3. **Analysis:** The collected data — tagged with chain of origin — is formatted into a structured prompt and sent to Venice AI via the OpenAI-compatible API. Venice returns a JSON trust score with 4-axis breakdown (25 points each), severity-tagged flags, and a recommendation (SAFE/CAUTION/BLOCKLIST).

4. **Action:** Based on the recommendation:
   - **SAFE (score ≥ 70):** Publish positive attestation to ERC-8004 ReputationRegistry on the agent's native chain via `giveFeedback()`.
   - **CAUTION (score 40-69):** Publish neutral attestation on native chain + Telegram notification.
   - **BLOCKLIST (score < 40):** Publish negative attestation on native chain + add to AgentBlocklist contract (on Base) + Telegram alert.

5. **Verification:** After publishing, the loop reads back the attestation from ERC-8004 on the agent's chain to confirm it was recorded. The UI displays real-time results.

---

## 3. User Flows

### Flow 1: Manual Agent Audit (UI)

1. User opens AgentAuditor web app
2. User types into the smart input field. The field auto-detects input type:
   - **Number (e.g. `42`)** → Agent ID lookup: queries ERC-8004 IdentityRegistry for that token ID
   - **`0x...` (42 chars)** → Address lookup: used directly as agent address
   - **Text string** → Name search: queries ERC-8004 `Registered` events + metadata for matching agent names
   - **`.eth` suffix** → ENS resolution (nice-to-have): resolves to address first
3. User selects a chain from the chain dropdown (defaults to "All Chains" auto-detect, or specific chain: Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon)
4. Frontend calls `/api/analyze` server route with `{ input, inputType, chain }`
5. Server resolves input to an address (if Agent ID or name, looks up on selected chain or scans all chains)
6. Server fetches Blockscout data from the resolved chain's API (transactions, transfers, internal txns)
7. Server reads ERC-8004 identity on that chain (tokenURI, metadata, existing feedback)
8. Server sends combined data to Venice AI for analysis
9. Venice returns structured trust score JSON
10. Server returns trust score + chain info to frontend
11. Frontend renders trust score card: overall score, 4-axis breakdown, flags, recommendation badge, chain badge
12. Frontend renders recent transaction table below the score card

**Error case:** If input resolves to no agent on any chain, display "No agent found matching this input" with suggestions.

**Error case:** If address has no transaction history, display "No onchain activity found for this address on [chain]" with a neutral state.

**Error case:** If Venice API is unavailable, fall back to displaying raw Blockscout data with "AI analysis unavailable — showing raw data only."

### Flow 2: Autonomous Agent Discovery & Audit

1. Autonomous loop timer fires (every 5 minutes)
2. Loop iterates through each supported chain:
   a. Queries that chain's ERC-8004 IdentityRegistry for `Registered` events since last checkpoint for that chain
   b. On Base: also queries Olas ServiceRegistryL2 for active services
   c. On Gnosis: also queries Olas ServiceRegistryL2 for prediction market agents
3. For each new/unaudited agent address (with chain tag):
   a. Fetch Blockscout data from the agent's native chain
   b. Read ERC-8004 identity on that chain
   c. Send to Venice AI (data tagged with chain of origin)
   d. Receive trust score
   e. If BLOCKLIST: call `AgentBlocklist.blockAgent(address, reason)` on Base + `giveFeedback()` on agent's native chain
   f. If CAUTION: call `giveFeedback()` on native chain + send Telegram notification
   g. If SAFE: call `giveFeedback()` on native chain
   h. Send Telegram notification for CAUTION and BLOCKLIST results (includes chain name)
4. Loop records per-chain checkpoint (last processed block number per chain)
5. Loop sleeps until next interval

**Error case:** If Blockscout rate limit hit (5 RPS per chain instance), back off with exponential delay and retry.

**Error case:** If ERC-8004 contract call reverts, log error and skip this agent (don't block the loop).

**Error case:** If a chain's Blockscout instance is down, skip that chain for this iteration and log a warning.

### Flow 3: Telegram Bot Interaction

1. User sends `/audit <input> [chain]` to AgentAuditor Telegram bot
   - Input supports same smart detection as UI: Agent ID, address, or name
   - Optional chain parameter (defaults to auto-detect across all chains)
   - Examples: `/audit 42`, `/audit 0x1234... base`, `/audit AgentName gnosis`
2. Bot parses input type and resolves to address + chain
3. Bot calls the same analysis pipeline as the UI
4. Bot responds with formatted trust score: score, recommendation badge, top flags, chain badge
5. If agent was previously audited, bot also shows historical scores

**Error case:** Unresolvable input → "Could not find an agent matching '...' on any supported chain. Try an address (0x...) or Agent ID (number)."

### Flow 4: Protocol Integration (Blocklist Query)

1. External smart contract calls `AgentBlocklist.isBlocked(agentAddress)`
2. Returns `true` if agent has been blocklisted, `false` otherwise
3. Protocol uses this to gate agent access to their system

```
ExternalProtocol -> AgentBlocklist: isBlocked(0xAgent)
AgentBlocklist -> ExternalProtocol: true/false
ExternalProtocol: allow/deny agent based on result
```

### Flow 5: AgentAuditor Self-Registration

1. At deployment, AgentAuditor registers itself on ERC-8004 IdentityRegistry via `register(agentURI)`
2. agentURI contains a base64-encoded JSON with: type "auditor", name "AgentAuditor", description, services (audit, blocklist), supportedTrust tags
3. AgentAuditor's own NFT ID is stored in config for future reference
4. Other agents/protocols can verify AgentAuditor's identity via the registry

---

## 4. Technical Specifications

### 4.1 Chain Config

- **Purpose:** Define supported chains with their Blockscout URLs, RPC endpoints, and ERC-8004 contract addresses
- **Interface:**
  - `SUPPORTED_CHAINS` → `Record<ChainId, ChainConfig>` (static config map)
  - `getChainConfig(chainId)` → `ChainConfig`
  - `getAllChains()` → `ChainConfig[]`
  - `detectChain(address)` → `ChainId | null` (check which chains have activity for an address)
- **Key Data Structures:**
  ```typescript
  type ChainId = "base" | "gnosis" | "ethereum" | "arbitrum" | "optimism" | "polygon";

  interface ChainConfig {
    id: ChainId;
    name: string;
    blockscoutUrl: string;       // e.g. "https://base.blockscout.com/api/v2"
    rpcUrl: string;              // free public RPC
    viemChain: Chain;            // viem chain object
    erc8004: {
      identityRegistry: string;  // same on all chains via CREATE2 (testnet vs mainnet addresses differ)
      reputationRegistry: string; // same on all chains via CREATE2 (testnet vs mainnet addresses differ)
    };
    olasRegistry?: string;       // Olas ServiceRegistryL2 address (Base, Gnosis only)
    explorer: string;            // block explorer URL for linking
  }
  ```
- **Supported Chains:**

  | Chain | Blockscout URL | Olas Registry | Primary Agent Ecosystem |
  |-------|---------------|:---:|---|
  | Base | `https://base.blockscout.com/api/v2` | Yes | Virtuals (18K+ agents), some Olas |
  | Gnosis | `https://gnosis.blockscout.com/api/v2` | Yes | Olas (90%+ activity, prediction market agents) |
  | Ethereum | `https://eth.blockscout.com/api/v2` | No | ERC-8004 registrations |
  | Arbitrum | `https://arbitrum.blockscout.com/api/v2` | No | Morpheus token/staking |
  | Optimism | `https://optimism.blockscout.com/api/v2` | No | ERC-8004 registrations |
  | Polygon | `https://polygon.blockscout.com/api/v2` | No | ERC-8004 registrations |

- **Dependencies:** None (static config)
- **Constraints:** ERC-8004 contracts use CREATE2 vanity addresses — identical on all chains. Blockscout APIs are identical across chains (same endpoints, same response format). 5 RPS per chain instance.

### 4.2 Onchain Data Pipeline

- **Purpose:** Fetch transaction data for any address on any supported chain from Blockscout REST API v2
- **Interface:**
  - `getTransactions(chainId, address, limit?)` → `TransactionSummary[]`
  - `getTokenTransfers(chainId, address, limit?)` → `TokenTransfer[]`
  - `getInternalTransactions(chainId, address, limit?)` → `ContractCall[]`
  - `fetchAgentData(chainId, address)` → `AgentTransactionData` (combines all three)
- **Key Data Structures:**
  ```typescript
  interface TransactionSummary {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    timestamp: number;
    methodId: string;
  }

  interface TokenTransfer {
    token: string; // "SYMBOL:0xAddress"
    from: string;
    to: string;
    value: string;
    timestamp: number;
  }

  interface ContractCall {
    contract: string;
    method: string; // CALL, DELEGATECALL, CREATE
    timestamp: number;
  }

  interface AgentTransactionData {
    address: string;
    chainId: ChainId;
    transactions: TransactionSummary[];
    tokenTransfers: TokenTransfer[];
    contractCalls: ContractCall[];
  }
  ```
- **Dependencies:** Chain Config (for Blockscout URLs), viem for RPC fallback
- **Constraints:** Blockscout rate limit 5 RPS per chain instance, 100K credits/day per chain. Default fetch limit 50 per category.

### 4.3 ERC-8004 Registry Reader

- **Purpose:** Read agent identities, metadata, and existing feedback from ERC-8004 contracts on any supported chain
- **Interface:**
  - `getAgentIdentity(chainId, agentId)` → `AgentIdentity` (tokenURI + metadata + wallet)
  - `findAgentByAddress(chainId, address)` → `agentId | null` (event-based reverse lookup on one chain)
  - `findAgentAcrossChains(address)` → `{ chainId, agentId } | null` (scan all chains, ~2-5s timeout)
  - `searchAgentsByName(query)` → `{ chainId, agentId, name }[]` (search across chains)
  - `getAgentFeedback(chainId, agentId)` → `FeedbackSummary` (two-step: getClients → getSummary)
  - `discoverNewAgents(chainId, fromBlock)` → `DiscoveredAgent[]` (scan Registered events)
- **Key Data Structures:**
  ```typescript
  interface AgentIdentity {
    agentId: bigint;
    owner: string;
    tokenURI: string;
    metadata: Record<string, string>;
    wallet: string;
    registrationBlock: bigint;
  }

  interface FeedbackSummary {
    agentId: bigint;
    clients: string[];
    overallScore: { count: bigint; value: bigint; decimals: number };
    securityScore: { count: bigint; value: bigint; decimals: number };
  }

  interface DiscoveredAgent {
    agentId: bigint;
    owner: string;
    blockNumber: bigint;
    source: "erc8004" | "olas";
  }
  ```
- **Dependencies:** Chain Config, viem, ERC-8004 IdentityRegistry + ReputationRegistry contracts (same addresses on all chains)
- **Events:** Listens to `Registered(uint256 indexed agentId, address indexed owner)` events per chain
- **Constraints:** Reverse lookup (address → agentId) requires scanning `Registered` events per chain. Cache results per chain to avoid re-scanning. Name search scans cached registrations across all chains.

### 4.4 Venice Analysis Engine

- **Purpose:** Send behavioral data to Venice AI for private inference, receive structured trust scores
- **Interface:**
  - `analyzeAgent(client, data)` → `TrustScore`
  - `listAvailableModels(client)` → `string[]` (runtime model verification)
  - `createVeniceClient(apiKey)` → `OpenAI` instance
- **Key Data Structures:**
  ```typescript
  interface TrustScore {
    agentAddress: string;
    chainId: ChainId;
    overallScore: number; // 0-100
    breakdown: {
      transactionPatterns: number;   // 0-25
      contractInteractions: number;  // 0-25
      fundFlow: number;              // 0-25
      behavioralConsistency: number; // 0-25
    };
    flags: TrustFlag[];
    summary: string;
    recommendation: "SAFE" | "CAUTION" | "BLOCKLIST";
    analysisTimestamp: string;
  }

  interface TrustFlag {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    category: string;
    description: string;
    evidence: string;
  }
  ```
- **Dependencies:** openai SDK (6.32.0) with Venice baseURL, Venice API key (server-side only)
- **Constraints:**
  - Free tier: 10 prompts/day → mock-first during dev, real API for demo
  - Model IDs [ASSUMED]: `llama-3.3-70b` (primary), `mistral-31-24b` (fallback) — verify at runtime
  - `venice_parameters.enable_e2ee = true` for privacy narrative
  - Temperature 0.1 for deterministic analysis
  - JSON Schema response_format for structured output

### 4.5 Trust Score System

- **Purpose:** Validate, normalize, and format trust scores from Venice responses
- **Interface:**
  - `validateTrustScore(raw)` → `TrustScore` (validates JSON against schema)
  - `scoreToRecommendation(score, flags)` → `"SAFE" | "CAUTION" | "BLOCKLIST"`
  - `formatForAttestation(score)` → `{ value: bigint, decimals: number, tags: [bytes32, bytes32] }`
  - `formatForTelegram(score)` → `string` (markdown-formatted message)
  - `formatForUI(score)` → `UITrustScore` (frontend-friendly format)
- **Dependencies:** Venice Analysis Engine output
- **Constraints:** Overall score always equals sum of 4 breakdown scores. Recommendation derived from score + flags (CRITICAL flag → always BLOCKLIST regardless of score).

### 4.6 Onchain Attestations

- **Purpose:** Publish trust scores to ERC-8004 ReputationRegistry on the agent's native chain
- **Interface:**
  - `publishAttestation(chainId, agentId, trustScore)` → `txHash`
  - `verifyAttestation(chainId, agentId)` → `boolean` (read back to confirm)
- **Dependencies:** Chain Config, viem, ERC-8004 ReputationRegistry (same address on all chains), deployer wallet private key
- **Events:** Emits `FeedbackGiven` on ReputationRegistry on the target chain
- **Constraints:**
  - `giveFeedback()` uses `int128` — positive for SAFE (+score as int128), zero for CAUTION (neutral), negative for BLOCKLIST (-score as int128)
  - Tags: `trustScore/overall` and `trustScore/security` (bytes32 encoded)
  - Requires gas on each chain where attestations are published (Sepolia testnets for dev)
  - AgentAuditor must be registered on ERC-8004 first (Flow 5)
  - For MVP: attestations written to Base Sepolia only. Multi-chain attestation writes are a stretch goal.

### 4.7 Blocklist Contract (AgentBlocklist.sol)

- **Purpose:** Maintain a blocklist of agent addresses flagged as untrustworthy
- **Interface:**
  - `blockAgent(address, reason)` — Owner-only, emits `AgentBlocked`
  - `unblockAgent(address)` — Owner-only, emits `AgentUnblocked`
  - `isBlocked(address)` → `bool` — Public view
  - `blockAgentsBatch(address[], reason)` — Owner-only batch operation
- **Dependencies:** OpenZeppelin Ownable, Solidity ^0.8.24
- **Events:** `AgentBlocked(address indexed agent, string reason)`, `AgentUnblocked(address indexed agent)`
- **Constraints:** Only contract owner (AgentAuditor deployer) can write. Anyone can read.

### 4.8 Single-Page UI

- **Purpose:** Web interface for manual agent audits across chains
- **Interface:**
  - **Smart input field** — Auto-detects input type:
    - Number → Agent ID lookup (queries ERC-8004 IdentityRegistry)
    - `0x...` (42 chars) → Direct address lookup
    - Text string → Name search (queries cached ERC-8004 registrations)
    - `.eth` suffix → ENS resolution (nice-to-have, deferred if time-short)
  - **Chain selector dropdown** — "All Chains (auto-detect)" default, or pick specific chain (Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon)
  - Trust score card (score gauge, 4-axis breakdown bars, recommendation badge, flags list, **chain badge**)
  - Transaction history table (last 20 transactions)
  - Loading state and error states
- **Dependencies:** Next.js 16.2.0, Tailwind 4.2.2, Chain Config, Blockscout API (client reads), `/api/analyze` server route
- **Constraints:**
  - `"use client"` directive required for all interactive components
  - Venice API key must NOT be exposed client-side (server route only)
  - Single page, no routing needed (just `/`)
  - Responsive but desktop-first (judges use laptops)
  - Smart input placeholder text: "Enter Agent ID, address, or name..."

### 4.9 Telegram Bot

- **Purpose:** Send real-time alerts when risky agents are detected, accept `/audit` commands with chain support
- **Interface:**
  - `/audit <input> [chain]` — Trigger manual audit with smart input (Agent ID, address, or name). Optional chain parameter.
  - `/status` — Show autonomous loop status (per-chain checkpoint info)
  - Automatic notifications for CAUTION and BLOCKLIST results (includes chain name in message)
- **Dependencies:** grammy 1.41.1, Telegram Bot API, Chain Config
- **Constraints:** Long polling (not webhooks) for simplicity. Single-channel notification.

### 4.10 Agent Identity

- **Purpose:** Register AgentAuditor itself on ERC-8004 as a verifiable agent
- **Interface:** One-time registration script: `register(agentURI)` on IdentityRegistry (on Base, primary chain)
- **Key Data Structure (agent.json):**
  ```json
  {
    "type": "auditor",
    "name": "AgentAuditor",
    "description": "Autonomous trust evaluation agent for EVM chain AI agents — monitors Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon",
    "services": ["audit", "blocklist", "trust-score"],
    "supportedChains": ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"],
    "supportedTrust": ["trustScore/overall", "trustScore/security", "trustScore/reliability", "trustScore/quality"]
  }
  ```
- **Dependencies:** viem, ERC-8004 IdentityRegistry, deployer wallet
- **Constraints:** Registration is a one-time transaction on Base. agentURI is base64-encoded JSON.

### 4.11 Autonomous Loop

- **Purpose:** Orchestrate the full discover → analyze → score → act → verify cycle across all supported chains
- **Interface:**
  - `startLoop(intervalMs)` — Start the autonomous loop
  - `stopLoop()` — Stop gracefully
  - `runOnce()` — Single iteration across all chains (for testing)
  - `getStatus()` → `LoopStatus` (last run per chain, agents audited, next run)
- **Dependencies:** All other components, Chain Config
- **Constraints:**
  - Default interval: 5 minutes
  - Persists last-processed block number **per chain** to avoid re-scanning
  - Iterates chains sequentially (Base → Gnosis → others) to respect rate limits
  - Graceful error handling: one failed agent or chain doesn't stop the loop
  - Rate-aware: respects Blockscout 5 RPS per chain and Venice 10/day limits

---

## 5. API Contracts

### External API: Blockscout REST v2 (Multi-Chain)

All Blockscout instances expose identical REST API v2 endpoints. Only the base URL differs per chain.

| Chain | Base URL | Auth | Rate Limit |
|-------|----------|:---:|---|
| Base | `https://base.blockscout.com/api/v2` | None | 5 RPS |
| Gnosis | `https://gnosis.blockscout.com/api/v2` | None | 5 RPS |
| Ethereum | `https://eth.blockscout.com/api/v2` | None | 5 RPS |
| Arbitrum | `https://arbitrum.blockscout.com/api/v2` | None | 5 RPS |
| Optimism | `https://optimism.blockscout.com/api/v2` | None | 5 RPS |
| Polygon | `https://polygon.blockscout.com/api/v2` | None | 5 RPS |

#### Endpoint: GET /addresses/{hash}/transactions

- **Request:** `GET /addresses/0x1234.../transactions?limit=50`
- **Response (success):**
  ```json
  {
    "items": [
      {
        "hash": "0xabc...",
        "from": { "hash": "0x1234..." },
        "to": { "hash": "0x5678..." },
        "value": "1000000000000000000",
        "gas_used": "21000",
        "timestamp": "2026-03-19T10:00:00.000Z",
        "method": "transfer",
        "decoded_input": { "method_id": "0xa9059cbb" }
      }
    ],
    "next_page_params": { "block_number": 12345, "index": 0 }
  }
  ```

#### Endpoint: GET /addresses/{hash}/token-transfers

- **Request:** `GET /addresses/0x1234.../token-transfers?limit=50`
- **Response (success):**
  ```json
  {
    "items": [
      {
        "token": { "address": "0xtoken...", "symbol": "USDC" },
        "from": { "hash": "0x1234..." },
        "to": { "hash": "0x5678..." },
        "total": { "value": "1000000" },
        "timestamp": "2026-03-19T10:00:00.000Z"
      }
    ]
  }
  ```

#### Endpoint: GET /addresses/{hash}/internal-transactions

- **Request:** `GET /addresses/0x1234.../internal-transactions?limit=50`
- **Response (success):**
  ```json
  {
    "items": [
      {
        "to": { "hash": "0xcontract..." },
        "type": "CALL",
        "timestamp": "2026-03-19T10:00:00.000Z"
      }
    ]
  }
  ```

### External API: Venice AI (OpenAI-Compatible)

- **Base URL:** `https://api.venice.ai/api/v1`
- **Authentication:** `Authorization: Bearer $VENICE_API_KEY`
- **Rate Limits:** 10 prompts/day (free tier)

#### Endpoint: POST /chat/completions

- **Request:**
  ```json
  {
    "model": "llama-3.3-70b",
    "messages": [
      { "role": "system", "content": "[AgentAuditor system prompt]" },
      { "role": "user", "content": "[Formatted agent data]" }
    ],
    "response_format": { "type": "json_schema", "json_schema": { "..." } },
    "temperature": 0.1,
    "max_tokens": 2000,
    "venice_parameters": {
      "enable_e2ee": true,
      "include_venice_system_prompt": false
    }
  }
  ```
- **Response (success):**
  ```json
  {
    "choices": [
      {
        "message": {
          "content": "{\"agentAddress\":\"0x...\",\"overallScore\":75,...}"
        }
      }
    ]
  }
  ```

#### Endpoint: GET /models

- **Request:** `GET /models` with Bearer auth
- **Response:** `{ "data": [{ "id": "llama-3.3-70b", ... }] }`
- **Purpose:** Runtime verification of available model IDs

### Internal API: /api/analyze (Next.js Server Route)

- **Method:** POST
- **URL:** `/api/analyze`
- **Authentication:** None (server-side route, Venice key in env)

#### Request:
```json
{
  "input": "42",
  "inputType": "agentId" | "address" | "name" | "ens",
  "chain": "base" | "gnosis" | "ethereum" | "arbitrum" | "optimism" | "polygon" | "all"
}
```

#### Response (success — 200):
```json
{
  "trustScore": {
    "agentAddress": "0x...",
    "chainId": "gnosis",
    "overallScore": 31,
    "breakdown": {
      "transactionPatterns": 10,
      "contractInteractions": 9,
      "fundFlow": 6,
      "behavioralConsistency": 6
    },
    "flags": [
      { "severity": "CRITICAL", "category": "fund_flow", "description": "...", "evidence": "..." }
    ],
    "summary": "...",
    "recommendation": "BLOCKLIST",
    "analysisTimestamp": "2026-03-20T10:00:00Z"
  },
  "agentIdentity": { "agentId": "42", "owner": "0x...", "tokenURI": "..." } | null,
  "transactions": [ { "hash": "0x...", "from": "0x...", "to": "0x...", "value": "...", "timestamp": 1234 } ]
}
```

#### Response (agent not found — 404):
```json
{ "error": "agent_not_found", "message": "No agent found matching '...' on any supported chain." }
```

#### Response (Venice unavailable — 503):
```json
{ "error": "analysis_unavailable", "message": "AI analysis unavailable. Raw data returned.", "transactions": [...] }
```

### Internal: resolveInput (Server-Side Input Resolution)

Resolves smart input to a concrete `{ address, chainId }` pair before analysis:

```typescript
interface ResolvedInput {
  address: string;
  chainId: ChainId;
  agentId?: bigint;
  resolvedVia: "agentId" | "address" | "name" | "ens";
}

function resolveInput(
  input: string,
  inputType: "agentId" | "address" | "name" | "ens",
  chain: ChainId | "all"
): Promise<ResolvedInput>
```

**Resolution logic:**
- `agentId` → call `getAgentIdentity(chain, input)` → extract wallet address. If `chain === "all"`, scan each chain until found.
- `address` → use directly. If `chain === "all"`, call `detectChain(address)` from Chain Config.
- `name` → call `searchAgentsByName(input)` → return first match (or all matches for UI disambiguation).
- `ens` → resolve via ENS public resolver on Ethereum, then treat as address.

### External API: Telegram Bot API

- **Base URL:** `https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN`
- **Authentication:** Token in URL path
- **Rate Limits:** 30 messages/second

#### Endpoint: POST /sendMessage

- **Request:**
  ```json
  { "chat_id": "@channel_name", "text": "...", "parse_mode": "Markdown" }
  ```

### On-Chain Contracts: ERC-8004 (Multi-Chain — Same Addresses via CREATE2)

ERC-8004 contracts are deployed at identical vanity addresses on all 18+ EVM chains via CREATE2. AgentAuditor reads from all 6 supported chains.

- **IdentityRegistry (All Sepolia testnets):** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry (All Sepolia testnets):** `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **IdentityRegistry (All Mainnets):** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **ReputationRegistry (All Mainnets):** `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

#### Key Functions (IdentityRegistry)

```solidity
function register(string calldata agentURI) external returns (uint256 agentId);
function tokenURI(uint256 agentId) external view returns (string memory);
function getMetadata(uint256 agentId, string calldata key) external view returns (string memory);
function getAgentWallet(uint256 agentId) external view returns (address);
function ownerOf(uint256 agentId) external view returns (address);
event Registered(uint256 indexed agentId, address indexed owner);
```

#### Key Functions (ReputationRegistry)

```solidity
function giveFeedback(
    uint256 agentId,
    int128 value,
    uint8 valueDecimals,
    bytes32 tag1,
    bytes32 tag2,
    string calldata endpoint,
    string calldata feedbackURI,
    bytes32 feedbackHash
) external;
function getClients(uint256 agentId) external view returns (address[] memory);
function getSummary(
    uint256 agentId,
    address[] calldata clients,
    bytes32 tag1,
    bytes32 tag2
) external view returns (uint256 count, int256 summaryValue, uint8 summaryValueDecimals);
```

### On-Chain Contracts: AgentBlocklist (Custom)

- **Network:** Base Sepolia (dev), Base Mainnet (demo) — blocklist is on Base only, aggregates flags from all chains
- **Address:** Deployed during build — record in .env

```solidity
function blockAgent(address agent, string calldata reason) external;  // onlyOwner
function unblockAgent(address agent) external;                         // onlyOwner
function isBlocked(address agent) external view returns (bool);        // public
function blockAgentsBatch(address[] calldata agents, string calldata reason) external; // onlyOwner
```

### On-Chain Contracts: Olas ServiceRegistryL2

- **Base Mainnet:** `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE`
- **Gnosis Mainnet:** `0x9338b5153AE39BB89f50468E608eD9d764B755fD`
- **Used for:** Discovering active Olas Mech agents on Base and Gnosis (the two chains with 95%+ of Olas activity)

```solidity
function totalSupply() external view returns (uint256);
function getService(uint256 serviceId) external view returns (
    uint96 securityDeposit,
    address multisig,
    bytes32 configHash,
    uint32 threshold,
    uint32 maxNumAgentInstances,
    uint32 numAgentInstances,
    uint8 state
);
```

---

## 6. Demo Script

**Total Duration:** 4-5 minutes
**Format:** Screen recording with voiceover

### Scene 1: The Problem (30 seconds)

**Screen:** Split view — left shows Base and Gnosis explorers with millions of agent transactions, right shows ERC-8004 registry listing agents across chains.
**Voiceover:** "There are over eleven million autonomous agent transactions across EVM chains — four million on Base, nine million on Gnosis, with eighteen thousand agents on Virtuals alone. Any agent can register itself on ERC-8004 on any of eighteen chains, claim capabilities, and start transacting. But nobody is checking whether these agents actually do what they say. That's the trust gap."
**Action:** Scroll through explorers showing high volume on Base and Gnosis, then highlight an agent with suspicious patterns.

### Scene 2: Meet AgentAuditor (20 seconds)

**Screen:** AgentAuditor web UI — clean single-page design with smart input field and chain selector centered.
**Voiceover:** "AgentAuditor is the agent that watches other agents. Enter an agent ID, paste an address, or search by name — across Base, Gnosis, Ethereum, Arbitrum, Optimism, and Polygon. It fetches their complete onchain footprint, analyzes behavior using Venice's private AI, and produces a structured trust score."
**Action:** Camera pans across the UI showing the smart input field, chain dropdown, and clean interface.

### Scene 3: Live Audit Demo (60 seconds)

**Screen:** AgentAuditor UI with smart input field focused.
**Voiceover:** "Let's audit a real agent. I'll type an agent ID — AgentAuditor auto-detects it's an ID, not an address."
**Action:**
1. Type an agent ID number into the smart input field (shows "Agent ID detected" hint)
2. Select "Gnosis" from chain dropdown (showing the multi-chain capability)
3. Loading state shows data being fetched from Gnosis Blockscout
4. Trust score card appears with **Gnosis chain badge**: score gauge fills to 31/100 (BLOCKLIST)
5. Breakdown bars show: Transaction Patterns 10/25, Contract Interactions 9/25, Fund Flow 6/25, Behavioral Consistency 6/25
6. Flags section shows: "CRITICAL: Rapid fund draining pattern", "HIGH: Interaction with unverified contracts"
7. Scroll down to show transaction history table

**Voiceover (during loading):** "AgentAuditor pulls transaction history from Gnosis Blockscout, reads the agent's ERC-8004 identity — same contract addresses on every chain thanks to CREATE2 — and sends everything to Venice for private analysis."
**Voiceover (after score):** "Score: 31 out of 100. BLOCKLIST. The breakdown shows weak fund flow patterns and low behavioral consistency. Two flags: rapid fund draining and interaction with unverified contracts."

### Scene 4: Onchain Attestation (40 seconds)

**Screen:** Terminal / transaction view showing the attestation being published.
**Voiceover:** "But AgentAuditor doesn't just score — it acts. That trust score is now being published as an onchain attestation to ERC-8004's ReputationRegistry on Gnosis — the agent's native chain. And because the score is below 40, this agent is also added to the blocklist contract on Base, where any protocol can query it."
**Action:**
1. Show the `giveFeedback` transaction being submitted on Gnosis
2. Show transaction confirmed
3. Show blocklist contract `blockAgent` transaction on Base
4. Quick cut to explorer showing the confirmed transactions on both chains

### Scene 5: Autonomous Loop (30 seconds)

**Screen:** Terminal showing the autonomous loop running across chains.
**Voiceover:** "AgentAuditor runs autonomously. Every five minutes, it scans all six chains for new agents, analyzes their behavior, and takes action — no human in the loop. Here it's discovering agents on Base and Gnosis, running analysis, and publishing results."
**Action:** Show loop output: "[Base] Discovered 1 new agent... [Gnosis] Discovered 2 new agents... Analyzing 0xABC on Gnosis... Score: 78/100 SAFE... Publishing attestation to Gnosis... Confirmed."

### Scene 6: Telegram Alert (20 seconds)

**Screen:** Telegram chat showing a notification from AgentAuditor bot.
**Voiceover:** "When a risky agent is detected, the Telegram bot fires an alert immediately. Teams and protocols monitoring this channel get real-time threat intelligence."
**Action:** Show a Telegram notification arriving: "BLOCKLIST: Agent 0x1234... scored 31/100. Flags: rapid fund draining, interaction with unverified contracts. Added to blocklist."

### Scene 7: Blocklist Query & Self-Registration (20 seconds)

**Screen:** Split view — left shows a simple Solidity snippet calling `isBlocked()`, right shows AgentAuditor's own ERC-8004 registration.
**Voiceover:** "Any protocol can check the blocklist — one `isBlocked()` call gates agent access. And AgentAuditor practices what it preaches: it's registered on ERC-8004 itself, with verifiable identity and trust tags."
**Action:** Left side highlights the `isBlocked()` call returning `true` for the blocked agent. Right side shows AgentAuditor's own NFT on ERC-8004 with its agent.json metadata.

### Scene 8: The Architecture (20 seconds)

**Screen:** Architecture diagram from the PRD.
**Voiceover:** "Under the hood: Blockscout across six EVM chains for data, Venice private inference for analysis with end-to-end encryption, ERC-8004 for reading agent identities and writing trust attestations on any chain, a custom blocklist contract, and grammy for Telegram. All TypeScript. One codebase, six chains."
**Action:** Highlight each component as it's mentioned, showing the chain config fanning out to multiple chains.

### Scene 9: Why This Matters (20 seconds)

**Screen:** Return to the UI showing the trust score with chain badge.
**Voiceover:** "As AI agents proliferate across EVM chains, the question isn't whether they'll interact with your protocol — it's whether you can trust them when they do. AgentAuditor is the answer: continuous, autonomous, cross-chain trust evaluation for the agent economy."
**Action:** Fade to project name and team info.

### Demo Prerequisites

- AgentBlocklist deployed to Base Sepolia (or Mainnet for final demo)
- AgentAuditor registered on ERC-8004 (on Base)
- At least 2-3 agent addresses with transaction history across different chains (Base + Gnosis minimum)
- Venice API key with available prompts (or use cached results)
- Telegram bot configured and channel set up
- Autonomous loop running for at least one visible cycle (showing multi-chain scanning)

---

## 7. Risk Register

| # | Risk | Category | Severity | Likelihood | Impact | Mitigation | Decision Tree |
|---|------|----------|----------|-----------|--------|------------|:---:|
| 1 | Venice model IDs (`llama-3.3-70b`, `mistral-31-24b`) don't exist or are renamed | Technical | CRITICAL | MEDIUM | Analysis engine non-functional | Runtime model verification via `GET /models`. Fallback: iterate available models, pick first `llama` or `mistral` match | Plan Phase 3 |
| 2 | Venice free tier (10/day) exhausted during dev/demo | Technical | HIGH | HIGH | Cannot run live analysis | Mock-first development. Cache Venice responses. Pre-compute 3-5 demo results. Only use real API for final demo recording | Plan Phase 3 |
| 3 | Venice structured output (`json_schema` response_format) not supported | Technical | HIGH | LOW | Trust scores require manual JSON parsing | Fallback: use system prompt "respond ONLY with valid JSON" + manual JSON.parse with try/catch | Plan Phase 3 |
| 4 | ERC-8004 contracts on Base Sepolia behave differently than expected | Technical | HIGH | MEDIUM | Registry read/write fails | Smoke test contracts early (Phase 1 gate). Test each function individually before integration | Plan Phase 2 |
| 5 | Blockscout API rate limits hit during demo | Demo | MEDIUM | MEDIUM | Slow or failed data fetching | Cache Blockscout responses for demo addresses. Implement exponential backoff. Pre-fetch demo data | Plan Phase 2 |
| 6 | No interesting agents to audit on Base (empty registry, boring tx patterns) | Demo | HIGH | MEDIUM | Demo lacks visual impact | Deploy 2-3 test agents with scripted behavior profiles (one safe, one suspicious, one malicious). Use Olas mech addresses as real-world examples | Plan Phase 4 |
| 7 | Gas insufficient for onchain attestations + blocklist writes | Technical | MEDIUM | LOW | Cannot publish trust scores onchain | Fund deployer wallet from Sepolia faucet (dev). Budget 0.01 ETH for demo on mainnet. Batch attestations if possible | Plan Phase 1 |
| 8 | Other teams building similar agent-trust concepts | Competitive | MEDIUM | MEDIUM | Reduced novelty score | Differentiate via: meta-agent framing (agent that audits agents), Venice privacy angle (encrypted inference), actual onchain attestations (not just a UI), autonomous loop with blocklist | N/A |
| 9 | Tailwind v4 patterns differ from available examples | Technical | LOW | MEDIUM | Slower UI development | Use `@import tailwindcss` and `@theme` in CSS. Reference official v4 docs. Keep UI minimal — one page, few components | Plan Phase 5 |
| 10 | Autonomous loop crashes or hangs | Technical | MEDIUM | MEDIUM | No continuous monitoring | Wrap loop body in try/catch. Log errors but continue. Add `/status` command to Telegram bot for monitoring | Plan Phase 6 |
| 11 | ERC-8004 reverse lookup (address → agentId) too slow | Technical | MEDIUM | HIGH | Slow agent discovery | Cache `Registered` event results. Use `fromBlock` parameter to only scan new blocks. In-memory map updated incrementally | Plan Phase 2 |
| 12 | Time crunch — 2 build days for 11 components | Time | HIGH | HIGH | Incomplete features at deadline | Priority order: core pipeline (data + Venice + score) > UI > contracts > attestations > Telegram > loop. Each component standalone-demoable | N/A |
| 13 | Demo video recording issues | Demo | MEDIUM | MEDIUM | Poor submission quality | Record early (day 2 evening). Use cached/pre-computed results for reliable demo. Script every click. Have backup screenshots | N/A |
| 14 | Network issues (Base RPC, Blockscout, Venice) during demo recording | Demo | MEDIUM | LOW | Failed live demo | Pre-cache all demo data. Implement offline fallback mode using cached responses. Record in segments, not one take | Plan Phase 7 |
| 15 | One or more chain Blockscout instances down or unreliable | Technical | MEDIUM | MEDIUM | Cannot fetch data for that chain | Graceful degradation: skip unavailable chains, show "Chain unavailable" in UI. Core demo uses Base + Gnosis (most reliable). Other 4 chains are bonus | Plan Phase 2 |
| 16 | ERC-8004 not actually deployed on claimed chains | Technical | LOW | LOW | Fewer chains available than advertised | Verify ERC-8004 deployment on each chain during build (smoke test). Fall back to chains where it's confirmed. Demo focuses on verified chains only | Plan Phase 1 |
| 17 | Smart input name search too slow (scanning all chains) | Technical | MEDIUM | MEDIUM | Poor UX on name search | Cache agent registrations at startup. Search cached data only. Fallback: disable name search if performance is unacceptable, keep Agent ID + Address | Plan Phase 5 |
| 18 | Gas costs across multiple chains for attestation writes | Technical | LOW | LOW | Can't write attestations on all chains | MVP: attestations on Base Sepolia only. Multi-chain writes are stretch goal. Free testnets have faucets | Plan Phase 2 |
| 19 | Telegram Bot API unavailable or rate-limited | Technical | LOW | LOW | No alerts sent for risky agents | Telegram is a notification layer, not core. If unavailable, log alerts locally and display in UI. Bot reconnects on next loop iteration | N/A |
| 20 | Olas ServiceRegistryL2 unavailable or returns unexpected data | Technical | LOW | LOW | Cannot discover Olas agents | Olas discovery is supplementary to ERC-8004. If Olas registry fails, skip Olas agents and rely on ERC-8004 registrations only. Log warning | Plan Phase 2 |

### Risk Categories Covered

- [x] Technical risks (API failures, bugs, integration) — Risks 1-5, 7, 9-11, 15-20
- [x] Competitive risks (other teams building similar) — Risk 8
- [x] Time risks (features that might not finish) — Risk 12
- [x] Demo risks (things that could go wrong in demo) — Risks 6, 13, 14
- [x] Judging risks (criteria misalignment) — Risk 8 (framing)
- [x] Scope risks (feature creep) — Risk 12 (priority order)

---

## 8. Day-by-Day Build Plan

| Day | Date | Primary Objective | Secondary Objective | Deliverable |
|:---:|------|------------------|--------------------|-----------  |
| 1 | Mar 20 | Chain config + Multi-chain Blockscout data + Venice mock + Trust Score + Blocklist contract | ERC-8004 reader (multi-chain) + smart input resolver + attestation writes | Working analysis pipeline (any input type → any chain → trust score out), deployed Blocklist contract on Sepolia |
| 2 | Mar 21 | UI (smart input + chain selector) + Telegram bot (with chain param) + Autonomous loop (multi-chain) + Real Venice API | Agent self-registration, deploy test agents on Base + Gnosis for demo | Complete working app: UI with multi-chain, bot, autonomous loop scanning all chains |
| 3 | Mar 22 | Demo video recording + Submission packaging | Polish UI, fix edge cases, deploy to mainnet if time allows | Submitted: repo + demo video on DoraHacks/SYNTHESIS platform |

### Priority Order (if time runs short)

1. **Must have (Day 1 AM):** Chain config (6 chains) + Blockscout data fetching (multi-chain) + Venice mock analysis + Trust score display
2. **Must have (Day 1 PM):** Smart input resolver (Agent ID + Address at minimum) + Blocklist contract deployed + ERC-8004 reader (multi-chain)
3. **Should have (Day 2 AM):** UI page with smart input + chain selector + `/api/analyze` server route + Real Venice API swap
4. **Should have (Day 2 PM):** Telegram bot with chain support + Autonomous loop (multi-chain) + Self-registration
5. **Nice to have:** Name search in smart input, ENS resolution, mainnet deployment, polished UI animations
6. **Cut if needed:** Olas discovery (use only ERC-8004 agents), name search, ENS, batch operations, pagination, chains beyond Base+Gnosis

### Buffer Allocation

Day 3 (Mar 22) is entirely buffer + demo + submission. No new features on Day 3.

---

## 9. Dependencies & Prerequisites

### External Services

| Service | URL | Auth Required | Status |
|---------|-----|:---:|---|
| Blockscout REST v2 (Base) | `https://base.blockscout.com/api/v2` | No | Live — free, no key needed |
| Blockscout REST v2 (Gnosis) | `https://gnosis.blockscout.com/api/v2` | No | Live — free, no key needed |
| Blockscout REST v2 (Ethereum) | `https://eth.blockscout.com/api/v2` | No | Live — free, no key needed |
| Blockscout REST v2 (Arbitrum) | `https://arbitrum.blockscout.com/api/v2` | No | Live — free, no key needed |
| Blockscout REST v2 (Optimism) | `https://optimism.blockscout.com/api/v2` | No | Live — free, no key needed |
| Blockscout REST v2 (Polygon) | `https://polygon.blockscout.com/api/v2` | No | Live — free, no key needed |
| Venice AI API | `https://api.venice.ai/api/v1` | Yes (Bearer token) | Live — need API key |
| Telegram Bot API | `https://api.telegram.org/bot{TOKEN}` | Yes (token in URL) | Live — need BotFather token |
| Base Sepolia RPC | `https://sepolia.base.org` | No | Live — free public RPC |
| Base Mainnet RPC | `https://mainnet.base.org` | No | Live — free public RPC |
| Gnosis Mainnet RPC | `https://rpc.gnosischain.com` | No | Live — free public RPC |
| Ethereum Mainnet RPC | `https://eth.llamarpc.com` | No | Live — free public RPC |
| Arbitrum Mainnet RPC | `https://arb1.arbitrum.io/rpc` | No | Live — free public RPC |
| Optimism Mainnet RPC | `https://mainnet.optimism.io` | No | Live — free public RPC |
| Polygon Mainnet RPC | `https://polygon-rpc.com` | No | Live — free public RPC |

### Development Tools

| Tool | Version | Purpose | Install Command |
|------|---------|---------|----------------|
| Bun | 1.3.10 | Package manager + runtime | `curl -fsSL https://bun.sh/install \| bash` |
| Node.js | 20+ | Runtime (Next.js) | `nvm install 20` |
| Foundry | 1.4.4-stable | Solidity compilation + testing + deployment | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Git | latest | Version control | Pre-installed |

### Accounts & Credentials

| Account | Purpose | How to Get |
|---------|---------|-----------|
| Venice API key | AI inference | Sign up at `venice.ai`, generate API key in dashboard |
| Telegram Bot Token | Bot API access | Message `@BotFather` on Telegram, `/newbot` |
| Base Sepolia ETH | Contract deployment + attestation gas | Faucet: `https://www.alchemy.com/faucets/base-sepolia` |
| Deployer wallet | Sign transactions | Generate with `cast wallet new` or use existing |

### On-Chain Addresses

| Item | Address | Network | Source |
|------|---------|---------|--------|
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | All Sepolia testnets (CREATE2) | EIP-8004 spec |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | All Sepolia testnets (CREATE2) | EIP-8004 spec |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | All Mainnets (CREATE2) | EIP-8004 spec |
| ERC-8004 ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | All Mainnets (CREATE2) | EIP-8004 spec |
| Olas ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | Base Mainnet | Olas docs |
| Olas ServiceRegistryL2 | `0x9338b5153AE39BB89f50468E608eD9d764B755fD` | Gnosis Mainnet | Olas docs |
| AgentBlocklist | TBD — deploy during build | Base Sepolia | Custom contract |

---

## 10. Concerns Compliance

No formal `concerns.md` exists for this project. The following concerns are derived from hackathon requirements, sponsor expectations, and technical constraints:

| # | Severity | Concern | How PRD Addresses It |
|---|:---:|---------|----------------------|
| 1 | C | ERC-8004 integration must use correct function signatures (3 were wrong in research) | Section 4.3 and 5 specify the verified correct functions: tokenURI, getMetadata, getAgentWallet, getClients, getSummary, giveFeedback. All confirmed via technical spike. |
| 2 | C | Venice API key must not be exposed client-side | Section 4.8 specifies server route `/api/analyze`. Section 2 shows Venice calls only from server. NEXT_PUBLIC_ prefix explicitly excluded. |
| 3 | C | Demo must show real onchain interactions, not just a UI | Demo Scenes 4-5 show live attestation publishing on agent's native chain and autonomous loop. Flow 2 and Flow 4 are fully onchain. |
| 4 | C | Project must demonstrate autonomy (judging criterion) | Section 4.11 (Autonomous Loop) runs continuously across all chains. Demo Scene 5 shows multi-chain scanning. The agent acts without human intervention. |
| 5 | C | Must hit at least one sponsor prize track convincingly | Section 1 maps to 3 tracks. ERC-8004 deep integration (Protocol Labs), Venice private inference (Venice), meta-agent concept (Open Track). |
| 6 | C | Multi-chain support must be real, not cosmetic | Section 4.1 (Chain Config) defines 6 chains with verified Blockscout URLs. Section 4.2 (Data Pipeline) parameterizes all calls by chainId. Demo Scene 3 shows auditing an agent on Gnosis specifically. |
| 7 | I | Venice free tier (10 prompts/day) limits development | Section 4.4 constraints specify mock-first strategy. Risk 2 addresses this with caching + pre-computed demo results. |
| 8 | I | Need real agents to audit for demo impact | Risk 6 addresses this: deploy test agents with scripted profiles + use Olas mech addresses on Base and Gnosis. |
| 9 | I | 2 build days is tight for 11 components | Section 8 provides strict priority order. Multi-chain adds ~1-2 hours (chain config map + UI dropdown). Each component is standalone-demoable. Day 3 is buffer + demo only. |
| 10 | I | Blocklist contract must be simple and auditable | Section 4.7 specifies minimal contract (45 lines). Uses battle-tested OpenZeppelin Ownable. No complex logic. |
| 11 | I | Smart input must handle ambiguous inputs gracefully | Section 4.8 specifies auto-detection rules (number → Agent ID, 0x → address, text → name). UI shows detected type hint. Error messages guide user to correct format. |
| 12 | A | Tailwind v4 has different config patterns than v3 | Section 4.8 constraints note this. Greenfield project — no migration. Use `@import tailwindcss` from start. |
| 13 | A | ERC-8004 reverse lookup is event-scanning based (potentially slow across 6 chains) | Section 4.3 constraints specify per-chain caching and incremental `fromBlock` scanning. |
| 14 | A | Venice model IDs are assumed, not verified | Section 4.4 constraints specify runtime verification via `GET /models`. Decision tree in Plan Phase 3. |
| 15 | A | Blockscout instances may have varying reliability across chains | Section 4.11 specifies graceful degradation — skip unavailable chains. Risk 15 addresses this. Base + Gnosis are primary, others are bonus. |
