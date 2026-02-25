"use client";

import type { RiskFactor } from "@/lib/risk-engine/types";

interface RiskFactorChartProps {
  topRisks: RiskFactor[];
  topStrengths: RiskFactor[];
}

const CATEGORY_COLORS: Record<RiskFactor["category"], string> = {
  FUNDING:   "bg-blue-500",
  TEAM:      "bg-purple-500",
  TECHNICAL: "bg-cyan-500",
  COMMUNITY: "bg-pink-500",
  MARKET:    "bg-amber-500",
  LEGAL:     "bg-rose-500",
};

const CATEGORY_BADGES: Record<RiskFactor["category"], string> = {
  FUNDING:   "bg-blue-100 text-blue-700",
  TEAM:      "bg-purple-100 text-purple-700",
  TECHNICAL: "bg-cyan-100 text-cyan-700",
  COMMUNITY: "bg-pink-100 text-pink-700",
  MARKET:    "bg-amber-100 text-amber-700",
  LEGAL:     "bg-rose-100 text-rose-700",
};

interface FactorBarProps {
  factor: RiskFactor;
  isRisk: boolean;
}

function FactorBar({ factor, isRisk }: FactorBarProps) {
  const absImpact = Math.abs(factor.impact);
  const barWidth  = Math.min(100, absImpact * 400); // scale for visual clarity
  const barColor  = isRisk ? "bg-red-400" : "bg-emerald-400";

  return (
    <div className="group rounded-xl border border-gray-100 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-800">{factor.displayName}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGES[factor.category]}`}>
              {factor.category}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 line-clamp-2">{factor.description}</p>
        </div>
        <div className="ml-3 text-right shrink-0">
          <span className={`text-xs font-bold ${isRisk ? "text-red-600" : "text-emerald-600"}`}>
            {isRisk ? "" : "+"}{(factor.impact * 100).toFixed(1)}
          </span>
          <p className="text-[10px] text-gray-400">impact</p>
        </div>
      </div>

      {/* Impact bar */}
      <div className="mt-2 space-y-1">
        <div className="flex gap-1 items-center">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Current vs benchmark */}
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>Current: {Math.round(factor.currentValue * 100)}/100</span>
          <span>Benchmark: {Math.round(factor.benchmark * 100)}/100</span>
        </div>
      </div>

      {/* Recommendation (shown on hover) */}
      {factor.recommendation && (
        <p className="mt-2 text-xs text-indigo-600 hidden group-hover:block border-t border-indigo-50 pt-2">
          {factor.recommendation}
        </p>
      )}
    </div>
  );
}

export function RiskFactorChart({ topRisks, topStrengths }: RiskFactorChartProps) {
  return (
    <div className="space-y-6">
      {/* Risk Factors */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <h3 className="text-sm font-semibold text-gray-700">Top Risk Factors</h3>
          <span className="ml-auto text-xs text-gray-400">Hover for recommendations</span>
        </div>
        {topRisks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No significant risk factors identified.</p>
        ) : (
          <div className="space-y-2">
            {topRisks.map((factor) => (
              <FactorBar key={factor.name} factor={factor} isRisk={true} />
            ))}
          </div>
        )}
      </div>

      {/* Strengths */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-700">Key Strengths</h3>
        </div>
        {topStrengths.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No significant strengths identified.</p>
        ) : (
          <div className="space-y-2">
            {topStrengths.map((factor) => (
              <FactorBar key={factor.name} factor={factor} isRisk={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
