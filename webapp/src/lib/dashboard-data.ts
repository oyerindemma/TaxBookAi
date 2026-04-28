import "server-only";

import type { Prisma } from "@prisma/client";
import type {
  DashboardExpenseCategoryRow,
  DashboardMonthlyTrendRow,
} from "@/lib/tax-reporting";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getDashboardTaxCardSnapshot,
  type DashboardTaxCardSnapshot,
} from "@/lib/transaction-tax";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import { getUserWorkspaceSummary, type WorkspaceRole } from "@/lib/workspaces";

export type {
  DashboardExpenseCategoryRow,
  DashboardMonthlyTrendRow,
} from "@/lib/tax-reporting";

const DASHBOARD_MONTH_COUNT = 6;
const DASHBOARD_RECENT_ACTIVITY_LIMIT = 10;
const DASHBOARD_DATA_SCHEMA_TABLES = [
  "Workspace",
  "WorkspaceMember",
  "WorkspaceSubscription",
  "BusinessProfile",
  "WorkspaceOnboarding",
  "ClientBusiness",
  "TransactionCategory",
  "LedgerTransaction",
  "BankAccount",
  "BankTransaction",
  "TaxRecord",
] as const;
const DASHBOARD_DATA_SCHEMA_COLUMNS = [
  "Workspace.",
  "WorkspaceMember.",
  "WorkspaceSubscription.",
  "BusinessProfile.",
  "WorkspaceOnboarding.",
  "ClientBusiness.",
  "TransactionCategory.",
  "LedgerTransaction.",
  "BankAccount.",
  "BankTransaction.",
  "TaxRecord.",
] as const;
const DASHBOARD_LEDGER_SUPPORT = {
  tables: ["LedgerTransaction", "ClientBusiness", "TransactionCategory"],
  columns: [
    "LedgerTransaction.clientBusinessId",
    "LedgerTransaction.categoryId",
    "LedgerTransaction.transactionDate",
    "LedgerTransaction.description",
    "LedgerTransaction.reference",
    "LedgerTransaction.sourceDocumentNumber",
    "LedgerTransaction.direction",
    "LedgerTransaction.amountMinor",
    "LedgerTransaction.currency",
    "LedgerTransaction.reviewStatus",
    "LedgerTransaction.taxCategory",
    "LedgerTransaction.taxEvidenceStatus",
  ],
} as const;

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

const dashboardBankTransactionFallbackSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  currency: true,
  reviewStatus: true,
  suggestedCategoryName: true,
  category: {
    select: {
      name: true,
    },
  },
  suggestedCategory: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type DashboardBankTransactionFallbackRecord = Prisma.BankTransactionGetPayload<{
  select: typeof dashboardBankTransactionFallbackSelect;
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
  vatDueMinor: number;
  whtDueMinor: number;
  vatNetMinor: number;
  whtPayableMinor: number;
  taxSummaryDateLabel: string;
  taxSummaryGeneratedAt: string | null;
  currency: string;
  vatDueExplanation: string;
  whtDueExplanation: string;
  totalDueExplanation: string;
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

export type DashboardWorkspaceSummary = {
  workspaceId: number;
  workspaceName: string;
  role: WorkspaceRole;
  clientBusinessCount: number;
  membersCount: number;
  taxRecordsCount: number;
  trackedTransactionCount: number;
  representedCategoryCount: number;
  expenseCategoryCount: number;
  recentTransactionCount: number;
  lastTransactionAt: Date | null;
  expenseCategorizationRate: number;
};

export type DashboardPageData = {
  dashboard: DashboardData;
  workspaceSummary: DashboardWorkspaceSummary | null;
  errorMessage: string | null;
};

function isDashboardDataSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...DASHBOARD_DATA_SCHEMA_TABLES],
    columns: [...DASHBOARD_DATA_SCHEMA_COLUMNS],
  });
}

async function runDashboardDataQuerySafely<T>(input: {
  workspaceId: number;
  label: string;
  query: () => Promise<T>;
  fallback: () => T;
  support?: {
    tables?: readonly string[];
    columns?: readonly string[];
  };
}) {
  if (input.support && !(await hasPrismaDatabaseSupport(input.support))) {
    return input.fallback();
  }

  try {
    return await input.query();
  } catch (error) {
    logError(
      "dashboard-data",
      `Dashboard ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isDashboardDataSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function buildEmptyDashboardData(scope: DashboardData["scope"]): DashboardData {
  return {
    scope,
    kpis: {
      totalRevenueMinor: 0,
      totalExpensesMinor: 0,
      netProfitMinor: 0,
      taxDueMinor: 0,
      vatDueMinor: 0,
      whtDueMinor: 0,
      vatNetMinor: 0,
      whtPayableMinor: 0,
      taxSummaryDateLabel: "Current month",
      taxSummaryGeneratedAt: null,
      currency: "NGN",
      vatDueExplanation: "VAT due will appear here once workspace transactions are available.",
      whtDueExplanation: "WHT due will appear here once workspace transactions are available.",
      totalDueExplanation:
        "Total live tax due will appear here once workspace transactions are available.",
    },
    chart: buildMonthlyTrendRows([]),
    expenseBreakdown: [],
    recentActivity: [],
    expenseCategorizationRate: 0,
    recordCount: 0,
  };
}

function buildEmptyDashboardTaxCardSnapshot(): DashboardTaxCardSnapshot {
  const generatedAt = new Date().toISOString();

  return {
    dateLabel: "Current month",
    vatNetMinor: 0,
    whtPayableMinor: 0,
    vatDueMinor: 0,
    whtDueMinor: 0,
    totalDueMinor: 0,
    whtReceivableMinor: 0,
    estimatedTaxExposureMinor: 0,
    vatDueExplanation: "VAT due will appear here once workspace transactions are available.",
    whtDueExplanation: "WHT due will appear here once workspace transactions are available.",
    totalDueExplanation:
      "Total live tax due will appear here once workspace transactions are available.",
    generatedAt,
  };
}

function buildEmptyDashboardPageData(scope: DashboardData["scope"]): DashboardPageData {
  return {
    dashboard: buildEmptyDashboardData(scope),
    workspaceSummary: null,
    errorMessage: null,
  };
}

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

function formatStatusLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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

function resolveBankTransactionFallbackCurrency(
  records: DashboardBankTransactionFallbackRecord[]
) {
  const currencies = new Set(records.map((record) => record.currency).filter(Boolean));
  if (currencies.size === 0) return "NGN";
  return currencies.size === 1 ? [...currencies][0] : "MIXED";
}

function buildMonthlyTrendRowsFromBankTransactions(
  records: DashboardBankTransactionFallbackRecord[]
) {
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

    if (record.type === "CREDIT") {
      bucket.revenue += record.amount;
    }
    if (record.type === "DEBIT") {
      bucket.expenses += record.amount;
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

function buildExpenseBreakdownFromBankTransactions(
  records: DashboardBankTransactionFallbackRecord[]
) {
  const expenseRecords = records.filter((record) => record.type === "DEBIT");
  if (expenseRecords.length === 0) {
    return [] satisfies DashboardExpenseCategoryRow[];
  }

  const totalsByCategory = new Map<string, { amount: number; count: number }>();

  for (const record of expenseRecords) {
    const label =
      record.category?.name?.trim() ||
      record.suggestedCategory?.name?.trim() ||
      record.suggestedCategoryName?.trim() ||
      "Uncategorized";
    const bucket = totalsByCategory.get(label) ?? { amount: 0, count: 0 };
    bucket.amount += record.amount;
    bucket.count += 1;
    totalsByCategory.set(label, bucket);
  }

  const totalExpenseAmount = expenseRecords.reduce((sum, record) => sum + record.amount, 0);

  return Array.from(totalsByCategory.entries())
    .map(([label, totals]) => ({
      label,
      amount: totals.amount,
      count: totals.count,
      share: totalExpenseAmount > 0 ? totals.amount / totalExpenseAmount : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function buildRecentActivityFromBankTransactions(
  records: DashboardBankTransactionFallbackRecord[]
): DashboardRecentActivityRow[] {
  return records.map((record) => ({
    id: record.id,
    date: new Date(record.transactionDate),
    description: record.description.trim() || record.reference?.trim() || "Bank transaction",
    type: record.type === "CREDIT" ? "Income" : "Expense",
    amountMinor: record.amount,
    status: formatStatusLabel(record.reviewStatus),
    currency: record.currency,
  }));
}

export async function getDashboardData(input: {
  userId: number;
  workspaceId?: number | null;
}) {
  const scope = input.workspaceId ? "workspace" : "user";

  if (!input.workspaceId) {
    return buildEmptyDashboardData(scope);
  }

  const workspaceId = input.workspaceId;

  try {
    const supportsLedgerData = await hasPrismaDatabaseSupport(DASHBOARD_LEDGER_SUPPORT);
    const records: DashboardLedgerRecord[] = supportsLedgerData
      ? await runDashboardDataQuerySafely<DashboardLedgerRecord[]>({
          workspaceId,
          label: "ledger transactions query",
          query: () =>
            prisma.ledgerTransaction.findMany({
              where: {
                clientBusiness: {
                  workspaceId,
                  archivedAt: null,
                },
                reviewStatus: "POSTED",
              },
              select: dashboardLedgerSelect,
              orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
            }),
          fallback: () => [],
        })
      : [];
    const taxCards = await runDashboardDataQuerySafely<DashboardTaxCardSnapshot>({
      workspaceId,
      label: "tax cards query",
      query: () => getDashboardTaxCardSnapshot(workspaceId),
      fallback: buildEmptyDashboardTaxCardSnapshot,
    });

    if (!supportsLedgerData) {
      const bankTransactions =
        await runDashboardDataQuerySafely<DashboardBankTransactionFallbackRecord[]>({
          workspaceId,
          label: "bank transactions fallback query",
          query: () =>
            prisma.bankTransaction.findMany({
              where: {
                workspaceId,
              },
              select: dashboardBankTransactionFallbackSelect,
              orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
            }),
          fallback: () => [],
        });

      if (bankTransactions.length > 0) {
        const revenueMinor = bankTransactions.reduce((sum, record) => {
          return record.type === "CREDIT" ? sum + record.amount : sum;
        }, 0);
        const expenseMinor = bankTransactions.reduce((sum, record) => {
          return record.type === "DEBIT" ? sum + record.amount : sum;
        }, 0);
        const expenseRecords = bankTransactions.filter((record) => record.type === "DEBIT");
        const categorizedExpenseCount = expenseRecords.filter((record) =>
          Boolean(
            record.category?.name?.trim() ||
              record.suggestedCategory?.name?.trim() ||
              record.suggestedCategoryName?.trim()
          )
        ).length;

        return {
          scope,
          kpis: {
            totalRevenueMinor: revenueMinor,
            totalExpensesMinor: expenseMinor,
            netProfitMinor: revenueMinor - expenseMinor,
            taxDueMinor: taxCards.totalDueMinor,
            vatDueMinor: taxCards.vatDueMinor,
            whtDueMinor: taxCards.whtDueMinor,
            vatNetMinor: taxCards.vatNetMinor,
            whtPayableMinor: taxCards.whtPayableMinor,
            taxSummaryDateLabel: taxCards.dateLabel,
            taxSummaryGeneratedAt: taxCards.generatedAt,
            currency: resolveBankTransactionFallbackCurrency(bankTransactions),
            vatDueExplanation: taxCards.vatDueExplanation,
            whtDueExplanation: taxCards.whtDueExplanation,
            totalDueExplanation: taxCards.totalDueExplanation,
          },
          chart: buildMonthlyTrendRowsFromBankTransactions(bankTransactions),
          expenseBreakdown: buildExpenseBreakdownFromBankTransactions(bankTransactions),
          recentActivity: buildRecentActivityFromBankTransactions(
            bankTransactions.slice(0, DASHBOARD_RECENT_ACTIVITY_LIMIT)
          ),
          expenseCategorizationRate:
            expenseRecords.length === 0 ? 0 : categorizedExpenseCount / expenseRecords.length,
          recordCount: bankTransactions.length,
        } satisfies DashboardData;
      }
    }

    const recentRecords = records.slice(0, DASHBOARD_RECENT_ACTIVITY_LIMIT);

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
        taxDueMinor: taxCards.totalDueMinor,
        vatDueMinor: taxCards.vatDueMinor,
        whtDueMinor: taxCards.whtDueMinor,
        vatNetMinor: taxCards.vatNetMinor,
        whtPayableMinor: taxCards.whtPayableMinor,
        taxSummaryDateLabel: taxCards.dateLabel,
        taxSummaryGeneratedAt: taxCards.generatedAt,
        currency: resolveCurrency(records),
        vatDueExplanation: taxCards.vatDueExplanation,
        whtDueExplanation: taxCards.whtDueExplanation,
        totalDueExplanation: taxCards.totalDueExplanation,
      },
      chart: buildMonthlyTrendRows(records),
      expenseBreakdown: buildExpenseBreakdown(records),
      recentActivity: buildRecentActivity(recentRecords),
      expenseCategorizationRate:
        expenseRecords.length === 0 ? 0 : categorizedExpenseCount / expenseRecords.length,
      recordCount: records.length,
    } satisfies DashboardData;
  } catch (error) {
    logError("dashboard-data", "Failed to load dashboard data; returning empty KPI data.", error, {
      userId: input.userId,
      workspaceId: input.workspaceId,
    });

    return buildEmptyDashboardData(scope);
  }
}

export const loadDashboardData = getDashboardData;

export async function loadDashboardPageData(input: {
  userId: number;
  workspaceId?: number | null;
}): Promise<DashboardPageData> {
  const scope: DashboardData["scope"] = input.workspaceId ? "workspace" : "user";

  if (!input.workspaceId) {
    return buildEmptyDashboardPageData(scope);
  }

  const workspaceId = input.workspaceId;

  try {
    const dashboard = await getDashboardData(input);
    const workspaceSummary = await runDashboardDataQuerySafely({
      workspaceId,
      label: "workspace summary query",
      query: () => getUserWorkspaceSummary(input.userId, workspaceId),
      fallback: () => null,
    });
    const expenseCategoryCount = await runDashboardDataQuerySafely({
      workspaceId,
      label: "transaction category count query",
      query: () =>
        prisma.transactionCategory.count({
          where: {
            clientBusiness: {
              workspaceId,
              archivedAt: null,
            },
          },
        }),
      fallback: () => 0,
    });

    return {
      dashboard,
      workspaceSummary: workspaceSummary
        ? {
            workspaceId: workspaceSummary.id,
            workspaceName: workspaceSummary.name,
            role: workspaceSummary.role,
            clientBusinessCount: workspaceSummary.clientBusinessCount,
            membersCount: workspaceSummary.membersCount,
            taxRecordsCount: workspaceSummary.taxRecordsCount,
            trackedTransactionCount: workspaceSummary.transactionCount,
            representedCategoryCount: dashboard.expenseBreakdown.length,
            expenseCategoryCount,
            recentTransactionCount: dashboard.recentActivity.length,
            lastTransactionAt: dashboard.recentActivity[0]?.date ?? null,
            expenseCategorizationRate: dashboard.expenseCategorizationRate,
          }
        : null,
      errorMessage: null,
    };
  } catch (error) {
    logError("dashboard-data", "Failed to load dashboard page data", error, {
      userId: input.userId,
      workspaceId: input.workspaceId,
    });

    return {
      ...buildEmptyDashboardPageData(scope),
      errorMessage:
        "Dashboard data is temporarily unavailable. We could not load live workspace metrics right now.",
    };
  }
}
