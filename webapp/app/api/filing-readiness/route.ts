import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFilingReadiness } from "@/lib/filing-readiness";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseDateParam(raw: string | null, endOfDay = false) {
  if (!raw) return null;

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!exactDate) {
    return null;
  }

  const parsed = new Date(
    Date.UTC(
      Number(exactDate[1]),
      Number(exactDate[2]) - 1,
      Number(exactDate[3]),
      endOfDay ? 23 : 12,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    )
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  try {
    const url = new URL(req.url);
    const dateFrom = parseDateParam(url.searchParams.get("dateFrom"));
    const dateTo = parseDateParam(url.searchParams.get("dateTo"), true);

    const readiness = await getWorkspaceFilingReadiness({
      workspaceId: ctx.workspaceId,
      dateFrom,
      dateTo,
      defaultDateWindowApplied: !dateFrom && !dateTo,
    });

    return NextResponse.json(readiness, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("filing readiness load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to load filing readiness." },
      { status: 500 }
    );
  }
}
