import "server-only";

import type {
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  BankTransactionStatus,
  Prisma,
  TaxEvidenceStatus,
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

export type FilingReadinessStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY"
  | "NEEDS_ATTENTION";

export type FilingReadinessSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type FilingReadinessMetricKey =
  | "UNCATEGORIZED_TRANSACTIONS"
  | "UNRESOLVED_TAX_TREATMENT_GAPS"
  | "UNRECONCILED_ITEMS"
  | "MISSING_EVIDENCE"
  | "FLAGGED_TRANSACTIONS";

export type FilingReadinessSample = {
  id: number;
  kind: "BANK_TRANSACTION" | "TAX_RECORD";
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
  narrative: string;
  blockerCount: number;
  highestSeverity: FilingReadinessSeverity | null;
  totals: {
    transactionsInScope: number;
    openTransactions: number;
    taxRecordsInScope: number;
    blockersBySeverity: Record<FilingReadinessSeverity, number>;
  };
  metrics: FilingReadinessMetric[];
  blockers: FilingReadinessBlocker[];
  recommendations: FilingReadinessRecommendation[];
};

export type DashboardFilingReadinessSnapshot = {
  score: number;
  status: FilingReadinessStatus;
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
const OPEN_REVIEW_STATUSES: BankTransactionReviewStatus[] = [
  "IMPORTED",
  "PENDING_REVIEW",
  "REVIEWED",
  "FLAGGED",
];
const UNRECONCILED_STATUSES: BankTransactionStatus[] = [
  "UNMATCHED",
  "SUGGESTED",
  "REVIEW_REQUIRED",
];
const EVIDENCE_GAP_STATUSES: TaxEvidenceStatus[] = ["UNKNOWN", "PENDING", "MISSING"];
const BANK_SAMPLE_LIMIT = 3;
const TAX_RECORD_SAMPLE_LIMIT = 3;
const FILING_READINESS_SCHEMA_TABLES = [
  "Workspace",
  "BankTransaction",
  "TaxRecord",
] as const;
const FILING_READINESS_SCHEMA_COLUMNS = [
  "Workspace.",
  "BankTransaction.",
  "TaxRecord.",
] as const;
const FILING_READINESS_BANK_QUERY_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.reviewStatus",
    "BankTransaction.categoryId",
    "BankTransaction.postingReadiness",
    "BankTransaction.taxTreatmentSource",
  ],
} as const;

const bankTransactionReadinessSelect = {
  id: true,
  transactionDate: true,
  description: true,
  amount: true,
  currency: true,
  status: true,
  reviewStatus: true,
  categoryId: true,
  postingReadiness: true,
  taxTreatmentSource: true,
  clientBusiness: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

const taxRecordReadinessSelect = {
  id: true,
  occurredOn: true,
  kind: true,
  description: true,
  amountKobo: true,
  currency: true,
  taxEvidenceStatus: true,
  clientBusiness: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.TaxRecordSelect;

type ReadinessBankTransaction = Prisma.BankTransactionGetPayload<{
  select: typeof bankTransactionReadinessSelect;
}>;

type ReadinessTaxRecord = Prisma.TaxRecordGetPayload<{
  select: typeof taxRecordReadinessSelect;
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
    narrative: "Not enough data yet to score filing readiness for this workspace.",
    blockerCount: 0,
    highestSeverity: null,
    totals: {
      transactionsInScope: 0,
      openTransactions: 0,
      taxRecordsInScope: 0,
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
    blockerCount: readiness.blockerCount,
    highestSeverity: readiness.highestSeverity,
    narrative: readiness.narrative,
    dateLabel: readiness.scope.dateLabel,
    topBlockers: [],
    primaryRecommendation: readiness.recommendations[0] ?? null,
  };
}

const METRIC_CONFIG: Record<FilingReadinessMetricKey, MetricConfig> = {
  UNCATEGORIZED_TRANSACTIONS: {
    key: "UNCATEGORIZED_TRANSACTIONS",
    label: "Uncategorized transactions",
    weight: 24,
    minimumPenalty: 6,
    href: "/dashboard/banking/review",
    actionLabel: "Open review queue",
    description:
      "Open transactions without categories still need bookkeeping classification before filing.",
    title: "Uncategorized transactions are still open",
    detail: (count, dateLabel) =>
      `${count} open transaction${count === 1 ? "" : "s"} in ${dateLabel} still need categorization before the filing cycle is clean.`,
  },
  UNRESOLVED_TAX_TREATMENT_GAPS: {
    key: "UNRESOLVED_TAX_TREATMENT_GAPS",
    label: "Tax treatment gaps",
    weight: 26,
    minimumPenalty: 8,
    href: "/dashboard/banking/review",
    actionLabel: "Resolve tax treatments",
    description:
      "Transactions with unset tax treatment and posting readiness gaps can still distort VAT or WHT.",
    title: "Tax treatment is still unresolved",
    detail: (count, dateLabel) =>
      `${count} transaction${count === 1 ? "" : "s"} in ${dateLabel} are still not ready for filing because tax treatment remains unset.`,
  },
  UNRECONCILED_ITEMS: {
    key: "UNRECONCILED_ITEMS",
    label: "Unreconciled items",
    weight: 22,
    minimumPenalty: 6,
    href: "/dashboard/banking/reconcile",
    actionLabel: "Open reconciliation",
    description:
      "Unmatched bank activity can leave filing totals unsupported or incomplete.",
    title: "Bank items still need reconciliation",
    detail: (count, dateLabel) =>
      `${count} bank transaction${count === 1 ? "" : "s"} in ${dateLabel} are still unmatched, suggested, or marked for reconciliation review.`,
  },
  MISSING_EVIDENCE: {
    key: "MISSING_EVIDENCE",
    label: "Missing evidence",
    weight: 16,
    minimumPenalty: 4,
    href: "/dashboard/tax-records",
    actionLabel: "Review tax records",
    description:
      "Tax records missing verified or attached support can block an audit-safe filing pack.",
    title: "Supporting evidence is still missing",
    detail: (count, dateLabel) =>
      `${count} tax record${count === 1 ? "" : "s"} in ${dateLabel} still show evidence as unknown, pending, or missing.`,
  },
  FLAGGED_TRANSACTIONS: {
    key: "FLAGGED_TRANSACTIONS",
    label: "Flagged transactions",
    weight: 12,
    minimumPenalty: 4,
    href: "/dashboard/banking/review",
    actionLabel: "Clear flagged items",
    description:
      "Flagged transactions should be resolved or explicitly accepted before the workspace is filing-ready.",
    title: "Flagged transactions still need review",
    detail: (count, dateLabel) =>
      `${count} transaction${count === 1 ? "" : "s"} in ${dateLabel} remain flagged for exception review.`,
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

function buildBankTransactionSample(transaction: ReadinessBankTransaction): FilingReadinessSample {
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

function buildTaxRecordSample(record: ReadinessTaxRecord): FilingReadinessSample {
  const clientBusinessLabel = record.clientBusiness?.name ?? "Workspace tax record";
  const dateLabel = record.occurredOn.toISOString().slice(0, 10);

  return {
    id: record.id,
    kind: "TAX_RECORD",
    label: record.description?.trim() || record.kind,
    secondaryLabel: `${clientBusinessLabel} · ${dateLabel}`,
    href: "/dashboard/tax-records",
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
        key: "IMPORT_TRANSACTIONS",
        title: "Start the filing pipeline",
        detail:
          "Import transactions or continue review work so TaxBook AI can begin scoring filing readiness for the active workspace.",
        href: "/dashboard/banking",
        actionLabel: "Open banking",
        priority: 1,
      },
      {
        key: "OPEN_REVIEW_QUEUE",
        title: "Review imported activity",
        detail:
          "Use the transaction review queue to categorize activity, resolve tax treatment, and prepare the books for filing.",
        href: "/dashboard/banking/review",
        actionLabel: "Open review queue",
        priority: 2,
      },
    ];
  }

  return [
    {
      key: "OPEN_TAX_FILING",
      title: "Prepare the filing pack",
      detail:
        "The current filing window has no active blockers. Open the filing workspace to prepare the next VAT or WHT pack.",
      href: "/dashboard/tax-filing",
      actionLabel: "Open tax filing",
      priority: 1,
    },
    {
      key: "REVIEW_TAX_CENTER",
      title: "Confirm live liabilities",
      detail:
        "Review the live VAT and WHT payable values once more before moving into the manual filing workflow.",
      href: "/dashboard/tax-center",
      actionLabel: "Open tax center",
      priority: 2,
    },
  ];
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

  try {
    const [workspace, bankTransactions, taxRecords] = await Promise.all([
      runFilingReadinessQuerySafely({
        workspaceId: input.workspaceId,
        label: "workspace query",
        query: prisma.workspace.findUnique({
          where: { id: input.workspaceId },
          select: {
            id: true,
            name: true,
          },
        }),
        fallback: () => null,
      }),
      runFilingReadinessQuerySafely({
        workspaceId: input.workspaceId,
        label: "bank transactions query",
        support: FILING_READINESS_BANK_QUERY_SUPPORT,
        query: prisma.bankTransaction.findMany({
          where: {
            workspaceId: input.workspaceId,
            transactionDate: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          select: bankTransactionReadinessSelect,
        }),
        fallback: () => [],
      }),
      runFilingReadinessQuerySafely({
        workspaceId: input.workspaceId,
        label: "tax records query",
        query: prisma.taxRecord.findMany({
          where: {
            workspaceId: input.workspaceId,
            occurredOn: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
          select: taxRecordReadinessSelect,
        }),
        fallback: () => [],
      }),
    ]);

    const openTransactions = bankTransactions.filter(
      (transaction) =>
        OPEN_REVIEW_STATUSES.includes(transaction.reviewStatus) &&
        transaction.status !== "IGNORED"
    );
    const uncategorizedTransactions = openTransactions.filter(
      (transaction) => transaction.categoryId === null
    );
    const taxTreatmentGapTransactions = openTransactions.filter(
      (transaction) =>
        transaction.postingReadiness !==
          ("READY_TO_POST" satisfies BankTransactionPostingReadiness) &&
        transaction.taxTreatmentSource === "UNSET"
    );
    const unreconciledTransactions = bankTransactions.filter((transaction) =>
      UNRECONCILED_STATUSES.includes(transaction.status)
    );
    const flaggedTransactions = openTransactions.filter(
      (transaction) => transaction.reviewStatus === "FLAGGED"
    );
    const missingEvidenceRecords = taxRecords.filter((record) =>
      EVIDENCE_GAP_STATUSES.includes(record.taxEvidenceStatus)
    );

    const metrics = [
      buildMetric({
        key: "UNCATEGORIZED_TRANSACTIONS",
        count: uncategorizedTransactions.length,
        total: Math.max(openTransactions.length, 1),
      }),
      buildMetric({
        key: "UNRESOLVED_TAX_TREATMENT_GAPS",
        count: taxTreatmentGapTransactions.length,
        total: Math.max(openTransactions.length, 1),
      }),
      buildMetric({
        key: "UNRECONCILED_ITEMS",
        count: unreconciledTransactions.length,
        total: Math.max(bankTransactions.length, 1),
      }),
      buildMetric({
        key: "MISSING_EVIDENCE",
        count: missingEvidenceRecords.length,
        total: Math.max(taxRecords.length, 1),
      }),
      buildMetric({
        key: "FLAGGED_TRANSACTIONS",
        count: flaggedTransactions.length,
        total: Math.max(openTransactions.length, 1),
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
          metric.key === "MISSING_EVIDENCE"
            ? missingEvidenceRecords
                .slice(0, TAX_RECORD_SAMPLE_LIMIT)
                .map((record) => buildTaxRecordSample(record))
            : metric.key === "UNRECONCILED_ITEMS"
              ? unreconciledTransactions
                  .slice(0, BANK_SAMPLE_LIMIT)
                  .map((transaction) => buildBankTransactionSample(transaction))
              : metric.key === "UNCATEGORIZED_TRANSACTIONS"
                ? uncategorizedTransactions
                    .slice(0, BANK_SAMPLE_LIMIT)
                    .map((transaction) => buildBankTransactionSample(transaction))
                : metric.key === "UNRESOLVED_TAX_TREATMENT_GAPS"
                  ? taxTreatmentGapTransactions
                      .slice(0, BANK_SAMPLE_LIMIT)
                      .map((transaction) => buildBankTransactionSample(transaction))
                  : flaggedTransactions
                      .slice(0, BANK_SAMPLE_LIMIT)
                      .map((transaction) => buildBankTransactionSample(transaction));

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
    const hasData = bankTransactions.length > 0 || taxRecords.length > 0;
    const score = hasData ? Math.max(0, 100 - totalPenalty) : 0;
    const status: FilingReadinessStatus = !hasData
      ? "NOT_STARTED"
      : blockers.length === 0
        ? "READY"
        : score >= 75
          ? "IN_PROGRESS"
          : "NEEDS_ATTENTION";
    const highestSeverity = blockers[0]?.severity ?? null;

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
      ? "No current-month transactions or tax records were found yet, so filing readiness has not started for this workspace."
      : blockers.length === 0
        ? `The active workspace is ready to file for ${dateLabel}. No uncategorized, unreconciled, evidence, or flagged blockers were detected.`
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
      narrative,
      blockerCount: blockers.length,
      highestSeverity,
      totals: {
        transactionsInScope: bankTransactions.length,
        openTransactions: openTransactions.length,
        taxRecordsInScope: taxRecords.length,
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
