// ─────────────────────────────────────────────────────────────────────────────
// Explainable AI — SHAP-inspired feature attribution
// Explains WHY a project received its risk score in human-readable terms
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureVector, RiskFactor, RiskScore } from "./types";
import { DEFAULT_MODEL_CONFIG } from "./model";

// Expected (baseline) feature values for an average project
const BASELINE_FEATURES: FeatureVector = {
  fundingCompletionRate:          0.40,
  fundingVelocityNormalized:      0.35,
  daysRemainingRatio:             0.50,
  contributorConcentrationRisk:   0.25,
  teamStrengthScore:              0.50,
  teamExperienceNormalized:       0.40,
  previousSuccessBoost:           0.40,
  communityEngagementScore:       0.40,
  sentimentNormalized:            0.55,
  githubActivityScore:            0.35,
  socialReachScore:               0.35,
  technicalRobustnessScore:       0.45,
  auditSafetyScore:               0.30,
  contractSecurityScore:          0.40,
  projectQualityScore:            0.45,
  roadmapScore:                   0.50,
  legalRiskScore:                 0.30,
  liquidityRiskScore:             0.50,
  categoryRiskFactor:             0.50,
  earlyMomentumIndex:             0.40,
  whitepaperQualityNormalized:    0.45,
  advisoryStrengthScore:          0.40,
};

// Benchmarks for "what a successful project looks like"
const SUCCESS_BENCHMARKS: Partial<FeatureVector> = {
  fundingCompletionRate:          0.80,
  fundingVelocityNormalized:      0.65,
  teamStrengthScore:              0.75,
  communityEngagementScore:       0.70,
  contractSecurityScore:          0.80,
  projectQualityScore:            0.70,
  earlyMomentumIndex:             0.70,
  auditSafetyScore:               0.75,
  legalRiskScore:                 0.15,
  contributorConcentrationRisk:   0.15,
};

interface FactorMeta {
  displayName: string;
  category: RiskFactor["category"];
  isRiskFactor: boolean; // true = higher value means MORE risk
  description: (value: number, delta: number) => string;
  recommendation?: (value: number) => string;
}

const FACTOR_META: Partial<Record<keyof FeatureVector, FactorMeta>> = {
  fundingCompletionRate: {
    displayName: "Funding Progress",
    category: "FUNDING",
    isRiskFactor: false,
    description: (v) => `Project has raised ${Math.round(v * 100)}% of its funding goal.`,
    recommendation: (v) => v < 0.3
      ? "Funding traction is low — consider improving marketing or adjusting the funding goal."
      : v < 0.6
      ? "Moderate funding progress. Stronger community outreach may accelerate momentum."
      : "Strong funding progress. Maintain current momentum.",
  },
  earlyMomentumIndex: {
    displayName: "Early Momentum",
    category: "FUNDING",
    isRiskFactor: false,
    description: (v) => `Early traction composite score: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.4
      ? "Early momentum is weak — high-impact launches and strategic partnerships may help."
      : "Momentum is adequate. Focus on converting community interest to contributions.",
  },
  contributorConcentrationRisk: {
    displayName: "Whale Concentration Risk",
    category: "FUNDING",
    isRiskFactor: true,
    description: (v) => `${Math.round(v * 100)}% of funds from single largest contributor.`,
    recommendation: (v) => v > 0.3
      ? "High concentration risk: a single whale withdrawal could collapse funding. Diversify contributor base."
      : "Concentration risk is acceptable.",
  },
  teamStrengthScore: {
    displayName: "Team Quality",
    category: "TEAM",
    isRiskFactor: false,
    description: (v) => `Team composite score: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.5
      ? "Team score is below average. Consider adding experienced advisors or publicising team credentials."
      : "Team appears solid. Highlight individual credentials for investor confidence.",
  },
  previousSuccessBoost: {
    displayName: "Founders' Track Record",
    category: "TEAM",
    isRiskFactor: false,
    description: (v) => `Founders' historical project success rate: ${Math.round(v * 100)}%.`,
    recommendation: (v) => v < 0.4
      ? "Limited prior success history. Detailed execution roadmap can compensate."
      : "Good track record — strong positive signal for investors.",
  },
  contractSecurityScore: {
    displayName: "Smart Contract Security",
    category: "TECHNICAL",
    isRiskFactor: false,
    description: (v) => `Contract security score: ${Math.round(v * 100)}/100 (audit + multisig).`,
    recommendation: (v) => v < 0.5
      ? "Smart contract security is concerning. A third-party audit is strongly recommended."
      : v < 0.75
      ? "Security is moderate. Consider a reputable audit firm for additional assurance."
      : "Strong security posture.",
  },
  auditSafetyScore: {
    displayName: "Audit Status",
    category: "TECHNICAL",
    isRiskFactor: false,
    description: (v) => v < 0.35
      ? "No audit or low-quality audit detected."
      : `Audit score: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.35
      ? "Critical: contract is unaudited. This dramatically increases investor risk."
      : "Audit coverage is adequate. Ensure audit reports are publicly accessible.",
  },
  communityEngagementScore: {
    displayName: "Community Engagement",
    category: "COMMUNITY",
    isRiskFactor: false,
    description: (v) => `Community activity score: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.4
      ? "Community engagement is low. Regular AMAs, content, and Discord activity can help."
      : "Community engagement is healthy.",
  },
  sentimentNormalized: {
    displayName: "Community Sentiment",
    category: "COMMUNITY",
    isRiskFactor: false,
    description: (v) => {
      const pct = Math.round(v * 100);
      if (pct < 40) return "Community sentiment is predominantly negative.";
      if (pct < 60) return "Community sentiment is neutral.";
      return `Community sentiment is positive (${pct}/100).`;
    },
    recommendation: (v) => v < 0.4
      ? "Negative sentiment detected. Address community concerns transparently and promptly."
      : "Sentiment is positive. Sustain open communication channels.",
  },
  legalRiskScore: {
    displayName: "Legal & Compliance Risk",
    category: "LEGAL",
    isRiskFactor: true,
    description: (v) => `Legal risk score: ${Math.round(v * 100)}/100 (higher = riskier).`,
    recommendation: (v) => v > 0.5
      ? "Significant compliance gaps identified. Engage legal counsel specialising in crypto/token regulation."
      : v > 0.3
      ? "Moderate compliance risk. Review jurisdiction-specific requirements."
      : "Legal posture appears sound.",
  },
  liquidityRiskScore: {
    displayName: "Liquidity Risk",
    category: "MARKET",
    isRiskFactor: true,
    description: (v) => `Liquidity risk: ${Math.round(v * 100)}/100. Low liquidity increases exit difficulty.`,
    recommendation: (v) => v > 0.6
      ? "Low liquidity is a concern for secondary market exits. Consider liquidity mining incentives."
      : "Liquidity appears adequate.",
  },
  projectQualityScore: {
    displayName: "Project Fundamentals",
    category: "MARKET",
    isRiskFactor: false,
    description: (v) => `Overall project quality: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.5
      ? "Project fundamentals need improvement — whitepaper, roadmap, and partnership quality are key."
      : "Strong project fundamentals.",
  },
  githubActivityScore: {
    displayName: "Development Activity",
    category: "TECHNICAL",
    isRiskFactor: false,
    description: (v) => `GitHub activity score: ${Math.round(v * 100)}/100.`,
    recommendation: (v) => v < 0.3
      ? "Low development activity. Consistent commits and open-source engagement build investor trust."
      : "Development activity is healthy.",
  },
};

/**
 * Computes SHAP-inspired marginal contributions for each feature.
 * Uses a simplified additive model: Δcontribution = weight × (value − baseline).
 * Positive contribution = feature is HELPING the project.
 * Negative contribution = feature is HURTING the project.
 */
function computeShapValues(features: FeatureVector): Record<keyof FeatureVector, number> {
  const weights = DEFAULT_MODEL_CONFIG.featureWeights;
  const result = {} as Record<keyof FeatureVector, number>;

  for (const key of Object.keys(features) as Array<keyof FeatureVector>) {
    const w = weights[key] ?? 0;
    const delta = features[key] - (BASELINE_FEATURES[key] ?? 0.5);
    result[key] = w * delta;
  }

  return result;
}

/** Returns the top N risk factors (hurting the project the most) */
export function getTopRiskFactors(features: FeatureVector, n = 5): RiskFactor[] {
  const shap = computeShapValues(features);

  return (Object.keys(FACTOR_META) as Array<keyof FeatureVector>)
    .map((key) => {
      const meta    = FACTOR_META[key]!;
      const value   = features[key];
      const contribution = shap[key]; // negative = hurting
      const benchmark = SUCCESS_BENCHMARKS[key] ?? BASELINE_FEATURES[key] ?? 0.5;

      return {
        name: key,
        displayName: meta.displayName,
        category: meta.category,
        impact: contribution,
        weight: Math.abs(DEFAULT_MODEL_CONFIG.featureWeights[key] ?? 0),
        currentValue: value,
        benchmark,
        description: meta.description(value, contribution),
        recommendation: meta.recommendation ? meta.recommendation(value) : undefined,
      } satisfies RiskFactor;
    })
    // Risk factors = features with negative SHAP (hurting the project)
    .filter((f) => f.impact < 0)
    .sort((a, b) => a.impact - b.impact) // most negative first
    .slice(0, n);
}

/** Returns the top N strengths (helping the project the most) */
export function getTopStrengths(features: FeatureVector, n = 5): RiskFactor[] {
  const shap = computeShapValues(features);

  return (Object.keys(FACTOR_META) as Array<keyof FeatureVector>)
    .map((key) => {
      const meta    = FACTOR_META[key]!;
      const value   = features[key];
      const contribution = shap[key];
      const benchmark = SUCCESS_BENCHMARKS[key] ?? BASELINE_FEATURES[key] ?? 0.5;

      return {
        name: key,
        displayName: meta.displayName,
        category: meta.category,
        impact: contribution,
        weight: Math.abs(DEFAULT_MODEL_CONFIG.featureWeights[key] ?? 0),
        currentValue: value,
        benchmark,
        description: meta.description(value, contribution),
        recommendation: meta.recommendation ? meta.recommendation(value) : undefined,
      } satisfies RiskFactor;
    })
    .filter((f) => f.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, n);
}

/** Generates a human-readable explanation summary */
export function generateExplanationSummary(
  riskScore: RiskScore,
  topRisks: RiskFactor[],
  topStrengths: RiskFactor[],
): string {
  const { overall, fundingRisk, teamRisk, technicalRisk } = riskScore;

  const riskWord =
    overall >= 80 ? "very low risk" :
    overall >= 65 ? "low risk" :
    overall >= 45 ? "moderate risk" :
    overall >= 25 ? "high risk" :
    "very high risk";

  const topRiskName   = topRisks[0]?.displayName   ?? "unknown factor";
  const topStrength   = topStrengths[0]?.displayName ?? "team quality";

  const weakestDomain =
    Math.min(fundingRisk, teamRisk, technicalRisk) === fundingRisk ? "funding momentum" :
    Math.min(fundingRisk, teamRisk, technicalRisk) === teamRisk    ? "team quality"     :
    "technical robustness";

  return (
    `This project is assessed as ${riskWord} (score: ${overall}/100). ` +
    `The primary concern is ${topRiskName.toLowerCase()}, while ${topStrength.toLowerCase()} ` +
    `is the strongest signal. The weakest domain is ${weakestDomain}. ` +
    `Investors should weigh the identified risk factors carefully before committing capital.`
  );
}

/** Generates actionable investor insights */
export function generateInvestorInsights(
  features: FeatureVector,
  riskScore: RiskScore,
  topRisks: RiskFactor[],
): string[] {
  const insights: string[] = [];

  if (riskScore.fundingRisk < 50) {
    insights.push("Funding velocity is below target — project may not reach its goal within the deadline.");
  }

  if (features.contributorConcentrationRisk > 0.35) {
    insights.push(
      `Whale risk: the top contributor holds ${Math.round(features.contributorConcentrationRisk * 100)}% ` +
      `of total funds. Consider setting a max contribution cap.`
    );
  }

  if (features.auditSafetyScore < 0.35) {
    insights.push("Smart contracts have not been independently audited — significant security risk for investors.");
  }

  if (features.sentimentNormalized < 0.45) {
    insights.push("Community sentiment is trending negative. Monitor Discord and Twitter for grievances.");
  }

  if (features.legalRiskScore > 0.5) {
    insights.push("Elevated regulatory/legal risk. Confirm the project has obtained appropriate legal opinions.");
  }

  if (features.teamStrengthScore > 0.7 && features.projectQualityScore > 0.65) {
    insights.push("Strong team and solid project fundamentals — a positive signal for long-term viability.");
  }

  if (riskScore.overall >= 70) {
    insights.push("Overall risk profile is favourable. This project meets baseline quality thresholds.");
  }

  // Add recommendations from top 3 risk factors
  for (const factor of topRisks.slice(0, 3)) {
    if (factor.recommendation) {
      insights.push(factor.recommendation);
    }
  }

  return insights.slice(0, 6); // cap at 6 insights
}
