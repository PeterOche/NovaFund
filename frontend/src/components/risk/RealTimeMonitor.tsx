"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { MonitoringSnapshot, RiskAlert, RiskLevel } from "@/lib/risk-engine/types";

interface RealTimeMonitorProps {
  projectId: string;
  initialSnapshots?: MonitoringSnapshot[];
}

const LEVEL_DOT: Record<RiskLevel, string> = {
  VERY_LOW:  "bg-emerald-500",
  LOW:       "bg-green-500",
  MEDIUM:    "bg-yellow-500",
  HIGH:      "bg-orange-500",
  VERY_HIGH: "bg-red-500",
};

const ALERT_STYLES: Record<RiskAlert["severity"], string> = {
  INFO:     "border-blue-200   bg-blue-50   text-blue-800",
  WARNING:  "border-yellow-200 bg-yellow-50 text-yellow-800",
  CRITICAL: "border-red-200    bg-red-50    text-red-800",
};

const ALERT_ICONS: Record<RiskAlert["severity"], string> = {
  INFO:     "ℹ️",
  WARNING:  "⚠️",
  CRITICAL: "🚨",
};

function SparkLine({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const width  = 120;
  const height = 36;
  const step   = width / (scores.length - 1);

  const points = scores
    .map((s, i) => `${i * step},${height - ((s - min) / range) * height}`)
    .join(" ");

  const isImproving = scores[scores.length - 1] > scores[0];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={isImproving ? "#10b981" : "#ef4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest point dot */}
      <circle
        cx={(scores.length - 1) * step}
        cy={height - ((scores[scores.length - 1] - min) / range) * height}
        r="3"
        fill={isImproving ? "#10b981" : "#ef4444"}
      />
    </svg>
  );
}

export function RealTimeMonitor({ projectId, initialSnapshots = [] }: RealTimeMonitorProps) {
  const [snapshots, setSnapshots]       = useState<MonitoringSnapshot[]>(initialSnapshots);
  const [alerts, setAlerts]             = useState<RiskAlert[]>([]);
  const [connected, setConnected]       = useState(false);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const eventSourceRef                  = useRef<EventSource | null>(null);
  const alertsRef                       = useRef<RiskAlert[]>([]);
  alertsRef.current                     = alerts;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/risk/monitor?projectId=${encodeURIComponent(projectId)}`);
    eventSourceRef.current = es;

    es.addEventListener("session_started", () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const snapshot: MonitoringSnapshot = JSON.parse(e.data);
      setSnapshots((prev) => {
        const next = [...prev, snapshot].slice(-50);
        return next;
      });
      setLastUpdated(new Date(snapshot.timestamp));
    });

    es.addEventListener("alert", (e: MessageEvent) => {
      const alert: RiskAlert = JSON.parse(e.data);
      setAlerts((prev) => [alert, ...prev].slice(0, 20));
    });

    es.addEventListener("heartbeat", () => {
      setConnected(true);
    });

    es.onerror = () => {
      setConnected(false);
      setError("Connection lost. Attempting to reconnect…");
      es.close();
      setTimeout(connect, 5_000);
    };
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const latestSnapshot  = snapshots[snapshots.length - 1];
  const recentScores    = snapshots.slice(-20).map((s) => s.riskScore);
  const trend           = latestSnapshot?.trendDirection ?? "STABLE";
  const trendArrow      = trend === "IMPROVING" ? "↑" : trend === "DECLINING" ? "↓" : "→";
  const trendColor      = trend === "IMPROVING" ? "text-emerald-600" : trend === "DECLINING" ? "text-red-600" : "text-gray-500";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
          <span className="text-sm font-semibold text-gray-700">Live Risk Monitor</span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {!connected && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              Reconnecting…
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 px-5 py-2 text-xs text-red-600 border-b border-red-100">
          {error}
        </div>
      )}

      {/* Current Score Panel */}
      {latestSnapshot ? (
        <div className="grid grid-cols-3 gap-4 p-5 border-b border-gray-100">
          {/* Score */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4">
            <p className="text-xs text-gray-400 mb-1">Risk Score</p>
            <p className="text-3xl font-bold text-gray-900">{latestSnapshot.riskScore}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[latestSnapshot.riskLevel]}`} />
              <span className="text-xs text-gray-500 capitalize">
                {latestSnapshot.riskLevel.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Trend */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4">
            <p className="text-xs text-gray-400 mb-1">Trend</p>
            <p className={`text-3xl font-bold ${trendColor}`}>{trendArrow}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">
              {trend.toLowerCase()}
            </p>
          </div>

          {/* Sparkline */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4">
            <p className="text-xs text-gray-400 mb-2">Last 20 readings</p>
            <SparkLine scores={recentScores} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 text-sm text-gray-400">
          <span className="animate-spin mr-2">⏳</span>
          Waiting for first reading…
        </div>
      )}

      {/* Alerts Feed */}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Recent Alerts
          {alerts.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-red-600 font-bold">
              {alerts.filter((a) => a.severity === "CRITICAL").length} critical
            </span>
          )}
        </p>

        {alerts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No alerts yet. Monitoring is active.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border px-4 py-3 text-sm ${ALERT_STYLES[alert.severity]}`}
              >
                <div className="flex items-start gap-2">
                  <span className="shrink-0">{ALERT_ICONS[alert.severity]}</span>
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{alert.message}</p>
                    <p className="text-xs opacity-60 mt-0.5">
                      {new Date(alert.timestamp).toLocaleTimeString()} ·{" "}
                      Score: {alert.previousScore} → {alert.currentScore}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
