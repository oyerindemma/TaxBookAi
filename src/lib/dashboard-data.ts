import "server-only";

import type { Prisma, TaxType } from "@prisma/client";
import type {
  DashboardExpenseCategoryRow,
  DashboardMonthlyTrendRow,
} from "@/lib/tax-reporting";
import { prisma } from "@/lib/prisma";

export type {
  DashboardExpenseCategoryRow,
  DashboardMonthlyTrendRow,
} from "@/lib/tax-reporting";

const DASHBOARD_MONTH_COUNT = 6;
const OPEN_TAX_PERIOD_STATUSES = ["OPEN", "IN_REVIEW", "READY"] as const;
const OPEN_TAX_TYPES = ["VAT", "WHT"] as const satisfies TaxType[];

const dashboardLedgerSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  sourceDocumentNumber: true,
  direction: true,
  amountMinor: true,
  currency: true,
  reviewStatus: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  category: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

type DashboardLedgerRecord = Prisma.LedgerTransactionGetPayload<{
  select: typeof dashboardLedgerSelect;
}>;

export type DashboardRecentActivityRow = {
  id: number;
  date: Date;
  description: string;
  type: string;
  amountMinor: number;
  status: string;
  currency: string;
};

export type DashboardKpiData = {
  totalRevenueMinor: number;
  totalExpensesMinor: number;
  netProfitMinor: number;
  taxDueMinor: number;
  currency: string;
  taxDueUsesFallback: boolean;
};

export type DashboardData = {
  scope: "workspace" | "user";
  kpis: DashboardKpiData;
  chart: DashboardMonthlyTrendRow[];
  expenseBreakdown: DashboardExpenseCategoryRow[];
  recentActivity: DashboardRecentActivityRow[];
  expenseCategorizationRate: number;
  recordCount: number;
};

function isTaxEntry(record: DashboardLedgerRecord) {
  return record.taxCategory === "TAX_PAYMENT";
}

function getRecordType(record: DashboardLedgerRecord) {
  if (isTaxEntry(record)) return "TAX";
  if (record.direction === "MONEY_IN") return "INCOME";
  if (record.direction === "MONEY_OUT") return "EXPENSE";
  return "JOURNAL";
}

function titleCaseType(type: string) {
  const normalized = type.trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveCurrency(records: DashboardLedgerRecord[]) {
  const currencies = new Set(records.map((record) => record.currency).filter(Boolean));
  if (currencies.size === 0) return "NGN";
  return currencies.size === 1 ? [...currencies][0] : "MIXED";
}

function getMonthKey(dateInput: Date) {
  return `${dateInput.getUTCFullYear()}-${String(dateInput.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
  });
}

function getRecentMonthKeys(endDate: Date, count: number) {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - offset, 1)
    );
    keys.push(getMonthKey(monthDate));
  }
  return keys;
}

function buildMonthlyTrendRows(records: DashboardLedgerRecord[]) {
  const endDate = new Date();
  const monthKeys = getRecentMonthKeys(endDate, DASHBOARD_MONTH_COUNT);
  const totalsByMonth = new Map(
    monthKeys.map((key) => [
      key,
      {
        revenue: 0,
        expenses: 0,
        taxLiability: 0,
      },
    ])
  );

  for (const record of records) {
    const bucket = totalsByMonth.get(getMonthKey(new Date(record.transactionDate)));
    if (!bucket) continue;

    const type = getRecordType(record);
    if (type === "INCOME") {
      bucket.revenue += record.amountMinor;
    }
    if (type === "EXPENSE") {
      bucket.expenses += record.amountMinor;
    }
    if (type === "TAX") {
      bucket.taxLiability += record.amountMinor;
    }
  }

  return monthKeys.map((key) => {
    const bucket = totalsByMonth.get(key) ?? {
      revenue: 0,
      expenses: 0,
      taxLiability: 0,
    };

    return {
      key,
      label: getMonthLabel(key),
      revenue: bucket.revenue,
      expenses: bucket.expenses,
      taxLiability: bucket.taxLiability,
    };
  });
}

function buildExpenseBreakdown(records: DashboardLedgerRecord[]) {
  const expenseRecords = records.filter((record) => getRecordType(record) === "EXPENSE");
  if (expenseRecords.length === 0) {
    return [] satisfies DashboardExpenseCategoryRow[];
  }

  const totalsByCategory = new Map<string, { amount: number; count: number }>();

  for (const record of expenseRecords) {
    const label = record.category?.name?.trim() || "Uncategorized";
    const bucket = totalsByCategory.get(label) ?? { amount: 0, count: 0 };
    bucket.amount += record.amountMinor;
    bucket.count += 1;
    totalsByCategory.set(label, bucket);
  }

  const sortedRows = Array.from(totalsByCategory.entries())
    .map(([label, totals]) => ({
      label,
      amount: totals.amount,
      count: totals.count,
    }))
    .sort((left, right) => right.amount - left.amount);

  const collapsedRows =
    sortedRows.length > 5
      ? [
          ...sortedRows.slice(0, 5),
          sortedRows.slice(5).reduce(
            (other, row) => ({
              label: "Other",
              amount: other.amount + row.amount,
              count: other.count + row.count,
            }),
            { label: "Other", amount: 0, count: 0 }
          ),
        ]
      : sortedRows;

  const totalExpenseAmount = collapsedRows.reduce((sum, row) => sum + row.amount, 0);

  return collapsedRows.map((row) => ({
    label: row.label,
    amount: row.amount,
    count: row.count,
    share: totalExpenseAmount > 0 ? row.amount / totalExpenseAmount : 0,
  }));
}

function buildActivityDescription(record: DashboardLedgerRecord) {
  const description =
    record.description?.trim() ||
    record.reference?.trim() ||
    record.sourceDocumentNumber?.trim();

  if (description) return description;
  return `${titleCaseType(getRecordType(record))} entry`;
}

function buildActivityStatus(record: DashboardLedgerRecord) {
  switch (record.reviewStatus) {
    case "POSTED":
      return "Posted";
    case "IN_REVIEW":
      return "In review";
    case "DRAFT":
      return "Draft";
    default:
      if (record.taxEvidenceStatus === "VERIFIED") return "Verified";
      if (record.taxEvidenceStatus === "MISSING") return "Missing docs";
      return "Pending";
  }
}

function buildRecentActivity(records: DashboardLedgerRecord[]): DashboardRecentActivityRow[] {
  return records.map((record) => ({
    id: record.id,
    date: new Date(record.transactionDate),
    description: buildActivityDescription(record),
    type: titleCaseType(getRecordType(record)),
    amountMinor: record.amountMinor,
    status: buildActivityStatus(record),
    currency: record.currency,
  }));
}

async function getTaxDueMinor(workspaceId?: number | null) {
  if (!workspaceId) {
    return {
      taxDueMinor: 0,
      taxDueUsesFallback: true,
    };
  }

  const openTaxComputations = await prisma.taxComputation.findMany({
    where: {
      workspaceId,
      taxType: {
        in: [...OPEN_TAX_TYPES],
      },
      taxPeriod: {
        status: {
          in: [...OPEN_TAX_PERIOD_STATUSES],
        },
      },
    },
    select: {
      taxType: true,
      netVatMinor: true,
      whtDeductedMinor: true,
    },
  });

  if (openTaxComputations.length === 0) {
    return {
      taxDueMinor: 0,
      taxDueUsesFallback: false,
    };
  }

  const taxDueMinor = openTaxComputations.reduce((sum, computation) => {
    if (computation.taxType === "VAT") {
      return sum + Math.max(computation.netVatMinor, 0);
    }

    if (computation.taxType === "WHT") {
      return sum + Math.max(computation.whtDeductedMinor, 0);
    }

    return sum;
  }, 0);

  return {
    taxDueMinor,
    taxDueUsesFallback: false,
  };
}

export async function getDashboardData(input: {
  userId: number;
  workspaceId?: number | null;
}) {
  const scope = input.workspaceId ? "workspace" : "user";

  if (!input.workspaceId) {
    const taxDue = await getTaxDueMinor(null);

    return {
      scope,
      kpis: {
        totalRevenueMinor: 0,
        totalExpensesMinor: 0,
        netProfitMinor: 0,
        taxDueMinor: taxDue.taxDueMinor,
        currency: "NGN",
        taxDueUsesFallback: taxDue.taxDueUsesFallback,
      },
      chart: buildMonthlyTrendRows([]),
      expenseBreakdown: [],
      recentActivity: [],
      expenseCategorizationRate: 0,
      recordCount: 0,
    } satisfies DashboardData;
  }

  const ledgerWhere = {
    clientBusiness: {
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    OR: [
      {
        reviewStatus: "POSTED" as const,
      },
      {
        taxCategory: "TAX_PAYMENT" as const,
      },
    ],
  } satisfies Prisma.LedgerTransactionWhereInput;

  const [records, recentRecords, taxDue] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where: ledgerWhere,
      select: dashboardLedgerSelect,
      orderBy: {
        transactionDate: "desc",
      },
    }),
    prisma.ledgerTransaction.findMany({
      where: ledgerWhere,
      select: dashboardLedgerSelect,
      orderBy: {
        transactionDate: "desc",
      },
      take: 10,
    }),
    getTaxDueMinor(input.workspaceId),
  ]);

  const totalRevenueMinor = records.reduce((sum, record) => {
    return getRecordType(record) === "INCOME" ? sum + record.amountMinor : sum;
  }, 0);

  const totalExpensesMinor = records.reduce((sum, record) => {
    return getRecordType(record) === "EXPENSE" ? sum + record.amountMinor : sum;
  }, 0);

  const expenseRecords = records.filter((record) => getRecordType(record) === "EXPENSE");
  const categorizedExpenseCount = expenseRecords.filter((record) =>
    Boolean(record.category?.name?.trim())
  ).length;

  return {
    scope,
    kpis: {
      totalRevenueMinor,
      totalExpensesMinor,
      netProfitMinor: totalRevenueMinor - totalExpensesMinor,
      taxDueMinor: taxDue.taxDueMinor,
      currency: resolveCurrency(records),
      taxDueUsesFallback: taxDue.taxDueUsesFallback,
    },
    chart: buildMonthlyTrendRows(records),
    expenseBreakdown: buildExpenseBreakdown(records),
    recentActivity: buildRecentActivity(recentRecords),
    expenseCategorizationRate:
      expenseRecords.length === 0 ? 0 : categorizedExpenseCount / expenseRecords.length,
    recordCount: records.length,
  } satisfies DashboardData;
}

export const loadDashboardData = getDashboardData;
