import "server-only";

import { prisma } from "@/lib/prisma";
import { listWorkspaceClients } from "@/lib/clients";
import {
  getWorkspaceTaxRecords,
  resolveSummaryCurrency,
  summarizeDashboardOverview,
  summarizeTaxFiling,
  summarizeTaxReport,
} from "@/lib/tax-reporting";

type AssistantInvoiceRow = {
  invoiceNumber: string;
  clientName: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalAmountKobo: number;
};

type AssistantClientBalanceRow = {
  clientName: string;
  outstandingBalanceKobo: number;
  invoiceCount: number;
  totalBilledKobo: number;
  totalPaidKobo: number;
};

type AssistantExpenseRow = {
  label: string;
  amountKobo: number;
  count: number;
  sharePercent?: number;
};

type AssistantRecentTaxRecordRow = {
  date: string;
  kind: string;
  amountKobo: number;
  computedTaxKobo: number;
  description: string | null;
  vendorName: string | null;
  category: string | null;
};

export type WorkspaceAssistantSnapshot = {
  workspace: {
    id: number;
    name: string;
    generatedAt: string;
    currentDate: string;
    weekStart: string;
    weekEnd: string;
    monthStart: string;
    monthEnd: string;
  };
  overview: {
    totalClients: number;
    totalInvoices: number;
    openInvoices: number;
    paidInvoices: number;
    overdueInvoices: number;
    totalTaxRecords: number;
    outstandingReceivablesKobo: number;
  };
  tax: {
    recentReportWindow: {
      from: string;
      to: string;
      grossKobo: number;
      taxKobo: number;
      netKobo: number;
      taxPayableKobo: number;
      currency: string;
    };
    currentMonth: {
      vatCollectedKobo: number;
      vatPaidKobo: number;
      vatPayableKobo: number;
      whtTaxKobo: number;
      currency: string;
    };
    monthlyTrend: Array<{
      label: string;
      revenueKobo: number;
      expenseKobo: number;
      taxLiabilityKobo: number;
    }>;
  };
  receivables: {
    dueThisWeek: AssistantInvoiceRow[];
    overdue: AssistantInvoiceRow[];
    topOutstandingClients: AssistantClientBalanceRow[];
  };
  expenses: {
    topCategories90d: AssistantExpenseRow[];
    topVendors90d: AssistantExpenseRow[];
    recentExpenses: AssistantRecentTaxRecordRow[];
  };
  recentActivity: {
    recentInvoices: AssistantInvoiceRow[];
    recentTaxRecords: AssistantRecentTaxRecordRow[];
  };
};

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function buildInvoiceRow(invoice: {
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  client: { name: string; companyName: string | null } | null;
}): AssistantInvoiceRow {
  return {
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.client?.companyName?.trim() || invoice.client?.name || "Client",
    status: invoice.status,
    issueDate: formatDateInputValue(invoice.issueDate),
    dueDate: formatDateInputValue(invoice.dueDate),
    totalAmountKobo: invoice.totalAmount,
  };
}

function buildRecentTaxRecordRow(record: {
  occurredOn: Date;
  kind: string;
  amountKobo: number;
  computedTax: number;
  description: string | null;
  vendorName: string | null;
  category: { name: string } | null;
}): AssistantRecentTaxRecordRow {
  return {
    date: formatDateInputValue(record.occurredOn),
    kind: record.kind,
    amountKobo: record.amountKobo,
    computedTaxKobo: record.computedTax,
    description: record.description,
    vendorName: record.vendorName,
    category: record.category?.name ?? null,
  };
}

function summarizeTopExpenseVendors(records: Array<{
  kind: string;
  amountKobo: number;
  vendorName: string | null;
}>) {
  const vendorTotals = new Map<string, { amountKobo: number; count: number }>();

  for (const record of records) {
    if (record.kind !== "EXPENSE") continue;
    const label = record.vendorName?.trim();
    if (!label) continue;

    const current = vendorTotals.get(label) ?? { amountKobo: 0, count: 0 };
    current.amountKobo += record.amountKobo;
    current.count += 1;
    vendorTotals.set(label, current);
  }

  return Array.from(vendorTotals.entries())
    .map(([label, totals]) => ({
      label,
      amountKobo: totals.amountKobo,
      count: totals.count,
    }))
    .sort((left, right) => right.amountKobo - left.amountKobo)
    .slice(0, 6);
}

export async function buildWorkspaceAssistantSnapshot(workspaceId: number) {
  const now = new Date();
  const today = startOfToday();
  const weekStart = startOfWeekMonday(today);
  const weekEnd = endOfWeekSunday(today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const recentWindowStart = addDays(today, -179);
  const expenseWindowStart = addDays(today, -89);

  const [workspace, totalTaxRecords, invoices, clients, recentRecordsResult, expenseRecordsResult, currentMonthRecordsResult] =
    await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      prisma.taxRecord.count({ where: { workspaceId } }),
      prisma.invoice.findMany({
        where: { workspaceId },
        include: {
          client: {
            select: {
              name: true,
              companyName: true,
            },
          },
        },
        orderBy: [{ issueDate: "desc" }],
      }),
      listWorkspaceClients(workspaceId),
      getWorkspaceTaxRecords(workspaceId, {
        fromParam: formatDateInputValue(recentWindowStart),
        toParam: formatDateInputValue(today),
      }),
      getWorkspaceTaxRecords(workspaceId, {
        fromParam: formatDateInputValue(expenseWindowStart),
        toParam: formatDateInputValue(today),
      }),
      getWorkspaceTaxRecords(workspaceId, {
        fromParam: formatDateInputValue(monthStart),
        toParam: formatDateInputValue(monthEnd),
      }),
    ]);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const recentReportSummary = summarizeTaxReport(recentRecordsResult.records);
  const recentDashboardSummary = summarizeDashboardOverview(recentRecordsResult.records, {
    months: 6,
  });
  const currentMonthFiling = summarizeTaxFiling(currentMonthRecordsResult.records);

  const outstandingByClient = clients
    .filter((client) => client.outstandingBalance > 0)
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance)
    .slice(0, 8)
    .map((client) => ({
      clientName: client.displayName,
      outstandingBalanceKobo: client.outstandingBalance,
      invoiceCount: client.invoiceCount,
      totalBilledKobo: client.totalBilled,
      totalPaidKobo: client.totalPaid,
    }));

  const dueThisWeek = invoices
    .filter((invoice) => invoice.status !== "PAID")
    .filter((invoice) => invoice.dueDate >= weekStart && invoice.dueDate <= weekEnd)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
    .slice(0, 8)
    .map((invoice) => buildInvoiceRow(invoice));

  const overdueInvoices = invoices
    .filter((invoice) => invoice.status !== "PAID")
    .filter((invoice) => invoice.status === "OVERDUE" || invoice.dueDate < today)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
    .slice(0, 8)
    .map((invoice) => buildInvoiceRow(invoice));

  const recentInvoices = [...invoices]
    .sort((left, right) => right.issueDate.getTime() - left.issueDate.getTime())
    .slice(0, 8)
    .map((invoice) => buildInvoiceRow(invoice));

  const expenseVendorRows = summarizeTopExpenseVendors(
    expenseRecordsResult.records.map((record) => ({
      kind: record.kind,
      amountKobo: record.amountKobo,
      vendorName: record.vendorName,
    }))
  );

  const recentExpenseRows = expenseRecordsResult.records
    .filter((record) => record.kind === "EXPENSE")
    .sort((left, right) => right.occurredOn.getTime() - left.occurredOn.getTime())
    .slice(0, 8)
    .map((record) => buildRecentTaxRecordRow(record));

  const recentTaxRecordRows = recentRecordsResult.records
    .sort((left, right) => right.occurredOn.getTime() - left.occurredOn.getTime())
    .slice(0, 10)
    .map((record) => buildRecentTaxRecordRow(record));

  const outstandingReceivablesKobo = clients.reduce(
    (sum, client) => sum + client.outstandingBalance,
    0
  );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      generatedAt: now.toISOString(),
      currentDate: formatDateInputValue(today),
      weekStart: formatDateInputValue(weekStart),
      weekEnd: formatDateInputValue(weekEnd),
      monthStart: formatDateInputValue(monthStart),
      monthEnd: formatDateInputValue(monthEnd),
    },
    overview: {
      totalClients: clients.length,
      totalInvoices: invoices.length,
      openInvoices: invoices.filter((invoice) => invoice.status !== "PAID").length,
      paidInvoices: invoices.filter((invoice) => invoice.status === "PAID").length,
      overdueInvoices: invoices.filter((invoice) => invoice.status === "OVERDUE").length,
      totalTaxRecords,
      outstandingReceivablesKobo,
    },
    tax: {
      recentReportWindow: {
        from: formatDateInputValue(recentWindowStart),
        to: formatDateInputValue(today),
        grossKobo: recentReportSummary.totals.gross,
        taxKobo: recentReportSummary.totals.tax,
        netKobo: recentReportSummary.totals.net,
        taxPayableKobo: recentReportSummary.taxPayable,
        currency: resolveSummaryCurrency(recentReportSummary.totals),
      },
      currentMonth: {
        vatCollectedKobo: currentMonthFiling.vatCollected,
        vatPaidKobo: currentMonthFiling.vatPaid,
        vatPayableKobo: currentMonthFiling.vatPayable,
        whtTaxKobo: currentMonthFiling.whtTotals.tax,
        currency: resolveSummaryCurrency(currentMonthFiling.whtTotals),
      },
      monthlyTrend: recentDashboardSummary.monthlyTrendRows.map((row) => ({
        label: row.label,
        revenueKobo: row.revenue,
        expenseKobo: row.expenses,
        taxLiabilityKobo: row.taxLiability,
      })),
    },
    receivables: {
      dueThisWeek,
      overdue: overdueInvoices,
      topOutstandingClients: outstandingByClient,
    },
    expenses: {
      topCategories90d: recentDashboardSummary.expenseCategoryRows.map((row) => ({
        label: row.label,
        amountKobo: row.amount,
        count: row.count,
        sharePercent: Number((row.share * 100).toFixed(1)),
      })),
      topVendors90d: expenseVendorRows,
      recentExpenses: recentExpenseRows,
    },
    recentActivity: {
      recentInvoices,
      recentTaxRecords: recentTaxRecordRows,
    },
  } satisfies WorkspaceAssistantSnapshot;
}
