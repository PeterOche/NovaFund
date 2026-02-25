// ─────────────────────────────────────────────────────────────────────────────
// Algorithmic Risk Assessment Engine — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type ProjectCategory =
  | "DEFI"
  | "NFT"
  | "GAMING"
  | "INFRASTRUCTURE"
  | "DAO"
  | "SOCIAL"
  | "OTHER";

export type DataSourceType = "ON_CHAIN" | "OFF_CHAIN" | "HYBRID";

// ─── Project Raw Data ─────────────────────────────────────────────────────────

export interface ProjectOnChainData {
  contractAddress?: string;
  chainId: number;
  totalRaised: number;            // in USD
  contributorCount: number;
  averageContribution: number;
  largestContribution: number;    // whale concentration risk
  fundingVelocity: number;        // USD per day
  daysActive: number;
  contractAuditScore?: number;    // 0-100 (if audited)
  hasMultisig: boolean;
  tokenomicsScore?: number;       // 0-100
  liquidityDepth?: number;        // USD in liquidity pools
  onChainActivityScore: number;   // 0-100 (derived from tx history)
}

export interface ProjectOffChainData {
  projectId: string;
  title: string;
  category: ProjectCategory;
  teamSize: number;
  teamExperienceYears: number;    // avg years of relevant experience
  githubCommits?: number;
  githubStars?: number;
  githubContributors?: number;
  twitterFollowers?: number;
  discordMembers?: number;
  whitepaperScore: number;        // 0-100 (completeness / quality)
  roadmapClarity: number;         // 0-100
  partnershipCount: number;
  advisorCount: number;
  advisorQualityScore: number;    // 0-100
  previousProjectsSuccessRate?: number; // 0-1
  legalComplianceScore: number;   // 0-100
  mediaScore: number;             // 0-100 (press/coverage quality)
  sentimentScore: number;         // -1 to 1 (community sentiment)
  fundingGoal: number;            // target in USD
  fundingDeadlineDays: number;
  milestoneCount: number;
  milestoneCompletionRate?: number; // 0-1 for ongoing projects
}

export interface ProjectRawData {
  onChain: ProjectOnChainData;
  offChain: ProjectOffChainData;
  timestamp: number;
}

// ─── Feature Vector ───────────────────────────────────────────────────────────

export interface FeatureVector {
  // Funding momentum features
  fundingCompletionRate: number;        // raised / goal
  fundingVelocityNormalized: number;    // velocity relative to goal
  daysRemainingRatio: number;           // days remaining / total deadline
  contributorConcentrationRisk: number; // Herfindahl index of contributions

  // Team quality features
  teamStrengthScore: number;
  teamExperienceNormalized: number;
  previousSuccessBoost: number;

  // Community & traction features
  communityEngagementScore: number;
  sentimentNormalized: number;
  githubActivityScore: number;
  socialReachScore: number;

  // Technical quality features
  technicalRobustnessScore: number;
  auditSafetyScore: number;
  contractSecurityScore: number;

  // Project quality features
  projectQualityScore: number;
  roadmapScore: number;
  legalRiskScore: number;

  // Market & liquidity features
  liquidityRiskScore: number;
  categoryRiskFactor: number;

  // Composite indicators
  earlyMomentumIndex: number;
  whitepaperQualityNormalized: number;
  advisoryStrengthScore: number;
}

// ─── Risk Factor (Explainability) ─────────────────────────────────────────────

export interface RiskFactor {
  name: string;
  displayName: string;
  category: "FUNDING" | "TEAM" | "TECHNICAL" | "COMMUNITY" | "MARKET" | "LEGAL";
  impact: number;           // -1 to 1 (negative = increases risk, positive = reduces risk)
  weight: number;           // 0-1 (importance in the model)
  currentValue: number;     // normalized 0-1
  benchmark: number;        // average value for successful projects
  description: string;
  recommendation?: string;
}

// ─── Risk Assessment Result ───────────────────────────────────────────────────

export interface RiskScore {
  overall: number;            // 0-100 (100 = safest)
  fundingRisk: number;        // 0-100
  teamRisk: number;           // 0-100
  technicalRisk: number;      // 0-100
  communityRisk: number;      // 0-100
  marketRisk: number;         // 0-100
  legalRisk: number;          // 0-100
}

export interface SuccessPrediction {
  probability: number;          // 0-1
  confidenceInterval: [number, number]; // [lower, upper] at 95% CI
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  modelVersion: string;
}

export interface RiskAssessmentResult {
  projectId: string;
  timestamp: number;
  riskLevel: RiskLevel;
  riskScore: RiskScore;
  successPrediction: SuccessPrediction;
  topRiskFactors: RiskFactor[];
  topStrengths: RiskFactor[];
  explanationSummary: string;
  investorInsights: string[];
  dataSourcesUsed: DataSourceType[];
  assessmentVersion: string;
}

// ─── Monitoring ───────────────────────────────────────────────────────────────

export interface RiskAlert {
  id: string;
  projectId: string;
  timestamp: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  type: RiskAlertType;
  message: string;
  affectedFactors: string[];
  previousScore: number;
  currentScore: number;
  delta: number;
}

export type RiskAlertType =
  | "SCORE_DROP"
  | "SCORE_IMPROVEMENT"
  | "WHALE_CONCENTRATION"
  | "FUNDING_STALL"
  | "COMMUNITY_SENTIMENT_DROP"
  | "GITHUB_INACTIVITY"
  | "SMART_CONTRACT_RISK"
  | "TEAM_CHANGE"
  | "MILESTONE_MISSED"
  | "LIQUIDITY_RISK";

export interface MonitoringSnapshot {
  projectId: string;
  timestamp: number;
  riskScore: number;
  riskLevel: RiskLevel;
  alerts: RiskAlert[];
  deltaFromPrevious?: number;
  trendDirection: "IMPROVING" | "DECLINING" | "STABLE";
  trendStrength: number;  // 0-1
}

export interface MonitoringSession {
  sessionId: string;
  projectId: string;
  startTime: number;
  intervalMs: number;
  snapshots: MonitoringSnapshot[];
  isActive: boolean;
  subscriberCount: number;
}

// ─── Data Pipeline ────────────────────────────────────────────────────────────

export interface DataPipelineConfig {
  onChainRpcUrl?: string;
  offChainApiUrl?: string;
  cacheTtlMs: number;
  maxRetries: number;
  timeoutMs: number;
  privacyMode: boolean;   // enables zero-knowledge / aggregated data only
}

export interface DataFetchResult<T> {
  data: T | null;
  source: DataSourceType;
  fetchedAt: number;
  fromCache: boolean;
  error?: string;
}

// ─── Model Config ─────────────────────────────────────────────────────────────

export interface ModelConfig {
  version: string;
  featureWeights: Record<keyof FeatureVector, number>;
  categoryRiskMultipliers: Record<ProjectCategory, number>;
  riskThresholds: {
    veryLow: number;
    low: number;
    medium: number;
    high: number;
  };
  ensembleWeights: {
    logisticRegression: number;
    gradientBoosting: number;
    randomForest: number;
  };
}
