import "server-only";

import { getWorkspaceCashflowReport } from "@/lib/accounting-reports";
import {
  resolveAccountingReportPeriod,
  type ResolvedAccountingReportPeriod,
} from "@/lib/report-period";

export async function getCashFlowReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod = resolveAccountingReportPeriod({ period: "all" })
) {
  const envelope = await getWorkspaceCashflowReport(workspaceId, period);

  return {
    status: "ok" as const,
    inflow: envelope.report.totalCashIn,
    outflow: envelope.report.totalCashOut,
    netCash: envelope.report.netCashflow,
    empty: envelope.report.empty,
  };
}
