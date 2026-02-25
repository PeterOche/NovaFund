// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Risk Monitor
// Polls for project data changes and emits risk alerts when thresholds are crossed
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MonitoringSnapshot,
  MonitoringSession,
  RiskAlert,
  RiskAlertType,
  RiskLevel,
} from "./types";
import { RiskEngine } from "./index";
import { invalidateProjectCache } from "./data-pipeline";

// ─── Thresholds ────────────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = {
  criticalScoreDrop:     10,  // points in one poll cycle
  warningScoreDrop:       5,
  criticalScoreImprove:  10,
  whaleConcentration:    0.4, // 40% single contributor
  fundingStallHours:     24,  // no new funds for X hours
  sentimentDropThresh:   0.35,
  githubInactivityDays:  14,
};

type AlertCallback = (alert: RiskAlert) => void;
type SnapshotCallback = (snapshot: MonitoringSnapshot) => void;

// ─── Monitor Store ─────────────────────────────────────────────────────────────

const activeSessions = new Map<string, MonitoringSession>();
const alertCallbacks = new Map<string, Set<AlertCallback>>();
const snapshotCallbacks = new Map<string, Set<SnapshotCallback>>();
const intervalHandles = new Map<string, ReturnType<typeof setInterval>>();

// ─── Risk Trend Analysis ───────────────────────────────────────────────────────

function analyzeTrend(snapshots: MonitoringSnapshot[]): {
  direction: "IMPROVING" | "DECLINING" | "STABLE";
  strength: number;
} {
  if (snapshots.length < 2) return { direction: "STABLE", strength: 0 };

  const recent  = snapshots.slice(-5);
  const scores  = recent.map((s) => s.riskScore);
  const first   = scores[0];
  const last    = scores[scores.length - 1];
  const delta   = last - first;
  const range   = Math.max(...scores) - Math.min(...scores);

  if (Math.abs(delta) < 2) return { direction: "STABLE", strength: range / 100 };

  return {
    direction: delta > 0 ? "IMPROVING" : "DECLINING",
    strength:  Math.min(1, Math.abs(delta) / 20),
  };
}

// ─── Alert Generation ──────────────────────────────────────────────────────────

function generateAlerts(
  projectId: string,
  previousScore: number,
  currentScore: number,
  snapshot: MonitoringSnapshot,
  raw?: Record<string, number>,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const delta = currentScore - previousScore;
  const now   = Date.now();

  const makeAlert = (
    type: RiskAlertType,
    severity: RiskAlert["severity"],
    message: string,
    factors: string[],
  ): RiskAlert => ({
    id:              `${projectId}-${type}-${now}`,
    projectId,
    timestamp:       now,
    severity,
    type,
    message,
    affectedFactors: factors,
    previousScore,
    currentScore,
    delta,
  });

  // Score drop alerts
  if (delta <= -ALERT_THRESHOLDS.criticalScoreDrop) {
    alerts.push(makeAlert(
      "SCORE_DROP",
      "CRITICAL",
      `Risk score dropped ${Math.abs(delta).toFixed(1)} points (${previousScore} → ${currentScore}). Immediate review recommended.`,
      ["overall"],
    ));
  } else if (delta <= -ALERT_THRESHOLDS.warningScoreDrop) {
    alerts.push(makeAlert(
      "SCORE_DROP",
      "WARNING",
      `Risk score declined ${Math.abs(delta).toFixed(1)} points (${previousScore} → ${currentScore}).`,
      ["overall"],
    ));
  }

  // Score improvement
  if (delta >= ALERT_THRESHOLDS.criticalScoreImprove) {
    alerts.push(makeAlert(
      "SCORE_IMPROVEMENT",
      "INFO",
      `Risk score improved ${delta.toFixed(1)} points (${previousScore} → ${currentScore}).`,
      ["overall"],
    ));
  }

  // Whale concentration check
  if (raw?.contributorConcentrationRisk !== undefined &&
      raw.contributorConcentrationRisk > ALERT_THRESHOLDS.whaleConcentration) {
    alerts.push(makeAlert(
      "WHALE_CONCENTRATION",
      "WARNING",
      `Single contributor holds ${Math.round(raw.contributorConcentrationRisk * 100)}% of total funds — whale exit risk is elevated.`,
      ["contributorConcentrationRisk", "fundingRisk"],
    ));
  }

  // Sentiment drop
  if (raw?.sentimentNormalized !== undefined &&
      raw.sentimentNormalized < ALERT_THRESHOLDS.sentimentDropThresh) {
    alerts.push(makeAlert(
      "COMMUNITY_SENTIMENT_DROP",
      "WARNING",
      `Community sentiment has fallen to ${Math.round(raw.sentimentNormalized * 100)}/100 — monitor community channels.`,
      ["sentimentNormalized", "communityRisk"],
    ));
  }

  return alerts;
}

// ─── Core Poll Function ────────────────────────────────────────────────────────

async function pollProject(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session || !session.isActive) return;

  const { projectId } = session;

  try {
    // Force fresh data fetch
    invalidateProjectCache(projectId);

    const engine = new RiskEngine();
    const assessment = await engine.assess(projectId);

    if (!assessment) return;

    const previousSnapshot = session.snapshots[session.snapshots.length - 1];
    const previousScore    = previousSnapshot?.riskScore ?? assessment.riskScore.overall;

    const { direction, strength } = analyzeTrend(session.snapshots);

    const currentSnapshot: MonitoringSnapshot = {
      projectId,
      timestamp:         Date.now(),
      riskScore:         assessment.riskScore.overall,
      riskLevel:         assessment.riskLevel,
      alerts:            [],
      deltaFromPrevious: assessment.riskScore.overall - previousScore,
      trendDirection:    direction,
      trendStrength:     strength,
    };

    // Generate and attach alerts
    const alerts = generateAlerts(
      projectId,
      previousScore,
      assessment.riskScore.overall,
      currentSnapshot,
    );
    currentSnapshot.alerts = alerts;

    // Store snapshot (keep last 100)
    session.snapshots.push(currentSnapshot);
    if (session.snapshots.length > 100) {
      session.snapshots.shift();
    }

    // Emit alert events
    const alertSubs = alertCallbacks.get(projectId);
    if (alertSubs) {
      for (const alert of alerts) {
        for (const cb of alertSubs) cb(alert);
      }
    }

    // Emit snapshot events
    const snapshotSubs = snapshotCallbacks.get(projectId);
    if (snapshotSubs) {
      for (const cb of snapshotSubs) cb(currentSnapshot);
    }
  } catch (err) {
    console.error(`[RiskMonitor] Poll failed for session ${sessionId}:`, err);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function startMonitoring(
  projectId: string,
  intervalMs = 60_000,
): MonitoringSession {
  // Reuse existing session if one is active
  for (const [, session] of activeSessions) {
    if (session.projectId === projectId && session.isActive) {
      session.subscriberCount++;
      return session;
    }
  }

  const sessionId = `${projectId}-${Date.now()}`;
  const session: MonitoringSession = {
    sessionId,
    projectId,
    startTime:       Date.now(),
    intervalMs,
    snapshots:       [],
    isActive:        true,
    subscriberCount: 1,
  };

  activeSessions.set(sessionId, session);

  const handle = setInterval(() => void pollProject(sessionId), intervalMs);
  intervalHandles.set(sessionId, handle);

  // Run first poll immediately
  void pollProject(sessionId);

  return session;
}

export function stopMonitoring(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.subscriberCount = Math.max(0, session.subscriberCount - 1);
  if (session.subscriberCount > 0) return; // still has subscribers

  session.isActive = false;
  const handle = intervalHandles.get(sessionId);
  if (handle !== undefined) {
    clearInterval(handle);
    intervalHandles.delete(sessionId);
  }
  activeSessions.delete(sessionId);
}

export function onAlert(projectId: string, cb: AlertCallback): () => void {
  if (!alertCallbacks.has(projectId)) alertCallbacks.set(projectId, new Set());
  alertCallbacks.get(projectId)!.add(cb);
  return () => alertCallbacks.get(projectId)?.delete(cb);
}

export function onSnapshot(projectId: string, cb: SnapshotCallback): () => void {
  if (!snapshotCallbacks.has(projectId)) snapshotCallbacks.set(projectId, new Set());
  snapshotCallbacks.get(projectId)!.add(cb);
  return () => snapshotCallbacks.get(projectId)?.delete(cb);
}

export function getSession(sessionId: string): MonitoringSession | undefined {
  return activeSessions.get(sessionId);
}

export function getSessionByProject(projectId: string): MonitoringSession | undefined {
  for (const [, session] of activeSessions) {
    if (session.projectId === projectId && session.isActive) return session;
  }
  return undefined;
}

export function getRecentSnapshots(projectId: string, limit = 20): MonitoringSnapshot[] {
  const session = getSessionByProject(projectId);
  if (!session) return [];
  return session.snapshots.slice(-limit);
}

export function getAllActiveSessionIds(): string[] {
  return [...activeSessions.keys()];
}
