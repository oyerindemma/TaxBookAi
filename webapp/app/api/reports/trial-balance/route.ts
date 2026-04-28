import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceTrialBalanceReport } from "@/lib/accounting-reports";
import {
  resolveAccountingReportPeriod,
  toAccountingReportPeriodSummary,
} from "@/lib/report-period";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const period = resolveAccountingReportPeriod({
    period: url.searchParams.get("period"),
    month: url.searchParams.get("month"),
    quarter: url.searchParams.get("quarter"),
    year: url.searchParams.get("year"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (period.errorMsg) {
    return NextResponse.json(
      {
        error: period.errorMsg,
        code: "INVALID_REPORT_PERIOD",
        period: toAccountingReportPeriodSummary(period),
      },
      { status: 400 }
    );
  }

  const response = await getWorkspaceTrialBalanceReport(ctx.workspaceId, period);
  return NextResponse.json(response);
}
