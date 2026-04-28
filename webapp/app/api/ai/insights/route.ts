import { NextResponse } from "next/server";
import { buildEmptyWorkspaceFinancialInsights, getWorkspaceFinancialInsights } from "@/lib/ai/financial-insights";
import { requireRoleAtLeast, getAuthContext, getSessionFromCookies } from "@/lib/auth";
import type { PeriodComparisonMode } from "@/lib/accounting/period-compare";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function resolveComparisonMode(url: URL): PeriodComparisonMode {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && to) {
    return "CUSTOM_RANGE";
  }

  const compare = url.searchParams.get("compare")?.trim().toLowerCase();
  if (compare === "quarter") {
    return "CURRENT_QUARTER";
  }

  return "CURRENT_MONTH";
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getAuthContext();
  if (!ctx?.workspaceId) {
    return NextResponse.json(buildEmptyWorkspaceFinancialInsights(0), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const payload = await getWorkspaceFinancialInsights({
      workspaceId: ctx.workspaceId,
      mode: resolveComparisonMode(url),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("ai insights route failed", error, {
      workspaceId: ctx.workspaceId,
      userId: session.userId,
    });

    return NextResponse.json(
      {
        error: "Failed to load workspace financial insights.",
      },
      {
        status: 500,
      }
    );
  }
}
