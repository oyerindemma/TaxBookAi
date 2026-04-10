import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getWorkspaceCitWorkflowPageData } from "@/lib/cit-workflow";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseOptionalId(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseYear(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 2000 || parsed > 9999) {
    return null;
  }
  return parsed;
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(
    ctx.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }

  try {
    const url = new URL(req.url);
    const pageData = await getWorkspaceCitWorkflowPageData({
      workspaceId: ctx.workspaceId,
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      year: parseYear(url.searchParams.get("year")),
    });

    return NextResponse.json({ pageData }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logRouteError("cit workflow page data load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to load the CIT workflow." },
      { status: 500 }
    );
  }
}
