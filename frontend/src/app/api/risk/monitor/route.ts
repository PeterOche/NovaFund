// GET  /api/risk/monitor?projectId=xxx              → SSE stream of risk snapshots/alerts
// POST /api/risk/monitor   { projectId, action: "start"|"stop", intervalMs? }
// GET  /api/risk/monitor?projectId=xxx&action=snapshots → last N snapshots

import { NextRequest, NextResponse } from "next/server";
import {
  startMonitoring,
  stopMonitoring,
  getRecentSnapshots,
  getSessionByProject,
} from "@/lib/risk-engine";

// ─── SSE Stream ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const action    = searchParams.get("action");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  // Return recent snapshots (non-streaming)
  if (action === "snapshots") {
    const limit     = Number(searchParams.get("limit") ?? "20");
    const snapshots = getRecentSnapshots(projectId, limit);
    return NextResponse.json({ projectId, snapshots }, { status: 200 });
  }

  // Return session status
  if (action === "status") {
    const session = getSessionByProject(projectId);
    return NextResponse.json(
      session
        ? { active: true, sessionId: session.sessionId, subscriberCount: session.subscriberCount }
        : { active: false },
      { status: 200 },
    );
  }

  // SSE streaming for real-time updates
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const session = startMonitoring(projectId, 60_000);

      // Send initial state
      send("session_started", {
        sessionId:   session.sessionId,
        projectId,
        startTime:   session.startTime,
        intervalMs:  session.intervalMs,
      });

      // Send existing snapshots
      if (session.snapshots.length > 0) {
        send("snapshot", session.snapshots[session.snapshots.length - 1]);
      }

      // Register live listeners
      const { onAlert, onSnapshot } = require("@/lib/risk-engine") as typeof import("@/lib/risk-engine");

      const unsubAlert    = onAlert(projectId,    (alert)    => send("alert",    alert));
      const unsubSnapshot = onSnapshot(projectId, (snapshot) => send("snapshot", snapshot));

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        send("heartbeat", { timestamp: Date.now() });
      }, 30_000);

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubAlert();
        unsubSnapshot();
        stopMonitoring(session.sessionId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Control Endpoint (start / stop) ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      projectId?: string;
      action?: "start" | "stop";
      intervalMs?: number;
      sessionId?: string;
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    if (body.action === "start") {
      const session = startMonitoring(body.projectId, body.intervalMs ?? 60_000);
      return NextResponse.json({
        sessionId:  session.sessionId,
        projectId:  body.projectId,
        intervalMs: session.intervalMs,
        startTime:  session.startTime,
      });
    }

    if (body.action === "stop") {
      if (!body.sessionId) {
        return NextResponse.json({ error: "Missing sessionId for stop action" }, { status: 400 });
      }
      stopMonitoring(body.sessionId);
      return NextResponse.json({ stopped: true, sessionId: body.sessionId });
    }

    return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'." }, { status: 400 });
  } catch (err) {
    console.error("[/api/risk/monitor]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
