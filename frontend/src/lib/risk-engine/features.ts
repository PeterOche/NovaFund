// ─────────────────────────────────────────────────────────────────────────────
// Feature Engineering — Transforms raw project data into ML feature vectors
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ProjectRawData,
  FeatureVector,
  ProjectCategory,
} from "./types";

// Category baseline risk multipliers (higher = riskier category historically)
const CATEGORY_RISK: Record<ProjectCategory, number> = {
  INFRASTRUCTURE: 0.20,
  DEFI:           0.45,
  DAO:            0.40,
  GAMING:         0.55,
  NFT:            0.70,
  SOCIAL:         0.50,
  OTHER:          0.60,
};

// Benchmarks derived from historically successful projects
const BENCHMARKS = {
  minContributors:         50,
  goodContributors:        500,
  goodFundingVelocity:     5_000,   // USD/day
  goodGithubCommits:       200,
  goodTwitterFollowers:    10_000,
  goodDiscordMembers:      5_000,
  goodTeamExperience:      5,       // years
  goodAdvisorCount:        3,
  goodPartnershipCount:    2,
  maxWhaleConcentration:   0.3,     // 30% max safe whale holding
};

/** Clamp a value between 0 and 1 */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Sigmoid normalisation for unbounded positive inputs */
function sigmoid(x: number, scale = 1): number {
  return 1 / (1 + Math.exp(-x / scale));
}

/** Log-scaled normalisation — handles wide-range metrics like follower counts */
function logNorm(value: number, reference: number): number {
  if (value <= 0) return 0;
  return clamp01(Math.log1p(value) / Math.log1p(reference));
}

/**
 * Herfindahl-Hirschman Index proxy for concentration risk.
 * We approximate it using the largest single contribution relative to total.
 */
function concentrationRisk(largest: number, total: number): number {
  if (total <= 0) return 1;
  return clamp01(largest / total);
}

/**
 * Extracts a normalised FeatureVector from raw project data.
 * All output values are in [0, 1] unless noted.
 */
export function extractFeatures(raw: ProjectRawData): FeatureVector {
  const { onChain: oc, offChain: off } = raw;

  // ── Funding features ────────────────────────────────────────────────────────
  const fundingCompletionRate = clamp01(oc.totalRaised / (off.fundingGoal || 1));

  const daysRemaining = Math.max(0, off.fundingDeadlineDays - oc.daysActive);
  const daysRemainingRatio = off.fundingDeadlineDays > 0
    ? clamp01(daysRemaining / off.fundingDeadlineDays)
    : 0;

  const fundingVelocityNormalized = logNorm(
    oc.fundingVelocity,
    BENCHMARKS.goodFundingVelocity,
  );

  const contributorConcentrationRisk = concentrationRisk(
    oc.largestContribution,
    oc.totalRaised,
  );

  // ── Team features ────────────────────────────────────────────────────────────
  const teamExperienceNormalized = logNorm(
    oc.daysActive > 0 ? off.teamExperienceYears : 0,
    BENCHMARKS.goodTeamExperience,
  );

  const previousSuccessBoost = off.previousProjectsSuccessRate != null
    ? clamp01(off.previousProjectsSuccessRate)
    : 0.4; // neutral prior when unknown

  const teamStrengthScore = clamp01(
    0.3 * teamExperienceNormalized +
    0.25 * previousSuccessBoost +
    0.25 * clamp01(off.teamSize / 10) +
    0.20 * clamp01(off.advisorQualityScore / 100),
  );

  // ── Community & traction ─────────────────────────────────────────────────────
  const twitterScore   = logNorm(off.twitterFollowers ?? 0, BENCHMARKS.goodTwitterFollowers);
  const discordScore   = logNorm(off.discordMembers   ?? 0, BENCHMARKS.goodDiscordMembers);
  const sentimentNorm  = clamp01((off.sentimentScore + 1) / 2); // map -1..1 → 0..1

  const communityEngagementScore = clamp01(
    0.35 * twitterScore +
    0.35 * discordScore +
    0.30 * sentimentNorm,
  );

  const githubCommitScore      = logNorm(off.githubCommits       ?? 0, BENCHMARKS.goodGithubCommits);
  const githubContributorScore = logNorm(off.githubContributors  ?? 0, 20);
  const githubStarScore        = logNorm(off.githubStars         ?? 0, 500);
  const githubActivityScore    = clamp01(
    0.5 * githubCommitScore + 0.3 * githubContributorScore + 0.2 * githubStarScore,
  );

  const socialReachScore = clamp01(0.6 * twitterScore + 0.4 * discordScore);

  // ── Technical quality ────────────────────────────────────────────────────────
  const auditSafetyScore = oc.contractAuditScore != null
    ? clamp01(oc.contractAuditScore / 100)
    : 0.3; // no audit = penalised

  const contractSecurityScore = clamp01(
    0.6 * auditSafetyScore +
    0.4 * (oc.hasMultisig ? 1 : 0),
  );

  const tokenomicsNorm = oc.tokenomicsScore != null
    ? clamp01(oc.tokenomicsScore / 100)
    : 0.4;

  const technicalRobustnessScore = clamp01(
    0.4 * contractSecurityScore +
    0.3 * githubActivityScore +
    0.3 * tokenomicsNorm,
  );

  // ── Project quality ──────────────────────────────────────────────────────────
  const whitepaperQualityNormalized = clamp01(off.whitepaperScore / 100);
  const roadmapScore = clamp01(off.roadmapClarity / 100);
  const legalRiskScore = 1 - clamp01(off.legalComplianceScore / 100); // inverted: low compliance = high risk

  const advisoryStrengthScore = clamp01(
    0.5 * clamp01(off.advisorCount / BENCHMARKS.goodAdvisorCount) +
    0.5 * clamp01(off.advisorQualityScore / 100),
  );

  const partnershipScore = clamp01(
    off.partnershipCount / (BENCHMARKS.goodPartnershipCount + 1),
  );

  const projectQualityScore = clamp01(
    0.25 * whitepaperQualityNormalized +
    0.20 * roadmapScore +
    0.20 * advisoryStrengthScore +
    0.15 * partnershipScore +
    0.10 * clamp01(off.mediaScore / 100) +
    0.10 * clamp01(off.milestoneCount / 10),
  );

  // ── Market & liquidity ───────────────────────────────────────────────────────
  const liquidityScore = oc.liquidityDepth != null
    ? logNorm(oc.liquidityDepth, 500_000)
    : 0.2;
  const liquidityRiskScore = 1 - liquidityScore;   // inverted: low liquidity = high risk

  const categoryRiskFactor = CATEGORY_RISK[off.category] ?? 0.5;

  // ── Composite / early momentum ───────────────────────────────────────────────
  const earlyMomentumIndex = clamp01(
    0.35 * fundingCompletionRate +
    0.25 * fundingVelocityNormalized +
    0.20 * communityEngagementScore +
    0.20 * clamp01(oc.contributorCount / BENCHMARKS.goodContributors),
  );

  return {
    fundingCompletionRate,
    fundingVelocityNormalized,
    daysRemainingRatio,
    contributorConcentrationRisk,
    teamStrengthScore,
    teamExperienceNormalized,
    previousSuccessBoost,
    communityEngagementScore,
    sentimentNormalized: sentimentNorm,
    githubActivityScore,
    socialReachScore,
    technicalRobustnessScore,
    auditSafetyScore,
    contractSecurityScore,
    projectQualityScore,
    roadmapScore,
    legalRiskScore,
    liquidityRiskScore,
    categoryRiskFactor,
    earlyMomentumIndex,
    whitepaperQualityNormalized,
    advisoryStrengthScore,
  };
}
