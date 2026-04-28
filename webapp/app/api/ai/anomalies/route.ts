import { NextResponse } from "next/server";
import { buildEmptyWorkspaceAnomalySnapshot, getWorkspaceAnomalySnapshot } from "@/lib/ai/anomaly-detection";
import { requireRoleAtLeast, getAuthContext, getSessionFromCookies } from "@/lib/auth";
import { syncAnomaliesToAlerts } from "@/lib/alerts/sync-anomalies";
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

function parseSync(raw: string | null) {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getAuthContext();
  if (!ctx?.workspaceId) {
    return NextResponse.json(buildEmptyWorkspaceAnomalySnapshot(0), {
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
    const mode = resolveComparisonMode(url);
    const payload = await getWorkspaceAnomalySnapshot({
      workspaceId: ctx.workspaceId,
      mode,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    if (parseSync(url.searchParams.get("sync"))) {
      await syncAnomaliesToAlerts({
        workspaceId: ctx.workspaceId,
        snapshot: payload,
      });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("ai anomalies route failed", error, {
      workspaceId: ctx.workspaceId,
      userId: session.userId,
    });

    return NextResponse.json(
      {
        error: "Failed to load workspace anomalies.",
      },
      {
        status: 500,
      }
    );
  }
}
