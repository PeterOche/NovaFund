// POST /api/risk/assess
// Body: { projectId, chainId?, contractAddress?, privacyMode? }
// Returns: RiskAssessmentResult

import { NextRequest, NextResponse } from "next/server";
import { RiskEngine } from "@/lib/risk-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      projectId?: string;
      chainId?: number;
      contractAddress?: string;
      privacyMode?: boolean;
    };

    if (!body.projectId || typeof body.projectId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid projectId" },
        { status: 400 },
      );
    }

    const engine = new RiskEngine({
      privacyMode: body.privacyMode ?? false,
    });

    const result = await engine.assess(
      body.projectId,
      body.chainId ?? 1,
      body.contractAddress,
    );

    if (!result) {
      return NextResponse.json(
        { error: "Unable to fetch project data for risk assessment" },
        { status: 422 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/risk/assess]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// GET /api/risk/assess?projectId=xxx&chainId=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId       = searchParams.get("projectId");
  const chainId         = Number(searchParams.get("chainId") ?? "1");
  const contractAddress = searchParams.get("contractAddress") ?? undefined;

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId query parameter" },
      { status: 400 },
    );
  }

  try {
    const engine = new RiskEngine();
    const result = await engine.assess(projectId, chainId, contractAddress);

    if (!result) {
      return NextResponse.json(
        { error: "Unable to fetch project data for risk assessment" },
        { status: 422 },
      );
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[/api/risk/assess GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
