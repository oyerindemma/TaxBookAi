import "server-only";

import type {
  ExpenseLeakFindingSeverity as PrismaExpenseLeakFindingSeverity,
  ExpenseLeakFindingStatus as PrismaExpenseLeakFindingStatus,
  ExpenseLeakFindingType as PrismaExpenseLeakFindingType,
  Prisma,
} from "@prisma/client";
import { logError } from "@/lib/logger";
import { OfflineSyncConflictError } from "@/lib/offline-sync-server";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import {
  createExpenseLeakSeverityCountMap,
  createExpenseLeakTypeCountMap,
  type DashboardExpenseLeakSnapshot,
  type ExpenseLeakCenterResponse,
  type ExpenseLeakEvidenceLink,
  type ExpenseLeakFindingListItem,
  type ExpenseLeakFindingSeverity,
  type ExpenseLeakFindingStatus,
  type ExpenseLeakFindingType,
} from "@/lib/expense-leak-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FINDING_LIMIT = 60;
const DASHBOARD_FINDING_LIMIT = 4;
const RECURRING_LOOKBACK_DAYS = 400;
const RECURRING_MIN_OCCURRENCES = 3;
const RECURRING_MAX_EVIDENCE = 4;
const RECURRING_MIN_INTERVAL_DAYS = 20;
const RECURRING_MAX_INTERVAL_DAYS = 40;
const RECURRING_AMOUNT_VARIANCE_RATIO = 0.18;
const DUPLICATE_LOOKBACK_DAYS = 120;
const DUPLICATE_WINDOW_DAYS = 7;
const DUPLICATE_MAX_AMOUNT_DELTA_RATIO = 0.02;
const DUPLICATE_MIN_AMOUNT_DELTA_MINOR = 500;
const SPIKE_MAX_EVIDENCE = 5;
const SPIKE_RATIO_THRESHOLD = 1.8;
const SPIKE_MIN_DELTA_MINOR = 50_000;
const SPIKE_MIN_CURRENT_TOTAL_MINOR = 100_000;
const DETECTED_FINDING_TYPES: PrismaExpenseLeakFindingType[] = [
  "RECURRING_SPEND",
  "DUPLICATE_VENDOR_CHARGE",
  "MONTH_OVER_MONTH_SPIKE",
];
const EXPENSE_LEAK_SCHEMA_TABLES = [
  "ExpenseLeakFinding",
  "BankTransaction",
  "ClientBusiness",
  "TransactionCategory",
  "Workspace",
] as const;
const EXPENSE_LEAK_SCHEMA_COLUMNS = [
  "ExpenseLeakFinding.",
  "BankTransaction.",
  "ClientBusiness.",
  "TransactionCategory.",
  "Workspace.",
] as const;
const EXPENSE_LEAK_STORAGE_SUPPORT = {
  tables: ["ExpenseLeakFinding"],
} as const;
const EXPENSE_LEAK_ANALYTICS_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.reviewStatus",
    "BankTransaction.normalizedMerchantName",
    "BankTransaction.categoryId",
  ],
} as const;

const expenseLeakSelect = {
  id: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  summary: true,
  explanation: true,
  estimatedSavingsMinor: true,
  currency: true,
  recommendedActionLabel: true,
  recommendedActionHref: true,
  primaryRecordType: true,
  primaryRecordId: true,
  primaryRecordHref: true,
  recordCount: true,
  evidencePayload: true,
  metadataPayload: true,
  firstDetectedAt: true,
  lastDetectedAt: true,
  dismissedAt: true,
  resolvedAt: true,
  lastStatusChangedAt: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ExpenseLeakFindingSelect;

const expenseTransactionSelect = {
  id: true,
  clientBusinessId: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  currency: true,
  type: true,
  status: true,
  reviewStatus: true,
  normalizedMerchantName: true,
  suggestedCounterparty: true,
  suggestedCategoryName: true,
  categoryId: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type ExpenseLeakRecord = Prisma.ExpenseLeakFindingGetPayload<{
  select: typeof expenseLeakSelect;
}>;

type ExpenseTransaction = Prisma.BankTransactionGetPayload<{
  select: typeof expenseTransactionSelect;
}>;

type DetectedExpenseLeakFinding = {
  workspaceId: number;
  clientBusinessId: number | null;
  type: PrismaExpenseLeakFindingType;
  severity: PrismaExpenseLeakFindingSeverity;
  dedupeKey: string;
  title: string;
  summary: string;
  explanation: string | null;
  estimatedSavingsMinor: number;
  currency: string;
  recommendedActionLabel: string | null;
  recommendedActionHref: string | null;
  primaryRecordType: string | null;
  primaryRecordId: number | null;
  primaryRecordHref: string | null;
  recordCount: number;
  evidenceLinks: ExpenseLeakEvidenceLink[];
  metadata: Record<string, unknown> | null;
};

type ExpenseLeakFilters = {
  workspaceId: number;
  query?: string | null;
  status?: ExpenseLeakFindingStatus | "ALL" | null;
  severity?: ExpenseLeakFindingSeverity | "ALL" | null;
  type?: ExpenseLeakFindingType | "ALL" | null;
  limit?: number | null;
  sync?: boolean;
};

function isExpenseLeakSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...EXPENSE_LEAK_SCHEMA_TABLES],
    columns: [...EXPENSE_LEAK_SCHEMA_COLUMNS],
  });
}

async function runExpenseLeakStepSafely<T>(input: {
  workspaceId: number;
  label: string;
  query: Promise<T>;
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
    return await input.query;
  } catch (error) {
    logError(
      "expense-leaks",
      `Expense leak ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isExpenseLeakSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function buildEmptyExpenseLeakCenterData(workspaceId: number): ExpenseLeakCenterResponse {
  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspaceId,
    },
    summary: {
      totalCount: 0,
      openCount: 0,
      dismissedCount: 0,
      resolvedCount: 0,
      criticalOpenCount: 0,
      warningOpenCount: 0,
      infoOpenCount: 0,
      openEstimatedSavingsMinor: 0,
      byType: createExpenseLeakTypeCountMap(),
      bySeverity: createExpenseLeakSeverityCountMap(),
    },
    findings: [],
  };
}

function buildEmptyDashboardExpenseLeakSnapshot(
  workspaceId: number
): DashboardExpenseLeakSnapshot {
  const center = buildEmptyExpenseLeakCenterData(workspaceId);

  return {
    generatedAt: center.generatedAt,
    summary: {
      openCount: 0,
      criticalCount: 0,
      openEstimatedSavingsMinor: 0,
      recurringCount: 0,
    },
    topFindings: [],
  };
}

function findingStatusRank(status: ExpenseLeakFindingStatus) {
  if (status === "OPEN") return 0;
  if (status === "DISMISSED") return 1;
  return 2;
}

function findingSeverityRank(severity: ExpenseLeakFindingSeverity) {
  if (severity === "CRITICAL") return 0;
  if (severity === "WARNING") return 1;
  return 2;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function truncate(value: string | null | undefined, maxLength = 48) {
  const normalized = normalizeText(value);
  if (!normalized) return "Untitled transaction";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseJsonString<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function inferSeverity(estimatedSavingsMinor: number): PrismaExpenseLeakFindingSeverity {
  if (estimatedSavingsMinor >= 500_000) return "CRITICAL";
  if (estimatedSavingsMinor >= 150_000) return "WARNING";
  return "INFO";
}

function buildEvidenceLink(transaction: ExpenseTransaction): ExpenseLeakEvidenceLink {
  return {
    recordType: "BANK_TRANSACTION",
    recordId: transaction.id,
    href: `/dashboard/banking/review?transactionId=${transaction.id}`,
    label: truncate(transaction.description),
    secondaryLabel: `${formatDate(transaction.transactionDate)} · ${formatMoney(
      transaction.amount,
      transaction.currency
    )}`,
  };
}

function getMerchantLabel(transaction: ExpenseTransaction) {
  return (
    normalizeText(transaction.normalizedMerchantName) ||
    normalizeText(transaction.suggestedCounterparty) ||
    ""
  );
}

function getRecurringGroupKey(transaction: ExpenseTransaction) {
  const merchantKey = normalizeKey(getMerchantLabel(transaction));
  if (!merchantKey) return null;
  return `${transaction.clientBusinessId ?? 0}:${merchantKey}`;
}

function getSpikeGroup(input: ExpenseTransaction) {
  const merchantKey = normalizeKey(getMerchantLabel(input));
  if (merchantKey) {
    return {
      key: `merchant:${input.clientBusinessId ?? 0}:${merchantKey}`,
      label: getMerchantLabel(input),
    };
  }

  const categoryLabel =
    normalizeText(input.category?.name) || normalizeText(input.suggestedCategoryName);
  if (categoryLabel) {
    return {
      key: `category:${input.clientBusinessId ?? 0}:${normalizeKey(categoryLabel)}`,
      label: categoryLabel,
    };
  }

  return null;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getCurrentAndPreviousMonthRange(now = new Date()) {
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const currentMonthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  const previousMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );
  const previousMonthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)
  );

  return {
    currentMonthStart,
    currentMonthEnd,
    previousMonthStart,
    previousMonthEnd,
    currentMonthKey: monthKey(currentMonthStart),
  };
}

function serializeExpenseLeakFinding(record: ExpenseLeakRecord): ExpenseLeakFindingListItem {
  return {
    id: record.id,
    type: record.type,
    severity: record.severity,
    status: record.status,
    title: record.title,
    summary: record.summary,
    explanation: record.explanation,
    estimatedSavingsMinor: record.estimatedSavingsMinor,
    currency: record.currency,
    recommendedActionLabel: record.recommendedActionLabel,
    recommendedActionHref: record.recommendedActionHref,
    primaryRecordType: record.primaryRecordType,
    primaryRecordId: record.primaryRecordId,
    primaryRecordHref: record.primaryRecordHref,
    recordCount: record.recordCount,
    evidenceLinks:
      parseJsonString<ExpenseLeakEvidenceLink[]>(record.evidencePayload) ?? [],
    metadata: parseJsonString<Record<string, unknown>>(record.metadataPayload),
    firstDetectedAt: record.firstDetectedAt.toISOString(),
    lastDetectedAt: record.lastDetectedAt.toISOString(),
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    lastStatusChangedAt: record.lastStatusChangedAt?.toISOString() ?? null,
    clientBusiness: record.clientBusiness
      ? {
          id: record.clientBusiness.id,
          name: record.clientBusiness.name,
        }
      : null,
  };
}

function buildExpenseLeakSummary(findings: ExpenseLeakFindingListItem[]) {
  const byType = createExpenseLeakTypeCountMap();
  const bySeverity = createExpenseLeakSeverityCountMap();
  let openCount = 0;
  let dismissedCount = 0;
  let resolvedCount = 0;
  let criticalOpenCount = 0;
  let warningOpenCount = 0;
  let infoOpenCount = 0;
  let openEstimatedSavingsMinor = 0;

  for (const finding of findings) {
    byType[finding.type] += 1;
    bySeverity[finding.severity] += 1;

    if (finding.status === "OPEN") {
      openCount += 1;
      openEstimatedSavingsMinor += finding.estimatedSavingsMinor;
      if (finding.severity === "CRITICAL") criticalOpenCount += 1;
      if (finding.severity === "WARNING") warningOpenCount += 1;
      if (finding.severity === "INFO") infoOpenCount += 1;
    } else if (finding.status === "DISMISSED") {
      dismissedCount += 1;
    } else {
      resolvedCount += 1;
    }
  }

  return {
    totalCount: findings.length,
    openCount,
    dismissedCount,
    resolvedCount,
    criticalOpenCount,
    warningOpenCount,
    infoOpenCount,
    openEstimatedSavingsMinor,
    byType,
    bySeverity,
  };
}

function filterExpenseLeakFindings(
  findings: ExpenseLeakFindingListItem[],
  input: Pick<ExpenseLeakFilters, "query" | "status" | "severity" | "type" | "limit">
) {
  const query = normalizeKey(input.query);

  const filtered = findings.filter((finding) => {
    if (input.status && input.status !== "ALL" && finding.status !== input.status) {
      return false;
    }
    if (
      input.severity &&
      input.severity !== "ALL" &&
      finding.severity !== input.severity
    ) {
      return false;
    }
    if (input.type && input.type !== "ALL" && finding.type !== input.type) {
      return false;
    }
    if (!query) {
      return true;
    }

    const haystack = [
      finding.title,
      finding.summary,
      finding.explanation ?? "",
      finding.clientBusiness?.name ?? "",
      ...finding.evidenceLinks.map(
        (link) => `${link.label} ${link.secondaryLabel ?? ""}`
      ),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  filtered.sort((left, right) => {
    const statusDelta = findingStatusRank(left.status) - findingStatusRank(right.status);
    if (statusDelta !== 0) return statusDelta;

    if (right.estimatedSavingsMinor !== left.estimatedSavingsMinor) {
      return right.estimatedSavingsMinor - left.estimatedSavingsMinor;
    }

    const severityDelta =
      findingSeverityRank(left.severity) - findingSeverityRank(right.severity);
    if (severityDelta !== 0) return severityDelta;

    return (
      new Date(right.lastDetectedAt).getTime() - new Date(left.lastDetectedAt).getTime()
    );
  });

  return typeof input.limit === "number" && input.limit > 0
    ? filtered.slice(0, input.limit)
    : filtered;
}

async function loadExpenseTransactions(workspaceId: number, since: Date) {
  try {
    return await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        transactionDate: {
          gte: since,
        },
        type: "DEBIT",
        status: {
          not: "IGNORED",
        },
        ignoredAt: null,
        amount: {
          gt: 0,
        },
      },
      orderBy: {
        transactionDate: "asc",
      },
      select: expenseTransactionSelect,
    });
  } catch (error) {
    logError(
      "expense-leaks",
      "Expense transaction query failed; returning no transactions for leak detection.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isExpenseLeakSchemaCompatibilityError(error),
      }
    );

    return [];
  }
}

async function detectRecurringSpendFindings(
  workspaceId: number
): Promise<DetectedExpenseLeakFinding[]> {
  const since = new Date(Date.now() - RECURRING_LOOKBACK_DAYS * DAY_IN_MS);
  const transactions = await loadExpenseTransactions(workspaceId, since);
  const grouped = new Map<string, ExpenseTransaction[]>();

  for (const transaction of transactions) {
    const groupKey = getRecurringGroupKey(transaction);
    if (!groupKey) continue;

    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(transaction);
    grouped.set(groupKey, bucket);
  }

  const findings: DetectedExpenseLeakFinding[] = [];
  const now = new Date();

  for (const [groupKey, group] of grouped.entries()) {
    if (group.length < RECURRING_MIN_OCCURRENCES) {
      continue;
    }

    const recent = group.slice(-RECURRING_MAX_EVIDENCE);
    const intervals = recent.slice(1).map((transaction, index) => {
      const previous = recent[index];
      return Math.round(
        (transaction.transactionDate.getTime() - previous.transactionDate.getTime()) /
          DAY_IN_MS
      );
    });

    if (intervals.length < RECURRING_MIN_OCCURRENCES - 1) {
      continue;
    }

    const averageIntervalDays =
      intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const monthsCovered = new Set(recent.map((item) => monthKey(item.transactionDate))).size;
    if (
      monthsCovered < RECURRING_MIN_OCCURRENCES ||
      averageIntervalDays < RECURRING_MIN_INTERVAL_DAYS ||
      averageIntervalDays > RECURRING_MAX_INTERVAL_DAYS
    ) {
      continue;
    }

    const averageAmountMinor =
      recent.reduce((sum, transaction) => sum + transaction.amount, 0) / recent.length;
    const amountTolerance = Math.max(
      DUPLICATE_MIN_AMOUNT_DELTA_MINOR,
      Math.round(averageAmountMinor * RECURRING_AMOUNT_VARIANCE_RATIO)
    );
    const allAmountsStable = recent.every(
      (transaction) => Math.abs(transaction.amount - averageAmountMinor) <= amountTolerance
    );
    if (!allAmountsStable) {
      continue;
    }

    const latest = recent[recent.length - 1];
    if (now.getTime() - latest.transactionDate.getTime() > 60 * DAY_IN_MS) {
      continue;
    }

    const label = getMerchantLabel(latest);
    const estimatedSavingsMinor = Math.round(averageAmountMinor);
    const evidenceLinks = recent.slice(-RECURRING_MAX_EVIDENCE).reverse().map(buildEvidenceLink);

    findings.push({
      workspaceId,
      clientBusinessId: latest.clientBusinessId,
      type: "RECURRING_SPEND",
      severity: inferSeverity(estimatedSavingsMinor),
      dedupeKey: `RECURRING_SPEND:${groupKey}`,
      title: "Recurring spend pattern detected",
      summary: `${label} has charged about ${formatMoney(
        estimatedSavingsMinor,
        latest.currency
      )} on a repeating monthly pattern.`,
      explanation: `The last ${recent.length} charges landed about every ${Math.round(
        averageIntervalDays
      )} days with very similar amounts.`,
      estimatedSavingsMinor,
      currency: latest.currency,
      recommendedActionLabel: "Review recurring charges",
      recommendedActionHref: `/dashboard/banking/review?transactionId=${latest.id}`,
      primaryRecordType: "BANK_TRANSACTION",
      primaryRecordId: latest.id,
      primaryRecordHref: `/dashboard/banking/review?transactionId=${latest.id}`,
      recordCount: recent.length,
      evidenceLinks,
      metadata: {
        merchant: label,
        averageIntervalDays: Math.round(averageIntervalDays),
        averageAmountMinor: estimatedSavingsMinor,
        occurrences: group.length,
        monthsCovered,
        clientBusinessName: latest.clientBusiness?.name ?? null,
      },
    });
  }

  return findings
    .sort((left, right) => right.estimatedSavingsMinor - left.estimatedSavingsMinor)
    .slice(0, 18);
}

async function detectDuplicateVendorChargeFindings(
  workspaceId: number
): Promise<DetectedExpenseLeakFinding[]> {
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * DAY_IN_MS);
  const transactions = await loadExpenseTransactions(workspaceId, since);
  const grouped = new Map<string, ExpenseTransaction[]>();

  for (const transaction of transactions) {
    const groupKey = getRecurringGroupKey(transaction);
    if (!groupKey) continue;

    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(transaction);
    grouped.set(groupKey, bucket);
  }

  const findings: DetectedExpenseLeakFinding[] = [];
  const pairedIds = new Set<number>();

  for (const group of grouped.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index];
      if (pairedIds.has(current.id)) {
        continue;
      }

      for (let candidateIndex = index + 1; candidateIndex < group.length; candidateIndex += 1) {
        const candidate = group[candidateIndex];
        if (pairedIds.has(candidate.id)) {
          continue;
        }

        const daysApart = Math.round(
          (candidate.transactionDate.getTime() - current.transactionDate.getTime()) / DAY_IN_MS
        );
        if (daysApart > DUPLICATE_WINDOW_DAYS) {
          break;
        }

        const amountTolerance = Math.max(
          DUPLICATE_MIN_AMOUNT_DELTA_MINOR,
          Math.round(Math.max(current.amount, candidate.amount) * DUPLICATE_MAX_AMOUNT_DELTA_RATIO)
        );
        if (Math.abs(current.amount - candidate.amount) > amountTolerance) {
          continue;
        }

        pairedIds.add(current.id);
        pairedIds.add(candidate.id);

        const label = getMerchantLabel(candidate);
        const estimatedSavingsMinor = Math.min(current.amount, candidate.amount);
        const dedupeKey = `DUPLICATE_VENDOR_CHARGE:${Math.min(current.id, candidate.id)}:${Math.max(
          current.id,
          candidate.id
        )}`;

        findings.push({
          workspaceId,
          clientBusinessId: candidate.clientBusinessId,
          type: "DUPLICATE_VENDOR_CHARGE",
          severity: inferSeverity(estimatedSavingsMinor),
          dedupeKey,
          title: "Possible duplicate vendor charge",
          summary: `${label} appears to have charged the workspace twice within ${daysApart} day${
            daysApart === 1 ? "" : "s"
          }.`,
          explanation:
            current.reference && candidate.reference
              ? `References ${current.reference} and ${candidate.reference} are close in time and amount, so this pair is worth checking.`
              : "The two charges share the same merchant pattern and near-identical amounts.",
          estimatedSavingsMinor,
          currency: candidate.currency,
          recommendedActionLabel: "Inspect the duplicate pair",
          recommendedActionHref: `/dashboard/banking/review?transactionId=${candidate.id}`,
          primaryRecordType: "BANK_TRANSACTION",
          primaryRecordId: candidate.id,
          primaryRecordHref: `/dashboard/banking/review?transactionId=${candidate.id}`,
          recordCount: 2,
          evidenceLinks: [buildEvidenceLink(candidate), buildEvidenceLink(current)],
          metadata: {
            merchant: label,
            daysApart,
            amountDeltaMinor: Math.abs(current.amount - candidate.amount),
            clientBusinessName: candidate.clientBusiness?.name ?? null,
          },
        });
        break;
      }
    }
  }

  return findings
    .sort((left, right) => right.estimatedSavingsMinor - left.estimatedSavingsMinor)
    .slice(0, 24);
}

async function detectMonthOverMonthSpikeFindings(
  workspaceId: number
): Promise<DetectedExpenseLeakFinding[]> {
  const {
    currentMonthStart,
    currentMonthEnd,
    previousMonthStart,
    previousMonthEnd,
    currentMonthKey,
  } = getCurrentAndPreviousMonthRange();
  let transactions: ExpenseTransaction[] = [];

  try {
    transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        transactionDate: {
          gte: previousMonthStart,
          lte: currentMonthEnd,
        },
        type: "DEBIT",
        status: {
          not: "IGNORED",
        },
        ignoredAt: null,
        amount: {
          gt: 0,
        },
      },
      orderBy: {
        transactionDate: "asc",
      },
      select: expenseTransactionSelect,
    });
  } catch (error) {
    logError(
      "expense-leaks",
      "Month-over-month spike query failed; returning no spike findings.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isExpenseLeakSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  const grouped = new Map<
    string,
    {
      clientBusinessId: number | null;
      label: string;
      currency: string;
      currentMonth: ExpenseTransaction[];
      previousMonth: ExpenseTransaction[];
      clientBusinessName: string | null;
    }
  >();

  for (const transaction of transactions) {
    const group = getSpikeGroup(transaction);
    if (!group) continue;

    const bucket = grouped.get(group.key) ?? {
      clientBusinessId: transaction.clientBusinessId,
      label: group.label,
      currency: transaction.currency,
      currentMonth: [],
      previousMonth: [],
      clientBusinessName: transaction.clientBusiness?.name ?? null,
    };

    if (
      transaction.transactionDate.getTime() >= currentMonthStart.getTime() &&
      transaction.transactionDate.getTime() <= currentMonthEnd.getTime()
    ) {
      bucket.currentMonth.push(transaction);
    } else if (
      transaction.transactionDate.getTime() >= previousMonthStart.getTime() &&
      transaction.transactionDate.getTime() <= previousMonthEnd.getTime()
    ) {
      bucket.previousMonth.push(transaction);
    }

    grouped.set(group.key, bucket);
  }

  const findings: DetectedExpenseLeakFinding[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    if (group.currentMonth.length === 0 || group.previousMonth.length === 0) {
      continue;
    }

    const currentTotal = group.currentMonth.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );
    const previousTotal = group.previousMonth.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );

    if (currentTotal < SPIKE_MIN_CURRENT_TOTAL_MINOR || previousTotal <= 0) {
      continue;
    }

    const ratio = currentTotal / previousTotal;
    const delta = currentTotal - previousTotal;
    if (ratio < SPIKE_RATIO_THRESHOLD || delta < SPIKE_MIN_DELTA_MINOR) {
      continue;
    }

    const latest = [...group.currentMonth].sort(
      (left, right) => right.transactionDate.getTime() - left.transactionDate.getTime()
    )[0];
    const currentEvidence = [...group.currentMonth]
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 3)
      .map(buildEvidenceLink);
    const baselineEvidence = [...group.previousMonth]
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 2)
      .map(buildEvidenceLink);

    findings.push({
      workspaceId,
      clientBusinessId: group.clientBusinessId,
      type: "MONTH_OVER_MONTH_SPIKE",
      severity: inferSeverity(delta),
      dedupeKey: `MONTH_OVER_MONTH_SPIKE:${currentMonthKey}:${groupKey}`,
      title: "Month-over-month spend spike detected",
      summary: `${group.label} moved from ${formatMoney(
        previousTotal,
        group.currency
      )} last month to ${formatMoney(currentTotal, group.currency)} this month.`,
      explanation: `That is about ${ratio.toFixed(1)}x higher month on month, with an incremental spend of ${formatMoney(
        delta,
        group.currency
      )}.`,
      estimatedSavingsMinor: delta,
      currency: group.currency,
      recommendedActionLabel: "Inspect the spike",
      recommendedActionHref: `/dashboard/banking/review?transactionId=${latest.id}`,
      primaryRecordType: "BANK_TRANSACTION",
      primaryRecordId: latest.id,
      primaryRecordHref: `/dashboard/banking/review?transactionId=${latest.id}`,
      recordCount: group.currentMonth.length + group.previousMonth.length,
      evidenceLinks: [...currentEvidence, ...baselineEvidence].slice(0, SPIKE_MAX_EVIDENCE),
      metadata: {
        currentMonthKey,
        currentTotalMinor: currentTotal,
        previousTotalMinor: previousTotal,
        ratio,
        deltaMinor: delta,
        clientBusinessName: group.clientBusinessName,
      },
    });
  }

  return findings
    .sort((left, right) => right.estimatedSavingsMinor - left.estimatedSavingsMinor)
    .slice(0, 18);
}

async function detectExpenseLeakFindings(workspaceId: number) {
  const detected = await Promise.all([
    runExpenseLeakStepSafely({
      workspaceId,
      label: "recurring spend detector",
      query: detectRecurringSpendFindings(workspaceId),
      fallback: () => [],
    }),
    runExpenseLeakStepSafely({
      workspaceId,
      label: "duplicate charge detector",
      query: detectDuplicateVendorChargeFindings(workspaceId),
      fallback: () => [],
    }),
    runExpenseLeakStepSafely({
      workspaceId,
      label: "spike detector",
      query: detectMonthOverMonthSpikeFindings(workspaceId),
      fallback: () => [],
    }),
  ]);

  return detected.flat();
}

function resolveDetectedFindingStatus(input: {
  existing:
    | {
        status: PrismaExpenseLeakFindingStatus;
        dismissedAt: Date | null;
        resolvedAt: Date | null;
      }
    | undefined;
  now: Date;
}) {
  if (!input.existing) {
    return {
      status: "OPEN" as const,
      dismissedAt: null,
      resolvedAt: null,
      statusChangedAt: input.now,
      statusChangedByUserId: null,
      statusChanged: true,
    };
  }

  if (input.existing.status === "DISMISSED") {
    return {
      status: "DISMISSED" as const,
      dismissedAt: input.existing.dismissedAt ?? input.now,
      resolvedAt: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  if (input.existing.status === "OPEN") {
    return {
      status: "OPEN" as const,
      dismissedAt: null,
      resolvedAt: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  return {
    status: "OPEN" as const,
    dismissedAt: null,
    resolvedAt: null,
    statusChangedAt: input.now,
    statusChangedByUserId: null,
    statusChanged: true,
  };
}

export async function syncExpenseLeakFindings(workspaceId: number) {
  const supportsExpenseLeakStorage = await hasPrismaDatabaseSupport(
    EXPENSE_LEAK_STORAGE_SUPPORT
  );
  const supportsExpenseLeakAnalytics = await hasPrismaDatabaseSupport(
    EXPENSE_LEAK_ANALYTICS_SUPPORT
  );

  if (!supportsExpenseLeakStorage || !supportsExpenseLeakAnalytics) {
    return;
  }

  try {
    const now = new Date();
    const detectedFindings = await detectExpenseLeakFindings(workspaceId);
    const existingFindings = await prisma.expenseLeakFinding.findMany({
      where: {
        workspaceId,
        type: {
          in: DETECTED_FINDING_TYPES,
        },
      },
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        dismissedAt: true,
        resolvedAt: true,
      },
    });
    const existingByDedupeKey = new Map(
      existingFindings.map((finding) => [finding.dedupeKey, finding])
    );
    const detectedDedupeKeys = new Set(detectedFindings.map((finding) => finding.dedupeKey));

    await prisma.$transaction(async (tx) => {
      for (const finding of detectedFindings) {
        const existing = existingByDedupeKey.get(finding.dedupeKey);
        const nextStatus = resolveDetectedFindingStatus({
          existing,
          now,
        });

        await tx.expenseLeakFinding.upsert({
          where: {
            workspaceId_dedupeKey: {
              workspaceId,
              dedupeKey: finding.dedupeKey,
            },
          },
          create: {
            workspaceId: finding.workspaceId,
            clientBusinessId: finding.clientBusinessId,
            type: finding.type,
            severity: finding.severity,
            status: nextStatus.status,
            dedupeKey: finding.dedupeKey,
            title: finding.title,
            summary: finding.summary,
            explanation: finding.explanation,
            estimatedSavingsMinor: finding.estimatedSavingsMinor,
            currency: finding.currency,
            recommendedActionLabel: finding.recommendedActionLabel,
            recommendedActionHref: finding.recommendedActionHref,
            primaryRecordType: finding.primaryRecordType,
            primaryRecordId: finding.primaryRecordId,
            primaryRecordHref: finding.primaryRecordHref,
            recordCount: finding.recordCount,
            evidencePayload: JSON.stringify(finding.evidenceLinks),
            metadataPayload: finding.metadata ? JSON.stringify(finding.metadata) : null,
            firstDetectedAt: now,
            lastDetectedAt: now,
            dismissedAt: nextStatus.dismissedAt,
            resolvedAt: nextStatus.resolvedAt,
            lastStatusChangedAt: nextStatus.statusChangedAt,
          },
          update: {
            clientBusinessId: finding.clientBusinessId,
            type: finding.type,
            severity: finding.severity,
            status: nextStatus.status,
            title: finding.title,
            summary: finding.summary,
            explanation: finding.explanation,
            estimatedSavingsMinor: finding.estimatedSavingsMinor,
            currency: finding.currency,
            recommendedActionLabel: finding.recommendedActionLabel,
            recommendedActionHref: finding.recommendedActionHref,
            primaryRecordType: finding.primaryRecordType,
            primaryRecordId: finding.primaryRecordId,
            primaryRecordHref: finding.primaryRecordHref,
            recordCount: finding.recordCount,
            evidencePayload: JSON.stringify(finding.evidenceLinks),
            metadataPayload: finding.metadata ? JSON.stringify(finding.metadata) : null,
            lastDetectedAt: now,
            dismissedAt: nextStatus.dismissedAt,
            resolvedAt: nextStatus.resolvedAt,
            ...(nextStatus.statusChanged
              ? {
                  lastStatusChangedAt: nextStatus.statusChangedAt,
                  statusChangedByUserId: nextStatus.statusChangedByUserId,
                }
              : {}),
          },
        });
      }

      const staleOpenIds = existingFindings
        .filter(
          (finding) =>
            !detectedDedupeKeys.has(finding.dedupeKey) && finding.status === "OPEN"
        )
        .map((finding) => finding.id);

      if (staleOpenIds.length > 0) {
        await tx.expenseLeakFinding.updateMany({
          where: {
            id: {
              in: staleOpenIds,
            },
          },
          data: {
            status: "RESOLVED",
            resolvedAt: now,
            lastStatusChangedAt: now,
            statusChangedByUserId: null,
          },
        });
      }
    });
  } catch (error) {
    logError(
      "expense-leaks",
      "Expense leak sync failed; continuing with a safe empty-state fallback.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isExpenseLeakSchemaCompatibilityError(error),
      }
    );
  }
}

export async function getExpenseLeakCenterData(
  input: ExpenseLeakFilters
): Promise<ExpenseLeakCenterResponse> {
  if (!(await hasPrismaDatabaseSupport(EXPENSE_LEAK_STORAGE_SUPPORT))) {
    return buildEmptyExpenseLeakCenterData(input.workspaceId);
  }

  try {
    if (input.sync) {
      await runExpenseLeakStepSafely({
        workspaceId: input.workspaceId,
        label: "sync",
        support: {
          tables: [...EXPENSE_LEAK_STORAGE_SUPPORT.tables],
          columns: [...EXPENSE_LEAK_ANALYTICS_SUPPORT.columns],
        },
        query: syncExpenseLeakFindings(input.workspaceId),
        fallback: () => undefined,
      });
    }

    const records = await runExpenseLeakStepSafely({
      workspaceId: input.workspaceId,
      label: "records query",
      support: EXPENSE_LEAK_STORAGE_SUPPORT,
      query: prisma.expenseLeakFinding.findMany({
        where: {
          workspaceId: input.workspaceId,
        },
        select: expenseLeakSelect,
      }),
      fallback: () => [],
    });
    const findings = records.map(serializeExpenseLeakFinding);
    const summary = buildExpenseLeakSummary(findings);

    return {
      generatedAt: new Date().toISOString(),
      workspace: {
        id: input.workspaceId,
      },
      summary,
      findings: filterExpenseLeakFindings(findings, {
        query: input.query,
        status: input.status,
        severity: input.severity,
        type: input.type,
        limit: input.limit ?? DEFAULT_FINDING_LIMIT,
      }),
    };
  } catch (error) {
    logError(
      "expense-leaks",
      "Failed to build expense leak center data; returning an empty result.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyExpenseLeakCenterData(input.workspaceId);
  }
}

export async function getDashboardExpenseLeakSnapshot(
  workspaceId: number
): Promise<DashboardExpenseLeakSnapshot> {
  try {
    const center = await getExpenseLeakCenterData({
      workspaceId,
      sync: true,
      limit: DASHBOARD_FINDING_LIMIT,
    });

    return {
      generatedAt: center.generatedAt,
      summary: {
        openCount: center.summary.openCount,
        criticalCount: center.summary.criticalOpenCount,
        openEstimatedSavingsMinor: center.summary.openEstimatedSavingsMinor,
        recurringCount: center.summary.byType.RECURRING_SPEND,
      },
      topFindings: center.findings.filter((finding) => finding.status === "OPEN").slice(0, 4),
    };
  } catch (error) {
    logError(
      "expense-leaks",
      "Failed to build dashboard expense leak snapshot; returning an empty widget result.",
      error,
      {
        workspaceId,
      }
    );

    return buildEmptyDashboardExpenseLeakSnapshot(workspaceId);
  }
}

export async function updateExpenseLeakFindingStatus(input: {
  workspaceId: number;
  findingId: number;
  actorUserId: number;
  status: ExpenseLeakFindingStatus;
  lastKnownChangeAt?: string | null;
}) {
  const finding = await prisma.expenseLeakFinding.findFirst({
    where: {
      id: input.findingId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      lastStatusChangedAt: true,
      primaryRecordHref: true,
    },
  });

  if (!finding) {
    throw new Error("Expense leak finding not found.");
  }

  const currentLastKnownChangeAt = finding.lastStatusChangedAt?.toISOString() ?? null;

  if (
    input.lastKnownChangeAt !== undefined &&
    input.lastKnownChangeAt !== currentLastKnownChangeAt
  ) {
    throw new OfflineSyncConflictError(
      "This expense leak finding changed before the queued action could sync.",
      {
        label: finding.title,
        status: finding.status,
        lastKnownChangeAt: currentLastKnownChangeAt,
        href: finding.primaryRecordHref ?? "/dashboard/expense-leaks",
        recordType: "EXPENSE_LEAK_FINDING",
        recordId: finding.id,
      }
    );
  }

  const now = new Date();

  const updated = await prisma.expenseLeakFinding.update({
    where: {
      id: finding.id,
    },
    data: {
      status: input.status,
      dismissedAt: input.status === "DISMISSED" ? now : null,
      resolvedAt: input.status === "RESOLVED" ? now : null,
      lastStatusChangedAt: now,
      statusChangedByUserId: input.actorUserId,
    },
    select: expenseLeakSelect,
  });

  return serializeExpenseLeakFinding(updated);
}
