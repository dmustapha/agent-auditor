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
