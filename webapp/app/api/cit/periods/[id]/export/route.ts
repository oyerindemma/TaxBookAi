import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { buildCitWorkflowExport, recordCitWorkflowExport } from "@/lib/cit-workflow";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseId(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "TAX_FILING_ASSISTANT"
    );
    if (!featureAccess.ok) {
      return NextResponse.json({ error: featureAccess.error }, { status: 402 });
    }

    const { id } = await context.params;
    const citPeriodId = parseId(id);
    if (!citPeriodId) {
      return NextResponse.json({ error: "Invalid CIT period id." }, { status: 400 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "json").trim().toLowerCase();
    if (!["json", "summary-csv", "summary-html"].includes(format)) {
      return NextResponse.json({ error: "Invalid export format." }, { status: 400 });
    }

    const exportPayload = await buildCitWorkflowExport({
      workspaceId: ctx.workspaceId,
      citPeriodId,
    });
    await recordCitWorkflowExport({
      workspaceId: ctx.workspaceId,
      citPeriodId,
      actorUserId: ctx.userId,
      format,
    });

    if (format === "summary-html") {
      return new NextResponse(exportPayload.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (format === "summary-csv") {
      return new NextResponse(exportPayload.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=cit-summary-${citPeriodId}.csv`,
        },
      });
    }

    return new NextResponse(JSON.stringify(exportPayload.json, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=cit-summary-${citPeriodId}.json`,
      },
    });
  } catch (error) {
    logRouteError("cit export failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export the CIT workflow." },
      { status: 500 }
    );
  }
}
