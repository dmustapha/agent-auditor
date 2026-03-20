# AgentAuditor — Architecture Document

**Version:** V1
**Date:** 2026-03-19
**Stack:** TypeScript, Next.js 16.2.0, Tailwind 4.2.2, Bun, Solidity (Foundry 1.4.4), viem 2.47.5, openai 6.32.0, grammy 1.41.1
**THIS IS THE SINGLE SOURCE OF TRUTH.** Copy code from this document exactly.

---

## 1. System Overview

### Purpose

AgentAuditor is an autonomous meta-agent that monitors AI agents across 6 EVM chains, analyzes their onchain behavior via Venice private inference, publishes trust attestations to ERC-8004, and maintains a queryable blocklist contract.

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AGENT-AUDITOR MONOREPO                                │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         src/lib/ (Core Logic)                           │    │
│  │                                                                         │    │
│  │  types.ts ─────────────────────── All shared interfaces & types         │    │
│  │      │                                                                  │    │
│  │  chains.ts ────────────────────── 6-chain config map                    │    │
│  │      │                            (Blockscout URLs, RPCs, ERC-8004)     │    │
│  │      │                                                                  │    │
│  │  blockscout.ts ────────────────── Multi-chain Blockscout REST v2        │    │
│  │      │                            (txns, transfers, internal txns)      │    │
│  │      │                                                                  │    │
│  │  erc8004.ts ───────────────────── ERC-8004 Registry Reader              │    │
│  │      │                            (identity, feedback, discovery)       │    │
│  │      │                                                                  │    │
│  │  olas.ts ──────────────────────── Olas ServiceRegistryL2 Discovery      │    │
│  │      │                            (Base + Gnosis only)                  │    │
│  │      │                                                                  │    │
│  │  venice.ts ────────────────────── Venice AI Client                      │    │
│  │      │                            (openai SDK, e2ee, mock mode)         │    │
│  │      │                                                                  │    │
│  │  trust-score.ts ───────────────── Score validation & formatting         │    │
│  │      │                            (attestation, UI, Telegram)           │    │
│  │      │                                                                  │    │
│  │  attestation.ts ───────────────── giveFeedback writer + verification    │    │
│  │      │                                                                  │    │
│  │  resolver.ts ──────────────────── Smart input resolution                │    │
│  │      │                            (Agent ID, address, name, ENS)        │    │
│  │      │                                                                  │    │
│  │  loop.ts ──────────────────────── Autonomous loop orchestrator          │    │
│  │                                   (multi-chain discover→analyze→act)    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐    │
│  │  src/app/ (Next.js)       │  │  contracts/ (Foundry)                    │    │
│  │                           │  │                                          │    │
│  │  layout.tsx               │  │  src/AgentBlocklist.sol                  │    │
│  │  page.tsx (single page)   │  │  test/AgentBlocklist.t.sol              │    │
│  │  globals.css (Tailwind)   │  │  script/DeployBlocklist.s.sol           │    │
│  │  api/analyze/route.ts     │  │  foundry.toml                           │    │
│  │                           │  └──────────────────────────────────────────┘    │
│  │  components/              │                                                  │
│  │    SmartInput.tsx         │  ┌──────────────────────────────────────────┐    │
│  │    ChainSelector.tsx      │  │  src/bot/ (Telegram)                     │    │
│  │    TrustScoreCard.tsx     │  │                                          │    │
│  │    TransactionTable.tsx   │  │  telegram.ts (grammy bot)                │    │
│  │    LoadingState.tsx       │  └──────────────────────────────────────────┘    │
│  └──────────────────────────┘                                                  │
│                                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐    │
│  │  scripts/                 │  │  Config Files                            │    │
│  │  register-agent.ts        │  │  package.json, tsconfig.json             │    │
│  │  run-loop.ts              │  │  next.config.ts, tailwind: in CSS        │    │
│  │  seed-test-agents.ts      │  │  .env.example, .gitignore                │    │
│  └──────────────────────────┘  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘

External Dependencies:
  Blockscout REST v2 ×6 ──── base.blockscout.com, gnosis.blockscout.com, ...
  Venice AI API ──────────── api.venice.ai/api/v1 (OpenAI-compatible)
  ERC-8004 Contracts ×6 ──── 0x8004... (IdentityRegistry + ReputationRegistry)
  Olas ServiceRegistryL2 ×2  Base + Gnosis
  Telegram Bot API ────────── api.telegram.org
  Free Public RPCs ×6 ─────── sepolia.base.org, rpc.gnosischain.com, ...
```

### Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| TypeScript | 5.7+ | Primary language |
| Next.js | 16.2.0 | Frontend framework + API routes |
| Tailwind CSS | 4.2.2 | Styling (v4 — `@import tailwindcss`) |
| Bun | 1.3.10 | Package manager + runtime |
| Solidity | ^0.8.24 | AgentBlocklist smart contract |
| Foundry | 1.4.4-stable | Solidity compilation, testing, deployment |
| viem | 2.47.5 | EVM client (contract reads/writes, RPC) |
| openai | 6.32.0 | Venice AI client (OpenAI-compatible API) |
| grammy | 1.41.1 | Telegram Bot framework |
| OpenZeppelin | 5.x | Ownable for AgentBlocklist |

### File Structure

```
agent-auditor/
├── .env.example
├── .env                          # Created by developer (not committed)
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── contracts/
│   ├── foundry.toml
│   ├── src/
│   │   └── AgentBlocklist.sol
│   ├── test/
│   │   └── AgentBlocklist.t.sol
│   └── script/
│       └── DeployBlocklist.s.sol
├── src/
│   ├── lib/
│   │   ├── types.ts              # All shared types/interfaces
│   │   ├── chains.ts             # 6-chain config map
│   │   ├── blockscout.ts         # Multi-chain Blockscout REST v2 client
│   │   ├── erc8004.ts            # ERC-8004 Registry Reader
│   │   ├── olas.ts               # Olas ServiceRegistryL2 discovery
│   │   ├── venice.ts             # Venice AI client + mock mode
│   │   ├── trust-score.ts        # Score validation & formatting
│   │   ├── attestation.ts        # giveFeedback writer + verification
│   │   ├── resolver.ts           # Smart input resolution
│   │   └── loop.ts               # Autonomous loop orchestrator
│   ├── bot/
│   │   └── telegram.ts           # grammy Telegram bot
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── api/
│   │   │   └── analyze/
│   │   │       └── route.ts      # POST /api/analyze server route
│   │   └── components/
│   │       ├── SmartInput.tsx
│   │       ├── ChainSelector.tsx
│   │       ├── TrustScoreCard.tsx
│   │       ├── TransactionTable.tsx
│   │       └── LoadingState.tsx
│   └── scripts/
│       ├── register-agent.ts     # Self-registration on ERC-8004
│       ├── run-loop.ts           # Start autonomous loop
│       └── seed-test-agents.ts   # Deploy test agents for demo
└── public/
    └── favicon.ico
```

---

## 2. Component Architecture

### Component Table

| # | Component | Type | File Path | Purpose | Dependencies |
|---|-----------|------|-----------|---------|-------------|
| 1 | Shared Types | Module | `src/lib/types.ts` | All TypeScript interfaces and type definitions | None |
| 2 | Chain Config | Module | `src/lib/chains.ts` | 6-chain config map (Blockscout URLs, RPCs, ERC-8004 addresses) | types.ts, viem |
| 3 | Onchain Data Pipeline | Service | `src/lib/blockscout.ts` | Fetch tx data from Blockscout REST v2 on any chain | types.ts, chains.ts |
| 4 | ERC-8004 Registry Reader | Service | `src/lib/erc8004.ts` | Read agent identities, feedback, discover new agents | types.ts, chains.ts, viem |
| 5 | Olas Discovery | Service | `src/lib/olas.ts` | Discover Olas agents on Base + Gnosis | types.ts, chains.ts, viem |
| 6 | Venice Analysis Engine | Service | `src/lib/venice.ts` | Venice AI client with mock mode | types.ts, openai |
| 7 | Trust Score System | Module | `src/lib/trust-score.ts` | Validate, normalize, format trust scores | types.ts |
| 8 | Onchain Attestations | Service | `src/lib/attestation.ts` | Publish trust scores to ERC-8004 ReputationRegistry | types.ts, chains.ts, viem |
| 9 | Smart Input Resolver | Service | `src/lib/resolver.ts` | Resolve Agent ID / address / name / ENS to concrete address+chain | types.ts, chains.ts, erc8004.ts |
| 10 | Autonomous Loop | Orchestrator | `src/lib/loop.ts` | Multi-chain discover→analyze→act cycle | All lib modules |
| 11 | API Route | Server Route | `src/app/api/analyze/route.ts` | POST /api/analyze — server-side Venice calls | resolver.ts, blockscout.ts, erc8004.ts, venice.ts, trust-score.ts |
| 12 | Single-Page UI | Frontend | `src/app/page.tsx` + `components/*` | Smart input + chain selector + score display | API route |
| 13 | Telegram Bot | Service | `src/bot/telegram.ts` | Alerts + /audit command | grammy, resolver.ts, blockscout.ts, venice.ts, trust-score.ts |
| 14 | Blocklist Contract | Smart Contract | `contracts/src/AgentBlocklist.sol` | On-chain blocklist of flagged agents | OpenZeppelin Ownable |
| 15 | Agent Identity | Script | `src/scripts/register-agent.ts` | Register AgentAuditor on ERC-8004 | chains.ts, viem |

### Dependency Graph

```
types.ts
  └── chains.ts
        ├── blockscout.ts
        ├── erc8004.ts
        │     └── resolver.ts
        ├── olas.ts
        ├── attestation.ts
        └── venice.ts
              └── trust-score.ts

loop.ts ──── blockscout.ts + erc8004.ts + olas.ts + venice.ts + trust-score.ts + attestation.ts

API route ── resolver.ts + blockscout.ts + erc8004.ts + venice.ts + trust-score.ts

Telegram ─── resolver.ts + blockscout.ts + venice.ts + trust-score.ts

Frontend ─── API route (fetch)

AgentBlocklist.sol ── standalone (OpenZeppelin Ownable)
register-agent.ts ─── chains.ts + erc8004.ts ABI
```

### Data Flow

```
Input (UI/Telegram/Loop)
  │
  ▼
resolver.ts ── resolve input → { address, chainId }
  │
  ├──▶ blockscout.ts ── fetch txns from chainId's Blockscout → AgentTransactionData
  │
  ├──▶ erc8004.ts ── read identity from chainId's IdentityRegistry → AgentIdentity
  │
  ▼
venice.ts ── send AgentTransactionData to Venice AI → raw JSON
  │
  ▼
trust-score.ts ── validate + format → TrustScore
  │
  ├──▶ attestation.ts ── giveFeedback on chainId's ReputationRegistry → txHash
  │
  ├──▶ AgentBlocklist ── blockAgent on Base (if BLOCKLIST) → txHash
  │
  └──▶ telegram.ts ── send alert (if CAUTION/BLOCKLIST) → message
```

---

## 3. Shared Types

### Purpose

All TypeScript interfaces and types used across the codebase. Single source of truth for data shapes.

### Code

#### File: src/lib/types.ts
[VERIFIED] — Derived from PRD V2 specs + technical spike + ERC-8004 verified functions
```typescript
// ─── Chain Types ─────────────────────────────────────────────────────────────

export type ChainId = "base" | "gnosis" | "ethereum" | "arbitrum" | "optimism" | "polygon";

export interface ChainConfig {
  readonly id: ChainId;
  readonly name: string;
  readonly blockscoutUrl: string;
  readonly rpcUrl: string;
  readonly chainIdNum: number;
  readonly erc8004: {
    readonly identityRegistry: `0x${string}`;
    readonly reputationRegistry: `0x${string}`;
  };
  readonly olasRegistry?: `0x${string}`;
  readonly explorer: string;
}

// ─── Blockscout Response Types ───────────────────────────────────────────────

export interface BlockscoutTransaction {
  readonly hash: string;
  readonly from: { readonly hash: string };
  readonly to: { readonly hash: string } | null;
  readonly value: string;
  readonly gas_used: string;
  readonly timestamp: string;
  readonly method: string | null;
  readonly decoded_input: { readonly method_id: string } | null;
}

export interface BlockscoutTokenTransfer {
  readonly token: { readonly address: string; readonly symbol: string };
  readonly from: { readonly hash: string };
  readonly to: { readonly hash: string };
  readonly total: { readonly value: string };
  readonly timestamp: string;
}

export interface BlockscoutInternalTx {
  readonly to: { readonly hash: string };
  readonly type: string;
  readonly timestamp: string;
}

export interface BlockscoutPaginatedResponse<T> {
  readonly items: readonly T[];
  readonly next_page_params: { readonly block_number: number; readonly index: number } | null;
}

// ─── Processed Data Types ────────────────────────────────────────────────────

export interface TransactionSummary {
  readonly hash: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly gasUsed: string;
  readonly timestamp: number;
  readonly methodId: string;
}

export interface TokenTransfer {
  readonly token: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly timestamp: number;
}

export interface ContractCall {
  readonly contract: string;
  readonly method: string;
  readonly timestamp: number;
}

export interface AgentTransactionData {
  readonly address: string;
  readonly chainId: ChainId;
  readonly transactions: readonly TransactionSummary[];
  readonly tokenTransfers: readonly TokenTransfer[];
  readonly contractCalls: readonly ContractCall[];
}

// ─── ERC-8004 Types ──────────────────────────────────────────────────────────

export interface AgentIdentity {
  readonly agentId: bigint;
  readonly owner: string;
  readonly tokenURI: string;
  readonly metadata: Record<string, string>;
  readonly wallet: string;
  readonly registrationBlock: bigint;
}

export interface FeedbackSummary {
  readonly agentId: bigint;
  readonly clients: readonly string[];
  readonly overallScore: { readonly count: bigint; readonly value: bigint; readonly decimals: number };
  readonly securityScore: { readonly count: bigint; readonly value: bigint; readonly decimals: number };
}

export interface DiscoveredAgent {
  readonly agentId: bigint;
  readonly owner: string;
  readonly blockNumber: bigint;
  readonly chainId: ChainId;
  readonly source: "erc8004" | "olas";
}

// ─── Venice / Trust Score Types ──────────────────────────────────────────────

export interface TrustScore {
  readonly agentAddress: string;
  readonly chainId: ChainId;
  readonly overallScore: number;
  readonly breakdown: {
    readonly transactionPatterns: number;
    readonly contractInteractions: number;
    readonly fundFlow: number;
    readonly behavioralConsistency: number;
  };
  readonly flags: readonly TrustFlag[];
  readonly summary: string;
  readonly recommendation: "SAFE" | "CAUTION" | "BLOCKLIST";
  readonly analysisTimestamp: string;
}

export interface TrustFlag {
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly category: string;
  readonly description: string;
  readonly evidence: string;
}

// ─── Attestation Types ───────────────────────────────────────────────────────

export interface AttestationResult {
  readonly txHash: `0x${string}`;
  readonly chainId: ChainId;
  readonly agentId: bigint;
  readonly value: bigint;
}

// ─── Smart Input Types ───────────────────────────────────────────────────────

export type InputType = "agentId" | "address" | "name" | "ens";

export interface ResolvedInput {
  readonly address: string;
  readonly chainId: ChainId;
  readonly agentId?: bigint;
  readonly resolvedVia: InputType;
}

// ─── Autonomous Loop Types ───────────────────────────────────────────────────

export interface LoopCheckpoint {
  readonly [chainId: string]: bigint; // last processed block per chain
}

export interface LoopStatus {
  readonly running: boolean;
  readonly lastRun: string | null;
  readonly agentsAudited: number;
  readonly checkpoints: LoopCheckpoint;
  readonly nextRun: string | null;
}

export interface AuditResult {
  readonly agent: DiscoveredAgent;
  readonly trustScore: TrustScore;
  readonly attestationTx: `0x${string}` | null;
  readonly blocklistTx: `0x${string}` | null;
  readonly telegramSent: boolean;
}

// ─── Olas Types ──────────────────────────────────────────────────────────────

export enum ServiceState {
  NonExistent = 0,
  PreRegistration = 1,
  ActiveRegistration = 2,
  FinishedRegistration = 3,
  Deployed = 4,
  TerminatedBonded = 5,
}

export interface OlasService {
  readonly serviceId: number;
  readonly owner: string;
  readonly multisig: string;
  readonly state: ServiceState;
  readonly agentInstances: readonly string[];
  readonly numAgentInstances: number;
  readonly chainId: ChainId;
}

// ─── API Route Types ─────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  readonly input: string;
  readonly inputType: InputType;
  readonly chain: ChainId | "all";
}

export interface AnalyzeResponse {
  readonly trustScore: TrustScore;
  readonly agentIdentity: AgentIdentity | null;
  readonly transactions: readonly TransactionSummary[];
}

export interface AnalyzeErrorResponse {
  readonly error: string;
  readonly message: string;
  readonly transactions?: readonly TransactionSummary[];
}

// ─── UI Types ────────────────────────────────────────────────────────────────

export interface UITrustScore {
  readonly address: string;
  readonly chainId: ChainId;
  readonly chainName: string;
  readonly score: number;
  readonly maxScore: number;
  readonly breakdown: {
    readonly label: string;
    readonly value: number;
    readonly max: number;
  }[];
  readonly recommendation: "SAFE" | "CAUTION" | "BLOCKLIST";
  readonly recommendationColor: string;
  readonly flags: readonly TrustFlag[];
  readonly summary: string;
  readonly timestamp: string;
}
```

### Key Decisions

- All types use `readonly` to enforce immutability throughout the codebase
- `ChainId` is a string union (not enum) for simpler serialization in API responses
- `ServiceState` is an enum because it maps to Solidity uint8 values
- Blockscout raw response types are separate from processed types for clean transformation

---

## 4. Chain Config

### Purpose

Static configuration map for all 6 supported EVM chains. Every module that needs chain-specific data imports from here.

### Dependencies

types.ts, viem (for chain objects)

### Code

#### File: src/lib/chains.ts
[VERIFIED] — Blockscout URLs confirmed via spike, ERC-8004 addresses from PRD (CREATE2 vanity), Olas addresses from autonolas-registries config.json
```typescript
import {
  base,
  gnosis,
  mainnet,
  arbitrum,
  optimism,
  polygon,
  baseSepolia,
  gnosisChiado,
  sepolia,
  arbitrumSepolia,
  optimismSepolia,
} from "viem/chains";
import { createPublicClient, http, type Chain } from "viem";
import type { ChainId, ChainConfig } from "./types";

// ─── Use testnet flag from environment ───────────────────────────────────────

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === "true";

// ─── ERC-8004 Contract Addresses (CREATE2 — identical on all chains) ─────────

const ERC8004_MAINNET = {
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`,
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as `0x${string}`,
} as const;

const ERC8004_TESTNET = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`,
} as const;

const ERC8004 = IS_TESTNET ? ERC8004_TESTNET : ERC8004_MAINNET;

// ─── Chain Configurations ────────────────────────────────────────────────────

export const SUPPORTED_CHAINS: Record<ChainId, ChainConfig> = {
  base: {
    id: "base",
    name: "Base",
    blockscoutUrl: "https://base.blockscout.com/api/v2",
    rpcUrl: IS_TESTNET ? "https://sepolia.base.org" : "https://mainnet.base.org",
    chainIdNum: IS_TESTNET ? 84532 : 8453,
    erc8004: ERC8004,
    olasRegistry: "0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE",
    explorer: IS_TESTNET ? "https://sepolia.basescan.org" : "https://basescan.org",
  },
  gnosis: {
    id: "gnosis",
    name: "Gnosis",
    blockscoutUrl: "https://gnosis.blockscout.com/api/v2",
    rpcUrl: "https://rpc.gnosischain.com",
    chainIdNum: 100,
    erc8004: ERC8004,
    olasRegistry: "0x9338b5153AE39BB89f50468E608eD9d764B755fD",
    explorer: "https://gnosisscan.io",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    blockscoutUrl: "https://eth.blockscout.com/api/v2",
    rpcUrl: "https://eth.llamarpc.com",
    chainIdNum: IS_TESTNET ? 11155111 : 1,
    erc8004: ERC8004,
    explorer: IS_TESTNET ? "https://sepolia.etherscan.io" : "https://etherscan.io",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    blockscoutUrl: "https://arbitrum.blockscout.com/api/v2",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    chainIdNum: 42161,
    erc8004: ERC8004,
    explorer: "https://arbiscan.io",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    blockscoutUrl: "https://optimism.blockscout.com/api/v2",
    rpcUrl: "https://mainnet.optimism.io",
    chainIdNum: 10,
    erc8004: ERC8004,
    explorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    blockscoutUrl: "https://polygon.blockscout.com/api/v2",
    rpcUrl: "https://polygon-rpc.com",
    chainIdNum: 137,
    erc8004: ERC8004,
    explorer: "https://polygonscan.com",
  },
} as const;

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return config;
}

export function getAllChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS);
}

export function getAllChainIds(): ChainId[] {
  return Object.keys(SUPPORTED_CHAINS) as ChainId[];
}

// ─── Viem Chain Object Map ───────────────────────────────────────────────────

const VIEM_CHAINS: Record<ChainId, Chain> = {
  base: IS_TESTNET ? baseSepolia : base,
  gnosis: IS_TESTNET ? gnosisChiado : gnosis,
  ethereum: IS_TESTNET ? sepolia : mainnet,
  arbitrum: IS_TESTNET ? arbitrumSepolia : arbitrum,
  optimism: IS_TESTNET ? optimismSepolia : optimism,
  polygon: polygon, // no standard Sepolia for Polygon in viem
};

export function getViemChain(chainId: ChainId): Chain {
  return VIEM_CHAINS[chainId];
}

// ─── Public Client Factory ───────────────────────────────────────────────────

const clientCache = new Map<ChainId, ReturnType<typeof createPublicClient>>();

export function getPublicClient(chainId: ChainId) {
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const config = getChainConfig(chainId);
  const client = createPublicClient({
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });

  clientCache.set(chainId, client);
  return client;
}
```

### Key Decisions

- **Testnet/mainnet toggle via env var** — `NEXT_PUBLIC_USE_TESTNET=true` switches all chains to testnet. ERC-8004 addresses differ between testnet and mainnet.
- **Client caching** — viem public clients are cached per chain to avoid creating new HTTP transports on every call.
- **Olas registry only on Base + Gnosis** — other chains don't have meaningful Olas activity.

---

## 5. AgentBlocklist Smart Contract

### Purpose

On-chain blocklist of flagged agent addresses, deployed on Base. Queryable by any smart contract via `isBlocked()`.

### Dependencies

OpenZeppelin Ownable (v5.x)

### Code

#### File: contracts/src/AgentBlocklist.sol
[VERIFIED] — From technical spike, tested with 12 passing tests
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentBlocklist
/// @notice Maintains a blocklist of agent addresses flagged by AgentAuditor
/// @dev Owner-only writes, public reads. Emits events for indexing.
contract AgentBlocklist is Ownable {
    mapping(address => bool) private _blocked;

    event AgentBlocked(address indexed agent, string reason);
    event AgentUnblocked(address indexed agent);

    constructor() Ownable(msg.sender) {}

    function blockAgent(address agent, string calldata reason) external onlyOwner {
        require(agent != address(0), "Zero address");
        require(!_blocked[agent], "Already blocked");
        _blocked[agent] = true;
        emit AgentBlocked(agent, reason);
    }

    function unblockAgent(address agent) external onlyOwner {
        require(_blocked[agent], "Not blocked");
        _blocked[agent] = false;
        emit AgentUnblocked(agent);
    }

    function isBlocked(address agent) external view returns (bool) {
        return _blocked[agent];
    }

    function blockAgentsBatch(
        address[] calldata agents,
        string calldata reason
    ) external onlyOwner {
        for (uint256 i; i < agents.length; ++i) {
            if (agents[i] != address(0) && !_blocked[agents[i]]) {
                _blocked[agents[i]] = true;
                emit AgentBlocked(agents[i], reason);
            }
        }
    }
}
```

#### File: contracts/test/AgentBlocklist.t.sol
[VERIFIED] — From technical spike, all 12 tests pass
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentBlocklist.sol";

contract AgentBlocklistTest is Test {
    AgentBlocklist blocklist;
    address owner = address(this);
    address agent1 = address(0xA1);
    address agent2 = address(0xA2);
    address nonOwner = address(0xBEEF);

    function setUp() public {
        blocklist = new AgentBlocklist();
    }

    function test_blockAgent() public {
        blocklist.blockAgent(agent1, "Trust score < 40");
        assertTrue(blocklist.isBlocked(agent1));
    }

    function test_unblockAgent() public {
        blocklist.blockAgent(agent1, "Suspicious");
        blocklist.unblockAgent(agent1);
        assertFalse(blocklist.isBlocked(agent1));
    }

    function test_isBlocked_defaultFalse() public view {
        assertFalse(blocklist.isBlocked(agent1));
    }

    function test_blockAgent_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit AgentBlocklist.AgentBlocked(agent1, "Drain pattern");
        blocklist.blockAgent(agent1, "Drain pattern");
    }

    function test_unblockAgent_emitsEvent() public {
        blocklist.blockAgent(agent1, "Test");
        vm.expectEmit(true, false, false, false);
        emit AgentBlocklist.AgentUnblocked(agent1);
        blocklist.unblockAgent(agent1);
    }

    function test_revert_blockZeroAddress() public {
        vm.expectRevert("Zero address");
        blocklist.blockAgent(address(0), "Invalid");
    }

    function test_revert_blockAlreadyBlocked() public {
        blocklist.blockAgent(agent1, "First");
        vm.expectRevert("Already blocked");
        blocklist.blockAgent(agent1, "Second");
    }

    function test_revert_unblockNotBlocked() public {
        vm.expectRevert("Not blocked");
        blocklist.unblockAgent(agent1);
    }

    function test_revert_nonOwnerBlock() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        blocklist.blockAgent(agent1, "Unauthorized");
    }

    function test_revert_nonOwnerUnblock() public {
        blocklist.blockAgent(agent1, "Test");
        vm.prank(nonOwner);
        vm.expectRevert();
        blocklist.unblockAgent(agent1);
    }

    function test_blockBatch() public {
        address[] memory agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;
        blocklist.blockAgentsBatch(agents, "Batch block");
        assertTrue(blocklist.isBlocked(agent1));
        assertTrue(blocklist.isBlocked(agent2));
    }

    function test_blockBatch_skipsZeroAndDuplicates() public {
        blocklist.blockAgent(agent1, "Already");
        address[] memory agents = new address[](3);
        agents[0] = address(0);
        agents[1] = agent1;
        agents[2] = agent2;
        blocklist.blockAgentsBatch(agents, "Batch");
        assertFalse(blocklist.isBlocked(address(0)));
        assertTrue(blocklist.isBlocked(agent2));
    }
}
```

#### File: contracts/script/DeployBlocklist.s.sol
[VERIFIED] — From technical spike
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentBlocklist.sol";

contract DeployBlocklist is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        AgentBlocklist blocklist = new AgentBlocklist();
        console.log("AgentBlocklist deployed:", address(blocklist));

        vm.stopBroadcast();
    }
}
```

#### File: contracts/foundry.toml
[VERIFIED] — Standard Foundry config
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
base_sepolia = "${BASE_SEPOLIA_RPC_URL}"
base_mainnet = "https://mainnet.base.org"

[etherscan]
base_sepolia = { key = "${BASESCAN_API_KEY}", url = "https://api-sepolia.basescan.org/api" }
```

### Key Decisions

- **Minimal contract (42 lines)** — simple, auditable, no upgrade patterns
- **Batch operation** silently skips zero addresses and already-blocked agents (idempotent)
- **Deployed on Base only** — blocklist aggregates flags from all chains into one queryable source

---

## 6. Onchain Data Pipeline (Blockscout)

### Purpose

Fetch transaction data for any address on any supported chain from Blockscout REST API v2. Parameterized by ChainId — same code, different base URL.

### Dependencies

types.ts, chains.ts

### Code

#### File: src/lib/blockscout.ts
[VERIFIED] — Blockscout REST v2 endpoints confirmed via spike, response shapes from official docs
```typescript
import type {
  ChainId,
  AgentTransactionData,
  TransactionSummary,
  TokenTransfer,
  ContractCall,
  BlockscoutTransaction,
  BlockscoutTokenTransfer,
  BlockscoutInternalTx,
  BlockscoutPaginatedResponse,
} from "./types";
import { getChainConfig } from "./chains";

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT_DELAY_MS = 220; // ~4.5 RPS per chain (under 5 RPS limit)
const lastRequestTime = new Map<ChainId, number>();

async function rateLimitedFetch(chainId: ChainId, url: string): Promise<Response> {
  const now = Date.now();
  const lastTime = lastRequestTime.get(chainId) ?? 0;
  const elapsed = now - lastTime;

  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }

  lastRequestTime.set(chainId, Date.now());

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Blockscout ${chainId} ${res.status}: ${url}`);
  }
  return res;
}

// ─── Fetch Functions ─────────────────────────────────────────────────────────

export async function getTransactions(
  chainId: ChainId,
  address: string,
  limit = 50,
): Promise<TransactionSummary[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/transactions?limit=${limit}`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutTransaction> = await res.json();

  return data.items.map((tx) => ({
    hash: tx.hash,
    from: tx.from.hash,
    to: tx.to?.hash ?? "CONTRACT_CREATION",
    value: tx.value,
    gasUsed: tx.gas_used,
    timestamp: new Date(tx.timestamp).getTime(),
    methodId: tx.decoded_input?.method_id ?? tx.method ?? "0x",
  }));
}

export async function getTokenTransfers(
  chainId: ChainId,
  address: string,
  limit = 50,
): Promise<TokenTransfer[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/token-transfers?limit=${limit}`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutTokenTransfer> = await res.json();

  return data.items.map((t) => ({
    token: `${t.token.symbol}:${t.token.address}`,
    from: t.from.hash,
    to: t.to.hash,
    value: t.total.value,
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

export async function getInternalTransactions(
  chainId: ChainId,
  address: string,
  limit = 50,
): Promise<ContractCall[]> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}/internal-transactions?limit=${limit}`;
  const res = await rateLimitedFetch(chainId, url);
  const data: BlockscoutPaginatedResponse<BlockscoutInternalTx> = await res.json();

  return data.items.map((t) => ({
    contract: t.to.hash,
    method: t.type,
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

export async function fetchAgentData(
  chainId: ChainId,
  address: string,
): Promise<AgentTransactionData> {
  const [transactions, tokenTransfers, contractCalls] = await Promise.all([
    getTransactions(chainId, address),
    getTokenTransfers(chainId, address),
    getInternalTransactions(chainId, address),
  ]);

  return { address, chainId, transactions, tokenTransfers, contractCalls };
}

/**
 * Detect which chains have activity for an address.
 * Checks transaction count on each chain via Blockscout counters endpoint.
 * Returns first chain with activity, or null.
 */
export async function detectChainWithActivity(
  address: string,
): Promise<ChainId | null> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const config = getChainConfig(chainId);
      const url = `${config.blockscoutUrl}/addresses/${address}`;
      const res = await rateLimitedFetch(chainId, url);
      const data: { transactions_count?: string } = await res.json();
      if (data.transactions_count && parseInt(data.transactions_count) > 0) {
        return chainId;
      }
    } catch {
      continue; // chain unavailable, skip
    }
  }

  return null;
}
```

### Key Decisions

- **Per-chain rate limiting** — each chain instance gets its own 220ms delay (4.5 RPS, safely under 5 RPS limit)
- **`fetchAgentData` runs 3 fetches in parallel** — they count as separate requests against rate limit but hit the same chain instance
- **`detectChainWithActivity` is sequential** — checking all 6 chains in parallel would be 6 simultaneous requests; sequential respects rate limits and stops at first match

---

## 7. ERC-8004 Registry Reader

### Purpose

Read agent identities, metadata, and existing feedback from ERC-8004 contracts. Discover new agents via `Registered` events. Same contract addresses on all chains via CREATE2.

### Dependencies

types.ts, chains.ts, viem

### Code

#### File: src/lib/erc8004.ts
[VERIFIED] — Function signatures confirmed via PRD Section 5 (post-spike correction: getAgent/agentOf/getAggregatedFeedback DO NOT EXIST)
```typescript
import { decodeAbiParameters, encodeAbiParameters, toHex, fromHex } from "viem";
import type {
  ChainId,
  AgentIdentity,
  FeedbackSummary,
  DiscoveredAgent,
} from "./types";
import { getChainConfig, getPublicClient } from "./chains";

// ─── ABI Fragments ───────────────────────────────────────────────────────────

const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getMetadata",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const IDENTITY_REGISTRY_EVENTS = [
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

const REPUTATION_REGISTRY_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "bytes32" },
      { name: "tag2", type: "bytes32" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "getClients",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getSummary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clients", type: "address[]" },
      { name: "tag1", type: "bytes32" },
      { name: "tag2", type: "bytes32" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int256" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

// ─── Tag Constants ───────────────────────────────────────────────────────────

export const TRUST_TAGS = {
  overall: toHex("trustScore/overall", { size: 32 }),
  security: toHex("trustScore/security", { size: 32 }),
} as const;

// ─── Export ABIs for use by attestation.ts ───────────────────────────────────

export { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI };

// ─── Read Functions ──────────────────────────────────────────────────────────

export async function getAgentIdentity(
  chainId: ChainId,
  agentId: bigint,
): Promise<AgentIdentity> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);
  const registry = config.erc8004.identityRegistry;

  const [tokenURI, wallet, owner] = await Promise.all([
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }) as Promise<string>,
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getAgentWallet",
      args: [agentId],
    }) as Promise<string>,
    client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    }) as Promise<string>,
  ]);

  // Try to read common metadata keys
  let metadata: Record<string, string> = {};
  try {
    const name = await client.readContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getMetadata",
      args: [agentId, "name"],
    }) as string;
    if (name) metadata["name"] = name;
  } catch {
    // metadata key may not exist — not an error
  }

  return {
    agentId,
    owner,
    tokenURI,
    metadata,
    wallet,
    registrationBlock: 0n, // populated by discovery functions
  };
}

/**
 * Find agent ID for an address on a specific chain.
 * Scans Registered events (no reverse lookup function exists on ERC-8004).
 */
export async function findAgentByAddress(
  chainId: ChainId,
  address: string,
): Promise<bigint | null> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  // ERC-8004 deployed recently — use block 0 on testnets, last 500k blocks on mainnet
  // to avoid "block range too large" RPC errors on free endpoints
  const latestBlock = await client.getBlockNumber();
  const safeFromBlock = latestBlock > 500_000n ? latestBlock - 500_000n : 0n;

  const logs = await client.getLogs({
    address: config.erc8004.identityRegistry,
    event: IDENTITY_REGISTRY_EVENTS[0],
    args: { owner: address as `0x${string}` },
    fromBlock: safeFromBlock,
    toBlock: "latest",
  });

  if (logs.length === 0) return null;
  return logs[0].args.agentId ?? null;
}

/**
 * Find agent across all chains. Returns first match.
 * Sequential to respect rate limits (~2-5s worst case).
 */
export async function findAgentAcrossChains(
  address: string,
): Promise<{ chainId: ChainId; agentId: bigint } | null> {
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const agentId = await findAgentByAddress(chainId, address);
      if (agentId !== null) return { chainId, agentId };
    } catch {
      continue; // chain unavailable
    }
  }
  return null;
}

/**
 * Search agents by name across all chains.
 * Searches cached Registered events + metadata for matching names.
 */
export async function searchAgentsByName(
  query: string,
): Promise<{ chainId: ChainId; agentId: bigint; name: string }[]> {
  const results: { chainId: ChainId; agentId: bigint; name: string }[] = [];
  const queryLower = query.toLowerCase();
  const chains: ChainId[] = ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"];

  for (const chainId of chains) {
    try {
      const client = getPublicClient(chainId);
      const config = getChainConfig(chainId);

      // Get total supply to know range
      const totalSupply = await client.readContract({
        address: config.erc8004.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "totalSupply",
      }) as bigint;

      // Search last 50 agents (most recent registrations)
      const searchLimit = totalSupply < 50n ? totalSupply : 50n;
      const startId = totalSupply - searchLimit + 1n;

      for (let id = startId; id <= totalSupply; id += 1n) {
        try {
          const name = await client.readContract({
            address: config.erc8004.identityRegistry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getMetadata",
            args: [id, "name"],
          }) as string;

          if (name && name.toLowerCase().includes(queryLower)) {
            results.push({ chainId, agentId: id, name });
          }
        } catch {
          continue; // agent may not have name metadata
        }
      }
    } catch {
      continue; // chain unavailable
    }
  }

  return results;
}

/**
 * Get aggregated feedback for an agent.
 * Two-step: getClients() → getSummary().
 * (getAggregatedFeedback DOES NOT EXIST on ERC-8004 — verified in spike)
 */
export async function getAgentFeedback(
  chainId: ChainId,
  agentId: bigint,
): Promise<FeedbackSummary> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);
  const reputationRegistry = config.erc8004.reputationRegistry;

  // Step 1: Get all client addresses that have given feedback
  const clients = await client.readContract({
    address: reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "getClients",
    args: [agentId],
  }) as readonly string[];

  if (clients.length === 0) {
    return {
      agentId,
      clients: [],
      overallScore: { count: 0n, value: 0n, decimals: 0 },
      securityScore: { count: 0n, value: 0n, decimals: 0 },
    };
  }

  // Step 2: Get summary for overall and security tags
  const [overallResult, securityResult] = await Promise.all([
    client.readContract({
      address: reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [...clients] as `0x${string}`[], TRUST_TAGS.overall, TRUST_TAGS.overall],
    }) as Promise<readonly [bigint, bigint, number]>,
    client.readContract({
      address: reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, [...clients] as `0x${string}`[], TRUST_TAGS.security, TRUST_TAGS.security],
    }) as Promise<readonly [bigint, bigint, number]>,
  ]);

  return {
    agentId,
    clients: [...clients],
    overallScore: { count: overallResult[0], value: overallResult[1], decimals: overallResult[2] },
    securityScore: { count: securityResult[0], value: securityResult[1], decimals: securityResult[2] },
  };
}

/**
 * Discover newly registered agents on a specific chain since a block number.
 */
export async function discoverNewAgents(
  chainId: ChainId,
  fromBlock: bigint,
): Promise<DiscoveredAgent[]> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  const logs = await client.getLogs({
    address: config.erc8004.identityRegistry,
    event: IDENTITY_REGISTRY_EVENTS[0],
    fromBlock,
    toBlock: "latest",
  });

  return logs.map((log) => ({
    agentId: log.args.agentId!,
    owner: log.args.owner!,
    blockNumber: log.blockNumber,
    chainId,
    source: "erc8004" as const,
  }));
}
```

### Key Decisions

- **No `getAgent()` or `agentOf()` calls** — these functions don't exist on ERC-8004 (spike finding). Use `tokenURI` + `getMetadata` + `getAgentWallet` instead.
- **No `getAggregatedFeedback()`** — doesn't exist. Two-step: `getClients()` then `getSummary()`.
- **Reverse lookup via event scanning** — `findAgentByAddress` scans `Registered` events. Sequential across chains to respect RPC rate limits.
- **Name search searches last 50 agents per chain** — pragmatic limit to avoid scanning entire registries.

---

## 8. Olas Discovery

### Purpose

Discover Olas agents on Base and Gnosis via ServiceRegistryL2. Supplementary to ERC-8004 discovery.

### Dependencies

types.ts, chains.ts, viem

### Code

#### File: src/lib/olas.ts
[ASSUMED] — ABI fragments derived from standard Olas registry patterns. Addresses verified from autonolas-registries config.json. Verify ABI against deployed bytecode.
```typescript
import type { ChainId, OlasService, DiscoveredAgent, ServiceState } from "./types";
import { getPublicClient, getChainConfig } from "./chains";

// ─── ABI Fragments [ASSUMED — verify against deployed bytecode] ──────────────

const SERVICE_REGISTRY_ABI = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getService",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [
      { name: "securityDeposit", type: "uint96" },
      { name: "multisig", type: "address" },
      { name: "configHash", type: "bytes32" },
      { name: "threshold", type: "uint32" },
      { name: "maxNumAgentInstances", type: "uint32" },
      { name: "numAgentInstances", type: "uint32" },
      { name: "state", type: "uint8" },
    ],
  },
  {
    name: "getAgentInstances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [
      { name: "numAgentInstances", type: "uint256" },
      { name: "agentInstances", type: "address[]" },
    ],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const DEPLOY_SERVICE_EVENT = {
  name: "DeployService",
  type: "event" as const,
  inputs: [
    { name: "serviceId", type: "uint256" as const, indexed: true },
    { name: "multisig", type: "address" as const, indexed: false },
  ],
};

// ─── Chains with Olas Registries ─────────────────────────────────────────────

const OLAS_CHAINS: ChainId[] = ["base", "gnosis"];

export function isOlasChain(chainId: ChainId): boolean {
  return OLAS_CHAINS.includes(chainId);
}

// ─── Discovery Functions ─────────────────────────────────────────────────────

/**
 * Discover deployed Olas services via DeployService events since a block.
 * Only works on Base and Gnosis.
 */
export async function discoverOlasAgents(
  chainId: ChainId,
  fromBlock: bigint,
): Promise<DiscoveredAgent[]> {
  const config = getChainConfig(chainId);
  if (!config.olasRegistry) return [];

  const client = getPublicClient(chainId);

  try {
    const logs = await client.getLogs({
      address: config.olasRegistry,
      event: DEPLOY_SERVICE_EVENT,
      fromBlock,
      toBlock: "latest",
    });

    const agents: DiscoveredAgent[] = [];

    for (const log of logs) {
      const serviceId = Number(log.args.serviceId);
      const multisig = log.args.multisig as string;

      // Get agent instance addresses for this service
      try {
        const result = await client.readContract({
          address: config.olasRegistry!,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getAgentInstances",
          args: [BigInt(serviceId)],
        });

        const [, agentInstances] = result as [bigint, readonly string[]];
        if (!Array.isArray(agentInstances)) continue; // Guard against ABI mismatch

        for (const addr of agentInstances) {
          agents.push({
            agentId: BigInt(serviceId),
            owner: addr as `0x${string}`,
            blockNumber: log.blockNumber,
            chainId,
            source: "olas",
          });
        }

        // Also add the multisig itself as a monitorable address
        if (multisig !== "0x0000000000000000000000000000000000000000") {
          agents.push({
            agentId: BigInt(serviceId),
            owner: multisig,
            blockNumber: log.blockNumber,
            chainId,
            source: "olas",
          });
        }
      } catch {
        // Service may have been terminated — skip
        continue;
      }
    }

    return agents;
  } catch {
    // Olas registry unavailable — non-fatal
    console.warn(`[olas] Failed to discover agents on ${chainId}`);
    return [];
  }
}
```

### Key Decisions

- **Olas is supplementary** — if registry fails, we still have ERC-8004 discovery. Non-fatal errors.
- **Event-based discovery** — more efficient than scanning all service IDs.
- **Both agent instances and multisig addresses** are returned as auditable addresses.

---

## 9. Venice Analysis Engine

### Purpose

Send behavioral data to Venice AI for private inference. Returns structured trust scores. Includes mock mode for development (Venice free tier: 10 prompts/day).

### Dependencies

types.ts, openai SDK

### Code

#### File: src/lib/venice.ts
[VERIFIED] — Venice API confirmed via spike. JSON schema mode supported. E2EE available. Model IDs [ASSUMED] — verify at runtime via GET /models.
```typescript
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChainId, AgentTransactionData, TrustScore, TrustFlag } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

// [ASSUMED] Model IDs — verify at runtime via GET /api/v1/models
const PRIMARY_MODEL = "llama-3.3-70b";
const FALLBACK_MODEL = "mistral-31-24b";

// ─── Venice-Specific Parameters ──────────────────────────────────────────────

interface VeniceParameters {
  enable_e2ee?: boolean;
  include_venice_system_prompt?: boolean;
}

// ─── Client Factory ──────────────────────────────────────────────────────────

export function createVeniceClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: VENICE_BASE_URL,
  });
}

// ─── Runtime Model Verification ──────────────────────────────────────────────

export async function listAvailableModels(client: OpenAI): Promise<string[]> {
  const models = await client.models.list();
  return models.data.map((m) => m.id);
}

/**
 * Find the best available model matching our preferences.
 * Falls back through: PRIMARY_MODEL → FALLBACK_MODEL → first llama → first mistral → any model.
 */
export async function resolveModel(client: OpenAI): Promise<string> {
  const available = await listAvailableModels(client);

  if (available.includes(PRIMARY_MODEL)) return PRIMARY_MODEL;
  if (available.includes(FALLBACK_MODEL)) return FALLBACK_MODEL;

  const llama = available.find((m) => m.includes("llama"));
  if (llama) return llama;

  const mistral = available.find((m) => m.includes("mistral"));
  if (mistral) return mistral;

  if (available.length > 0) return available[0];

  throw new Error("No models available on Venice");
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AgentAuditor, an AI security analyst specializing in onchain autonomous agent behavior across EVM chains.

Your task: analyze transaction data for an AI agent address and produce a structured trust score.

ANALYSIS FRAMEWORK:
1. Transaction Patterns (0-25 points)
   - Regular vs erratic timing
   - Gas usage efficiency (wasteful = suspicious)
   - Transaction volume relative to agent type
   - Nonce gaps (skipped transactions)

2. Contract Interactions (0-25 points)
   - Interactions with verified/known-good contracts (+)
   - Interactions with unverified contracts (-)
   - Diversity of protocols used
   - Proxy contract usage patterns

3. Fund Flow Analysis (0-25 points)
   - Fund sources (CEX, bridges, mixers, fresh wallets)
   - Destination analysis (known protocols vs unknown EOAs)
   - Circular fund patterns (wash trading signals)
   - Large sudden transfers

4. Behavioral Consistency (0-25 points)
   - Does onchain behavior match declared agent purpose?
   - Consistency of operations over time
   - Anomalous deviations from baseline
   - Permission escalation patterns

FLAGS:
- CRITICAL: Direct interaction with known exploit contracts, mixer usage, drain patterns
- HIGH: Unverified contract deployment, large unexplained transfers, nonce manipulation
- MEDIUM: Irregular timing, high gas waste, interaction with low-trust addresses
- LOW: Minor deviations, new agent with limited history

RECOMMENDATION:
- SAFE: Score >= 70, no CRITICAL flags
- CAUTION: Score 40-69 OR any HIGH flags
- BLOCKLIST: Score < 40 OR any CRITICAL flags

Respond ONLY with valid JSON matching the provided schema. No markdown, no explanation outside JSON.`;

// ─── JSON Schema for Structured Output ───────────────────────────────────────

const TRUST_SCORE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "trust_score",
    strict: true,
    schema: {
      type: "object",
      properties: {
        agentAddress: { type: "string" },
        overallScore: { type: "number" },
        breakdown: {
          type: "object",
          properties: {
            transactionPatterns: { type: "number" },
            contractInteractions: { type: "number" },
            fundFlow: { type: "number" },
            behavioralConsistency: { type: "number" },
          },
          required: [
            "transactionPatterns",
            "contractInteractions",
            "fundFlow",
            "behavioralConsistency",
          ],
          additionalProperties: false,
        },
        flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
              category: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["severity", "category", "description", "evidence"],
            additionalProperties: false,
          },
        },
        summary: { type: "string" },
        recommendation: { type: "string", enum: ["SAFE", "CAUTION", "BLOCKLIST"] },
        analysisTimestamp: { type: "string" },
      },
      required: [
        "agentAddress",
        "overallScore",
        "breakdown",
        "flags",
        "summary",
        "recommendation",
        "analysisTimestamp",
      ],
      additionalProperties: false,
    },
  },
};

// ─── Analysis Function ───────────────────────────────────────────────────────

export async function analyzeAgent(
  client: OpenAI,
  data: AgentTransactionData,
  model?: string,
): Promise<TrustScore> {
  const modelId = model ?? PRIMARY_MODEL;

  const userMessage = `Analyze this ${data.chainId.toUpperCase()} chain agent:

Address: ${data.address}
Chain: ${data.chainId}
Transaction count: ${data.transactions.length}
Token transfer count: ${data.tokenTransfers.length}
Unique contracts called: ${new Set(data.contractCalls.map((c) => c.contract)).size}

Recent transactions (last 20):
${JSON.stringify(data.transactions.slice(-20), null, 2)}

Token transfers (last 20):
${JSON.stringify(data.tokenTransfers.slice(-20), null, 2)}

Contract interactions (last 20):
${JSON.stringify(data.contractCalls.slice(-20), null, 2)}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let parsed: Record<string, unknown>;

  try {
    // Primary: structured output with json_schema
    const response = await client.chat.completions.create({
      model: modelId,
      messages,
      response_format: TRUST_SCORE_SCHEMA,
      temperature: 0.1,
      max_tokens: 2000,
      // @ts-expect-error venice_parameters not in OpenAI types
      venice_parameters: {
        enable_e2ee: true,
        include_venice_system_prompt: false,
      } satisfies VeniceParameters,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Venice");
    parsed = JSON.parse(content);
  } catch (primaryErr) {
    // Fallback: Venice may reject json_schema mode for some models, or return non-JSON.
    // Retry WITHOUT response_format, relying on system prompt "respond ONLY with valid JSON".
    console.warn("Venice structured output failed, retrying without schema:", primaryErr);
    const fallback = await client.chat.completions.create({
      model: modelId,
      messages,
      temperature: 0.1,
      max_tokens: 2000,
      // @ts-expect-error venice_parameters not in OpenAI types
      venice_parameters: {
        enable_e2ee: true,
        include_venice_system_prompt: false,
      } satisfies VeniceParameters,
    });
    const raw = fallback.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty fallback response from Venice");
    parsed = JSON.parse(raw); // If this also fails, let it throw
  }

  return {
    ...parsed,
    chainId: data.chainId,
  } as TrustScore;
}

// ─── Mock Mode (for development — saves Venice prompts) ──────────────────────

export function createMockTrustScore(
  address: string,
  chainId: ChainId,
  txCount: number,
): TrustScore {
  // Deterministic mock based on address — same input always gives same output
  const addrNum = parseInt(address.slice(2, 10), 16);
  const baseScore = (addrNum % 80) + 10; // 10-89

  const tp = Math.min(25, Math.floor(baseScore * 0.25));
  const ci = Math.min(25, Math.floor(baseScore * 0.28));
  const ff = Math.min(25, Math.floor(baseScore * 0.22));
  const bc = baseScore - tp - ci - ff;

  const flags: TrustFlag[] = [];
  if (baseScore < 40) {
    flags.push({
      severity: "CRITICAL",
      category: "fund_flow",
      description: "Rapid fund draining pattern detected",
      evidence: `${txCount} transactions with decreasing balance trend`,
    });
  }
  if (baseScore < 60) {
    flags.push({
      severity: "HIGH",
      category: "contract_interaction",
      description: "Interaction with unverified contracts",
      evidence: "Multiple calls to unverified contract addresses",
    });
  }

  const recommendation = baseScore >= 70 ? "SAFE" : baseScore >= 40 ? "CAUTION" : "BLOCKLIST";

  return {
    agentAddress: address,
    chainId,
    overallScore: baseScore,
    breakdown: {
      transactionPatterns: tp,
      contractInteractions: ci,
      fundFlow: ff,
      behavioralConsistency: Math.max(0, Math.min(25, bc)),
    },
    flags,
    summary: `Mock analysis: ${recommendation} with score ${baseScore}/100. ${txCount} transactions analyzed on ${chainId}.`,
    recommendation,
    analysisTimestamp: new Date().toISOString(),
  };
}
```

### Key Decisions

- **`@ts-expect-error` for venice_parameters** — OpenAI SDK doesn't type Venice-specific params. This is intentional.
- **Mock mode is deterministic** — same address always produces same score. Critical for testing and demo rehearsal.
- **`resolveModel()` cascading fallback** — PRIMARY → FALLBACK → any llama → any mistral → first available. Handles Venice's dynamic model roster.
- **`strict: true` in JSON schema** — ensures Venice returns exactly the schema we expect.

---

## 10. Trust Score System

### Purpose

Validate trust scores from Venice, normalize breakdown values, and format for attestation/UI/Telegram output.

### Dependencies

types.ts

### Code

#### File: src/lib/trust-score.ts
[VERIFIED] — Formatting logic derived from PRD specs. Attestation value encoding matches ERC-8004 int128/bytes32 types.
```typescript
import { toHex } from "viem";
import type { ChainId, TrustScore, TrustFlag, UITrustScore } from "./types";
import { getChainConfig } from "./chains";

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateTrustScore(raw: unknown): TrustScore {
  const score = raw as Record<string, unknown>;

  if (typeof score.overallScore !== "number" || score.overallScore < 0 || score.overallScore > 100) {
    throw new Error(`Invalid overallScore: ${score.overallScore}`);
  }

  const breakdown = score.breakdown as Record<string, number>;
  for (const key of ["transactionPatterns", "contractInteractions", "fundFlow", "behavioralConsistency"]) {
    if (typeof breakdown[key] !== "number" || breakdown[key] < 0 || breakdown[key] > 25) {
      throw new Error(`Invalid breakdown.${key}: ${breakdown[key]}`);
    }
  }

  const sum = breakdown.transactionPatterns + breakdown.contractInteractions +
    breakdown.fundFlow + breakdown.behavioralConsistency;
  if (Math.abs(sum - (score.overallScore as number)) > 5) {
    throw new Error(`Breakdown sum ${sum} diverges from overallScore ${score.overallScore} by >5`);
  }

  if (!["SAFE", "CAUTION", "BLOCKLIST"].includes(score.recommendation as string)) {
    throw new Error(`Invalid recommendation: ${score.recommendation}`);
  }

  return score as unknown as TrustScore;
}

// ─── Recommendation Logic ────────────────────────────────────────────────────

export function scoreToRecommendation(
  score: number,
  flags: readonly TrustFlag[],
): "SAFE" | "CAUTION" | "BLOCKLIST" {
  const hasCritical = flags.some((f) => f.severity === "CRITICAL");
  if (hasCritical || score < 40) return "BLOCKLIST";

  const hasHigh = flags.some((f) => f.severity === "HIGH");
  if (hasHigh || score < 70) return "CAUTION";

  return "SAFE";
}

// ─── Format for Attestation ──────────────────────────────────────────────────

export function formatForAttestation(score: TrustScore): {
  value: bigint;
  decimals: number;
  tag1: `0x${string}`;
  tag2: `0x${string}`;
} {
  // SAFE → positive int128, CAUTION → zero, BLOCKLIST → negative int128
  let value: bigint;
  if (score.recommendation === "SAFE") {
    value = BigInt(score.overallScore);
  } else if (score.recommendation === "CAUTION") {
    value = 0n; // neutral attestation
  } else {
    value = BigInt(-score.overallScore); // negative for BLOCKLIST
  }

  return {
    value,
    decimals: 0,
    tag1: toHex("trustScore/overall", { size: 32 }),
    tag2: toHex("trustScore/security", { size: 32 }),
  };
}

// ─── Format for Telegram ─────────────────────────────────────────────────────

export function formatForTelegram(score: TrustScore): string {
  const emoji = score.recommendation === "SAFE" ? "✅" :
    score.recommendation === "CAUTION" ? "⚠️" : "🚫";

  const chainConfig = getChainConfig(score.chainId);

  const flagLines = score.flags
    .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
    .map((f) => `  • [${f.severity}] ${f.description}`)
    .join("\n");

  return `${emoji} *AgentAuditor Alert*

*Address:* \`${score.agentAddress}\`
*Chain:* ${chainConfig.name}
*Score:* ${score.overallScore}/100 — *${score.recommendation}*

*Breakdown:*
  Txn Patterns: ${score.breakdown.transactionPatterns}/25
  Contract Int: ${score.breakdown.contractInteractions}/25
  Fund Flow: ${score.breakdown.fundFlow}/25
  Consistency: ${score.breakdown.behavioralConsistency}/25

${flagLines ? `*Flags:*\n${flagLines}\n` : ""}*Summary:* ${score.summary}`;
}

// ─── Format for UI ───────────────────────────────────────────────────────────

export function formatForUI(score: TrustScore): UITrustScore {
  const chainConfig = getChainConfig(score.chainId);

  const recommendationColors: Record<string, string> = {
    SAFE: "#22c55e",
    CAUTION: "#eab308",
    BLOCKLIST: "#ef4444",
  };

  return {
    address: score.agentAddress,
    chainId: score.chainId,
    chainName: chainConfig.name,
    score: score.overallScore,
    maxScore: 100,
    breakdown: [
      { label: "Transaction Patterns", value: score.breakdown.transactionPatterns, max: 25 },
      { label: "Contract Interactions", value: score.breakdown.contractInteractions, max: 25 },
      { label: "Fund Flow", value: score.breakdown.fundFlow, max: 25 },
      { label: "Behavioral Consistency", value: score.breakdown.behavioralConsistency, max: 25 },
    ],
    recommendation: score.recommendation,
    recommendationColor: recommendationColors[score.recommendation],
    flags: score.flags,
    summary: score.summary,
    timestamp: score.analysisTimestamp,
  };
}
```

### Key Decisions

- **Attestation value encoding**: SAFE → positive int128, CAUTION → 0 (neutral), BLOCKLIST → negative int128. Matches ERC-8004's signed int128 field.
- **Validation checks breakdown sum** — catches Venice responses where breakdown doesn't add up to overall score.
- **Telegram formatting uses Markdown** — grammy's default parse mode.

---

## 11. Onchain Attestations

### Purpose

Publish trust scores as ERC-8004 feedback on the agent's native chain. Write blocklist entries on Base.

### Dependencies

types.ts, chains.ts, viem, erc8004.ts (ABIs), trust-score.ts

### Code

#### File: src/lib/attestation.ts
[VERIFIED] — giveFeedback signature confirmed from PRD Section 5. int128/bytes32 encoding from viem docs.
```typescript
import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainId, TrustScore, AttestationResult } from "./types";
import { getChainConfig, getViemChain, getPublicClient } from "./chains";
import { REPUTATION_REGISTRY_ABI, TRUST_TAGS } from "./erc8004";
import { formatForAttestation } from "./trust-score";

// ─── AgentBlocklist ABI (for blocklist writes on Base) ───────────────────────

const AGENT_BLOCKLIST_ABI = [
  {
    name: "blockAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "isBlocked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// ─── Wallet Client Factory ───────────────────────────────────────────────────

function getWalletClient(chainId: ChainId) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY env var required for attestation writes");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const config = getChainConfig(chainId);

  return createWalletClient({
    account,
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });
}

// ─── Publish Attestation ─────────────────────────────────────────────────────

export async function publishAttestation(
  chainId: ChainId,
  agentId: bigint,
  trustScore: TrustScore,
): Promise<AttestationResult> {
  const wallet = getWalletClient(chainId);
  const config = getChainConfig(chainId);
  const { value, decimals, tag1, tag2 } = formatForAttestation(trustScore);

  const feedbackURI = JSON.stringify({
    auditor: "AgentAuditor",
    score: trustScore.overallScore,
    recommendation: trustScore.recommendation,
    chain: chainId,
    timestamp: trustScore.analysisTimestamp,
  });

  const feedbackHash = toHex(
    BigInt(new TextEncoder().encode(feedbackURI).reduce((h, b) => ((h << 5) - h + b) | 0, 0) >>> 0),
    { size: 32 },
  );

  const txHash = await wallet.writeContract({
    address: config.erc8004.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "giveFeedback",
    args: [
      agentId,
      value,
      decimals,
      tag1,
      tag2,
      "https://agentauditor.xyz",   // endpoint
      feedbackURI,
      feedbackHash,
    ],
  });

  return { txHash, chainId, agentId, value };
}

// ─── Verify Attestation ──────────────────────────────────────────────────────

export async function verifyAttestation(
  chainId: ChainId,
  agentId: bigint,
): Promise<boolean> {
  const client = getPublicClient(chainId);
  const config = getChainConfig(chainId);

  try {
    const clients = await client.readContract({
      address: config.erc8004.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getClients",
      args: [agentId],
    }) as readonly string[];

    // Check if our address is in the clients list
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) return false;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return clients.some((c) => c.toLowerCase() === account.address.toLowerCase());
  } catch {
    return false;
  }
}

// ─── Blocklist Operations ────────────────────────────────────────────────────

export async function addToBlocklist(
  agentAddress: string,
  reason: string,
): Promise<`0x${string}`> {
  const blocklistAddress = process.env.BLOCKLIST_CONTRACT_ADDRESS;
  if (!blocklistAddress) throw new Error("BLOCKLIST_CONTRACT_ADDRESS env var required");

  const wallet = getWalletClient("base");

  // Check if already blocked
  const client = getPublicClient("base");
  const alreadyBlocked = await client.readContract({
    address: blocklistAddress as `0x${string}`,
    abi: AGENT_BLOCKLIST_ABI,
    functionName: "isBlocked",
    args: [agentAddress as `0x${string}`],
  });

  if (alreadyBlocked) {
    console.log(`[attestation] ${agentAddress} already on blocklist`);
    return "0x0" as `0x${string}`;
  }

  const txHash = await wallet.writeContract({
    address: blocklistAddress as `0x${string}`,
    abi: AGENT_BLOCKLIST_ABI,
    functionName: "blockAgent",
    args: [agentAddress as `0x${string}`, reason],
  });

  return txHash;
}
```

### Key Decisions

- **Attestation value encoding**: SAFE → `+score`, CAUTION → `0`, BLOCKLIST → `-score` as int128.
- **Blocklist is always on Base** — regardless of which chain the agent was discovered on.
- **`feedbackHash`** — simple hash of the feedbackURI. Not cryptographic — just for deduplication.
- **`verifyAttestation`** checks if our address is in the getClients list, confirming our feedback was recorded.

---

## 12. Smart Input Resolver

### Purpose

Resolve user input (Agent ID, address, name, ENS) to a concrete `{ address, chainId }` pair before analysis.

### Dependencies

types.ts, chains.ts, erc8004.ts, blockscout.ts

### Code

#### File: src/lib/resolver.ts
[VERIFIED] — Resolution logic from PRD Section 5 (resolveInput spec). ENS resolution via viem's built-in.
```typescript
import { normalize } from "viem/ens";
import type { ChainId, InputType, ResolvedInput } from "./types";
import { getPublicClient, getAllChainIds } from "./chains";
import { getAgentIdentity, findAgentByAddress, findAgentAcrossChains, searchAgentsByName } from "./erc8004";
import { detectChainWithActivity } from "./blockscout";

// ─── Input Type Detection ────────────────────────────────────────────────────

export function detectInputType(input: string): InputType {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) return "agentId";
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return "address";
  if (trimmed.endsWith(".eth")) return "ens";
  return "name";
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export async function resolveInput(
  input: string,
  inputType: InputType,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  switch (inputType) {
    case "agentId":
      return resolveAgentId(input, chain);
    case "address":
      return resolveAddress(input, chain);
    case "name":
      return resolveName(input);
    case "ens":
      return resolveENS(input);
  }
}

async function resolveAgentId(
  input: string,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  const agentId = BigInt(input);

  if (chain !== "all") {
    const identity = await getAgentIdentity(chain, agentId);
    return {
      address: identity.wallet,
      chainId: chain,
      agentId,
      resolvedVia: "agentId",
    };
  }

  // Scan chains for this agent ID
  const chains = getAllChainIds();
  for (const chainId of chains) {
    try {
      const identity = await getAgentIdentity(chainId, agentId);
      if (identity.wallet && identity.wallet !== "0x0000000000000000000000000000000000000000") {
        return {
          address: identity.wallet,
          chainId,
          agentId,
          resolvedVia: "agentId",
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Agent ID ${input} not found on any supported chain`);
}

async function resolveAddress(
  input: string,
  chain: ChainId | "all",
): Promise<ResolvedInput> {
  const address = input.toLowerCase();

  if (chain !== "all") {
    // Try to find agent ID on this chain
    const agentId = await findAgentByAddress(chain, address).catch(() => null);
    return {
      address,
      chainId: chain,
      agentId: agentId ?? undefined,
      resolvedVia: "address",
    };
  }

  // Auto-detect chain with activity
  const detectedChain = await detectChainWithActivity(address);
  if (detectedChain) {
    const agentId = await findAgentByAddress(detectedChain, address).catch(() => null);
    return {
      address,
      chainId: detectedChain,
      agentId: agentId ?? undefined,
      resolvedVia: "address",
    };
  }

  // Default to Base if no activity found anywhere
  return {
    address,
    chainId: "base",
    resolvedVia: "address",
  };
}

async function resolveName(input: string): Promise<ResolvedInput> {
  const results = await searchAgentsByName(input);

  if (results.length === 0) {
    throw new Error(`No agent found matching name "${input}" on any supported chain`);
  }

  // Return first match
  const match = results[0];
  const identity = await getAgentIdentity(match.chainId, match.agentId);

  return {
    address: identity.wallet,
    chainId: match.chainId,
    agentId: match.agentId,
    resolvedVia: "name",
  };
}

async function resolveENS(input: string): Promise<ResolvedInput> {
  // ENS resolution happens on Ethereum mainnet
  const client = getPublicClient("ethereum");

  try {
    const address = await client.getEnsAddress({
      name: normalize(input),
    });

    if (!address) {
      throw new Error(`ENS name "${input}" does not resolve to an address`);
    }

    // Once we have the address, detect which chain has activity
    const detectedChain = await detectChainWithActivity(address);

    return {
      address,
      chainId: detectedChain ?? "ethereum",
      resolvedVia: "ens",
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not resolve")) {
      throw error;
    }
    throw new Error(`ENS resolution failed for "${input}"`);
  }
}
```

### Key Decisions

- **`detectInputType` is regex-based** — simple, deterministic, no false positives.
- **Address resolution defaults to Base** if no chain activity found anywhere.
- **Name search returns first match** — UI could show disambiguation in future, but for MVP first match is sufficient.
- **ENS resolves on Ethereum** then auto-detects which chain has activity for the resolved address.

---

## 13. Next.js API Route

### Purpose

Server-side POST `/api/analyze` route. Keeps Venice API key private. Orchestrates resolve → fetch → analyze → respond.

### Dependencies

resolver.ts, blockscout.ts, erc8004.ts, venice.ts, trust-score.ts

### Code

#### File: src/app/api/analyze/route.ts
[VERIFIED] — Next.js 16 App Router route handler pattern
```typescript
import { NextRequest, NextResponse } from "next/server";
import type { ChainId, InputType, AnalyzeRequest, AnalyzeResponse, AnalyzeErrorResponse } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData } from "@/lib/blockscout";
import { getAgentIdentity } from "@/lib/erc8004";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "@/lib/venice";
import { validateTrustScore, formatForUI } from "@/lib/trust-score";

const USE_MOCK = process.env.VENICE_MOCK === "true";

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { input, chain } = body;

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return NextResponse.json(
        { error: "invalid_input", message: "Input is required" } satisfies AnalyzeErrorResponse,
        { status: 400 },
      );
    }

    // 1. Detect input type (or use provided)
    const inputType: InputType = body.inputType ?? detectInputType(input);
    const selectedChain: ChainId | "all" = chain ?? "all";

    // 2. Resolve input to address + chain
    let resolved;
    try {
      resolved = await resolveInput(input, inputType, selectedChain);
    } catch (err) {
      return NextResponse.json(
        {
          error: "agent_not_found",
          message: err instanceof Error ? err.message : `No agent found matching "${input}" on any supported chain.`,
        } satisfies AnalyzeErrorResponse,
        { status: 404 },
      );
    }

    // 3. Fetch onchain data from resolved chain
    const agentData = await fetchAgentData(resolved.chainId, resolved.address);

    // 4. Try to get agent identity (may not be registered on ERC-8004)
    let agentIdentity = null;
    if (resolved.agentId) {
      try {
        agentIdentity = await getAgentIdentity(resolved.chainId, resolved.agentId);
      } catch {
        // Not registered — that's fine
      }
    }

    // 5. Analyze via Venice (or mock)
    let trustScore;
    if (USE_MOCK) {
      trustScore = createMockTrustScore(
        resolved.address,
        resolved.chainId,
        agentData.transactions.length,
      );
    } else {
      const apiKey = process.env.VENICE_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "analysis_unavailable",
            message: "AI analysis unavailable. Raw data returned.",
            transactions: agentData.transactions.slice(0, 20),
          } satisfies AnalyzeErrorResponse,
          { status: 503 },
        );
      }

      const client = createVeniceClient(apiKey);
      const model = await resolveModel(client);
      const rawScore = await analyzeAgent(client, agentData, model);
      trustScore = validateTrustScore(rawScore);
    }

    // 6. Return response
    const response: AnalyzeResponse = {
      trustScore,
      agentIdentity,
      transactions: agentData.transactions.slice(0, 20),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/analyze] Error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: err instanceof Error ? err.message : "Unexpected error",
      } satisfies AnalyzeErrorResponse,
      { status: 500 },
    );
  }
}
```

### Key Decisions

- **`VENICE_MOCK=true` env var** — switches to deterministic mock mode. Critical for development (10 prompts/day limit).
- **Venice API key never leaves server** — only accessed in route handler.
- **`resolveModel()` called per request** — could be cached, but Venice model roster can change. Overhead is one GET /models call.
- **Returns top 20 transactions** — UI doesn't need more for the history table.

---

## 14. Frontend — Single Page UI

### Purpose

Web interface for manual agent audits. Smart input + chain selector → trust score card + transaction table.

### Dependencies

Next.js 16.2.0, Tailwind 4.2.2

### Code

#### File: src/app/globals.css
[VERIFIED] — Tailwind v4 pattern (not v3 @tailwind directives)
```css
@import "tailwindcss";

@theme {
  --color-safe: #22c55e;
  --color-caution: #eab308;
  --color-blocklist: #ef4444;
  --color-surface: #0a0a0a;
  --color-surface-raised: #141414;
  --color-surface-hover: #1a1a1a;
  --color-border: #262626;
  --color-text-primary: #fafafa;
  --color-text-secondary: #a3a3a3;
  --color-accent: #3b82f6;
}
```

#### File: src/app/layout.tsx
[VERIFIED] — Next.js 16 App Router layout
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentAuditor — Trust Scores for AI Agents",
  description: "Autonomous trust evaluation for AI agents across EVM chains",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-text-primary min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
```

#### File: src/app/page.tsx
[VERIFIED] — Main page composing all components
```tsx
"use client";

import { useState } from "react";
import { SmartInput } from "./components/SmartInput";
import { ChainSelector } from "./components/ChainSelector";
import { TrustScoreCard } from "./components/TrustScoreCard";
import { TransactionTable } from "./components/TransactionTable";
import { LoadingState } from "./components/LoadingState";
import type { ChainId, InputType, AnalyzeResponse, AnalyzeErrorResponse, UITrustScore, TransactionSummary } from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    trustScore: UITrustScore;
    transactions: TransactionSummary[];
  } | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainId | "all">("all");

  async function handleAnalyze(input: string, inputType: InputType) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, inputType, chain: selectedChain }),
      });

      if (!res.ok) {
        const errBody: AnalyzeErrorResponse = await res.json();
        setError(errBody.message);
        return;
      }

      const data: AnalyzeResponse = await res.json();

      // Format trust score for UI
      const chainNames: Record<string, string> = {
        base: "Base", gnosis: "Gnosis", ethereum: "Ethereum",
        arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon",
      };

      const recommendationColors: Record<string, string> = {
        SAFE: "#22c55e", CAUTION: "#eab308", BLOCKLIST: "#ef4444",
      };

      const uiScore: UITrustScore = {
        address: data.trustScore.agentAddress,
        chainId: data.trustScore.chainId,
        chainName: chainNames[data.trustScore.chainId] ?? data.trustScore.chainId,
        score: data.trustScore.overallScore,
        maxScore: 100,
        breakdown: [
          { label: "Transaction Patterns", value: data.trustScore.breakdown.transactionPatterns, max: 25 },
          { label: "Contract Interactions", value: data.trustScore.breakdown.contractInteractions, max: 25 },
          { label: "Fund Flow", value: data.trustScore.breakdown.fundFlow, max: 25 },
          { label: "Behavioral Consistency", value: data.trustScore.breakdown.behavioralConsistency, max: 25 },
        ],
        recommendation: data.trustScore.recommendation,
        recommendationColor: recommendationColors[data.trustScore.recommendation],
        flags: data.trustScore.flags,
        summary: data.trustScore.summary,
        timestamp: data.trustScore.analysisTimestamp,
      };

      setResult({
        trustScore: uiScore,
        transactions: [...data.transactions],
      });
    } catch {
      setError("Failed to connect to analysis service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AgentAuditor</h1>
        <p className="mt-2 text-text-secondary">
          Trust scores for AI agents across EVM chains
        </p>
      </header>

      <div className="flex gap-3 mb-8">
        <SmartInput onSubmit={handleAnalyze} disabled={loading} />
        <ChainSelector value={selectedChain} onChange={setSelectedChain} disabled={loading} />
      </div>

      {loading && <LoadingState />}

      {error && (
        <div className="rounded-lg border border-blocklist/30 bg-blocklist/10 p-4 text-blocklist">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <TrustScoreCard score={result.trustScore} />
          <TransactionTable transactions={result.transactions} chainId={result.trustScore.chainId} />
        </div>
      )}
    </main>
  );
}
```

#### File: src/app/components/SmartInput.tsx
[VERIFIED] — Auto-detect input type with visual hint
```tsx
"use client";

import { useState, useCallback } from "react";
import type { InputType } from "@/lib/types";

interface SmartInputProps {
  onSubmit: (input: string, inputType: InputType) => void;
  disabled?: boolean;
}

function detectType(input: string): { type: InputType; hint: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: "name", hint: "" };
  if (/^\d+$/.test(trimmed)) return { type: "agentId", hint: "Agent ID detected" };
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { type: "address", hint: "Address detected" };
  if (trimmed.endsWith(".eth")) return { type: "ens", hint: "ENS name detected" };
  return { type: "name", hint: "Name search" };
}

export function SmartInput({ onSubmit, disabled }: SmartInputProps) {
  const [value, setValue] = useState("");
  const detected = detectType(value);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim(), detected.type);
  }, [value, detected.type, disabled, onSubmit]);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Enter Agent ID, address, or name..."
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-surface-raised px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none disabled:opacity-50"
      />
      {detected.hint && value.trim() && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          {detected.hint}
        </span>
      )}
    </div>
  );
}
```

#### File: src/app/components/ChainSelector.tsx
[VERIFIED] — Dropdown for 6 chains + "All Chains"
```tsx
"use client";

import type { ChainId } from "@/lib/types";

interface ChainSelectorProps {
  value: ChainId | "all";
  onChange: (chain: ChainId | "all") => void;
  disabled?: boolean;
}

const CHAIN_OPTIONS: { value: ChainId | "all"; label: string }[] = [
  { value: "all", label: "All Chains" },
  { value: "base", label: "Base" },
  { value: "gnosis", label: "Gnosis" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "polygon", label: "Polygon" },
];

export function ChainSelector({ value, onChange, disabled }: ChainSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChainId | "all")}
      disabled={disabled}
      className="rounded-lg border border-border bg-surface-raised px-3 py-3 text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
    >
      {CHAIN_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
```

#### File: src/app/components/TrustScoreCard.tsx
[VERIFIED] — Score display with gauge, breakdown bars, recommendation badge, flags
```tsx
"use client";

import type { UITrustScore } from "@/lib/types";

interface TrustScoreCardProps {
  score: UITrustScore;
}

export function TrustScoreCard({ score }: TrustScoreCardProps) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score.score / score.maxScore) * circumference;

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-6">
      {/* Header with chain badge */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-text-secondary font-mono">{score.address}</p>
          <span className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-border bg-surface">
            {score.chainName}
          </span>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-bold"
          style={{
            backgroundColor: `${score.recommendationColor}20`,
            color: score.recommendationColor,
          }}
        >
          {score.recommendation}
        </span>
      </div>

      {/* Score gauge */}
      <div className="flex items-center gap-8 mb-6">
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#262626" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={score.recommendationColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{score.score}</span>
            <span className="text-xs text-text-secondary">/ {score.maxScore}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-3">
          {score.breakdown.map((axis) => (
            <div key={axis.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-secondary">{axis.label}</span>
                <span>{axis.value}/{axis.max}</span>
              </div>
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${(axis.value / axis.max) * 100}%`,
                    backgroundColor: score.recommendationColor,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flags */}
      {score.flags.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Flags</h3>
          <div className="space-y-2">
            {score.flags.map((flag, i) => {
              const severityColors: Record<string, string> = {
                CRITICAL: "text-blocklist border-blocklist/30 bg-blocklist/10",
                HIGH: "text-caution border-caution/30 bg-caution/10",
                MEDIUM: "text-text-secondary border-border bg-surface",
                LOW: "text-text-secondary border-border bg-surface",
              };
              return (
                <div key={i} className={`rounded-lg border p-3 text-sm ${severityColors[flag.severity]}`}>
                  <span className="font-medium">[{flag.severity}]</span> {flag.description}
                  {flag.evidence && (
                    <p className="mt-1 text-xs opacity-70">{flag.evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-text-secondary">{score.summary}</p>
      <p className="mt-2 text-xs text-text-secondary/50">
        Analyzed {new Date(score.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
```

#### File: src/app/components/TransactionTable.tsx
[VERIFIED] — Last 20 transactions with explorer links
```tsx
"use client";

import type { ChainId, TransactionSummary } from "@/lib/types";

interface TransactionTableProps {
  transactions: readonly TransactionSummary[];
  chainId: ChainId;
}

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === "true";

const EXPLORER_URLS: Record<ChainId, string> = IS_TESTNET
  ? {
      base: "https://sepolia.basescan.org",
      gnosis: "https://gnosis-chiado.blockscout.com",
      ethereum: "https://sepolia.etherscan.io",
      arbitrum: "https://sepolia.arbiscan.io",
      optimism: "https://sepolia-optimism.etherscan.io",
      polygon: "https://amoy.polygonscan.com",
    }
  : {
      base: "https://basescan.org",
      gnosis: "https://gnosisscan.io",
      ethereum: "https://etherscan.io",
      arbitrum: "https://arbiscan.io",
      optimism: "https://optimistic.etherscan.io",
      polygon: "https://polygonscan.com",
    };

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatValue(wei: string): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return "0";
  if (eth < 0.001) return "<0.001";
  return eth.toFixed(4);
}

export function TransactionTable({ transactions, chainId }: TransactionTableProps) {
  const explorerBase = EXPLORER_URLS[chainId] ?? EXPLORER_URLS.base;

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 text-center text-text-secondary">
        No transactions found
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-medium text-text-secondary border-b border-border">
        Recent Transactions
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-4 py-2 font-medium">Hash</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium text-right">Value (ETH)</th>
              <th className="px-4 py-2 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.hash} className="border-b border-border/50 hover:bg-surface-hover">
                <td className="px-4 py-2 font-mono">
                  <a
                    href={`${explorerBase}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {truncateHash(tx.hash)}
                  </a>
                </td>
                <td className="px-4 py-2 font-mono text-text-secondary">{truncateHash(tx.from)}</td>
                <td className="px-4 py-2 font-mono text-text-secondary">{truncateHash(tx.to)}</td>
                <td className="px-4 py-2 text-right">{formatValue(tx.value)}</td>
                <td className="px-4 py-2 text-right text-text-secondary">
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

#### File: src/app/components/LoadingState.tsx
[VERIFIED] — Simple loading indicator
```tsx
export function LoadingState() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="mt-3 text-sm text-text-secondary">
        Fetching onchain data and running analysis...
      </p>
    </div>
  );
}
```

### Key Decisions

- **Single page, no client-side routing** — one input, one output. Minimal complexity.
- **Dark theme by default** — judges demo on laptops in conference halls (often dim lighting).
- **SVG gauge for score display** — pure CSS/SVG, no chart library dependency.
- **Tailwind v4 `@theme` for custom colors** — no tailwind.config.ts needed.
- **All components use `"use client"`** — they use hooks (useState, useCallback).

---

## 15. Telegram Bot

### Purpose

Send alerts when risky agents detected. Accept `/audit <input> [chain]` commands.

### Dependencies

grammy, resolver.ts, blockscout.ts, venice.ts, trust-score.ts

### Code

#### File: src/bot/telegram.ts
[VERIFIED] — grammy 1.41.1 long-polling pattern
```typescript
import { Bot, Context } from "grammy";
import type { ChainId } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData } from "@/lib/blockscout";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "@/lib/venice";
import { validateTrustScore, formatForTelegram } from "@/lib/trust-score";

// ─── Bot Setup ───────────────────────────────────────────────────────────────

const VALID_CHAINS = new Set<string>(["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"]);

export function createTelegramBot(token: string) {
  const bot = new Bot(token);
  const alertChannelId = process.env.TELEGRAM_CHANNEL_ID ?? "";

  // /audit <input> [chain]
  bot.command("audit", async (ctx: Context) => {
    const text = ctx.message?.text ?? "";
    const parts = text.replace("/audit", "").trim().split(/\s+/);

    if (parts.length === 0 || !parts[0]) {
      await ctx.reply("Usage: /audit <agent_id | address | name> [chain]\nExample: /audit 42 gnosis");
      return;
    }

    const input = parts[0];
    const chainArg = parts[1]?.toLowerCase();
    const chain: ChainId | "all" = chainArg && VALID_CHAINS.has(chainArg)
      ? (chainArg as ChainId)
      : "all";

    await ctx.reply(`Analyzing ${input}${chain !== "all" ? ` on ${chain}` : " across all chains"}...`);

    try {
      const inputType = detectInputType(input);
      const resolved = await resolveInput(input, inputType, chain);
      const agentData = await fetchAgentData(resolved.chainId, resolved.address);

      let trustScore;
      const useMock = process.env.VENICE_MOCK === "true";

      if (useMock) {
        trustScore = createMockTrustScore(resolved.address, resolved.chainId, agentData.transactions.length);
      } else {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
          await ctx.reply("Venice API key not configured. Cannot analyze.");
          return;
        }
        const client = createVeniceClient(apiKey);
        const model = await resolveModel(client);
        const raw = await analyzeAgent(client, agentData, model);
        trustScore = validateTrustScore(raw);
      }

      await ctx.reply(formatForTelegram(trustScore), { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`Error: ${err instanceof Error ? err.message : "Analysis failed"}`);
    }
  });

  // /status
  bot.command("status", async (ctx: Context) => {
    await ctx.reply("AgentAuditor is running. Use /audit to analyze an agent.");
  });

  // ─── Alert Function (called by autonomous loop) ────────────────────────────

  async function sendAlert(message: string) {
    if (!alertChannelId) {
      console.warn("[telegram] No TELEGRAM_CHANNEL_ID configured, skipping alert");
      return;
    }
    try {
      await bot.api.sendMessage(alertChannelId, message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[telegram] Failed to send alert:", err);
    }
  }

  return { bot, sendAlert };
}
```

### Key Decisions

- **Long polling (not webhooks)** — simpler for hackathon. No need for HTTPS endpoint.
- **`sendAlert` is a standalone function** returned alongside the bot — the autonomous loop calls it directly.
- **Chain parameter is optional** — defaults to "all" (auto-detect).

---

## 16. Autonomous Loop

### Purpose

Orchestrate the full discover → analyze → score → act → verify cycle across all 6 chains.

### Dependencies

All lib modules

### Code

#### File: src/lib/loop.ts
[VERIFIED] — Orchestration logic from PRD Section 4.11
```typescript
import type { ChainId, LoopCheckpoint, LoopStatus, AuditResult, DiscoveredAgent, TrustScore } from "./types";
import { getAllChainIds, getPublicClient } from "./chains";
import { fetchAgentData } from "./blockscout";
import { discoverNewAgents, getAgentIdentity } from "./erc8004";
import { discoverOlasAgents, isOlasChain } from "./olas";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "./venice";
import { validateTrustScore } from "./trust-score";
import { publishAttestation, addToBlocklist } from "./attestation";

// ─── State ───────────────────────────────────────────────────────────────────

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastRun: string | null = null;
let agentsAudited = 0;
const checkpoints: LoopCheckpoint = {};
const auditedAddresses = new Set<string>(); // avoid re-auditing in same session

// ─── Core Loop ───────────────────────────────────────────────────────────────

export async function runOnce(
  sendAlert: (msg: string) => Promise<void>,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const useMock = process.env.VENICE_MOCK === "true";
  const veniceClient = !useMock && process.env.VENICE_API_KEY
    ? createVeniceClient(process.env.VENICE_API_KEY)
    : null;
  const model = veniceClient ? await resolveModel(veniceClient) : null;

  const chains = getAllChainIds();

  for (const chainId of chains) {
    try {
      console.log(`[loop] Scanning ${chainId}...`);

      // Get current block for checkpoint
      const client = getPublicClient(chainId);
      const currentBlock = await client.getBlockNumber();
      const fromBlock = checkpoints[chainId] ?? (currentBlock - 10000n); // last ~10k blocks if no checkpoint

      // Discover new agents from ERC-8004
      const erc8004Agents = await discoverNewAgents(chainId, fromBlock);

      // Discover Olas agents (Base + Gnosis only)
      const olasAgents = isOlasChain(chainId)
        ? await discoverOlasAgents(chainId, fromBlock)
        : [];

      const allAgents = [...erc8004Agents, ...olasAgents];
      console.log(`[loop] ${chainId}: discovered ${allAgents.length} agents`);

      // Analyze each new agent
      for (const agent of allAgents) {
        // Get agent's wallet address
        let agentAddress: string;
        if (agent.source === "erc8004") {
          try {
            const identity = await getAgentIdentity(chainId, agent.agentId);
            agentAddress = identity.wallet;
          } catch {
            agentAddress = agent.owner;
          }
        } else {
          agentAddress = agent.owner; // Olas: multisig is the operational address
        }

        // Skip if already audited this session
        const key = `${chainId}:${agentAddress.toLowerCase()}`;
        if (auditedAddresses.has(key)) continue;
        auditedAddresses.add(key);

        try {
          // Fetch onchain data
          const agentData = await fetchAgentData(chainId, agentAddress);

          // Analyze
          let trustScore: TrustScore;
          if (useMock || !veniceClient || !model) {
            trustScore = createMockTrustScore(agentAddress, chainId, agentData.transactions.length);
          } else {
            const raw = await analyzeAgent(veniceClient, agentData, model);
            trustScore = validateTrustScore(raw);
          }

          console.log(`[loop] ${chainId} ${agentAddress}: ${trustScore.overallScore}/100 ${trustScore.recommendation}`);

          // Act based on recommendation
          let attestationTx: `0x${string}` | null = null;
          let blocklistTx: `0x${string}` | null = null;
          let telegramSent = false;

          // Publish attestation (on agent's native chain)
          try {
            const result = await publishAttestation(chainId, agent.agentId, trustScore);
            attestationTx = result.txHash;
          } catch (err) {
            console.error(`[loop] Attestation failed for ${agentAddress}:`, err);
          }

          // Blocklist + alert for CAUTION and BLOCKLIST
          if (trustScore.recommendation === "BLOCKLIST") {
            try {
              blocklistTx = await addToBlocklist(
                agentAddress,
                `Score: ${trustScore.overallScore}/100 on ${chainId}. ${trustScore.summary}`,
              );
            } catch (err) {
              console.error(`[loop] Blocklist failed for ${agentAddress}:`, err);
            }
          }

          if (trustScore.recommendation !== "SAFE") {
            try {
              const { formatForTelegram } = await import("./trust-score");
              await sendAlert(formatForTelegram(trustScore));
              telegramSent = true;
            } catch (err) {
              console.error(`[loop] Telegram alert failed:`, err);
            }
          }

          results.push({ agent, trustScore, attestationTx, blocklistTx, telegramSent });
          agentsAudited++;
        } catch (err) {
          console.error(`[loop] Failed to audit ${agentAddress} on ${chainId}:`, err);
        }
      }

      // Update checkpoint for this chain
      checkpoints[chainId] = currentBlock;
    } catch (err) {
      console.error(`[loop] Chain ${chainId} scan failed:`, err);
      // Continue to next chain — one failure doesn't stop the loop
    }
  }

  lastRun = new Date().toISOString();
  return results;
}

// ─── Start / Stop ────────────────────────────────────────────────────────────

export function startLoop(
  sendAlert: (msg: string) => Promise<void>,
  intervalMs = 5 * 60 * 1000, // 5 minutes default
) {
  if (running) {
    console.warn("[loop] Already running");
    return;
  }

  running = true;
  console.log(`[loop] Starting autonomous loop (interval: ${intervalMs / 1000}s)`);

  // Run immediately, then on interval
  runOnce(sendAlert).catch((err) => console.error("[loop] Initial run failed:", err));

  intervalHandle = setInterval(() => {
    runOnce(sendAlert).catch((err) => console.error("[loop] Interval run failed:", err));
  }, intervalMs);
}

export function stopLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  running = false;
  console.log("[loop] Stopped");
}

export function getStatus(): LoopStatus {
  return {
    running,
    lastRun,
    agentsAudited,
    checkpoints: { ...checkpoints },
    nextRun: running && lastRun
      ? new Date(new Date(lastRun).getTime() + 5 * 60 * 1000).toISOString()
      : null,
  };
}
```

### Key Decisions

- **Sequential chain scanning** — Base → Gnosis → Ethereum → ... to respect per-chain rate limits.
- **`auditedAddresses` set** prevents re-auditing the same agent in the same session.
- **Per-chain checkpoints** — each chain tracks its own last-processed block number.
- **One failed agent/chain doesn't stop the loop** — wrapped in try/catch at every level.
- **Dynamic import for `formatForTelegram`** — avoids circular dependency (loop.ts imports from trust-score.ts which imports from chains.ts).

---

## 17. Scripts

### Purpose

Standalone scripts for agent self-registration, loop startup, and demo test agent seeding.

### Code

#### File: src/scripts/register-agent.ts
[VERIFIED] — ERC-8004 register() function confirmed in PRD Section 5
```typescript
import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, getViemChain } from "../lib/chains";
import { IDENTITY_REGISTRY_ABI } from "../lib/erc8004";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY required");

  const chainId = "base" as const;
  const config = getChainConfig(chainId);
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const wallet = createWalletClient({
    account,
    chain: getViemChain(chainId),
    transport: http(config.rpcUrl),
  });

  const agentJson = {
    type: "auditor",
    name: "AgentAuditor",
    description: "Autonomous trust evaluation agent for EVM chain AI agents — monitors Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon",
    services: ["audit", "blocklist", "trust-score"],
    supportedChains: ["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"],
    supportedTrust: ["trustScore/overall", "trustScore/security", "trustScore/reliability", "trustScore/quality"],
  };

  // Encode as base64 data URI
  const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(agentJson)).toString("base64")}`;

  console.log("Registering AgentAuditor on ERC-8004 IdentityRegistry...");
  console.log("Chain:", config.name);
  console.log("Registry:", config.erc8004.identityRegistry);
  console.log("Account:", account.address);

  const txHash = await wallet.writeContract({
    address: config.erc8004.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
  });

  console.log("Transaction:", txHash);
  console.log("AgentAuditor registered successfully!");
}

main().catch(console.error);
```

#### File: src/scripts/run-loop.ts
[VERIFIED] — Starts autonomous loop + Telegram bot
```typescript
import { createTelegramBot } from "../bot/telegram";
import { startLoop, getStatus } from "../lib/loop";

async function main() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  let sendAlert: (msg: string) => Promise<void>;

  if (telegramToken) {
    const { bot, sendAlert: alert } = createTelegramBot(telegramToken);
    sendAlert = alert;

    // Start bot (long polling)
    bot.start({
      onStart: () => console.log("[bot] Telegram bot started"),
    });
    console.log("[bot] Telegram bot running");
  } else {
    console.warn("[bot] No TELEGRAM_BOT_TOKEN — alerts will be logged only");
    sendAlert = async (msg) => console.log("[alert]", msg);
  }

  // Start autonomous loop
  const intervalMs = parseInt(process.env.LOOP_INTERVAL_MS ?? "300000"); // default 5 min
  startLoop(sendAlert, intervalMs);

  console.log("[loop] Autonomous loop started");
  console.log("[loop] Status:", JSON.stringify(getStatus(), null, 2));

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch(console.error);
```

#### File: src/scripts/seed-test-agents.ts
[ASSUMED] — Demo helper. Creates test agent profiles for demo recording.
```typescript
/**
 * Seed test agents for demo purposes.
 * This script doesn't deploy real agents — it pre-caches mock analysis results
 * for known addresses so the demo is reliable and repeatable.
 */

import { writeFileSync, mkdirSync } from "fs";
import { createMockTrustScore } from "../lib/venice";
import type { ChainId } from "../lib/types";

interface TestAgent {
  name: string;
  address: string;
  chainId: ChainId;
  expectedScore: "high" | "medium" | "low";
}

// Pre-selected addresses with known transaction patterns
const TEST_AGENTS: TestAgent[] = [
  {
    name: "Safe Olas Agent",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: "gnosis",
    expectedScore: "high",
  },
  {
    name: "Suspicious Agent",
    address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    chainId: "base",
    expectedScore: "medium",
  },
  {
    name: "Malicious Drainer",
    address: "0x0000000000000000000000000000000000000bad",
    chainId: "base",
    expectedScore: "low",
  },
];

function main() {
  mkdirSync(".demo-cache", { recursive: true });

  for (const agent of TEST_AGENTS) {
    const score = createMockTrustScore(agent.address, agent.chainId, 50);
    const cacheKey = `${agent.chainId}-${agent.address}`;
    writeFileSync(
      `.demo-cache/${cacheKey}.json`,
      JSON.stringify({ agent, score }, null, 2),
    );
    console.log(`Cached: ${agent.name} → ${score.overallScore}/100 ${score.recommendation}`);
  }

  console.log(`\nSeeded ${TEST_AGENTS.length} test agents to .demo-cache/`);
}

main();
```

---

## 18. Configuration Reference

### Environment Variables

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|:---:|
| `NEXT_PUBLIC_USE_TESTNET` | Use testnet chains (Sepolia etc.) | `true` | Yes |
| `VENICE_API_KEY` | Venice AI API key | `vnce_...` | Yes (prod) |
| `VENICE_MOCK` | Use mock Venice responses | `true` | No (dev) |
| `PRIVATE_KEY` | Deployer wallet private key (0x-prefixed) | `0xabc...` | Yes |
| `BLOCKLIST_CONTRACT_ADDRESS` | Deployed AgentBlocklist address | `0x...` | Yes (after deploy) |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather token | `123456:ABC...` | No |
| `TELEGRAM_CHANNEL_ID` | Channel ID for alerts | `@agentauditor_alerts` | No |
| `LOOP_INTERVAL_MS` | Autonomous loop interval | `300000` | No (default 5min) |
| `BASE_SEPOLIA_RPC_URL` | Override Base Sepolia RPC | `https://sepolia.base.org` | No |

### Config Files

#### File: .env.example
[VERIFIED] — All vars from above
```bash
# Network
NEXT_PUBLIC_USE_TESTNET=true

# Venice AI
VENICE_API_KEY=
VENICE_MOCK=true

# Wallet
PRIVATE_KEY=0x

# Contracts (set after deployment)
BLOCKLIST_CONTRACT_ADDRESS=

# Telegram (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=

# Loop (optional)
LOOP_INTERVAL_MS=300000
```

#### File: package.json
[VERIFIED] — All dependency versions from forge state version pins
```json
{
  "name": "agent-auditor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "loop": "bun run src/scripts/run-loop.ts",
    "register": "bun run src/scripts/register-agent.ts",
    "seed": "bun run src/scripts/seed-test-agents.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "grammy": "1.41.1",
    "next": "16.2.0",
    "openai": "6.32.0",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "viem": "2.47.5"
  },
  "devDependencies": {
    "@types/node": "22.15.0",
    "@types/react": "19.1.0",
    "@types/react-dom": "19.1.0",
    "tailwindcss": "4.2.2",
    "typescript": "5.8.3"
  }
}
```

#### File: tsconfig.json
[VERIFIED] — Next.js 16 standard config with path aliases
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "contracts"]
}
```

#### File: next.config.ts
[VERIFIED] — Minimal Next.js 16 config
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack is default in dev via --turbopack flag
  },
};

export default nextConfig;
```

#### File: .gitignore
[VERIFIED] — Standard Next.js + Foundry ignores
```
# Dependencies
node_modules/

# Next.js
.next/
out/

# Environment
.env
.env.local

# Foundry
contracts/out/
contracts/cache/
contracts/lib/

# Demo
.demo-cache/

# Misc
.DS_Store
*.tsbuildinfo
```

---

## 19. Testing Strategy

### Test Files

| Test File | Tests | Command |
|-----------|-------|---------|
| `contracts/test/AgentBlocklist.t.sol` | All 12 contract tests (block, unblock, batch, access control, events) | `cd contracts && forge test -vvv` |

### Critical Tests (must pass before deployment)

1. **AgentBlocklist: all 12 tests** — verifies contract correctness
2. **Smoke test: Base Sepolia RPC** — `cast block-number --rpc-url $BASE_SEPOLIA_RPC_URL`
3. **Smoke test: Blockscout API** — `curl -s 'https://base.blockscout.com/api/v2/stats' | jq '.total_transactions'`
4. **Smoke test: Venice API** — `curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer $VENICE_API_KEY' https://api.venice.ai/api/v1/models`
5. **Smoke test: ERC-8004** — `cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e 'name()(string)' --rpc-url $BASE_SEPOLIA_RPC_URL`
6. **TypeScript typecheck** — `bun run typecheck`

---

## 20. Deployment Sequence

| Step | Action | Command | Verify |
|:---:|--------|---------|--------|
| 1 | Install dependencies | `bun install` | No errors, lock file created |
| 2 | Install Foundry deps | `cd contracts && forge install OpenZeppelin/openzeppelin-contracts --no-commit` | `lib/` populated |
| 3 | Run contract tests | `cd contracts && forge test -vvv` | 12/12 pass |
| 4 | Deploy AgentBlocklist | `cd contracts && forge script script/DeployBlocklist.s.sol:DeployBlocklist --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast` | Address logged |
| 5 | Record blocklist address | Add to `.env` as `BLOCKLIST_CONTRACT_ADDRESS` | `cast call $ADDR 'isBlocked(address)(bool)' 0x0000000000000000000000000000000000000001 --rpc-url $BASE_SEPOLIA_RPC_URL` returns `false` |
| 6 | Register AgentAuditor | `bun run register` | Transaction hash logged |
| 7 | Start dev server | `bun run dev` | UI at localhost:3000 |
| 8 | Start autonomous loop | `bun run loop` (separate terminal) | Loop scanning output |

### Dependencies

- Step 4 must complete before Step 5 (need deployed address)
- Step 5 must complete before Step 8 (loop needs blocklist address)
- Step 6 can run in parallel with Steps 7-8

---

## 21. Addresses & External References

### On-Chain Addresses

| Item | Address | Network |
|------|---------|---------|
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | All Sepolia testnets |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | All Sepolia testnets |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | All Mainnets |
| ERC-8004 ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | All Mainnets |
| Olas ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | Base Mainnet |
| Olas ServiceRegistryL2 | `0x9338b5153AE39BB89f50468E608eD9d764B755fD` | Gnosis Mainnet |
| AgentBlocklist | DEPLOY_AND_RECORD_ADDRESS_HERE | Base Sepolia |

### API Endpoints

| Service | URL | Auth |
|---------|-----|------|
| Venice AI | `https://api.venice.ai/api/v1` | Bearer token |
| Blockscout (Base) | `https://base.blockscout.com/api/v2` | None |
| Blockscout (Gnosis) | `https://gnosis.blockscout.com/api/v2` | None |
| Blockscout (Ethereum) | `https://eth.blockscout.com/api/v2` | None |
| Blockscout (Arbitrum) | `https://arbitrum.blockscout.com/api/v2` | None |
| Blockscout (Optimism) | `https://optimism.blockscout.com/api/v2` | None |
| Blockscout (Polygon) | `https://polygon.blockscout.com/api/v2` | None |
| Telegram Bot | `https://api.telegram.org/bot{TOKEN}` | Token in URL |

### EIP/Standard References

| Standard | Used For | Key Types |
|----------|---------|-----------|
| ERC-8004 | Agent identity + reputation | IdentityRegistry, ReputationRegistry, int128 feedback values |
| ERC-721 | Agent NFTs (IdentityRegistry inherits) | tokenURI, ownerOf, totalSupply |
