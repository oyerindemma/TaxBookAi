import "server-only";

import type { Prisma } from "@prisma/client";
import { hasOpenAiServerConfig } from "@/lib/env";
import {
  buildExplainMyNumbersPeriodRange,
  getExplainMyNumbersComparisonRange,
  getWorkspaceExplainMyNumbersAnalytics,
} from "@/lib/explain-my-numbers-analytics";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import { getWorkspaceTransactionTaxSummary } from "@/lib/transaction-tax";
import { getWorkspaceAlertCenterData } from "@/lib/workspace-alerts";
import type {
  AssistantAction,
  AssistantAnswerDraft,
  AssistantCitation,
  AssistantContextTransaction,
  AssistantHomeState,
  AssistantMetric,
  AssistantQuickInsight,
  AssistantWorkspaceContext,
  AssistantWorkspaceContextStatus,
} from "@/lib/assistant-types";

const DEFAULT_ASSISTANT_PROMPTS = [
  "What is my current tax exposure?",
  "Which transactions need review?",
  "Why did expenses increase?",
  "Summarize this workspace for me.",
  "What is uncategorized right now?",
];

const OPEN_REVIEW_STATUSES = ["IMPORTED", "PENDING_REVIEW", "FLAGGED"] as const;
const REVIEW_QUERY_SUPPORT = {
  tables: ["BankTransaction"],
  columns: ["BankTransaction.reviewStatus", "BankTransaction.postingReadiness"],
} as const;
const CATEGORIZATION_QUERY_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.categoryId",
    "BankTransaction.suggestedCategoryId",
    "BankTransaction.suggestionConfidence",
    "BankTransaction.suggestionReason",
  ],
} as const;
const FULL_TRANSACTION_QUERY_SUPPORT = {
  tables: ["BankTransaction", "BankAccount"],
  columns: [
    ...REVIEW_QUERY_SUPPORT.columns,
    ...CATEGORIZATION_QUERY_SUPPORT.columns,
  ],
} as const;

const assistantBaseTransactionSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  currency: true,
  bankAccount: {
    select: {
      name: true,
    },
  },
  clientBusiness: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

const assistantRichTransactionSelect = {
  ...assistantBaseTransactionSelect,
  reviewStatus: true,
  postingReadiness: true,
  reviewNotes: true,
  suggestionConfidence: true,
  suggestionReason: true,
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

type AssistantBaseTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof assistantBaseTransactionSelect;
}>;

type AssistantRichTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof assistantRichTransactionSelect;
}>;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function shortDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfCurrentMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfCurrentMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function includesAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate));
}

function dedupeStrings(values: string[], limit = values.length) {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
    if (next.length >= limit) break;
  }

  return next;
}

function dedupeById<T extends { id: string }>(values: T[], limit = values.length) {
  const next: T[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.id)) continue;
    seen.add(value.id);
    next.push(value);
    if (next.length >= limit) break;
  }

  return next;
}

function isAssistantSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: ["Workspace", "BusinessProfile", "ClientBusiness", "BankTransaction", "BankAccount"],
    columns: [
      "BusinessProfile.",
      "ClientBusiness.",
      "BankTransaction.",
      "BankAccount.",
    ],
  });
}

async function runAssistantContextQuerySafely<T>(input: {
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
      "assistant-context",
      `Assistant ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isAssistantSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function createEmptyTransaction(input: {
  id: number;
  transactionDate: string;
  description: string;
  reference?: string | null;
  amountMinor: number;
  type: "CREDIT" | "DEBIT";
  currency: string;
  bankAccountName: string;
  clientBusinessName?: string | null;
}): AssistantContextTransaction {
  return {
    id: input.id,
    transactionDate: input.transactionDate,
    description: input.description,
    reference: input.reference ?? null,
    amountMinor: input.amountMinor,
    type: input.type,
    currency: input.currency,
    bankAccountName: input.bankAccountName,
    clientBusinessName: input.clientBusinessName ?? null,
    reviewStatus: null,
    postingReadiness: null,
    categoryName: null,
    suggestedCategoryName: null,
    suggestionConfidence: null,
    suggestionReason: null,
    reviewNotes: null,
  };
}

function serializeBaseTransaction(
  transaction: AssistantBaseTransactionRecord
): AssistantContextTransaction {
  return createEmptyTransaction({
    id: transaction.id,
    transactionDate: transaction.transactionDate.toISOString(),
    description: transaction.description,
    reference: transaction.reference,
    amountMinor: transaction.amount,
    type: transaction.type,
    currency: transaction.currency,
    bankAccountName: transaction.bankAccount.name,
    clientBusinessName: transaction.clientBusiness?.name ?? null,
  });
}

function serializeRichTransaction(
  transaction: AssistantRichTransactionRecord
): AssistantContextTransaction {
  return {
    ...serializeBaseTransaction(transaction),
    reviewStatus: transaction.reviewStatus,
    postingReadiness: transaction.postingReadiness,
    categoryName: transaction.category?.name ?? null,
    suggestedCategoryName: transaction.suggestedCategory?.name ?? null,
    suggestionConfidence: transaction.suggestionConfidence,
    suggestionReason: transaction.suggestionReason,
    reviewNotes: transaction.reviewNotes,
  };
}

function buildEmptyAssistantContext(workspaceId: number): AssistantWorkspaceContext {
  return {
    workspace: {
      id: workspaceId,
      name: "Workspace",
      defaultCurrency: "NGN",
      generatedAt: new Date().toISOString(),
      status: "empty",
    },
    overview: {
      currentPeriodLabel: "this month",
      transactionCount: 0,
      currentPeriodTransactionCount: 0,
      pendingReviewCount: 0,
      flaggedCount: 0,
      uncategorizedCount: 0,
      suggestedCategoryCount: 0,
      lowConfidenceSuggestionCount: 0,
      totalIncomeMinor: 0,
      totalExpenseMinor: 0,
      netFlowMinor: 0,
    },
    tax: {
      status: "empty",
      dateLabel: "this month",
      vatDueMinor: 0,
      whtDueMinor: 0,
      totalTaxDueMinor: 0,
      provisional: true,
      transactionCount: 0,
      explanation: null,
    },
    review: {
      pendingCount: 0,
      flaggedCount: 0,
      reviewRequiredCount: 0,
      items: [],
    },
    categorization: {
      uncategorizedCount: 0,
      suggestedCount: 0,
      lowConfidenceCount: 0,
      items: [],
    },
    recentTransactions: [],
    clientBusinesses: [],
    alerts: {
      openCount: 0,
      criticalCount: 0,
      items: [],
    },
    analytics: {
      summary: "Not enough data yet to summarize this workspace.",
      expensesDeltaMinor: 0,
      netProfitDeltaMinor: 0,
      topCategoryDriver: null,
      topVendorDriver: null,
      filingNarrative: null,
      filingBlockerCount: 0,
    },
    warnings: ["Not enough data yet. Import a bank statement or add a manual transaction to get started."],
  };
}

async function loadRecentTransactions(input: {
  workspaceId: number;
  take: number;
  supportRichSelect: boolean;
}) {
  if (!(await hasPrismaDatabaseSupport({ tables: ["BankTransaction", "BankAccount"] }))) {
    return [] as AssistantContextTransaction[];
  }

  if (input.supportRichSelect) {
    return runAssistantContextQuerySafely({
      workspaceId: input.workspaceId,
      label: "recent transactions query",
      query: prisma.bankTransaction.findMany({
        where: {
          workspaceId: input.workspaceId,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: input.take,
        select: assistantRichTransactionSelect,
      }),
      fallback: () => [] as AssistantRichTransactionRecord[],
      support: FULL_TRANSACTION_QUERY_SUPPORT,
    }).then((rows) => rows.map(serializeRichTransaction));
  }

  return runAssistantContextQuerySafely({
    workspaceId: input.workspaceId,
    label: "recent transactions base query",
    query: prisma.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: input.take,
      select: assistantBaseTransactionSelect,
    }),
    fallback: () => [] as AssistantBaseTransactionRecord[],
    support: {
      tables: ["BankTransaction", "BankAccount"],
    },
  }).then((rows) => rows.map(serializeBaseTransaction));
}

function buildPendingReviewWhere(workspaceId: number): Prisma.BankTransactionWhereInput {
  return {
    workspaceId,
    reviewStatus: {
      in: [...OPEN_REVIEW_STATUSES],
    },
  };
}

export async function buildWorkspaceAssistantContext(
  workspaceId: number
): Promise<AssistantWorkspaceContext> {
  if (!workspaceId || !Number.isInteger(workspaceId) || workspaceId <= 0) {
    return buildEmptyAssistantContext(workspaceId);
  }

  const period = buildExplainMyNumbersPeriodRange("THIS_MONTH");
  const comparisonPeriod = getExplainMyNumbersComparisonRange(period);
  const dateFrom = startOfCurrentMonth();
  const dateTo = endOfCurrentMonth();
  const supportsReview = await hasPrismaDatabaseSupport(REVIEW_QUERY_SUPPORT);
  const supportsCategorization = await hasPrismaDatabaseSupport(CATEGORIZATION_QUERY_SUPPORT);
  const supportsRichTransactions = supportsReview && supportsCategorization;

  const [
    workspaceRecord,
    clientBusinesses,
    recentTransactions,
    totalTransactionCount,
    currentPeriodTransactions,
    pendingReviewCount,
    flaggedCount,
    reviewRequiredCount,
    pendingReviewItems,
    uncategorizedCount,
    suggestedCategoryCount,
    lowConfidenceSuggestionCount,
    uncategorizedItems,
    taxSummary,
    alerts,
    analyticsSnapshot,
  ] = await Promise.all([
    runAssistantContextQuerySafely({
      workspaceId,
      label: "workspace query",
      query: prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          businessProfile: {
            select: {
              defaultCurrency: true,
            },
          },
        },
      }),
      fallback: () => null,
      support: {
        tables: ["Workspace"],
      },
    }),
    runAssistantContextQuerySafely({
      workspaceId,
      label: "client business query",
      query: prisma.clientBusiness.findMany({
        where: {
          workspaceId,
          archivedAt: null,
        },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
        },
      }),
      fallback: () => [],
      support: {
        tables: ["ClientBusiness"],
      },
    }),
    loadRecentTransactions({
      workspaceId,
      take: 8,
      supportRichSelect: supportsRichTransactions,
    }),
    runAssistantContextQuerySafely({
      workspaceId,
      label: "transaction count query",
      query: prisma.bankTransaction.count({
        where: {
          workspaceId,
        },
      }),
      fallback: () => 0,
      support: {
        tables: ["BankTransaction"],
      },
    }),
    runAssistantContextQuerySafely({
      workspaceId,
      label: "current period transactions query",
      query: prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          transactionDate: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        select: {
          amount: true,
          type: true,
        },
      }),
      fallback: () => [] as Array<{ amount: number; type: "CREDIT" | "DEBIT" }>,
      support: {
        tables: ["BankTransaction"],
      },
    }),
    supportsReview
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "pending review count query",
          query: prisma.bankTransaction.count({
            where: buildPendingReviewWhere(workspaceId),
          }),
          fallback: () => 0,
          support: REVIEW_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsReview
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "flagged review count query",
          query: prisma.bankTransaction.count({
            where: {
              workspaceId,
              reviewStatus: "FLAGGED",
            },
          }),
          fallback: () => 0,
          support: REVIEW_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsReview
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "review required posting count query",
          query: prisma.bankTransaction.count({
            where: {
              workspaceId,
              postingReadiness: "REVIEW_REQUIRED",
            },
          }),
          fallback: () => 0,
          support: REVIEW_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsRichTransactions
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "pending review items query",
          query: prisma.bankTransaction.findMany({
            where: buildPendingReviewWhere(workspaceId),
            orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
            take: 5,
            select: assistantRichTransactionSelect,
          }),
          fallback: () => [] as AssistantRichTransactionRecord[],
          support: FULL_TRANSACTION_QUERY_SUPPORT,
        }).then((rows) => rows.map(serializeRichTransaction))
      : Promise.resolve([] as AssistantContextTransaction[]),
    supportsCategorization
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "uncategorized count query",
          query: prisma.bankTransaction.count({
            where: {
              workspaceId,
              categoryId: null,
            },
          }),
          fallback: () => 0,
          support: CATEGORIZATION_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsCategorization
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "suggested categorization count query",
          query: prisma.bankTransaction.count({
            where: {
              workspaceId,
              categoryId: null,
              suggestedCategoryId: {
                not: null,
              },
            },
          }),
          fallback: () => 0,
          support: CATEGORIZATION_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsCategorization
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "low confidence categorization count query",
          query: prisma.bankTransaction.count({
            where: {
              workspaceId,
              categoryId: null,
              suggestionConfidence: {
                lt: 0.7,
              },
            },
          }),
          fallback: () => 0,
          support: CATEGORIZATION_QUERY_SUPPORT,
        })
      : Promise.resolve(0),
    supportsRichTransactions
      ? runAssistantContextQuerySafely({
          workspaceId,
          label: "uncategorized items query",
          query: prisma.bankTransaction.findMany({
            where: {
              workspaceId,
              categoryId: null,
            },
            orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
            take: 5,
            select: assistantRichTransactionSelect,
          }),
          fallback: () => [] as AssistantRichTransactionRecord[],
          support: FULL_TRANSACTION_QUERY_SUPPORT,
        }).then((rows) => rows.map(serializeRichTransaction))
      : Promise.resolve([] as AssistantContextTransaction[]),
    getWorkspaceTransactionTaxSummary({
      workspaceId,
      dateFrom,
      dateTo,
      defaultDateWindowApplied: true,
      drilldownLimit: 5,
    }),
    getWorkspaceAlertCenterData({
      workspaceId,
      limit: 4,
    }),
    getWorkspaceExplainMyNumbersAnalytics({
      workspaceId,
      period,
      comparisonPeriod,
      includeTax: true,
      includeFilingReadiness: true,
    }),
  ]);

  const currentPeriodTotals = currentPeriodTransactions.reduce(
    (acc, transaction) => {
      if (transaction.type === "CREDIT") {
        acc.totalIncomeMinor += transaction.amount;
      } else {
        acc.totalExpenseMinor += transaction.amount;
      }
      return acc;
    },
    {
      totalIncomeMinor: 0,
      totalExpenseMinor: 0,
    }
  );
  const workspaceName = workspaceRecord?.name ?? "Workspace";
  const defaultCurrency =
    workspaceRecord?.businessProfile?.defaultCurrency ??
    clientBusinesses[0]?.defaultCurrency ??
    taxSummary.currency ??
    "NGN";
  const warnings: string[] = [];

  if (totalTransactionCount === 0) {
    warnings.push("Not enough data yet. Import a bank statement or add a manual transaction to get started.");
  }

  if (!supportsReview && totalTransactionCount > 0) {
    warnings.push("Review queue metadata is only partially available in this environment, so review counts may be understated.");
  }

  if (!supportsCategorization && totalTransactionCount > 0) {
    warnings.push("Category suggestion metadata is only partially available, so uncategorized counts may be understated.");
  }

  if (taxSummary.totalMatchingTransactions === 0 && totalTransactionCount > 0) {
    warnings.push("Tax exposure is provisional because no posted tax-ready transactions were found for the current window.");
  }

  const recentCurrencies = new Set(recentTransactions.map((transaction) => transaction.currency));
  if (recentCurrencies.size > 1) {
    warnings.push("This workspace has multiple transaction currencies, so headline totals are shown using the workspace default currency for consistency.");
  }

  const overallStatus: AssistantWorkspaceContextStatus =
    totalTransactionCount === 0
      ? "empty"
      : warnings.length > 0
        ? "partial"
        : "ready";

  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      defaultCurrency,
      generatedAt: new Date().toISOString(),
      status: overallStatus,
    },
    overview: {
      currentPeriodLabel: period.label,
      transactionCount: totalTransactionCount,
      currentPeriodTransactionCount: currentPeriodTransactions.length,
      pendingReviewCount,
      flaggedCount,
      uncategorizedCount,
      suggestedCategoryCount,
      lowConfidenceSuggestionCount,
      totalIncomeMinor: currentPeriodTotals.totalIncomeMinor,
      totalExpenseMinor: currentPeriodTotals.totalExpenseMinor,
      netFlowMinor:
        currentPeriodTotals.totalIncomeMinor - currentPeriodTotals.totalExpenseMinor,
    },
    tax: {
      status:
        taxSummary.totalMatchingTransactions === 0
          ? "empty"
          : taxSummary.transactions.some((transaction) => transaction.usesSuggestedFallback)
            ? "partial"
            : "ready",
      dateLabel: taxSummary.scope.dateLabel,
      vatDueMinor: taxSummary.liability.vatDueMinor,
      whtDueMinor: taxSummary.liability.whtDueMinor,
      totalTaxDueMinor: taxSummary.liability.totalDueMinor,
      provisional:
        taxSummary.totalMatchingTransactions === 0 ||
        taxSummary.transactions.some((transaction) => transaction.usesSuggestedFallback),
      transactionCount: taxSummary.totalMatchingTransactions,
      explanation:
        taxSummary.explanations.taxes[0]?.summary ??
        (taxSummary.totalMatchingTransactions > 0
          ? `Tax exposure is derived from ${taxSummary.scope.dateLabel} bank transactions.`
          : null),
    },
    review: {
      pendingCount: pendingReviewCount,
      flaggedCount,
      reviewRequiredCount,
      items: pendingReviewItems,
    },
    categorization: {
      uncategorizedCount,
      suggestedCount: suggestedCategoryCount,
      lowConfidenceCount: lowConfidenceSuggestionCount,
      items: uncategorizedItems,
    },
    recentTransactions,
    clientBusinesses: clientBusinesses.map((business) => ({
      id: business.id,
      name: business.name,
      defaultCurrency: business.defaultCurrency,
    })),
    alerts: {
      openCount: alerts.summary.openCount,
      criticalCount: alerts.summary.criticalOpenCount,
      items: alerts.alerts.slice(0, 4).map((alert) => ({
        id: alert.id,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        status: alert.status,
        href: alert.recommendedActionHref ?? alert.primaryRecordHref ?? null,
        clientBusinessName: alert.clientBusiness?.name ?? null,
      })),
    },
    analytics: {
      summary:
        totalTransactionCount === 0
          ? "Not enough data yet to summarize this workspace."
          : analyticsSnapshot.taxMovement?.explanationSummary ??
            analyticsSnapshot.filingReadiness?.narrative ??
            "Live workspace data is available for grounded answers.",
      expensesDeltaMinor: analyticsSnapshot.overview.expenses.deltaMinor,
      netProfitDeltaMinor: analyticsSnapshot.overview.netProfit.deltaMinor,
      topCategoryDriver: analyticsSnapshot.expenseChange.topCategories[0]
        ? {
            label: analyticsSnapshot.expenseChange.topCategories[0].label,
            deltaMinor: analyticsSnapshot.expenseChange.topCategories[0].deltaMinor,
          }
        : null,
      topVendorDriver: analyticsSnapshot.expenseChange.topVendors[0]
        ? {
            label: analyticsSnapshot.expenseChange.topVendors[0].label,
            deltaMinor: analyticsSnapshot.expenseChange.topVendors[0].deltaMinor,
          }
        : null,
      filingNarrative: analyticsSnapshot.filingReadiness?.narrative ?? null,
      filingBlockerCount: analyticsSnapshot.filingReadiness?.blockerCount ?? 0,
    },
    warnings: dedupeStrings(warnings, 6),
  };
}

function transactionHref(transactionId: number) {
  return `/dashboard/banking/review?transactionId=${transactionId}`;
}

function buildTransactionCitation(
  transaction: AssistantContextTransaction,
  kind: AssistantCitation["kind"],
  badge: string | null
): AssistantCitation {
  return {
    id: `${kind}-${transaction.id}`,
    kind,
    title: transaction.description,
    detail: `${shortDate(transaction.transactionDate)} · ${formatMoney(
      transaction.amountMinor,
      transaction.currency
    )}${transaction.clientBusinessName ? ` · ${transaction.clientBusinessName}` : ""}`,
    href: transactionHref(transaction.id),
    badge,
  };
}

function buildSummaryMetrics(context: AssistantWorkspaceContext): AssistantMetric[] {
  return [
    {
      label: "Transactions",
      value: String(context.overview.transactionCount),
      detail: `Total imported and manual transactions visible in ${context.workspace.name}.`,
    },
    {
      label: "Pending review",
      value: String(context.overview.pendingReviewCount),
      detail: "Items still waiting for accountant review.",
    },
    {
      label: "Uncategorized",
      value: String(context.overview.uncategorizedCount),
      detail: "Transactions without a final category assignment.",
    },
    {
      label: "Tax due",
      value: formatMoney(context.tax.totalTaxDueMinor, context.workspace.defaultCurrency),
      detail: `Current VAT plus WHT exposure for ${context.tax.dateLabel}.`,
    },
  ];
}

function buildTaxResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const citations = context.recentTransactions.slice(0, 2).map((transaction) =>
    buildTransactionCitation(
      transaction,
      "bank_transaction",
      transaction.reviewStatus ?? transaction.type
    )
  );

  if (context.tax.transactionCount === 0) {
    return {
      answer:
        "Not enough data yet to calculate tax exposure confidently. Import transactions, review the queue, and confirm tax treatment so VAT and WHT can be derived safely.",
      metrics: [
        {
          label: "Tax due",
          value: formatMoney(0, context.workspace.defaultCurrency),
          detail: "No tax-ready transactions were found in the current window.",
        },
        {
          label: "Pending review",
          value: String(context.review.pendingCount),
          detail: "Review these items before relying on provisional tax numbers.",
        },
      ],
      citations,
      actions: [
        {
          id: "assistant-open-review-tax",
          label: "Open review queue",
          href: "/dashboard/banking/review",
          description: "Clear pending items and confirm tax treatment.",
          intent: "review",
        },
        {
          id: "assistant-open-tax-center",
          label: "Open tax center",
          href: "/dashboard/tax-center",
          description: "Review the transaction-derived tax engine output.",
          intent: "navigate",
        },
      ],
      warnings: dedupeStrings(
        [
          ...context.warnings,
          "Current tax numbers are provisional until the review queue is cleared.",
        ],
        5
      ),
      suggestedPrompts: dedupeStrings(
        ["Which transactions need review before tax is final?", ...DEFAULT_ASSISTANT_PROMPTS],
        6
      ),
      incompleteData: true,
      status: context.workspace.status,
      sectionLabels: ["tax exposure"],
    };
  }

  return {
    answer: `Current tax exposure for ${context.tax.dateLabel} is ${formatMoney(
      context.tax.totalTaxDueMinor,
      context.workspace.defaultCurrency
    )}, made up of ${formatMoney(
      context.tax.vatDueMinor,
      context.workspace.defaultCurrency
    )} VAT due and ${formatMoney(
      context.tax.whtDueMinor,
      context.workspace.defaultCurrency
    )} WHT due.${context.tax.provisional ? " These numbers are still provisional because some tax treatment uses suggested defaults or the review queue is not fully cleared yet." : ""}`,
    metrics: [
      {
        label: "VAT due",
        value: formatMoney(context.tax.vatDueMinor, context.workspace.defaultCurrency),
        detail: `Derived from ${context.tax.dateLabel} transaction treatments.`,
      },
      {
        label: "WHT due",
        value: formatMoney(context.tax.whtDueMinor, context.workspace.defaultCurrency),
        detail: `Derived from ${context.tax.dateLabel} transaction treatments.`,
      },
      {
        label: "Total tax due",
        value: formatMoney(context.tax.totalTaxDueMinor, context.workspace.defaultCurrency),
        detail: "Combined VAT and WHT exposure.",
      },
      {
        label: "Pending review",
        value: String(context.review.pendingCount),
        detail: "Open review items can still change the final tax position.",
      },
    ],
    citations,
    actions: [
      {
        id: "assistant-open-tax-center-live",
        label: "Open tax center",
        href: "/dashboard/tax-center",
        description: "Inspect the detailed VAT and WHT breakdown.",
        intent: "navigate",
      },
    ],
    warnings: dedupeStrings(context.warnings, 5),
    suggestedPrompts: dedupeStrings(
      ["Which transactions explain the tax exposure?", ...DEFAULT_ASSISTANT_PROMPTS],
      6
    ),
    incompleteData: context.tax.provisional || context.warnings.length > 0,
    status: context.tax.status,
    sectionLabels: ["tax exposure"],
  };
}

function buildReviewResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const citations = context.review.items.map((transaction) =>
    buildTransactionCitation(
      transaction,
      "review_item",
      transaction.reviewStatus ?? transaction.postingReadiness
    )
  );

  if (context.review.pendingCount === 0) {
    return {
      answer:
        context.overview.transactionCount === 0
          ? "There are no transactions in this workspace yet, so the review queue is empty."
          : "There are no open pending-review items right now. The current queue looks clear.",
      metrics: [
        {
          label: "Pending review",
          value: "0",
          detail: "Transactions still waiting for a review decision.",
        },
        {
          label: "Flagged",
          value: String(context.review.flaggedCount),
          detail: "Items explicitly flagged for deeper attention.",
        },
      ],
      citations,
      actions: [
        {
          id: "assistant-open-banking",
          label: "Open transaction engine",
          href: "/dashboard/banking",
          description: "Inspect recent banking activity.",
          intent: "navigate",
        },
      ],
      warnings: dedupeStrings(context.warnings, 5),
      suggestedPrompts: dedupeStrings(
        ["What is uncategorized right now?", ...DEFAULT_ASSISTANT_PROMPTS],
        6
      ),
      incompleteData: context.workspace.status !== "ready",
      status: context.workspace.status,
      sectionLabels: ["review queue"],
    };
  }

  const lead = context.review.items[0];
  return {
    answer: `${context.review.pendingCount} transactions currently need review, with ${context.review.flaggedCount} already flagged and ${context.review.reviewRequiredCount} marked review-required for posting.${lead ? ` The most recent open item is "${lead.description}" from ${shortDate(lead.transactionDate)}.` : ""}`,
    metrics: [
      {
        label: "Pending review",
        value: String(context.review.pendingCount),
        detail: "Open items across imported, pending-review, and flagged states.",
      },
      {
        label: "Flagged",
        value: String(context.review.flaggedCount),
        detail: "Transactions already escalated for extra review.",
      },
      {
        label: "Review required",
        value: String(context.review.reviewRequiredCount),
        detail: "Transactions not ready to post automatically.",
      },
    ],
    citations,
    actions: [
      {
        id: "assistant-open-review",
        label: "Open review queue",
        href: "/dashboard/banking/review",
        description: "Work through the live review queue.",
        intent: "review",
      },
    ],
    warnings: dedupeStrings(context.warnings, 5),
    suggestedPrompts: dedupeStrings(
      ["What is uncategorized right now?", "Which items are low confidence?", ...DEFAULT_ASSISTANT_PROMPTS],
      7
    ),
    incompleteData: context.workspace.status !== "ready",
    status: context.workspace.status,
    sectionLabels: ["review queue"],
  };
}

function buildUncategorizedResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const citations = context.categorization.items.map((transaction) =>
    buildTransactionCitation(
      transaction,
      "category_suggestion",
      transaction.suggestedCategoryName
        ? `Suggest ${transaction.suggestedCategoryName}`
        : transaction.reviewStatus
    )
  );

  if (context.categorization.uncategorizedCount === 0) {
    return {
      answer:
        context.overview.transactionCount === 0
          ? "There are no transactions in this workspace yet, so there is nothing uncategorized."
          : "Nothing is uncategorized right now. The current transaction set already has categories or no open categorization gap was detected.",
      metrics: [
        {
          label: "Uncategorized",
          value: "0",
          detail: "Transactions without a final category assignment.",
        },
      ],
      citations,
      actions: [
        {
          id: "assistant-open-review-categorized",
          label: "Open review queue",
          href: "/dashboard/banking/review",
          description: "Spot-check categorized transactions if needed.",
          intent: "review",
        },
      ],
      warnings: dedupeStrings(context.warnings, 5),
      suggestedPrompts: dedupeStrings(DEFAULT_ASSISTANT_PROMPTS, 5),
      incompleteData: context.workspace.status !== "ready",
      status: context.workspace.status,
      sectionLabels: ["categorization"],
    };
  }

  const lowConfidenceLabel =
    context.categorization.lowConfidenceCount > 0
      ? ` ${context.categorization.lowConfidenceCount} of them are low-confidence suggestions and should be reviewed manually.`
      : "";

  return {
    answer: `${context.categorization.uncategorizedCount} transactions are still uncategorized, and ${context.categorization.suggestedCount} already have a suggested category.${lowConfidenceLabel}`,
    metrics: [
      {
        label: "Uncategorized",
        value: String(context.categorization.uncategorizedCount),
        detail: "Transactions that still need a final category assignment.",
      },
      {
        label: "Suggested",
        value: String(context.categorization.suggestedCount),
        detail: "Uncategorized transactions with a stored category suggestion.",
      },
      {
        label: "Low confidence",
        value: String(context.categorization.lowConfidenceCount),
        detail: "Suggested rows that likely still need manual review.",
      },
    ],
    citations,
    actions: [
      {
        id: "assistant-open-review-uncategorized",
        label: "Review uncategorized items",
        href: "/dashboard/banking/review",
        description: "Finish categorization from the review queue.",
        intent: "review",
      },
    ],
    warnings: dedupeStrings(
      [
        ...context.warnings,
        context.categorization.lowConfidenceCount > 0
          ? "Low-confidence category suggestions should be confirmed before posting."
          : "",
      ],
      5
    ),
    suggestedPrompts: dedupeStrings(
      ["Which transactions need review?", ...DEFAULT_ASSISTANT_PROMPTS],
      6
    ),
    incompleteData: true,
    status: context.workspace.status,
    sectionLabels: ["categorization"],
  };
}

function buildExpenseChangeResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const citations: AssistantCitation[] = [];

  if (context.analytics.topCategoryDriver) {
    citations.push({
      id: `category-${context.analytics.topCategoryDriver.label}`,
      kind: "summary",
      title: context.analytics.topCategoryDriver.label,
      detail: `Category delta: ${formatMoney(
        Math.abs(context.analytics.topCategoryDriver.deltaMinor),
        context.workspace.defaultCurrency
      )}`,
      href: "/dashboard/banking/review",
      badge: "Category driver",
    });
  }

  if (context.analytics.topVendorDriver) {
    citations.push({
      id: `vendor-${context.analytics.topVendorDriver.label}`,
      kind: "summary",
      title: context.analytics.topVendorDriver.label,
      detail: `Vendor delta: ${formatMoney(
        Math.abs(context.analytics.topVendorDriver.deltaMinor),
        context.workspace.defaultCurrency
      )}`,
      href: "/dashboard/banking/review",
      badge: "Vendor driver",
    });
  }

  const changeDirection =
    context.analytics.expensesDeltaMinor > 0
      ? "increased"
      : context.analytics.expensesDeltaMinor < 0
        ? "decreased"
        : "stayed broadly flat";
  const categoryLead = context.analytics.topCategoryDriver
    ? `${context.analytics.topCategoryDriver.label} is the strongest category driver at ${formatMoney(
        Math.abs(context.analytics.topCategoryDriver.deltaMinor),
        context.workspace.defaultCurrency
      )}.`
    : "No category-level expense driver is available yet.";
  const vendorLead = context.analytics.topVendorDriver
    ? `${context.analytics.topVendorDriver.label} is the clearest vendor driver at ${formatMoney(
        Math.abs(context.analytics.topVendorDriver.deltaMinor),
        context.workspace.defaultCurrency
      )}.`
    : "No vendor-level expense driver is available yet.";

  return {
    answer:
      context.overview.transactionCount === 0
        ? "Not enough data yet to explain expense movement. Import transactions for at least one period before asking why expenses changed."
        : `Expenses ${changeDirection} by ${formatMoney(
            Math.abs(context.analytics.expensesDeltaMinor),
            context.workspace.defaultCurrency
          )} versus the comparison period. ${categoryLead} ${vendorLead}`,
    metrics: [
      {
        label: "Expense change",
        value: formatMoney(
          context.analytics.expensesDeltaMinor,
          context.workspace.defaultCurrency
        ),
        detail: "Current-period expense movement versus the comparison period.",
      },
      {
        label: "Net profit change",
        value: formatMoney(
          context.analytics.netProfitDeltaMinor,
          context.workspace.defaultCurrency
        ),
        detail: "Net profit movement over the same comparison window.",
      },
    ],
    citations,
    actions: [
      {
        id: "assistant-open-banking-review-expense",
        label: "Inspect transactions",
        href: "/dashboard/banking/review",
        description: "Open the review queue to inspect the drivers directly.",
        intent: "review",
      },
    ],
    warnings: dedupeStrings(context.warnings, 5),
    suggestedPrompts: dedupeStrings(
      ["Which transactions need review?", "Summarize this workspace for me.", ...DEFAULT_ASSISTANT_PROMPTS],
      7
    ),
    incompleteData: context.workspace.status !== "ready",
    status: context.workspace.status,
    sectionLabels: ["expense variance"],
  };
}

function buildSummaryResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const citations = dedupeById(
    [
      ...context.recentTransactions.slice(0, 3).map((transaction) =>
        buildTransactionCitation(
          transaction,
          "bank_transaction",
          transaction.reviewStatus ?? transaction.type
        )
      ),
      ...context.alerts.items.slice(0, 2).map((alert) => ({
        id: `alert-${alert.id}`,
        kind: "alert" as const,
        title: alert.title,
        detail: `${alert.severity} · ${alert.message}`,
        href: alert.href,
        badge: alert.status,
      })),
    ],
    5
  );

  if (context.overview.transactionCount === 0) {
    return {
      answer:
        "This workspace is still new. There are no transactions yet, no review queue, and no tax exposure to summarize. Import a bank statement or add a manual transaction to start building a grounded picture.",
      metrics: buildSummaryMetrics(context),
      citations,
      actions: [
        {
          id: "assistant-open-reconcile-empty",
          label: "Import bank statement",
          href: "/dashboard/banking/reconcile",
          description: "Bring in a CSV bank statement to start the workflow.",
          intent: "navigate",
        },
        {
          id: "assistant-open-banking-empty",
          label: "Open transaction engine",
          href: "/dashboard/banking",
          description: "Add or review transactions manually.",
          intent: "navigate",
        },
      ],
      warnings: dedupeStrings(context.warnings, 5),
      suggestedPrompts: dedupeStrings(DEFAULT_ASSISTANT_PROMPTS, 5),
      incompleteData: true,
      status: "empty",
      sectionLabels: ["workspace summary"],
    };
  }

  const blockerLine =
    context.analytics.filingBlockerCount > 0
      ? ` Filing readiness currently has ${context.analytics.filingBlockerCount} blocker${context.analytics.filingBlockerCount === 1 ? "" : "s"}.`
      : "";
  const alertLine =
    context.alerts.openCount > 0
      ? ` There are ${context.alerts.openCount} open alerts, including ${context.alerts.criticalCount} critical.`
      : "";

  return {
    answer: `${context.workspace.name} has ${context.overview.transactionCount} transactions on record, ${context.overview.pendingReviewCount} pending review, and ${context.overview.uncategorizedCount} still uncategorized. Current-period inflows are ${formatMoney(
      context.overview.totalIncomeMinor,
      context.workspace.defaultCurrency
    )} against outflows of ${formatMoney(
      context.overview.totalExpenseMinor,
      context.workspace.defaultCurrency
    )}, with tax exposure currently at ${formatMoney(
      context.tax.totalTaxDueMinor,
      context.workspace.defaultCurrency
    )}.${blockerLine}${alertLine}`,
    metrics: buildSummaryMetrics(context),
    citations,
    actions: [
      {
        id: "assistant-open-dashboard",
        label: "Open dashboard",
        href: "/dashboard",
        description: "See the full workspace overview.",
        intent: "navigate",
      },
      {
        id: "assistant-open-review-summary",
        label: "Open review queue",
        href: "/dashboard/banking/review",
        description: "Work through pending transactions.",
        intent: "review",
      },
    ],
    warnings: dedupeStrings(context.warnings, 5),
    suggestedPrompts: dedupeStrings(DEFAULT_ASSISTANT_PROMPTS, 5),
    incompleteData: context.workspace.status !== "ready",
    status: context.workspace.status,
    sectionLabels: ["workspace summary"],
  };
}

function buildFilingResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  const blockerCount = context.analytics.filingBlockerCount;
  const answer =
    blockerCount > 0
      ? `Filing readiness is not clear yet. ${context.analytics.filingNarrative ?? `There are ${blockerCount} blockers still open.`}`
      : context.analytics.filingNarrative
        ? context.analytics.filingNarrative
        : "There are no filing blockers visible right now, but review and tax treatment should still be kept current.";

  return {
    answer,
    metrics: [
      {
        label: "Filing blockers",
        value: String(blockerCount),
        detail: "Issues currently preventing a fully clean filing position.",
      },
      {
        label: "Pending review",
        value: String(context.review.pendingCount),
        detail: "Review queue items often drive filing incompleteness.",
      },
    ],
    citations:
      blockerCount > 0
        ? [
            {
              id: "filing-blockers",
              kind: "filing_blocker",
              title: "Filing readiness",
              detail: context.analytics.filingNarrative ?? `${blockerCount} blockers remain open.`,
              href: "/dashboard/filing-readiness",
              badge: blockerCount > 0 ? "Needs attention" : "On track",
            },
          ]
        : [],
    actions: [
      {
        id: "assistant-open-filing-readiness",
        label: "Open filing readiness",
        href: "/dashboard/filing-readiness",
        description: "Inspect blockers and next actions for compliance readiness.",
        intent: "review",
      },
    ],
    warnings: dedupeStrings(context.warnings, 5),
    suggestedPrompts: dedupeStrings(
      ["Which transactions need review?", ...DEFAULT_ASSISTANT_PROMPTS],
      6
    ),
    incompleteData: context.workspace.status !== "ready",
    status: context.workspace.status,
    sectionLabels: ["filing readiness"],
  };
}

function buildGenericResponse(context: AssistantWorkspaceContext): AssistantAnswerDraft {
  return buildSummaryResponse(context);
}

export function buildAssistantAnswerDraft(input: {
  context: AssistantWorkspaceContext;
  message: string;
}): AssistantAnswerDraft {
  const normalized = input.message.trim().toLowerCase();

  if (
    includesAny(normalized, [
      "tax exposure",
      "vat",
      "wht",
      "tax due",
      "tax position",
      "tax summary",
    ])
  ) {
    return buildTaxResponse(input.context);
  }

  if (
    includesAny(normalized, [
      "need review",
      "pending review",
      "review queue",
      "review",
      "flagged",
    ])
  ) {
    return buildReviewResponse(input.context);
  }

  if (
    includesAny(normalized, [
      "uncategorized",
      "category suggestion",
      "categorized",
      "categorization",
    ])
  ) {
    return buildUncategorizedResponse(input.context);
  }

  if (
    includesAny(normalized, [
      "expenses increase",
      "expenses increased",
      "expense increase",
      "why did expenses",
      "vendor drove",
      "category drove",
    ])
  ) {
    return buildExpenseChangeResponse(input.context);
  }

  if (
    includesAny(normalized, [
      "filing",
      "readiness",
      "block",
      "blocker",
      "compliance",
    ])
  ) {
    return buildFilingResponse(input.context);
  }

  return buildGenericResponse(input.context);
}

export async function buildAssistantHomeState(
  workspaceId: number
): Promise<AssistantHomeState> {
  const context = await buildWorkspaceAssistantContext(workspaceId);

  const quickInsights: AssistantQuickInsight[] = [
    {
      id: "assistant-tax-exposure",
      title: "Tax exposure",
      summary:
        context.tax.transactionCount > 0
          ? `${formatMoney(context.tax.totalTaxDueMinor, context.workspace.defaultCurrency)} due for ${context.tax.dateLabel}.`
          : "No tax-ready transactions yet.",
      tone:
        context.tax.totalTaxDueMinor > 0
          ? context.tax.provisional
            ? "outline"
            : "default"
          : "secondary",
      href: "/dashboard/tax-center",
      ctaLabel: "Open tax center",
    },
    {
      id: "assistant-review-queue",
      title: "Review queue",
      summary:
        context.review.pendingCount > 0
          ? `${context.review.pendingCount} transactions still need review.`
          : "The review queue is currently clear.",
      tone: context.review.pendingCount > 0 ? "destructive" : "secondary",
      href: "/dashboard/banking/review",
      ctaLabel: "Open review queue",
    },
    {
      id: "assistant-categorization",
      title: "Categorization",
      summary:
        context.categorization.uncategorizedCount > 0
          ? `${context.categorization.uncategorizedCount} items are still uncategorized.`
          : "No uncategorized transactions detected right now.",
      tone: context.categorization.uncategorizedCount > 0 ? "outline" : "secondary",
      href: "/dashboard/banking/review",
      ctaLabel: "Inspect transactions",
    },
    {
      id: "assistant-alerts",
      title: "Workspace alerts",
      summary:
        context.alerts.openCount > 0
          ? `${context.alerts.openCount} open alerts, including ${context.alerts.criticalCount} critical.`
          : "No active workspace alerts at the moment.",
      tone: context.alerts.criticalCount > 0 ? "destructive" : "secondary",
      href: "/dashboard/notifications",
      ctaLabel: "Open alerts",
    },
  ];

  return {
    aiEnabled: hasOpenAiServerConfig(),
    summary:
      context.workspace.status === "empty"
        ? "Not enough data yet"
        : context.workspace.status === "partial"
          ? "Live workspace data is available, with some provisional signals."
          : "Live workspace insights are ready.",
    suggestedPrompts: [...DEFAULT_ASSISTANT_PROMPTS],
    quickInsights,
  };
}
