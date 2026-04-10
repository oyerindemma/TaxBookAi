import "server-only";

import { createHash } from "node:crypto";
import type { SubscriptionPlan, WorkspaceRole } from "@prisma/client";
import { extractOutputText } from "@/lib/bookkeeping-ai";
import {
  buildExplainMyNumbersPeriodRange,
  getExplainMyNumbersComparisonRange,
  getWorkspaceExplainMyNumbersAnalytics,
  resolveExplainMyNumbersPeriodPreset,
} from "@/lib/explain-my-numbers-analytics";
import type {
  ExplainMyNumbersAction,
  ExplainMyNumbersAnalyticsSnapshot,
  ExplainMyNumbersAnswer,
  ExplainMyNumbersHomeState,
  ExplainMyNumbersMessage,
  ExplainMyNumbersMetric,
  ExplainMyNumbersQuickInsight,
  ExplainMyNumbersSource,
} from "@/lib/explain-my-numbers-types";
import { getOpenAiServerConfig, hasOpenAiServerConfig } from "@/lib/env";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type AssistantContext = {
  workspaceId: number;
  workspaceName: string;
  defaultCurrency: string;
  plan: SubscriptionPlan;
  role: WorkspaceRole;
};

type ExplainSectionName =
  | "workspaceOverview"
  | "expenseVariance"
  | "categoryContribution"
  | "vendorContribution"
  | "taxMovement"
  | "filingReadiness";

type SectionResult = {
  name: ExplainSectionName;
  title: string;
  summary: string;
  metrics: ExplainMyNumbersMetric[];
  sources: ExplainMyNumbersSource[];
  actions: ExplainMyNumbersAction[];
  warnings: string[];
  modelContext: Record<string, unknown>;
};

type ExplainMyNumbersProvider = {
  key: "openai" | "rules";
  available: boolean;
  synthesize?: (input: {
    context: AssistantContext;
    question: string;
    history: ExplainMyNumbersMessage[];
    sectionResults: SectionResult[];
    requiresConfirmation: boolean;
  }) => Promise<{
    answer: string;
    incompleteData: boolean;
  }>;
};

const DEFAULT_PROMPTS = [
  "Why is tax due higher this month?",
  "What increased expenses this month?",
  "Which vendors drove the change?",
  "Which categories moved the most this month?",
  "What is blocking filing readiness?",
  "What changed in net profit this month?",
  "Which transactions explain the tax movement?",
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeQuestionHash(question: string) {
  return createHash("sha256").update(question.trim().toLowerCase()).digest("hex");
}

function includesAny(text: string, candidates: string[]) {
  return candidates.some((candidate) => text.includes(candidate));
}

function dedupeStrings(values: string[], limit = values.length) {
  const seen = new Set<string>();
  const next: string[] = [];

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
  const seen = new Set<string>();
  const next: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) continue;
    seen.add(value.id);
    next.push(value);
    if (next.length >= limit) break;
  }

  return next;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDelta(
  deltaMinor: number,
  currency: string,
  fallbackLabel = "no change"
) {
  if (deltaMinor === 0) return fallbackLabel;
  const prefix = deltaMinor > 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(deltaMinor), currency)}`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "new";
  return `${Math.round(value * 100)}%`;
}

function hasWriteIntent(question: string) {
  const normalized = question.toLowerCase();
  return includesAny(normalized, [
    "approve",
    "reject",
    "post",
    "delete",
    "file",
    "submit",
    "update",
    "change",
    "edit",
    "mark",
    "resolve",
  ]);
}

function loadProvider(): ExplainMyNumbersProvider {
  if (!hasOpenAiServerConfig()) {
    return {
      key: "rules",
      available: false,
    };
  }

  return {
    key: "openai",
    available: true,
    async synthesize(input) {
      const { apiKey, assistantModel } = getOpenAiServerConfig();
      const prompt =
        "You are TaxBook AI's explain-my-numbers assistant for accountants. " +
        "Answer only from the structured analytics results provided. " +
        "Do not infer facts that are not present. " +
        "If data is incomplete, say so clearly. " +
        "Never claim a write action happened. " +
        "If the user asks for a write action, say confirmation is required first. " +
        "Keep the answer concise, practical, and grounded in the cited workspace data.\n\n" +
        `Workspace: ${input.context.workspaceName}\n` +
        `Plan: ${input.context.plan}\n` +
        `Role: ${input.context.role}\n` +
        `Question: ${input.question}\n` +
        `Requires confirmation: ${input.requiresConfirmation ? "yes" : "no"}\n` +
        `Recent chat: ${JSON.stringify(input.history.slice(-6))}\n` +
        `Analytics: ${JSON.stringify(
          input.sectionResults.map((section) => ({
            name: section.name,
            title: section.title,
            summary: section.summary,
            warnings: section.warnings,
            metrics: section.metrics,
            sources: section.sources,
            actions: section.actions,
            modelContext: section.modelContext,
          }))
        )}`;

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: assistantModel,
          input: prompt,
          temperature: 0.2,
          text: {
            format: {
              type: "json_schema",
              name: "explain_my_numbers_answer",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  answer: {
                    type: "string",
                  },
                  incompleteData: {
                    type: "boolean",
                  },
                },
                required: ["answer", "incompleteData"],
              },
            },
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "OpenAI explain-my-numbers request failed");
      }

      const outputText = extractOutputText(data);
      if (!outputText) {
        throw new Error("OpenAI explain-my-numbers response was empty");
      }

      return JSON.parse(outputText) as {
        answer: string;
        incompleteData: boolean;
      };
    },
  };
}

async function loadAssistantContext(
  workspaceId: number,
  role: WorkspaceRole
): Promise<AssistantContext> {
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId,
    },
    select: {
      id: true,
      name: true,
      businessProfile: {
        select: {
          defaultCurrency: true,
        },
      },
      subscription: {
        select: {
          plan: true,
        },
      },
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    defaultCurrency: workspace.businessProfile?.defaultCurrency ?? "NGN",
    plan: workspace.subscription?.plan ?? "STARTER",
    role,
  };
}

function selectSections(question: string): ExplainSectionName[] {
  const normalized = question.toLowerCase();
  const sections = new Set<ExplainSectionName>();

  if (
    includesAny(normalized, ["tax", "vat", "wht", "due", "owe", "liability", "higher"])
  ) {
    sections.add("taxMovement");
  }

  if (
    includesAny(normalized, [
      "expense",
      "expenses",
      "spend",
      "cost",
      "profit",
      "net profit",
      "increased",
      "change",
      "changed",
    ])
  ) {
    sections.add("expenseVariance");
  }

  if (includesAny(normalized, ["category", "categories", "breakdown"])) {
    sections.add("categoryContribution");
  }

  if (includesAny(normalized, ["vendor", "vendors", "merchant", "supplier"])) {
    sections.add("vendorContribution");
  }

  if (includesAny(normalized, ["filing", "readiness", "blocker", "blocking", "ready to file"])) {
    sections.add("filingReadiness");
  }

  if (sections.size === 0) {
    sections.add("workspaceOverview");
    sections.add("taxMovement");
    sections.add("filingReadiness");
  }

  if (sections.has("expenseVariance") && !sections.has("categoryContribution")) {
    sections.add("categoryContribution");
  }
  if (sections.has("vendorContribution") && !sections.has("expenseVariance")) {
    sections.add("expenseVariance");
  }

  return Array.from(sections);
}

function buildCategorySource(
  row: ExplainMyNumbersAnalyticsSnapshot["expenseChange"]["topCategories"][number],
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): ExplainMyNumbersSource {
  return {
    id: `category-${row.key}`,
    kind: "category",
    title: row.label,
    detail: `${formatDelta(row.deltaMinor, snapshot.currency)} versus ${
      snapshot.period.previous?.label ?? "the comparison period"
    }. Current: ${formatMoney(row.currentMinor, snapshot.currency)}.`,
    href: `/dashboard/reports?from=${snapshot.period.current.fromParam}&to=${snapshot.period.current.toParam}`,
    badge: `${row.currentCount} tx`,
  };
}

function buildVendorSource(
  row: ExplainMyNumbersAnalyticsSnapshot["expenseChange"]["topVendors"][number],
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): ExplainMyNumbersSource {
  return {
    id: `vendor-${row.key}`,
    kind: "vendor",
    title: row.label,
    detail: `${formatDelta(row.deltaMinor, snapshot.currency)} versus ${
      snapshot.period.previous?.label ?? "the comparison period"
    }. Current: ${formatMoney(row.currentMinor, snapshot.currency)}.`,
    href: null,
    badge: `${row.currentCount} tx`,
  };
}

function buildOverviewSection(snapshot: ExplainMyNumbersAnalyticsSnapshot): SectionResult {
  return {
    name: "workspaceOverview",
    title: "Workspace overview",
    summary: `For ${snapshot.period.current.label}, revenue is ${formatMoney(
      snapshot.overview.revenue.currentMinor,
      snapshot.currency
    )}, expenses are ${formatMoney(
      snapshot.overview.expenses.currentMinor,
      snapshot.currency
    )}, and net profit is ${formatMoney(
      snapshot.overview.netProfit.currentMinor,
      snapshot.currency
    )}.`,
    metrics: [
      {
        label: "Revenue",
        value: formatMoney(snapshot.overview.revenue.currentMinor, snapshot.currency),
        detail: `${formatDelta(snapshot.overview.revenue.deltaMinor, snapshot.currency)} versus ${
          snapshot.period.previous?.label ?? "the prior comparison period"
        }.`,
      },
      {
        label: "Expenses",
        value: formatMoney(snapshot.overview.expenses.currentMinor, snapshot.currency),
        detail: `${formatDelta(snapshot.overview.expenses.deltaMinor, snapshot.currency)} versus ${
          snapshot.period.previous?.label ?? "the prior comparison period"
        }.`,
      },
      {
        label: "Net profit",
        value: formatMoney(snapshot.overview.netProfit.currentMinor, snapshot.currency),
        detail: `${formatDelta(snapshot.overview.netProfit.deltaMinor, snapshot.currency)} versus ${
          snapshot.period.previous?.label ?? "the prior comparison period"
        }.`,
      },
    ],
    sources: dedupeById(
      [
        ...snapshot.expenseChange.topCategories.flatMap((row) => row.sampleSources),
        ...snapshot.expenseChange.topVendors.flatMap((row) => row.sampleSources),
      ],
      6
    ),
    actions: [
      {
        id: "overview-open-dashboard",
        label: "Open dashboard",
        href: "/dashboard",
        description: "Review the live workspace overview cards and recent transactions.",
        intent: "navigate",
      },
      {
        id: "overview-open-reports",
        label: "Open reports",
        href: "/dashboard/reports",
        description: "Inspect the broader reporting surface for the active workspace.",
        intent: "review",
      },
    ],
    warnings: [],
    modelContext: {
      overview: snapshot.overview,
      period: snapshot.period,
    },
  };
}

function buildExpenseVarianceSection(snapshot: ExplainMyNumbersAnalyticsSnapshot): SectionResult {
  const category = snapshot.expenseChange.topCategories[0] ?? null;
  const vendor = snapshot.expenseChange.topVendors[0] ?? null;
  const change = snapshot.overview.expenses;

  return {
    name: "expenseVariance",
    title: "Expense variance",
    summary:
      change.direction === "FLAT"
        ? `Expenses are flat at ${formatMoney(
            change.currentMinor,
            snapshot.currency
          )} for ${snapshot.period.current.label}.`
        : `Expenses are ${formatMoney(
            change.currentMinor,
            snapshot.currency
          )} for ${snapshot.period.current.label}, ${change.deltaMinor > 0 ? "up" : "down"} ${formatMoney(
            Math.abs(change.deltaMinor),
            snapshot.currency
          )} from ${snapshot.period.previous?.label ?? "the comparison period"}.${
            category ? ` The largest category move is ${category.label} (${formatDelta(category.deltaMinor, snapshot.currency)}).` : ""
          }${vendor ? ` The most visible vendor driver is ${vendor.label} (${formatDelta(vendor.deltaMinor, snapshot.currency)}).` : ""}`,
    metrics: [
      {
        label: "Current expenses",
        value: formatMoney(change.currentMinor, snapshot.currency),
        detail: `Compared with ${formatMoney(change.previousMinor, snapshot.currency)} in ${
          snapshot.period.previous?.label ?? "the comparison period"
        }.`,
      },
      {
        label: "Expense delta",
        value: formatDelta(change.deltaMinor, snapshot.currency),
        detail: `That is ${formatPercent(change.deltaPercentage)} versus ${
          snapshot.period.previous?.label ?? "the comparison period"
        }.`,
      },
      {
        label: "Transactions in scope",
        value: String(snapshot.overview.currentTransactionCount),
        detail: `${snapshot.overview.previousTransactionCount} transaction(s) were in the previous comparison window.`,
      },
    ],
    sources: dedupeById(
      [
        ...(category ? [buildCategorySource(category, snapshot)] : []),
        ...(vendor ? [buildVendorSource(vendor, snapshot)] : []),
        ...snapshot.expenseChange.topCategories.flatMap((row) => row.sampleSources),
      ],
      8
    ),
    actions: [
      {
        id: "expense-open-reports",
        label: "Open reports",
        href: "/dashboard/reports",
        description: "Inspect the period totals behind the expense movement.",
        intent: "review",
      },
      {
        id: "expense-open-review",
        label: "Open transaction review",
        href: "/dashboard/banking/review",
        description: "Review underlying bookkeeping items if the change needs closer inspection.",
        intent: "review",
      },
    ],
    warnings: [],
    modelContext: {
      expenseDelta: change,
      topCategories: snapshot.expenseChange.topCategories,
      topVendors: snapshot.expenseChange.topVendors,
    },
  };
}

function buildCategoryContributionSection(
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): SectionResult {
  const topCategories = snapshot.expenseChange.topCategories;

  return {
    name: "categoryContribution",
    title: "Category contribution",
    summary:
      topCategories.length === 0
        ? `No categorized expense movement is available for ${snapshot.period.current.label} yet.`
        : `The largest category movers are ${topCategories
            .slice(0, 3)
            .map(
              (row) => `${row.label} (${formatDelta(row.deltaMinor, snapshot.currency)})`
            )
            .join(", ")}.`,
    metrics: topCategories.slice(0, 3).map((row) => ({
      label: row.label,
      value: formatMoney(row.currentMinor, snapshot.currency),
      detail: `${formatDelta(row.deltaMinor, snapshot.currency)} versus ${
        snapshot.period.previous?.label ?? "the comparison period"
      }.`,
    })),
    sources: dedupeById(
      [
        ...topCategories.map((row) => buildCategorySource(row, snapshot)),
        ...topCategories.flatMap((row) => row.sampleSources),
      ],
      8
    ),
    actions: [
      {
        id: "category-open-reports",
        label: "Open reports",
        href: "/dashboard/reports",
        description: "Review period totals and category-heavy activity.",
        intent: "review",
      },
      {
        id: "category-open-review",
        label: "Open transaction review",
        href: "/dashboard/banking/review",
        description: "Review category assignments on the transactions driving the movement.",
        intent: "review",
      },
    ],
    warnings: topCategories.length === 0 ? ["No category-level expense movement is available yet."] : [],
    modelContext: {
      topCategories,
    },
  };
}

function buildVendorContributionSection(
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): SectionResult {
  const topVendors = snapshot.expenseChange.topVendors;

  return {
    name: "vendorContribution",
    title: "Vendor contribution",
    summary:
      topVendors.length === 0
        ? `No vendor-linked expense movement is available for ${snapshot.period.current.label} yet.`
        : `The vendors driving the change most are ${topVendors
            .slice(0, 3)
            .map(
              (row) => `${row.label} (${formatDelta(row.deltaMinor, snapshot.currency)})`
            )
            .join(", ")}.`,
    metrics: topVendors.slice(0, 3).map((row) => ({
      label: row.label,
      value: formatMoney(row.currentMinor, snapshot.currency),
      detail: `${formatDelta(row.deltaMinor, snapshot.currency)} versus ${
        snapshot.period.previous?.label ?? "the comparison period"
      }.`,
    })),
    sources: dedupeById(
      [
        ...topVendors.map((row) => buildVendorSource(row, snapshot)),
        ...topVendors.flatMap((row) => row.sampleSources),
      ],
      8
    ),
    actions: [
      {
        id: "vendor-open-review",
        label: "Open transaction review",
        href: "/dashboard/banking/review",
        description: "Inspect supporting bookkeeping records for the vendor movement.",
        intent: "review",
      },
      {
        id: "vendor-open-dashboard",
        label: "Open dashboard",
        href: "/dashboard",
        description: "Compare the contribution against the live workspace overview.",
        intent: "navigate",
      },
    ],
    warnings: topVendors.length === 0 ? ["No vendor-linked expense movement is available yet."] : [],
    modelContext: {
      topVendors,
    },
  };
}

function buildTaxMovementSection(snapshot: ExplainMyNumbersAnalyticsSnapshot): SectionResult {
  if (!snapshot.taxMovement) {
    return {
      name: "taxMovement",
      title: "Tax movement",
      summary: `No live tax movement is available yet for ${snapshot.period.current.label}.`,
      metrics: [],
      sources: [],
      actions: [
        {
          id: "tax-open-center",
          label: "Open tax center",
          href: "/dashboard/tax-center",
          description: "Review current tax posture and drill down into source transactions.",
          intent: "review",
        },
      ],
      warnings: ["Tax movement data is not available for this workspace yet."],
      modelContext: {
        taxMovement: null,
      },
    };
  }

  const tax = snapshot.taxMovement;

  return {
    name: "taxMovement",
    title: "Tax movement",
    summary: `Tax due for ${snapshot.period.current.label} is ${formatMoney(
      tax.currentTotalDueMinor,
      snapshot.currency
    )}, ${tax.deltaMinor > 0 ? "up" : tax.deltaMinor < 0 ? "down" : "flat"} ${formatMoney(
      Math.abs(tax.deltaMinor),
      snapshot.currency
    )} from ${snapshot.period.previous?.label ?? "the comparison period"}. ${tax.explanationSummary}`,
    metrics: [
      {
        label: "Tax due",
        value: formatMoney(tax.currentTotalDueMinor, snapshot.currency),
        detail: `Compared with ${formatMoney(tax.previousTotalDueMinor, snapshot.currency)} in ${
          snapshot.period.previous?.label ?? "the comparison period"
        }.`,
      },
      {
        label: "VAT due",
        value: formatMoney(tax.currentVatDueMinor, snapshot.currency),
        detail: `${formatDelta(tax.currentVatDueMinor - tax.previousVatDueMinor, snapshot.currency)} versus ${
          snapshot.period.previous?.label ?? "the comparison period"
        }.`,
      },
      {
        label: "WHT due",
        value: formatMoney(tax.currentWhtDueMinor, snapshot.currency),
        detail: `${formatDelta(tax.currentWhtDueMinor - tax.previousWhtDueMinor, snapshot.currency)} versus ${
          snapshot.period.previous?.label ?? "the comparison period"
        }.`,
      },
    ],
    sources: dedupeById(
      [
        ...tax.topDrivers.map((driver) => ({
          id: `tax-driver-${driver.key}`,
          kind: "tax_driver" as const,
          title: driver.label,
          detail: `${formatMoney(driver.amountMinor, snapshot.currency)} · ${driver.reason}`,
          href: "/dashboard/tax-center",
          badge: driver.taxType,
        })),
        ...tax.sources,
      ],
      8
    ),
    actions: [
      {
        id: "tax-open-center",
        label: "Open tax center",
        href: "/dashboard/tax-center",
        description: "Inspect the current VAT and WHT drivers with transaction drill-downs.",
        intent: "review",
      },
      {
        id: "tax-open-review",
        label: "Open transaction review",
        href: "/dashboard/banking/review",
        description: "Review transactions that are shaping the live tax movement.",
        intent: "review",
      },
    ],
    warnings: [],
    modelContext: {
      tax,
    },
  };
}

function buildFilingReadinessSection(
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): SectionResult {
  if (!snapshot.filingReadiness) {
    return {
      name: "filingReadiness",
      title: "Filing readiness",
      summary: "Filing readiness data is not available for the active workspace yet.",
      metrics: [],
      sources: [],
      actions: [
        {
          id: "filing-open-readiness",
          label: "Open filing readiness",
          href: "/dashboard/filing-readiness",
          description: "Review blocker scoring and recommended next actions.",
          intent: "review",
        },
      ],
      warnings: ["Filing readiness data is not available yet."],
      modelContext: {
        filingReadiness: null,
      },
    };
  }

  const filing = snapshot.filingReadiness;

  return {
    name: "filingReadiness",
    title: "Filing readiness",
    summary:
      filing.blockerCount === 0
        ? `Filing readiness is ${filing.status.toLowerCase()} with a score of ${filing.score}. No active blockers are visible right now.`
        : `Filing readiness score is ${filing.score} with ${filing.blockerCount} blocker${
            filing.blockerCount === 1 ? "" : "s"
          }, led by ${filing.blockers[0]?.title.toLowerCase()}.`,
    metrics: [
      {
        label: "Readiness score",
        value: String(filing.score),
        detail: filing.narrative,
      },
      {
        label: "Blockers",
        value: String(filing.blockerCount),
        detail:
          filing.blockers[0]?.detail ??
          "No active blockers are reducing readiness right now.",
      },
      {
        label: "Status",
        value: filing.status,
        detail: `Recommended next actions: ${filing.recommendations.length}.`,
      },
    ],
    sources: dedupeById(
      filing.blockers.map((blocker, index) => ({
        id: `filing-blocker-${index}`,
        kind: "filing_blocker" as const,
        title: blocker.title,
        detail: blocker.detail,
        href: blocker.href,
        badge: blocker.severity,
      })),
      6
    ),
    actions: dedupeById(
      [
        {
          id: "filing-open-readiness",
          label: "Open filing readiness",
          href: "/dashboard/filing-readiness",
          description: "Review the filing blocker list and score inputs.",
          intent: "review" as const,
        },
        ...filing.recommendations.map((recommendation, index) => ({
          id: `filing-recommendation-${index}`,
          label: recommendation.actionLabel,
          href: recommendation.href,
          description: recommendation.detail,
          intent: "confirm" as const,
        })),
      ],
      5
    ),
    warnings: [],
    modelContext: {
      filing,
    },
  };
}

function buildFallbackAnswer(
  question: string,
  sections: SectionResult[],
  requiresConfirmation: boolean
) {
  const summary = sections
    .map((section) => section.summary)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  const warnings = dedupeStrings(sections.flatMap((section) => section.warnings), 3);
  const parts = [summary];

  if (warnings.length > 0) {
    parts.push(`Data note: ${warnings[0]}`);
  }

  if (requiresConfirmation) {
    parts.push(
      "No records were changed. If you want a write action, confirmation is required first."
    );
  }

  if (!parts[0]) {
    parts.unshift(`I could not find enough live workspace data to answer "${question}" confidently.`);
  }

  return parts.join(" ").trim();
}

function buildSuggestedPrompts(sectionResults: SectionResult[]) {
  const names = new Set(sectionResults.map((section) => section.name));
  const prompts = [...DEFAULT_PROMPTS];

  if (names.has("taxMovement")) {
    prompts.unshift("Which transactions explain the tax movement?");
  }
  if (names.has("expenseVariance")) {
    prompts.unshift("What increased expenses this month?");
  }
  if (names.has("vendorContribution")) {
    prompts.unshift("Which vendors drove the change?");
  }
  if (names.has("filingReadiness")) {
    prompts.unshift("What is blocking filing readiness?");
  }

  return dedupeStrings(prompts, 8);
}

function buildAuditMetadata(input: {
  question: string;
  context: AssistantContext;
  result: ExplainMyNumbersAnswer;
}) {
  return {
    workspaceId: input.context.workspaceId,
    workspaceName: input.context.workspaceName,
    plan: input.context.plan,
    role: input.context.role,
    questionPreview: input.question.slice(0, 160),
    questionHash: normalizeQuestionHash(input.question),
    questionLength: input.question.length,
    toolsInvoked: input.result.toolsInvoked,
    sourceCount: input.result.sources.length,
    followUpActionCount: input.result.followUpActions.length,
    mode: input.result.mode,
    provider: input.result.provider,
    incompleteData: input.result.incompleteData,
    requiresConfirmation: input.result.requiresConfirmation,
    warningCount: input.result.warnings.length,
    answerLength: input.result.answer.length,
  };
}

function buildQuickInsightsFromSnapshot(
  snapshot: ExplainMyNumbersAnalyticsSnapshot
): ExplainMyNumbersQuickInsight[] {
  const taxSummary = snapshot.taxMovement
    ? `Tax due is ${formatMoney(snapshot.taxMovement.currentTotalDueMinor, snapshot.currency)} with a ${formatDelta(snapshot.taxMovement.deltaMinor, snapshot.currency)} movement versus ${snapshot.period.previous?.label ?? "the comparison period"}.`
    : `No live tax movement is visible for ${snapshot.period.current.label} yet.`;
  const expenseLead = snapshot.expenseChange.topCategories[0];
  const vendorLead = snapshot.expenseChange.topVendors[0];
  const filingSummary = snapshot.filingReadiness
    ? snapshot.filingReadiness.narrative
    : "Filing readiness is not available yet for the active workspace.";

  return [
    {
      id: "explain-tax-movement",
      title: "Tax movement",
      summary: taxSummary,
      tone:
        snapshot.taxMovement && snapshot.taxMovement.deltaMinor > 0
          ? "destructive"
          : "secondary",
      href: "/dashboard/tax-center",
      ctaLabel: "Open tax center",
    },
    {
      id: "explain-expense-variance",
      title: "Expense variance",
      summary: expenseLead
        ? `${expenseLead.label} is the biggest category mover at ${formatDelta(
            expenseLead.deltaMinor,
            snapshot.currency
          )}.`
        : "No category-level expense movement is available yet.",
      tone: expenseLead && expenseLead.deltaMinor > 0 ? "outline" : "secondary",
      href: "/dashboard/reports",
      ctaLabel: "Open reports",
    },
    {
      id: "explain-vendor-drivers",
      title: "Vendor drivers",
      summary: vendorLead
        ? `${vendorLead.label} is the most visible vendor driver at ${formatDelta(
            vendorLead.deltaMinor,
            snapshot.currency
          )}.`
        : "No vendor-linked expense movement is available yet.",
      tone: vendorLead ? "outline" : "secondary",
      href: "/dashboard/banking/review",
      ctaLabel: "Inspect entries",
    },
    {
      id: "explain-filing-blockers",
      title: "Filing blockers",
      summary: filingSummary,
      tone:
        snapshot.filingReadiness && snapshot.filingReadiness.blockerCount > 0
          ? "destructive"
          : "secondary",
      href: "/dashboard/filing-readiness",
      ctaLabel: "Open readiness",
    },
  ];
}

function resolveHomeStateSummary(snapshot: ExplainMyNumbersAnalyticsSnapshot) {
  const hasTransactions =
    snapshot.overview.currentTransactionCount > 0 ||
    snapshot.overview.previousTransactionCount > 0;
  const hasExpenseDrivers =
    snapshot.expenseChange.topCategories.length > 0 ||
    snapshot.expenseChange.topVendors.length > 0;
  const hasTaxInsight = Boolean(snapshot.taxMovement);
  const hasFilingInsight = Boolean(snapshot.filingReadiness);

  return hasTransactions || hasExpenseDrivers || hasTaxInsight || hasFilingInsight
    ? "Live workspace insights are ready."
    : "Not enough data yet";
}

export async function answerExplainMyNumbersQuestion(input: {
  workspaceId: number;
  role: WorkspaceRole;
  question: string;
  history?: ExplainMyNumbersMessage[];
}): Promise<ExplainMyNumbersAnswer> {
  const question = normalizeText(input.question);
  const history = (input.history ?? [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: normalizeText(message.content).slice(0, 1000),
    }))
    .filter((message) => message.content)
    .slice(-8);

  const context = await loadAssistantContext(input.workspaceId, input.role);
  const requiresConfirmation = hasWriteIntent(question);
  const period = buildExplainMyNumbersPeriodRange(resolveExplainMyNumbersPeriodPreset(question));
  const comparisonPeriod = getExplainMyNumbersComparisonRange(period);
  const selectedSections = selectSections(question);
  const snapshot = await getWorkspaceExplainMyNumbersAnalytics({
    workspaceId: input.workspaceId,
    period,
    comparisonPeriod,
    includeTax: selectedSections.includes("taxMovement"),
    includeFilingReadiness: selectedSections.includes("filingReadiness"),
  });

  const builders: Record<ExplainSectionName, (snapshot: ExplainMyNumbersAnalyticsSnapshot) => SectionResult> =
    {
      workspaceOverview: buildOverviewSection,
      expenseVariance: buildExpenseVarianceSection,
      categoryContribution: buildCategoryContributionSection,
      vendorContribution: buildVendorContributionSection,
      taxMovement: buildTaxMovementSection,
      filingReadiness: buildFilingReadinessSection,
    };

  const sectionResults = selectedSections.map((section) => builders[section](snapshot));
  const supportingMetrics = dedupeById(
    sectionResults.flatMap((section) =>
      section.metrics.map((metric) => ({
        ...metric,
        id: `${section.name}-${metric.label}-${metric.value}`,
      }))
    ),
    6
  ).map((metric) => ({
    label: metric.label,
    value: metric.value,
    detail: metric.detail,
  }));
  const sources = dedupeById(sectionResults.flatMap((section) => section.sources), 8);
  const followUpActions = dedupeById(sectionResults.flatMap((section) => section.actions), 5);
  const warnings = dedupeStrings(sectionResults.flatMap((section) => section.warnings), 5);
  const provider = loadProvider();

  let answer = buildFallbackAnswer(question, sectionResults, requiresConfirmation);
  let mode: "openai" | "fallback" = "fallback";
  let incompleteData = warnings.length > 0;

  if (provider.available && provider.synthesize) {
    try {
      const result = await provider.synthesize({
        context,
        question,
        history,
        sectionResults,
        requiresConfirmation,
      });
      answer = result.answer.trim() || answer;
      incompleteData = result.incompleteData || warnings.length > 0;
      mode = "openai";
    } catch {
      warnings.unshift(
        "Generative synthesis was unavailable, so this answer used the rule-based explain-my-numbers assistant."
      );
      incompleteData = true;
    }
  } else {
    warnings.unshift(
      "OpenAI is not configured in this environment, so the assistant is running in rules-only mode."
    );
    incompleteData = true;
  }

  const response: ExplainMyNumbersAnswer = {
    answer,
    supportingMetrics,
    toolsInvoked: sectionResults.map((section) => section.name),
    sources,
    followUpActions,
    warnings: dedupeStrings(warnings, 5),
    mode,
    provider: provider.key,
    aiEnabled: provider.available,
    requiresConfirmation,
    incompleteData,
    suggestedPrompts: buildSuggestedPrompts(sectionResults),
    auditMetadata: {},
  };

  response.auditMetadata = buildAuditMetadata({
    question,
    context,
    result: response,
  });

  return response;
}

export async function buildExplainMyNumbersHomeState(input: {
  workspaceId: number;
  role: WorkspaceRole;
}): Promise<ExplainMyNumbersHomeState> {
  try {
    const period = buildExplainMyNumbersPeriodRange("THIS_MONTH");
    const comparisonPeriod = getExplainMyNumbersComparisonRange(period);
    const snapshot = await getWorkspaceExplainMyNumbersAnalytics({
      workspaceId: input.workspaceId,
      period,
      comparisonPeriod,
      includeTax: true,
      includeFilingReadiness: true,
    });

    return {
      aiEnabled: hasOpenAiServerConfig(),
      quickInsights: buildQuickInsightsFromSnapshot(snapshot),
      suggestedPrompts: DEFAULT_PROMPTS,
      summary: resolveHomeStateSummary(snapshot),
    };
  } catch (error) {
    logError(
      "explain-my-numbers",
      "Failed to build explain-my-numbers home state; returning an empty assistant state.",
      error,
      {
        workspaceId: input.workspaceId,
        role: input.role,
      }
    );

    return {
      aiEnabled: hasOpenAiServerConfig(),
      quickInsights: [],
      suggestedPrompts: DEFAULT_PROMPTS,
      summary: "Not enough data yet",
    };
  }
}
