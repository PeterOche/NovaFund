"use client";

import type { RiskLevel, RiskScore } from "@/lib/risk-engine/types";

interface RiskScoreCardProps {
  riskScore: RiskScore;
  riskLevel: RiskLevel;
  successProbability: number;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  className?: string;
}

const LEVEL_STYLES: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
  VERY_LOW:  { bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-300",  label: "Very Low Risk"  },
  LOW:       { bg: "bg-green-50",    text: "text-green-700",    border: "border-green-300",    label: "Low Risk"       },
  MEDIUM:    { bg: "bg-yellow-50",   text: "text-yellow-700",   border: "border-yellow-300",   label: "Medium Risk"    },
  HIGH:      { bg: "bg-orange-50",   text: "text-orange-700",   border: "border-orange-300",   label: "High Risk"      },
  VERY_HIGH: { bg: "bg-red-50",      text: "text-red-700",      border: "border-red-300",      label: "Very High Risk" },
};

const SCORE_COLOR = (score: number) =>
  score >= 75 ? "text-emerald-600" :
  score >= 55 ? "text-green-600"   :
  score >= 40 ? "text-yellow-600"  :
  score >= 25 ? "text-orange-600"  :
  "text-red-600";

const PROGRESS_BG = (score: number) =>
  score >= 75 ? "bg-emerald-500" :
  score >= 55 ? "bg-green-500"   :
  score >= 40 ? "bg-yellow-500"  :
  score >= 25 ? "bg-orange-500"  :
  "bg-red-500";

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${SCORE_COLOR(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${PROGRESS_BG(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function RiskScoreCard({
  riskScore,
  riskLevel,
  successProbability,
  confidenceLevel,
  className = "",
}: RiskScoreCardProps) {
  const style = LEVEL_STYLES[riskLevel];

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-5 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Risk Assessment</p>
          <p className={`text-lg font-bold ${style.text}`}>{style.label}</p>
        </div>
        {/* Circular score */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke={riskScore.overall >= 65 ? "#10b981" : riskScore.overall >= 45 ? "#f59e0b" : "#ef4444"}
              strokeWidth="2.5"
              strokeDasharray={`${riskScore.overall} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className={`absolute text-sm font-bold ${SCORE_COLOR(riskScore.overall)}`}>
            {riskScore.overall}
          </span>
        </div>
      </div>

      {/* Success probability */}
      <div className="mb-4 rounded-xl bg-white/70 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Success Probability</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(successProbability * 100)}%
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            confidenceLevel === "HIGH"   ? "bg-emerald-100 text-emerald-700" :
            confidenceLevel === "MEDIUM" ? "bg-yellow-100  text-yellow-700"  :
            "bg-gray-100 text-gray-600"
          }`}
        >
          {confidenceLevel} Confidence
        </span>
      </div>

      {/* Sub-scores */}
      <div className="space-y-2.5">
        <ScoreBar label="Funding"    score={riskScore.fundingRisk}   />
        <ScoreBar label="Team"       score={riskScore.teamRisk}      />
        <ScoreBar label="Technical"  score={riskScore.technicalRisk} />
        <ScoreBar label="Community"  score={riskScore.communityRisk} />
        <ScoreBar label="Market"     score={riskScore.marketRisk}    />
        <ScoreBar label="Legal"      score={riskScore.legalRisk}     />
      </div>
    </div>
  );
}
