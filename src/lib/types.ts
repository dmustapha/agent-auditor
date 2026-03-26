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

export interface AddressInfo {
  readonly isContract: boolean;
  readonly addressType: "EOA" | "contract" | "token" | "proxy";
  readonly implementationAddress: string | null;
  readonly ensName: string | null;
  readonly transactionsCount: number;
}

export interface WalletClassification {
  readonly isDefinitelyContract: boolean;
  readonly isERC4337: boolean;
  readonly humanScore: number; // 0 (definitely agent) to 100 (definitely human)
  readonly signals: readonly string[];
  readonly tier1Decisive: boolean; // true if Tier 1 alone was enough
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
}

// ─── Agent Classification ───────────────────────────────────────────────────

export type AgentType =
  | "KEEPER" | "ORACLE" | "LIQUIDATOR" | "MEV_BOT"
  | "BRIDGE_RELAYER" | "DEX_TRADER" | "GOVERNANCE"
  | "YIELD_OPTIMIZER" | "UNKNOWN";

// ─── Blockscout Response Types ───────────────────────────────────────────────

export interface BlockscoutTransaction {
  readonly hash: string;
  readonly from: { readonly hash: string };
  readonly to: { readonly hash: string } | null;
  readonly value: string;
  readonly gas_used: string;
  readonly gas_limit?: string;
  readonly nonce?: number;
  readonly timestamp: string;
  readonly method: string | null;
  readonly decoded_input: { readonly method_id: string } | null;
  readonly result?: string;
  readonly status?: string;
}

export interface BlockscoutTokenTransfer {
  readonly token: { readonly address: string; readonly symbol: string };
  readonly from: { readonly hash: string };
  readonly to: { readonly hash: string };
  readonly total: { readonly value: string };
  readonly timestamp: string;
}

export interface BlockscoutInternalTx {
  readonly to: { readonly hash: string } | null;
  readonly type: string;
  readonly timestamp: string;
}

export interface BlockscoutPaginatedResponse<T> {
  readonly items: readonly T[];
  readonly next_page_params: { readonly block_number: number; readonly index: number } | null;
}

export interface BlockscoutSmartContract {
  readonly is_verified: boolean;
  readonly name: string | null;
  readonly abi: unknown[] | null;
  readonly source_code: string | null;
}

export interface BlockscoutCoinBalanceHistoryItem {
  readonly block_number: number;
  readonly block_timestamp: string;
  readonly value: string;
}

export interface BlockscoutLog {
  readonly transaction_hash: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly block_timestamp: string;
  readonly address: { readonly hash: string };
}

// ─── Processed Data Types ────────────────────────────────────────────────────

export interface TransactionSummary {
  readonly hash: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly gasUsed: string;
  readonly gasLimit?: string;
  readonly nonce?: number;
  readonly timestamp: number;
  readonly methodId: string;
  readonly success: boolean;
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

// ─── Agent Metrics ──────────────────────────────────────────────────────────

export interface AgentMetrics {
  readonly avgGasPerTx: number;
  readonly totalGasSpentWei: string;
  readonly txFrequencyPerDay: number;
  readonly activeHoursUTC: number[];
  readonly successRate: number;
  readonly uniqueCounterparties: number;
  readonly largestSingleTxWei: string;
  readonly nonceGaps: number;
  readonly firstSeenTimestamp: number | null;
  readonly lastSeenTimestamp: number | null;
  readonly mostCalledContracts: readonly string[];
  readonly agentType: AgentType;
  readonly isERC4337: boolean;
  readonly netFlowETH: string;
  readonly protocolsUsed: readonly string[];
  readonly walletClassification: WalletClassification;
  readonly consistencyScore: number;
}

// ─── Behavioral Profile Types ───────────────────────────────────────────────

export interface LifeEvent {
  readonly date: string; // ISO date
  readonly type: "biggest_gain" | "biggest_loss" | "costliest_failure" | "busiest_day" | "longest_dormancy" | "peak_balance" | "first_action" | "drain_event" | "contract_deployment";
  readonly description: string;
  readonly value?: string; // ETH or token amount
  readonly txHash?: string;
}

export interface ActivityCategory {
  readonly category: "swapping" | "lending" | "borrowing" | "lp_provision" | "staking" | "bridging" | "governance" | "keeper_ops" | "oracle_ops" | "nft_trading" | "transfers" | "contract_creation" | "other";
  readonly percentage: number;
  readonly txCount: number;
  readonly protocols: readonly string[];
}

export interface ResolvedCounterparty {
  readonly address: string;
  readonly name: string | null; // resolved protocol name or null
  readonly txCount: number;
  readonly volumeETH: string;
  readonly direction: "mostly_outbound" | "mostly_inbound" | "balanced";
}

export interface FailedTxAnalysis {
  readonly totalFailed: number;
  readonly totalGasUnitsWasted: string; // gas units (not Wei — no gasPrice available)
  readonly mostCommonReason: string; // inferred from patterns
  readonly worstFailure: { readonly txHash: string; readonly gasUnits: string; readonly date: string } | null;
}

export interface TimezoneFingerprint {
  readonly peakWindowUTC: string; // e.g. "01:00-09:00"
  readonly deadZoneUTC: string; // e.g. "14:00-22:00"
  readonly inference: string; // e.g. "Likely East Asian timezone operator"
  readonly is24x7: boolean; // true = bot with no sleep pattern
}

export interface TokenFlowSummary {
  readonly dominantToken: { readonly symbol: string; readonly txCount: number } | null;
  readonly uniqueTokens: number;
  readonly netDirection: "outbound" | "inbound" | "balanced";
  readonly topTokens: readonly { readonly symbol: string; readonly txCount: number }[];
}

export interface BalanceStory {
  readonly peakBalanceETH: string;
  readonly peakDate: string | null;
  readonly currentBalanceETH: string;
  readonly drawdownFromPeak: string; // percentage like "-82%"
  readonly trend: "accumulating" | "depleting" | "stable" | "volatile";
}

export interface BehavioralProfile {
  readonly lifeEvents: readonly LifeEvent[];
  readonly activityBreakdown: readonly ActivityCategory[];
  readonly topCounterparties: readonly ResolvedCounterparty[];
  readonly failedTxAnalysis: FailedTxAnalysis;
  readonly timezoneFingerprint: TimezoneFingerprint;
  readonly tokenFlowSummary: TokenFlowSummary;
  readonly balanceStory: BalanceStory;
  readonly contractsDeployed: number;
  readonly walletAgeDays: number;
  readonly firstAction: string; // description of first ever tx
  readonly protocolLoyalty: string; // e.g. "94% of swaps through Uniswap V3"
  readonly busiestDay: { readonly date: string; readonly txCount: number } | null;
  readonly longestDormancy: { readonly days: number; readonly from: string; readonly to: string } | null;
}

// ─── Blockscout Enrichment Types ────────────────────────────────────────────

export interface SmartContractData {
  readonly isVerified: boolean;
  readonly name: string | null;
  readonly abi: unknown[] | null;
  readonly sourceCode: string | null;
}

export interface CoinBalancePoint {
  readonly timestamp: number;
  readonly value: string;
  readonly blockNumber: number;
}

export interface EventLog {
  readonly txHash: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly timestamp: number;
  readonly contractAddress: string;
}

// ─── Agent Transaction Data ─────────────────────────────────────────────────

export interface AgentTransactionData {
  readonly address: string;
  readonly chainId: ChainId;
  readonly transactions: readonly TransactionSummary[];
  readonly tokenTransfers: readonly TokenTransfer[];
  readonly contractCalls: readonly ContractCall[];
  readonly computedMetrics?: AgentMetrics;
  readonly smartContractData?: SmartContractData;
  readonly coinBalanceHistory?: CoinBalancePoint[];
  readonly eventLogs?: EventLog[];
  readonly addressInfo?: AddressInfo;
  readonly behavioralProfile?: BehavioralProfile;
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

export interface ProtocolShare {
  readonly protocol: string;
  readonly percentage: number;
  readonly action: string;
}

export interface ActivityProfile {
  readonly primaryActivity: string;
  readonly strategies: readonly string[];
  readonly protocolBreakdown: readonly ProtocolShare[];
  readonly riskBehaviors: readonly string[];
  readonly successMetrics: string;
}

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
  readonly agentType: AgentType;
  readonly behavioralNarrative: string;
  readonly performanceScore: number;
  readonly operationalPattern: {
    readonly avgIntervalHours: number;
    readonly peakHoursUTC: readonly number[];
    readonly consistencyScore: number;
  };
  readonly financialSummary: {
    readonly totalGasSpentETH: string;
    readonly netFlowETH: string;
    readonly largestSingleTxETH: string;
  };
  readonly protocolsUsed: readonly string[];
  readonly funFact: string;
  readonly anomalies: readonly string[];
  readonly isLikelyHumanWallet: boolean;
  readonly walletClassification?: WalletClassification;
  readonly activityProfile?: ActivityProfile;
  // Dossier enrichment fields (locally computed)
  readonly totalTransactions?: number;
  readonly successRate?: number;
  readonly avgGasPerTx?: number;
  readonly nonceGaps?: number;
  readonly firstSeenTimestamp?: number | null;
  readonly lastSeenTimestamp?: number | null;
  readonly mostCalledContracts?: readonly string[];
  readonly uniqueCounterparties?: number;
  readonly txFrequencyPerDay?: number;
  readonly balanceTrend?: "accumulating" | "depleting" | "stable";
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
  readonly [chainId: string]: bigint;
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
  readonly totalTransactionCount?: number;
  readonly walletClassification?: WalletClassification;
  readonly successRate?: number;
  readonly ethPrice?: number;
  readonly attestationTxHash?: string;
  readonly chainResults?: readonly { chainId: string; txCount: number }[];
  readonly chainsScanned?: readonly string[];
  readonly behavioralProfile?: BehavioralProfile;
  readonly ensName?: string | null;
}

export interface AnalyzeErrorResponse {
  readonly error: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly activeChains?: readonly string[];
  readonly transactions?: readonly TransactionSummary[];
}

// ─── UI Types ────────────────────────────────────────────────────────────────

export interface UITrustScore {
  readonly address: string;
  readonly ensName?: string | null;
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
  readonly agentType: AgentType;
  readonly behavioralNarrative: string;
  readonly performanceScore: number;
  readonly operationalPattern: {
    readonly avgIntervalHours: number;
    readonly peakHoursUTC: readonly number[];
    readonly consistencyScore: number;
  };
  readonly financialSummary: {
    readonly totalGasSpentETH: string;
    readonly netFlowETH: string;
    readonly largestSingleTxETH: string;
  };
  readonly protocolsUsed: readonly string[];
  readonly funFact: string;
  readonly anomalies: readonly string[];
  readonly isLikelyHumanWallet: boolean;
  readonly walletClassification?: WalletClassification;
  readonly activityProfile?: ActivityProfile;
  readonly successRate?: number;
  readonly ethPrice?: number;
  // Dossier enrichment
  readonly totalTransactions?: number;
  readonly avgGasPerTx?: number;
  readonly nonceGaps?: number;
  readonly firstSeenTimestamp?: number | null;
  readonly lastSeenTimestamp?: number | null;
  readonly mostCalledContracts?: readonly string[];
  readonly uniqueCounterparties?: number;
  readonly txFrequencyPerDay?: number;
  readonly balanceTrend?: "accumulating" | "depleting" | "stable";
  readonly behavioralProfile?: BehavioralProfile;
}

// ─── Sidebar / localStorage Types ───────────────────────────────────────────

export interface AuditRecord {
  readonly address: string;
  readonly chainId: ChainId;
  readonly score: number;
  readonly recommendation: "SAFE" | "CAUTION" | "BLOCKLIST";
  readonly timestamp: number;
  readonly agentType: AgentType;
}

export interface WatchlistEntry extends AuditRecord {
  readonly pinnedAt: number;
}

export interface ThreatFeedEntry {
  readonly agentAddress: string;
  readonly reason: string;
  readonly blockNumber: bigint;
  readonly txHash: string;
  readonly timestamp: number;
}

export interface SessionStats {
  readonly totalAudited: number;
  readonly bySafe: number;
  readonly byCaution: number;
  readonly byBlocklist: number;
}

// ─── Directory Types ────────────────────────────────────────────────────────

export type SortField = "score" | "activity" | "gas" | "lastActive";

export interface DirectoryAgent {
  readonly address: string;
  readonly chainId: ChainId;
  readonly name: string;
  readonly agentType: AgentType;
  readonly score: number;
  readonly recommendation: "SAFE" | "CAUTION" | "BLOCKLIST";
  readonly behavioralNarrative: string;
  readonly financialSummary: {
    readonly totalGasSpentETH: string;
    readonly netFlowETH: string;
  };
  readonly operationalPattern: {
    readonly peakHoursUTC: readonly number[];
    readonly consistencyScore: number;
  };
  readonly protocolsUsed: readonly string[];
  readonly funFact: string;
  readonly anomalies: readonly string[];
  readonly txCount: number;
  readonly lastActive: number;
  readonly source: "seed" | "erc8004" | "olas" | "live";
}

export interface DirectoryResponse {
  readonly agents: readonly DirectoryAgent[];
  readonly timestamp: number;
}
