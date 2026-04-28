import "server-only";

import { getWorkspaceBalanceSheetReport } from "@/lib/accounting-reports";
import {
  resolveAccountingReportPeriod,
  type ResolvedAccountingReportPeriod,
} from "@/lib/report-period";

export async function getBalanceSheetReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod = resolveAccountingReportPeriod({ period: "all" })
) {
  const envelope = await getWorkspaceBalanceSheetReport(workspaceId, period);

  return {
    status: "ok" as const,
    assets: envelope.report.totalAssets,
    liabilities: envelope.report.totalLiabilities,
    equity: envelope.report.totalEquity,
    isBalanced: envelope.report.validation.isBalanced,
    difference: envelope.report.validation.difference,
    empty: envelope.report.empty,
  };
}
