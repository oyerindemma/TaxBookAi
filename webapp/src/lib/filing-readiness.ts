import "server-only";

import type {
  Prisma,
  TaxEvidenceStatus,
  TransactionReviewStatus,
} from "@prisma/client";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import {
  formatDateInputValue,
  getDefaultTransactionTaxDateRange,
} from "@/lib/transaction-tax";
import {
  resolveNigerianTaxOutputStatus,
  type NigerianTaxOutputStatus,
} from "@/lib/nigeria-tax-rules";

export type FilingReadinessStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY"
  | "NEEDS_ATTENTION";

export type FilingReadinessSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type FilingReadinessMetricKey =
  | "UNPOSTED_ACTIVITY"
  | "UNCATEGORIZED_EXPENSE_LEDGER"
  | "MISSING_EVIDENCE"
  | "STALE_TAX_ENGINE"
  | "TAX_ENGINE_EXCEPTIONS";

export type FilingReadinessSample = {
  id: number;
  kind: "BANK_TRANSACTION" | "LEDGER_TRANSACTION" | "TAX_PERIOD";
  label: string;
  secondaryLabel: string;
  href: string;
};

export type FilingReadinessMetric = {
  key: FilingReadinessMetricKey;
  label: string;
  count: number;
  total: number;
  weight: number;
  penalty: number;
  description: string;
  href: string;
  actionLabel: string;
};

export type FilingReadinessBlocker = {
  key: FilingReadinessMetricKey;
  title: string;
  detail: string;
  severity: FilingReadinessSeverity;
  count: number;
  href: string;
  actionLabel: string;
  examples: FilingReadinessSample[];
};

export type FilingReadinessRecommendation = {
  key: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  priority: number;
};

export type WorkspaceFilingReadiness = {
  generatedAt: string;
  workspace: {
    id: number;
    name: string;
  };
  scope: {
    dateFrom: string;
    dateTo: string;
    dateLabel: string;
    defaultDateWindowApplied: boolean;
  };
  score: number;
  status: FilingReadinessStatus;
  outputStatus: NigerianTaxOutputStatus;
  narrative: string;
  blockerCount: number;
  highestSeverity: FilingReadinessSeverity | null;
  totals: {
    ledgerTransactionsInScope: number;
    unpostedSourceActivity: number;
    taxEngineSourcesInScope: number;
    blockersBySeverity: Record<FilingReadinessSeverity, number>;
  };
  metrics: FilingReadinessMetric[];
  blockers: FilingReadinessBlocker[];
  recommendations: FilingReadinessRecommendation[];
};

export type DashboardFilingReadinessSnapshot = {
  score: number;
  status: FilingReadinessStatus;
  outputStatus: NigerianTaxOutputStatus;
  blockerCount: number;
  highestSeverity: FilingReadinessSeverity | null;
  narrative: string;
  dateLabel: string;
  topBlockers: Array<{
    key: FilingReadinessMetricKey;
    title: string;
    count: number;
    severity: FilingReadinessSeverity;
  }>;
  primaryRecommendation: FilingReadinessRecommendation | null;
};

const SEVERITY_ORDER: FilingReadinessSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const EVIDENCE_GAP_STATUSES: TaxEvidenceStatus[] = ["UNKNOWN", "PENDING", "MISSING"];
const POSTED_REVIEW_STATUS = "POSTED" satisfies TransactionReviewStatus;
const LEDGER_SAMPLE_LIMIT = 3;
const BANK_SAMPLE_LIMIT = 3;
const TAX_ENGINE_STALE_THRESHOLD_MS = 60_000;
const FILING_READINESS_SCHEMA_TABLES = [
  "Workspace",
  "BankTransaction",
  "LedgerTransaction",
  "ClientBusiness",
  "TaxPeriod",
  "TaxComputation",
] as const;
const FILING_READINESS_SCHEMA_COLUMNS = [
  "Workspace.",
  "BankTransaction.",
  "LedgerTransaction.",
  "ClientBusiness.",
  "TaxPeriod.",
  "TaxComputation.",
] as const;
const FILING_READINESS_UNPOSTED_ACTIVITY_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.transactionDate",
    "BankTransaction.description",
    "BankTransaction.amount",
    "BankTransaction.currency",
    "BankTransaction.status",
    "BankTransaction.matchedLedgerTransactionId",
    "BankTransaction.clientBusinessId",
  ],
} as const;
const FILING_READINESS_LEDGER_QUERY_SUPPORT = {
  tables: ["LedgerTransaction", "ClientBusiness"],
  columns: [
    "LedgerTransaction.clientBusinessId",
    "LedgerTransaction.categoryId",
    "LedgerTransaction.transactionDate",
    "LedgerTransaction.description",
    "LedgerTransaction.direction",
    "LedgerTransaction.amountMinor",
    "LedgerTransaction.currency",
    "LedgerTransaction.reviewStatus",
    "LedgerTransaction.vatTreatment",
    "LedgerTransaction.whtTreatment",
    "LedgerTransaction.taxCategory",
    "LedgerTransaction.taxEvidenceStatus",
    "LedgerTransaction.updatedAt",
    "ClientBusiness.workspaceId",
    "ClientBusiness.archivedAt",
  ],
} as const;
const FILING_READINESS_TAX_ENGINE_SUPPORT = {
  tables: ["TaxPeriod", "TaxComputation"],
  columns: [
    "TaxPeriod.workspaceId",
    "TaxPeriod.clientBusinessId",
    "TaxPeriod.label",
    "TaxPeriod.status",
    "TaxPeriod.startDate",
    "TaxPeriod.endDate",
    "TaxPeriod.updatedAt",
    "TaxComputation.taxPeriodId",
    "TaxComputation.taxType",
    "TaxComputation.status",
    "TaxComputation.sourceCount",
    "TaxComputation.exceptionCount",
    "TaxComputation.computedAt",
  ],
} as const;

const bankSourceActivitySelect = {
  id: true,
  transactionDate: true,
  description: true,
  amount: true,
  currency: true,
  matchedLedgerTransactionId: true,
  clientBusiness: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

const ledgerTransactionReadinessSelect = {
  id: true,
  transactionDate: true,
  description: true,
  amountMinor: true,
  currency: true,
  direction: true,
  reviewStatus: true,
  categoryId: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  vatTreatment: true,
  whtTreatment: true,
  updatedAt: true,
  clientBusiness: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

const taxComputationReadinessSelect = {
  taxType: true,
  status: true,
  sourceCount: true,
  exceptionCount: true,
  computedAt: true,
} satisfies Prisma.TaxComputationSelect;

const taxPeriodReadinessSelect = {
  id: true,
  label: true,
  status: true,
  startDate: true,
  endDate: true,
  updatedAt: true,
  computations: {
    select: taxComputationReadinessSelect,
  },
} satisfies Prisma.TaxPeriodSelect;

type ReadinessBankSourceActivity = Prisma.BankTransactionGetPayload<{
  select: typeof bankSourceActivitySelect;
}>;

type ReadinessLedgerTransaction = Prisma.LedgerTransactionGetPayload<{
  select: typeof ledgerTransactionReadinessSelect;
}>;

type ReadinessTaxPeriod = Prisma.TaxPeriodGetPayload<{
  select: typeof taxPeriodReadinessSelect;
}>;

type MetricConfig = {
  key: FilingReadinessMetricKey;
  label: string;
  weight: number;
  minimumPenalty: number;
  href: string;
  actionLabel: string;
  description: string;
  title: string;
  detail: (count: number, dateLabel: string) => string;
};

function isFilingReadinessSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...FILING_READINESS_SCHEMA_TABLES],
    columns: [...FILING_READINESS_SCHEMA_COLUMNS],
  });
}

async function runFilingReadinessQuerySafely<T>(input: {
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
      "filing-readiness",
      `Filing readiness ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isFilingReadinessSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function buildEmptyWorkspaceFilingReadiness(input: {
  workspaceId: number;
  dateFrom: Date;
  dateTo: Date;
  defaultDateWindowApplied?: boolean;
}): WorkspaceFilingReadiness {
  const dateLabel = formatDateLabel(input.dateFrom, input.dateTo);

  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: input.workspaceId,
      name: "Workspace",
    },
    scope: {
      dateFrom: formatDateInputValue(input.dateFrom),
      dateTo: formatDateInputValue(input.dateTo),
      dateLabel,
      defaultDateWindowApplied: input.defaultDateWindowApplied ?? true,
    },
    score: 0,
    status: "NOT_STARTED",
    outputStatus: "review-needed",
    narrative:
      "Not enough posted-ledger or tax-engine data exists yet to score filing readiness for this workspace.",
    blockerCount: 0,
    highestSeverity: null,
    totals: {
      ledgerTransactionsInScope: 0,
      unpostedSourceActivity: 0,
      taxEngineSourcesInScope: 0,
      blockersBySeverity: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      },
    },
    metrics: [],
    blockers: [],
    recommendations: buildDefaultRecommendations(false),
  };
}

function buildEmptyDashboardFilingReadinessSnapshot(
  workspaceId: number
): DashboardFilingReadinessSnapshot {
  const { dateFrom, dateTo } = getDefaultTransactionTaxDateRange();
  const readiness = buildEmptyWorkspaceFilingReadiness({
    workspaceId,
    dateFrom,
    dateTo,
    defaultDateWindowApplied: true,
  });

  return {
    score: readiness.score,
    status: readiness.status,
    outputStatus: readiness.outputStatus,
    blockerCount: readiness.blockerCount,
    highestSeverity: readiness.highestSeverity,
    narrative: readiness.narrative,
    dateLabel: readiness.scope.dateLabel,
    topBlockers: [],
    primaryRecommendation: readiness.recommendations[0] ?? null,
  };
}

const METRIC_CONFIG: Record<FilingReadinessMetricKey, MetricConfig> = {
  UNPOSTED_ACTIVITY: {
    key: "UNPOSTED_ACTIVITY",
    label: "Unposted source activity",
    weight: 30,
    minimumPenalty: 8,
    href: "/dashboard/banking/review",
    actionLabel: "Open banking review",
    description:
      "Source activity that has not reached the posted ledger will keep dashboard totals and filing output out of sync.",
    title: "Source activity is still outside the posted ledger",
    detail: (count, dateLabel) =>
      `${count} source transaction${count === 1 ? "" : "s"} in ${dateLabel} have not been posted into the ledger yet, so filing totals are still incomplete.`,
  },
  UNCATEGORIZED_EXPENSE_LEDGER: {
    key: "UNCATEGORIZED_EXPENSE_LEDGER",
    label: "Uncategorized posted expenses",
    weight: 18,
    minimumPenalty: 5,
    href: "/dashboard/reports",
    actionLabel: "Open reports",
    description:
      "Posted expense entries without categories make the ledger harder to trust for month-end and tax review.",
    title: "Posted expense entries still need categories",
    detail: (count, dateLabel) =>
      `${count} posted expense entr${count === 1 ? "y" : "ies"} in ${dateLabel} still lack a bookkeeping category.`,
  },
  MISSING_EVIDENCE: {
    key: "MISSING_EVIDENCE",
    label: "Missing filing evidence",
    weight: 16,
    minimumPenalty: 4,
    href: "/dashboard/tax",
    actionLabel: "Open tax engine",
    description:
      "Tax-relevant posted ledger entries should carry attached or verified evidence before filing.",
    title: "Tax-relevant ledger evidence is still missing",
    detail: (count, dateLabel) =>
      `${count} posted filing-relevant entr${count === 1 ? "y" : "ies"} in ${dateLabel} still show evidence as unknown, pending, or missing.`,
  },
  STALE_TAX_ENGINE: {
    key: "STALE_TAX_ENGINE",
    label: "Stale tax engine output",
    weight: 22,
    minimumPenalty: 12,
    href: "/dashboard/tax",
    actionLabel: "Open tax engine",
    description:
      "The tax engine should be as fresh as the posted ledger before the workspace is treated as filing-ready.",
    title: "Tax engine output is behind the posted ledger",
    detail: (_count, dateLabel) =>
      `The tax engine snapshot for ${dateLabel} is older than newer posted ledger changes and should be refreshed before filing.`,
  },
  TAX_ENGINE_EXCEPTIONS: {
    key: "TAX_ENGINE_EXCEPTIONS",
    label: "Tax engine exceptions",
    weight: 14,
    minimumPenalty: 4,
    href: "/dashboard/tax",
    actionLabel: "Open tax engine",
    description:
      "Stored VAT and WHT computations still carry unresolved exceptions that need review before filing.",
    title: "Tax engine exceptions still need review",
    detail: (count, dateLabel) =>
      `${count} tax engine exception${count === 1 ? "" : "s"} remain open for ${dateLabel}.`,
  },
};

function formatDateLabel(dateFrom: Date, dateTo: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatRange(dateFrom, dateTo);
}

function severityRank(value: FilingReadinessSeverity) {
  return SEVERITY_ORDER.indexOf(value);
}

function computePenalty(count: number, total: number, weight: number, minimumPenalty: number) {
  if (count <= 0 || total <= 0) return 0;

  const ratio = Math.min(count / total, 1);
  return Math.min(weight, Math.max(minimumPenalty, Math.round(weight * ratio)));
}

function resolveSeverity(input: {
  count: number;
  total: number;
  penalty: number;
}): FilingReadinessSeverity | null {
  if (input.count <= 0) return null;

  const ratio = input.total > 0 ? input.count / input.total : 1;
  if (input.penalty >= 18 || ratio >= 0.4 || input.count >= 25) return "CRITICAL";
  if (input.penalty >= 10 || ratio >= 0.2 || input.count >= 10) return "HIGH";
  if (ratio >= 0.08 || input.count >= 3) return "MEDIUM";
  return "LOW";
}

function buildBankTransactionSample(
  transaction: ReadinessBankSourceActivity
): FilingReadinessSample {
  const clientBusinessLabel = transaction.clientBusiness?.name ?? "Workspace transaction";
  const dateLabel = transaction.transactionDate.toISOString().slice(0, 10);

  return {
    id: transaction.id,
    kind: "BANK_TRANSACTION",
    label: transaction.description,
    secondaryLabel: `${clientBusinessLabel} · ${dateLabel}`,
    href: `/dashboard/banking/review?transactionId=${transaction.id}`,
  };
}

function buildLedgerTransactionSample(
  transaction: ReadinessLedgerTransaction,
  href = "/dashboard/reports"
): FilingReadinessSample {
  const clientBusinessLabel = transaction.clientBusiness?.name ?? "Workspace ledger";
  const dateLabel = transaction.transactionDate.toISOString().slice(0, 10);

  return {
    id: transaction.id,
    kind: "LEDGER_TRANSACTION",
    label: transaction.description,
    secondaryLabel: `${clientBusinessLabel} · ${dateLabel}`,
    href,
  };
}

function buildTaxPeriodSample(period: ReadinessTaxPeriod): FilingReadinessSample {
  const latestComputedAt = getLatestTaxComputedAt(period);
  const computationSummary = latestComputedAt
    ? `Computed ${latestComputedAt.toISOString().slice(0, 10)}`
    : "Awaiting computation";

  return {
    id: period.id,
    kind: "TAX_PERIOD",
    label: period.label,
    secondaryLabel: `${period.status} · ${computationSummary}`,
    href: "/dashboard/tax",
  };
}

function buildMetric(input: {
  key: FilingReadinessMetricKey;
  count: number;
  total: number;
}): FilingReadinessMetric {
  const config = METRIC_CONFIG[input.key];

  return {
    key: input.key,
    label: config.label,
    count: input.count,
    total: input.total,
    weight: config.weight,
    penalty: computePenalty(input.count, input.total, config.weight, config.minimumPenalty),
    description: config.description,
    href: config.href,
    actionLabel: config.actionLabel,
  };
}

function buildRecommendationFromBlocker(
  blocker: FilingReadinessBlocker,
  index: number
): FilingReadinessRecommendation {
  return {
    key: blocker.key,
    title: blocker.title,
    detail: blocker.detail,
    href: blocker.href,
    actionLabel: blocker.actionLabel,
    priority: index + 1,
  };
}

function buildDefaultRecommendations(hasData: boolean): FilingReadinessRecommendation[] {
  if (!hasData) {
    return [
      {
        key: "POST_SOURCE_ACTIVITY",
        title: "Start posting into the ledger",
        detail:
          "Import transactions or approve bookkeeping work so the workspace builds a posted-ledger baseline for filing readiness.",
        href: "/dashboard/banking",
        actionLabel: "Open banking",
        priority: 1,
      },
      {
        key: "OPEN_BOOKKEEPING_FLOW",
        title: "Prepare the first filing-ready month",
        detail:
          "Once the ledger starts receiving posted activity, TaxBook AI can align the tax engine and score filing readiness for the current month.",
        href: "/dashboard/bookkeeping/review",
        actionLabel: "Open bookkeeping review",
        priority: 2,
      },
    ];
  }

  return [
    {
      key: "OPEN_TAX_ENGINE",
      title: "Confirm the live tax engine output",
      detail:
        "The posted ledger and tax engine are aligned for the current filing window. Review VAT and WHT once more before preparing the filing pack.",
      href: "/dashboard/tax",
      actionLabel: "Open tax engine",
      priority: 1,
    },
    {
      key: "OPEN_TAX_FILING",
      title: "Prepare the filing pack",
      detail:
        "Use the current month ledger and tax snapshot to move into the filing workflow with fewer manual checks.",
      href: "/dashboard/tax-filing",
      actionLabel: "Open tax filing",
      priority: 2,
    },
  ];
}

function isFullCalendarMonthRange(dateFrom: Date, dateTo: Date) {
  const expectedStart = new Date(
    Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const expectedEnd = new Date(
    Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );

  return (
    dateFrom.getTime() === expectedStart.getTime() &&
    dateTo.getTime() === expectedEnd.getTime() &&
    dateFrom.getUTCFullYear() === dateTo.getUTCFullYear() &&
    dateFrom.getUTCMonth() === dateTo.getUTCMonth()
  );
}

function isTaxRelevantLedgerTransaction(transaction: ReadinessLedgerTransaction) {
  return (
    transaction.taxCategory !== null ||
    transaction.vatTreatment !== "NONE" ||
    transaction.whtTreatment !== "NONE"
  );
}

function getTaxComputations(period: ReadinessTaxPeriod | null) {
  return (
    period?.computations.filter(
      (computation) => computation.taxType === "VAT" || computation.taxType === "WHT"
    ) ?? []
  );
}

function getLatestTaxComputedAt(period: ReadinessTaxPeriod | null) {
  const computations = getTaxComputations(period);

  return computations
    .map((computation) => computation.computedAt)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function getTaxEngineSourceCount(period: ReadinessTaxPeriod | null) {
  return getTaxComputations(period).reduce(
    (max, computation) => Math.max(max, computation.sourceCount),
    0
  );
}

function getTaxEngineExceptionCount(period: ReadinessTaxPeriod | null) {
  return getTaxComputations(period).reduce(
    (sum, computation) => sum + computation.exceptionCount,
    0
  );
}

function getLatestLedgerUpdate(transactions: ReadinessLedgerTransaction[]) {
  return transactions
    .map((transaction) => transaction.updatedAt)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export async function getWorkspaceFilingReadiness(input: {
  workspaceId: number;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  defaultDateWindowApplied?: boolean;
}): Promise<WorkspaceFilingReadiness> {
  const defaultRange = getDefaultTransactionTaxDateRange();
  const dateFrom = input.dateFrom ?? defaultRange.dateFrom;
  const dateTo = input.dateTo ?? defaultRange.dateTo;
  const dateLabel = formatDateLabel(dateFrom, dateTo);
  const useStoredTaxPeriod = isFullCalendarMonthRange(dateFrom, dateTo);

  try {
    const workspace = await runFilingReadinessQuerySafely({
      workspaceId: input.workspaceId,
      label: "workspace query",
      query: () =>
        prisma.workspace.findUnique({
          where: { id: input.workspaceId },
          select: {
            id: true,
            name: true,
          },
        }),
      fallback: () => null,
    });

    const postedLedgerTransactions = await runFilingReadinessQuerySafely({
      workspaceId: input.workspaceId,
      label: "posted ledger query",
      support: FILING_READINESS_LEDGER_QUERY_SUPPORT,
      query: () =>
        prisma.ledgerTransaction.findMany({
          where: {
            reviewStatus: POSTED_REVIEW_STATUS,
            transactionDate: {
              gte: dateFrom,
              lte: dateTo,
            },
            clientBusiness: {
              workspaceId: input.workspaceId,
              archivedAt: null,
            },
          },
          orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          select: ledgerTransactionReadinessSelect,
        }),
      fallback: () => [],
    });

    const unpostedSourceActivity = await runFilingReadinessQuerySafely({
      workspaceId: input.workspaceId,
      label: "unposted source activity query",
      support: FILING_READINESS_UNPOSTED_ACTIVITY_SUPPORT,
      query: () =>
        prisma.bankTransaction.findMany({
          where: {
            workspaceId: input.workspaceId,
            transactionDate: {
              gte: dateFrom,
              lte: dateTo,
            },
            status: {
              not: "IGNORED",
            },
            matchedLedgerTransactionId: null,
          },
          orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          select: bankSourceActivitySelect,
        }),
      fallback: () => [],
    });

    const taxPeriod = useStoredTaxPeriod
      ? await runFilingReadinessQuerySafely({
          workspaceId: input.workspaceId,
          label: "tax period query",
          support: FILING_READINESS_TAX_ENGINE_SUPPORT,
          query: () =>
            prisma.taxPeriod.findFirst({
              where: {
                workspaceId: input.workspaceId,
                clientBusinessId: null,
                startDate: {
                  lte: dateFrom,
                },
                endDate: {
                  gte: dateTo,
                },
              },
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              select: taxPeriodReadinessSelect,
            }),
          fallback: () => null,
        })
      : null;

    const postedExpenseLedger = postedLedgerTransactions.filter(
      (transaction) => transaction.direction === "MONEY_OUT"
    );
    const uncategorizedExpenseLedger = postedExpenseLedger.filter(
      (transaction) => transaction.categoryId === null
    );
    const filingRelevantLedger = postedLedgerTransactions.filter(isTaxRelevantLedgerTransaction);
    const missingEvidenceLedger = filingRelevantLedger.filter((transaction) =>
      EVIDENCE_GAP_STATUSES.includes(transaction.taxEvidenceStatus)
    );
    const latestTaxRelevantLedgerUpdate = getLatestLedgerUpdate(filingRelevantLedger);
    const latestTaxComputedAt = getLatestTaxComputedAt(taxPeriod);
    const taxEngineSourcesInScope = getTaxEngineSourceCount(taxPeriod);
    const taxEngineExceptionCount = getTaxEngineExceptionCount(taxPeriod);
    const staleTaxEngine =
      useStoredTaxPeriod &&
      filingRelevantLedger.length > 0 &&
      (!taxPeriod ||
        !latestTaxComputedAt ||
        (latestTaxRelevantLedgerUpdate?.getTime() ?? 0) - latestTaxComputedAt.getTime() >
          TAX_ENGINE_STALE_THRESHOLD_MS);

    const metrics = [
      buildMetric({
        key: "UNPOSTED_ACTIVITY",
        count: unpostedSourceActivity.length,
        total: Math.max(postedLedgerTransactions.length + unpostedSourceActivity.length, 1),
      }),
      buildMetric({
        key: "UNCATEGORIZED_EXPENSE_LEDGER",
        count: uncategorizedExpenseLedger.length,
        total: Math.max(postedExpenseLedger.length, 1),
      }),
      buildMetric({
        key: "MISSING_EVIDENCE",
        count: missingEvidenceLedger.length,
        total: Math.max(filingRelevantLedger.length, 1),
      }),
      buildMetric({
        key: "STALE_TAX_ENGINE",
        count: staleTaxEngine ? 1 : 0,
        total: 1,
      }),
      buildMetric({
        key: "TAX_ENGINE_EXCEPTIONS",
        count: taxEngineExceptionCount,
        total: Math.max(taxEngineSourcesInScope, 1),
      }),
    ] satisfies FilingReadinessMetric[];

    const blockers = metrics
      .map((metric) => {
        if (metric.count <= 0) {
          return null;
        }

        const config = METRIC_CONFIG[metric.key];
        const severity = resolveSeverity({
          count: metric.count,
          total: metric.total,
          penalty: metric.penalty,
        });

        if (!severity) {
          return null;
        }

        const examples =
          metric.key === "UNPOSTED_ACTIVITY"
            ? unpostedSourceActivity
                .slice(0, BANK_SAMPLE_LIMIT)
                .map((transaction) => buildBankTransactionSample(transaction))
            : metric.key === "UNCATEGORIZED_EXPENSE_LEDGER"
              ? uncategorizedExpenseLedger
                  .slice(0, LEDGER_SAMPLE_LIMIT)
                  .map((transaction) => buildLedgerTransactionSample(transaction))
              : metric.key === "MISSING_EVIDENCE"
                ? missingEvidenceLedger
                    .slice(0, LEDGER_SAMPLE_LIMIT)
                    .map((transaction) => buildLedgerTransactionSample(transaction, "/dashboard/tax"))
                : taxPeriod
                  ? [buildTaxPeriodSample(taxPeriod)]
                  : filingRelevantLedger
                      .slice(0, LEDGER_SAMPLE_LIMIT)
                      .map((transaction) => buildLedgerTransactionSample(transaction, "/dashboard/tax"));

        return {
          key: metric.key,
          title: config.title,
          detail: config.detail(metric.count, dateLabel),
          severity,
          count: metric.count,
          href: config.href,
          actionLabel: config.actionLabel,
          examples,
        } satisfies FilingReadinessBlocker;
      })
      .filter((blocker): blocker is FilingReadinessBlocker => blocker !== null)
      .sort((left, right) => {
        const severityDelta = severityRank(left.severity) - severityRank(right.severity);
        if (severityDelta !== 0) return severityDelta;
        return right.count - left.count;
      });

    const totalPenalty = metrics.reduce((sum, metric) => sum + metric.penalty, 0);
    const hasData =
      postedLedgerTransactions.length > 0 ||
      unpostedSourceActivity.length > 0 ||
      taxEngineSourcesInScope > 0 ||
      Boolean(taxPeriod);
    const score = hasData ? Math.max(0, 100 - totalPenalty) : 0;
    const highestSeverity = blockers[0]?.severity ?? null;
    const status: FilingReadinessStatus = !hasData
      ? "NOT_STARTED"
      : blockers.length === 0
        ? "READY"
        : highestSeverity === "CRITICAL" || score < 75
          ? "NEEDS_ATTENTION"
          : "IN_PROGRESS";
    const outputStatus = resolveNigerianTaxOutputStatus({
      sourceCount: taxEngineSourcesInScope,
      exceptionCount: taxEngineExceptionCount + blockers.length,
      isEstimate: status !== "READY",
    });

    const recommendations =
      blockers.length > 0
        ? blockers
            .slice(0, 4)
            .map((blocker, index) => buildRecommendationFromBlocker(blocker, index))
        : buildDefaultRecommendations(hasData);

    const blockersBySeverity = {
      CRITICAL: blockers.filter((blocker) => blocker.severity === "CRITICAL").length,
      HIGH: blockers.filter((blocker) => blocker.severity === "HIGH").length,
      MEDIUM: blockers.filter((blocker) => blocker.severity === "MEDIUM").length,
      LOW: blockers.filter((blocker) => blocker.severity === "LOW").length,
    } satisfies Record<FilingReadinessSeverity, number>;

    const narrative = !hasData
      ? "No current-month posted-ledger activity or stored tax-engine output was found yet, so filing readiness has not started for this workspace."
      : blockers.length === 0
        ? `Posted ledger coverage, evidence, and tax-engine freshness are aligned for ${dateLabel}.`
        : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} are reducing filing readiness for ${dateLabel}, led by ${blockers[0]?.title.toLowerCase()}.`;

    return {
      generatedAt: new Date().toISOString(),
      workspace: {
        id: input.workspaceId,
        name: workspace?.name ?? "Workspace",
      },
      scope: {
        dateFrom: formatDateInputValue(dateFrom),
        dateTo: formatDateInputValue(dateTo),
        dateLabel,
        defaultDateWindowApplied: input.defaultDateWindowApplied ?? true,
      },
      score,
      status,
      outputStatus,
      narrative,
      blockerCount: blockers.length,
      highestSeverity,
      totals: {
        ledgerTransactionsInScope: postedLedgerTransactions.length,
        unpostedSourceActivity: unpostedSourceActivity.length,
        taxEngineSourcesInScope,
        blockersBySeverity,
      },
      metrics,
      blockers,
      recommendations,
    } satisfies WorkspaceFilingReadiness;
  } catch (error) {
    logError(
      "filing-readiness",
      "Failed to build filing readiness; returning an empty readiness snapshot.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyWorkspaceFilingReadiness({
      workspaceId: input.workspaceId,
      dateFrom,
      dateTo,
      defaultDateWindowApplied: input.defaultDateWindowApplied,
    });
  }
}

export async function getDashboardFilingReadinessSnapshot(
  workspaceId?: number | null
): Promise<DashboardFilingReadinessSnapshot | null> {
  if (!workspaceId) {
    return null;
  }

  try {
    const readiness = await getWorkspaceFilingReadiness({
      workspaceId,
      defaultDateWindowApplied: true,
    });

    return {
      score: readiness.score,
      status: readiness.status,
      outputStatus: readiness.outputStatus,
      blockerCount: readiness.blockerCount,
      highestSeverity: readiness.highestSeverity,
      narrative: readiness.narrative,
      dateLabel: readiness.scope.dateLabel,
      topBlockers: readiness.blockers.slice(0, 3).map((blocker) => ({
        key: blocker.key,
        title: blocker.title,
        count: blocker.count,
        severity: blocker.severity,
      })),
      primaryRecommendation: readiness.recommendations[0] ?? null,
    } satisfies DashboardFilingReadinessSnapshot;
  } catch (error) {
    logError(
      "filing-readiness",
      "Failed to build dashboard filing readiness; returning an empty widget snapshot.",
      error,
      {
        workspaceId,
      }
    );

    return buildEmptyDashboardFilingReadinessSnapshot(workspaceId);
  }
}
