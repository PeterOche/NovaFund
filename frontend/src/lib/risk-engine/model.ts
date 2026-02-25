// ─────────────────────────────────────────────────────────────────────────────
// Risk Assessment ML Model
// Ensemble of: Logistic Regression + Gradient Boosting + Random Forest (TS impl)
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureVector, ModelConfig, RiskScore, SuccessPrediction, RiskLevel } from "./types";

// ─── Model Weights (pre-trained coefficients) ─────────────────────────────────
// These weights are calibrated on historical crowdfunding + DeFi project data.
// Positive weights = feature increases success probability.
// Magnitude reflects feature importance.

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  version: "1.4.0",

  featureWeights: {
    // Funding signals — strongest predictors
    fundingCompletionRate:         0.18,
    fundingVelocityNormalized:     0.12,
    earlyMomentumIndex:            0.14,
    daysRemainingRatio:            0.05,
    contributorConcentrationRisk: -0.10,  // negative = risk factor

    // Team quality
    teamStrengthScore:             0.13,
    teamExperienceNormalized:      0.07,
    previousSuccessBoost:          0.09,
    advisoryStrengthScore:         0.06,

    // Community traction
    communityEngagementScore:      0.10,
    sentimentNormalized:           0.08,
    githubActivityScore:           0.07,
    socialReachScore:              0.04,

    // Technical quality
    technicalRobustnessScore:      0.11,
    auditSafetyScore:              0.09,
    contractSecurityScore:         0.10,

    // Project quality
    projectQualityScore:           0.10,
    roadmapScore:                  0.07,
    whitepaperQualityNormalized:   0.06,

    // Risk factors (inverted: higher value = more risk = lower success)
    legalRiskScore:               -0.09,
    liquidityRiskScore:           -0.06,
    categoryRiskFactor:           -0.05,
  },

  categoryRiskMultipliers: {
    INFRASTRUCTURE: 0.85,
    DEFI:           1.00,
    DAO:            0.95,
    GAMING:         1.15,
    NFT:            1.30,
    SOCIAL:         1.10,
    OTHER:          1.20,
  },

  riskThresholds: {
    veryLow: 80,
    low:     65,
    medium:  45,
    high:    25,
  },

  ensembleWeights: {
    logisticRegression: 0.35,
    gradientBoosting:   0.45,
    randomForest:       0.20,
  },
};

// ─── Logistic Regression ──────────────────────────────────────────────────────

function logisticRegression(features: FeatureVector, weights: Record<keyof FeatureVector, number>): number {
  let logit = -0.5; // bias term (calibrated intercept)

  for (const [key, weight] of Object.entries(weights)) {
    const featureValue = features[key as keyof FeatureVector] ?? 0;
    logit += weight * featureValue;
  }

  // Sigmoid activation
  return 1 / (1 + Math.exp(-logit * 4));
}

// ─── Gradient Boosting (shallow tree ensemble) ────────────────────────────────
// Implements a simplified GBDT using hard-coded split rules calibrated from data.
// Each "tree" is a lookup table of decision rules → residual correction.

type TreeNode = {
  feature: keyof FeatureVector;
  threshold: number;
  left: number | TreeNode;
  right: number | TreeNode;
};

function evalTree(node: number | TreeNode, features: FeatureVector): number {
  if (typeof node === "number") return node;
  const val = features[node.feature] ?? 0;
  return val <= node.threshold
    ? evalTree(node.left, features)
    : evalTree(node.right, features);
}

const GRADIENT_BOOSTING_TREES: TreeNode[] = [
  // Tree 1: Funding momentum tree
  {
    feature: "fundingCompletionRate", threshold: 0.5,
    left: {
      feature: "earlyMomentumIndex", threshold: 0.3,
      left: -0.12, right: 0.04,
    },
    right: {
      feature: "fundingVelocityNormalized", threshold: 0.6,
      left: 0.08, right: 0.18,
    },
  },
  // Tree 2: Team quality tree
  {
    feature: "teamStrengthScore", threshold: 0.5,
    left: {
      feature: "previousSuccessBoost", threshold: 0.5,
      left: -0.10, right: 0.02,
    },
    right: {
      feature: "advisoryStrengthScore", threshold: 0.4,
      left: 0.06, right: 0.14,
    },
  },
  // Tree 3: Technical safety tree
  {
    feature: "contractSecurityScore", threshold: 0.5,
    left: {
      feature: "auditSafetyScore", threshold: 0.3,
      left: -0.15, right: -0.03,
    },
    right: {
      feature: "technicalRobustnessScore", threshold: 0.6,
      left: 0.05, right: 0.12,
    },
  },
  // Tree 4: Community sentiment tree
  {
    feature: "sentimentNormalized", threshold: 0.45,
    left: {
      feature: "communityEngagementScore", threshold: 0.3,
      left: -0.08, right: -0.02,
    },
    right: {
      feature: "socialReachScore", threshold: 0.5,
      left: 0.04, right: 0.10,
    },
  },
  // Tree 5: Risk factors tree
  {
    feature: "legalRiskScore", threshold: 0.5,
    left: {
      feature: "liquidityRiskScore", threshold: 0.6,
      left: 0.06, right: -0.02,
    },
    right: {
      feature: "contributorConcentrationRisk", threshold: 0.4,
      left: -0.04, right: -0.13,
    },
  },
  // Tree 6: Project quality tree
  {
    feature: "projectQualityScore", threshold: 0.55,
    left: {
      feature: "roadmapScore", threshold: 0.4,
      left: -0.07, right: 0.01,
    },
    right: {
      feature: "whitepaperQualityNormalized", threshold: 0.6,
      left: 0.05, right: 0.11,
    },
  },
];

const GBDT_BASE_SCORE = 0.5;
const LEARNING_RATE   = 0.1;

function gradientBoosting(features: FeatureVector): number {
  let score = GBDT_BASE_SCORE;
  for (const tree of GRADIENT_BOOSTING_TREES) {
    score += LEARNING_RATE * evalTree(tree, features);
  }
  return Math.min(1, Math.max(0, score));
}

// ─── Random Forest (bagged feature subsets) ───────────────────────────────────
// A lightweight approximation: each "tree" uses a weighted sum of a subset of features.

const RF_TREES: Array<{ features: Array<keyof FeatureVector>; weights: number[] }> = [
  {
    features: ["fundingCompletionRate", "earlyMomentumIndex", "teamStrengthScore"],
    weights:  [0.45, 0.35, 0.20],
  },
  {
    features: ["communityEngagementScore", "githubActivityScore", "sentimentNormalized"],
    weights:  [0.40, 0.35, 0.25],
  },
  {
    features: ["contractSecurityScore", "technicalRobustnessScore", "auditSafetyScore"],
    weights:  [0.40, 0.35, 0.25],
  },
  {
    features: ["projectQualityScore", "roadmapScore", "advisoryStrengthScore"],
    weights:  [0.40, 0.30, 0.30],
  },
  {
    features: ["teamExperienceNormalized", "previousSuccessBoost", "socialReachScore"],
    weights:  [0.35, 0.40, 0.25],
  },
];

function randomForest(features: FeatureVector): number {
  const treePredictions = RF_TREES.map(({ features: feats, weights }) => {
    let prediction = 0;
    for (let i = 0; i < feats.length; i++) {
      prediction += (features[feats[i]] ?? 0) * weights[i];
    }
    return Math.min(1, Math.max(0, prediction));
  });

  return treePredictions.reduce((a, b) => a + b, 0) / treePredictions.length;
}

// ─── Ensemble Prediction ──────────────────────────────────────────────────────

export function predictSuccessProbability(
  features: FeatureVector,
  config: ModelConfig = DEFAULT_MODEL_CONFIG,
): SuccessPrediction {
  const lrScore  = logisticRegression(features, config.featureWeights);
  const gbtScore = gradientBoosting(features);
  const rfScore  = randomForest(features);

  const { logisticRegression: lrW, gradientBoosting: gbW, randomForest: rfW } =
    config.ensembleWeights;

  const ensembleProbability = lrW * lrScore + gbW * gbtScore + rfW * rfScore;

  // Confidence interval via model disagreement (epistemic uncertainty proxy)
  const variance = (
    lrW  * Math.pow(lrScore  - ensembleProbability, 2) +
    gbW  * Math.pow(gbtScore - ensembleProbability, 2) +
    rfW  * Math.pow(rfScore  - ensembleProbability, 2)
  );
  const stdDev = Math.sqrt(variance);
  const margin = 1.96 * stdDev; // 95% CI

  const lower = Math.max(0, ensembleProbability - margin);
  const upper = Math.min(1, ensembleProbability + margin);

  const confidenceLevel =
    stdDev < 0.05 ? "HIGH" :
    stdDev < 0.12 ? "MEDIUM" :
    "LOW";

  return {
    probability: Math.round(ensembleProbability * 1000) / 1000,
    confidenceInterval: [
      Math.round(lower * 1000) / 1000,
      Math.round(upper * 1000) / 1000,
    ],
    confidenceLevel,
    modelVersion: config.version,
  };
}

// ─── Risk Score Computation ───────────────────────────────────────────────────

export function computeRiskScore(features: FeatureVector): RiskScore {
  // Each sub-score is 0-100 where 100 = safest (least risk)

  const fundingRisk = Math.round(
    100 * (
      0.40 * features.fundingCompletionRate +
      0.25 * features.fundingVelocityNormalized +
      0.20 * (1 - features.contributorConcentrationRisk) +
      0.15 * features.earlyMomentumIndex
    )
  );

  const teamRisk = Math.round(
    100 * (
      0.35 * features.teamStrengthScore +
      0.25 * features.teamExperienceNormalized +
      0.25 * features.previousSuccessBoost +
      0.15 * features.advisoryStrengthScore
    )
  );

  const technicalRisk = Math.round(
    100 * (
      0.35 * features.contractSecurityScore +
      0.30 * features.technicalRobustnessScore +
      0.20 * features.auditSafetyScore +
      0.15 * features.githubActivityScore
    )
  );

  const communityRisk = Math.round(
    100 * (
      0.35 * features.communityEngagementScore +
      0.30 * features.sentimentNormalized +
      0.20 * features.socialReachScore +
      0.15 * features.githubActivityScore
    )
  );

  const marketRisk = Math.round(
    100 * (
      0.40 * (1 - features.liquidityRiskScore) +
      0.35 * (1 - features.categoryRiskFactor) +
      0.25 * features.earlyMomentumIndex
    )
  );

  const legalRisk = Math.round(
    100 * (1 - features.legalRiskScore)
  );

  const overall = Math.round(
    0.20 * fundingRisk  +
    0.18 * teamRisk     +
    0.18 * technicalRisk +
    0.14 * communityRisk +
    0.16 * marketRisk   +
    0.14 * legalRisk
  );

  return { overall, fundingRisk, teamRisk, technicalRisk, communityRisk, marketRisk, legalRisk };
}

// ─── Risk Level Classification ────────────────────────────────────────────────

export function classifyRiskLevel(overallScore: number, config: ModelConfig = DEFAULT_MODEL_CONFIG): RiskLevel {
  const { veryLow, low, medium, high } = config.riskThresholds;
  if (overallScore >= veryLow) return "VERY_LOW";
  if (overallScore >= low)     return "LOW";
  if (overallScore >= medium)  return "MEDIUM";
  if (overallScore >= high)    return "HIGH";
  return "VERY_HIGH";
}
