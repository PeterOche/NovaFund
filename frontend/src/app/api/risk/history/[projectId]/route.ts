// GET /api/risk/history/[projectId]
// Returns paginated risk assessment history for a project

import { NextRequest, NextResponse } from "next/server";
import { getRecentSnapshots } from "@/lib/risk-engine";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const { projectId } = params;
  const { searchParams } = new URL(req.url);

  const limit  = Math.min(Number(searchParams.get("limit")  ?? "20"), 100);
  const offset = Number(searchParams.get("offset") ?? "0");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const allSnapshots = getRecentSnapshots(projectId, 100);
    const paginated    = allSnapshots.slice(offset, offset + limit);

    return NextResponse.json(
      {
        projectId,
        total:     allSnapshots.length,
        limit,
        offset,
        snapshots: paginated,
        hasMore:   offset + limit < allSnapshots.length,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    console.error("[/api/risk/history]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
