import "server-only";

import { getWorkspaceProfitLossReport } from "@/lib/accounting-reports";
import {
  resolveAccountingReportPeriod,
  type ResolvedAccountingReportPeriod,
} from "@/lib/report-period";

export async function getProfitAndLossReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod = resolveAccountingReportPeriod({ period: "all" })
) {
  const envelope = await getWorkspaceProfitLossReport(workspaceId, period);

  return {
    status: "ok" as const,
    revenue: envelope.report.totalRevenue,
    expenses: envelope.report.totalExpenses,
    profit: envelope.report.netProfit,
    netProfit: envelope.report.netProfit,
    breakdown: [
      ...envelope.report.revenueAccounts,
      ...envelope.report.expenseAccounts,
    ],
    empty: envelope.report.empty,
  };
}
