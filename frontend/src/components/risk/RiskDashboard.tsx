"use client";

import { useEffect, useState, useCallback } from "react";
import type { RiskAssessmentResult } from "@/lib/risk-engine/types";
import { RiskScoreCard }    from "./RiskScoreCard";
import { RiskFactorChart }  from "./RiskFactorChart";
import { RealTimeMonitor }  from "./RealTimeMonitor";

interface RiskDashboardProps {
  projectId: string;
  chainId?: number;
  contractAddress?: string;
  showMonitor?: boolean;
}

type LoadingState = "idle" | "loading" | "success" | "error";

export function RiskDashboard({
  projectId,
  chainId = 1,
  contractAddress,
  showMonitor = true,
}: RiskDashboardProps) {
  const [assessment,    setAssessment]   = useState<RiskAssessmentResult | null>(null);
  const [loadingState,  setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage,  setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed]= useState<Date | null>(null);

  const fetchAssessment = useCallback(async () => {
    setLoadingState("loading");
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        projectId,
        chainId: String(chainId),
        ...(contractAddress ? { contractAddress } : {}),
      });

      const res = await fetch(`/api/risk/assess?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as RiskAssessmentResult;
      setAssessment(data);
      setLoadingState("success");
      setLastRefreshed(new Date());
    } catch (err) {
      setLoadingState("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to load risk assessment");
    }
  }, [projectId, chainId, contractAddress]);

  useEffect(() => {
    void fetchAssessment();
  }, [fetchAssessment]);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loadingState === "loading" && !assessment) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-80 rounded-2xl bg-gray-200" />
          <div className="h-80 rounded-2xl bg-gray-200 lg:col-span-2" />
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (loadingState === "error" && !assessment) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-semibold text-red-700 mb-1">Risk Assessment Unavailable</p>
        <p className="text-xs text-red-500 mb-4">{errorMessage}</p>
        <button
          onClick={() => void fetchAssessment()}
          className="rounded-lg bg-red-100 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!assessment) return null;

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Risk Assessment</h2>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={() => void fetchAssessment()}
          disabled={loadingState === "loading"}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
        >
          <span className={loadingState === "loading" ? "animate-spin" : ""}>↻</span>
          Refresh
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Score card */}
        <div>
          <RiskScoreCard
            riskScore={assessment.riskScore}
            riskLevel={assessment.riskLevel}
            successProbability={assessment.successPrediction.probability}
            confidenceLevel={assessment.successPrediction.confidenceLevel}
          />

          {/* Confidence interval */}
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">95% Confidence Interval</p>
            <p className="text-sm font-semibold text-gray-800">
              {Math.round(assessment.successPrediction.confidenceInterval[0] * 100)}%
              {" — "}
              {Math.round(assessment.successPrediction.confidenceInterval[1] * 100)}%
            </p>
          </div>
        </div>

        {/* Right: Risk factors */}
        <div className="lg:col-span-2 space-y-4">
          <RiskFactorChart
            topRisks={assessment.topRiskFactors}
            topStrengths={assessment.topStrengths}
          />
        </div>
      </div>

      {/* Explanation + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Assessment Summary</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{assessment.explanationSummary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {assessment.dataSourcesUsed.map((src) => (
              <span
                key={src}
                className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600"
              >
                {src}
              </span>
            ))}
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              v{assessment.assessmentVersion}
            </span>
          </div>
        </div>

        {/* Investor Insights */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Investor Insights</h3>
          {assessment.investorInsights.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No specific insights available.</p>
          ) : (
            <ul className="space-y-2">
              {assessment.investorInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Real-time Monitor */}
      {showMonitor && (
        <RealTimeMonitor projectId={projectId} />
      )}
    </div>
  );
}
