import "server-only";

import { createHash } from "node:crypto";
import type { SubscriptionPlan, WorkspaceRole } from "@prisma/client";
import { getWorkspaceBookkeepingMetrics, getWorkspaceTaxSummary } from "@/lib/accounting-firm";
import { listWorkspaceClients } from "@/lib/clients";
import { extractOutputText } from "@/lib/bookkeeping-ai";
import { getOpenAiServerConfig, hasOpenAiServerConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  buildTaxComplianceSummary,
  getReadinessLabel,
  resolveTaxPeriodState,
} from "@/lib/tax-compliance";
import { getWorkspaceTaxRecords } from "@/lib/tax-reporting";

export type FinanceAssistantToolName =
  | "getTaxSummary"
  | "getOverdueInvoices"
  | "getUnmatchedBankTransactions"
  | "getExpenseAnomalies"
  | "getRevenueTrend"
  | "getCashMovementSummary"
  | "getFilingStatus"
  | "getDuplicateExpenses"
  | "explainTransaction"
  | "suggestNextActions"
  | "openLinkedRecord";

export type FinanceAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FinanceAssistantMetric = {
  label: string;
  value: string;
  detail: string;
};

export type FinanceAssistantSource = {
  id: string;
  kind:
    | "invoice"
    | "client"
    | "client_business"
    | "bank_transaction"
    | "ledger_transaction"
    | "bookkeeping_upload"
    | "filing_draft"
    | "filing_status"
    | "summary";
  title: string;
  detail: string;
  href: string | null;
  badge: string | null;
};

export type FinanceAssistantAction = {
  id: string;
  label: string;
  href: string;
  description: string;
  intent: "navigate" | "review" | "confirm";
};

export type FinanceAssistantQuickInsight = {
  id: string;
  title: string;
  summary: string;
  tone: "default" | "secondary" | "outline" | "destructive";
  href: string;
  ctaLabel: string;
};

export type FinanceAssistantHomeState = {
  aiEnabled: boolean;
  quickInsights: FinanceAssistantQuickInsight[];
  suggestedPrompts: string[];
};

export type FinanceAssistantAnswer = {
  answer: string;
  supportingMetrics: FinanceAssistantMetric[];
  toolsInvoked: FinanceAssistantToolName[];
  sources: FinanceAssistantSource[];
  followUpActions: FinanceAssistantAction[];
  warnings: string[];
  mode: "openai" | "fallback";
  aiEnabled: boolean;
  requiresConfirmation: boolean;
  incompleteData: boolean;
  suggestedPrompts: string[];
  auditMetadata: Record<string, unknown>;
};

type AssistantContext = {
  workspaceId: number;
  workspaceName: string;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  plan: SubscriptionPlan;
  role: WorkspaceRole;
};

type AssistantPeriodPreset =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER"
  | "THIS_YEAR"
  | "LAST_30_DAYS"
  | "THIS_WEEK";

type AssistantPeriodRange = {
  preset: AssistantPeriodPreset;
  label: string;
  from: Date;
  to: Date;
  fromParam: string;
  toParam: string;
};

type ToolPlan = {
  name: FinanceAssistantToolName;
  args?: Record<string, unknown>;
};

type ToolResult = {
  name: FinanceAssistantToolName;
  title: string;
  summary: string;
  metrics: FinanceAssistantMetric[];
  sources: FinanceAssistantSource[];
  actions: FinanceAssistantAction[];
  warnings: string[];
  modelContext: Record<string, unknown>;
};

const DEFAULT_PROMPTS = [
  "How much VAT do we owe this month?",
  "Which invoices are overdue right now?",
  "Which bank transactions are still unmatched?",
  "What expenses look unusual this quarter?",
  "Which client contributes the most revenue?",
  "Which filings are ready?",
  "Why did VAT increase this month?",
  "What changed in cash movement this month?",
  "What should I review first today?",
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthValue(date: Date) {
  return date.toISOString().slice(0, 7);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function startOfQuarter(date: Date) {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
}

function endOfQuarter(date: Date) {
  const start = startOfQuarter(date);
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0, 23, 59, 59, 999)
  );
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function endOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

function startOfWeekMonday(date: Date) {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999)
  );
}

function shiftMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function shiftDays(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount));
}

function getQuarterNumber(date: Date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function resolvePeriodPreset(question: string): AssistantPeriodPreset {
  const normalized = question.toLowerCase();

  if (normalized.includes("last 30") || normalized.includes("past 30")) {
    return "LAST_30_DAYS";
  }
  if (normalized.includes("this week") || normalized.includes("current week")) {
    return "THIS_WEEK";
  }
  if (normalized.includes("last month") || normalized.includes("previous month")) {
    return "LAST_MONTH";
  }
  if (normalized.includes("last quarter") || normalized.includes("previous quarter")) {
    return "LAST_QUARTER";
  }
  if (normalized.includes("this quarter") || normalized.includes("current quarter")) {
    return "THIS_QUARTER";
  }
  if (normalized.includes("this year") || normalized.includes("current year")) {
    return "THIS_YEAR";
  }

  return "THIS_MONTH";
}

function buildPeriodRange(preset: AssistantPeriodPreset, now = new Date()): AssistantPeriodRange {
  const currentDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  );

  if (preset === "THIS_WEEK") {
    const from = startOfWeekMonday(currentDate);
    const to = endOfWeekSunday(currentDate);
    return {
      preset,
      label: "this week",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_30_DAYS") {
    const to = new Date(
      Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate(), 23, 59, 59, 999)
    );
    const from = shiftDays(currentDate, -29);
    return {
      preset,
      label: "the last 30 days",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_MONTH") {
    const anchor = shiftMonths(currentDate, -1);
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    return {
      preset,
      label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "THIS_QUARTER") {
    const from = startOfQuarter(currentDate);
    const to = endOfQuarter(currentDate);
    return {
      preset,
      label: `Q${getQuarterNumber(currentDate)} ${currentDate.getUTCFullYear()}`,
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_QUARTER") {
    const anchor = shiftMonths(currentDate, -3);
    const from = startOfQuarter(anchor);
    const to = endOfQuarter(anchor);
    return {
      preset,
      label: `Q${getQuarterNumber(anchor)} ${anchor.getUTCFullYear()}`,
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "THIS_YEAR") {
    const from = startOfYear(currentDate);
    const to = endOfYear(currentDate);
    return {
      preset,
      label: String(currentDate.getUTCFullYear()),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  const from = startOfMonth(currentDate);
  const to = endOfMonth(currentDate);
  return {
    preset: "THIS_MONTH",
    label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    from,
    to,
    fromParam: formatDateParam(from),
    toParam: formatDateParam(to),
  };
}

function getComparisonRange(range: AssistantPeriodRange): AssistantPeriodRange | null {
  if (range.preset === "THIS_WEEK") {
    const from = shiftDays(range.from, -7);
    const to = shiftDays(range.to, -7);
    return {
      preset: "THIS_WEEK",
      label: "the prior week",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }
  if (range.preset === "LAST_30_DAYS") {
    return {
      preset: "LAST_30_DAYS",
      label: "the prior 30 days",
      from: shiftDays(range.from, -30),
      to: shiftDays(range.from, -1),
      fromParam: formatDateParam(shiftDays(range.from, -30)),
      toParam: formatDateParam(shiftDays(range.from, -1)),
    };
  }
  if (range.preset === "THIS_MONTH") {
    return buildPeriodRange("LAST_MONTH");
  }
  if (range.preset === "THIS_QUARTER") {
    return buildPeriodRange("LAST_QUARTER");
  }
  if (range.preset === "THIS_YEAR") {
    const year = range.from.getUTCFullYear() - 1;
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    return {
      preset: "THIS_YEAR",
      label: String(year),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }
  return null;
}

function formatMoney(amountMinor: number, currency: string) {
  const value = (amountMinor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (currency === "MIXED") {
    return `${value} (mixed currencies)`;
  }

  return `${currency} ${value}`;
}

function formatCount(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function shortDate(date: Date | string) {
  const resolved = typeof date === "string" ? new Date(date) : date;
  return resolved.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeQuestionHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hasWriteIntent(question: string) {
  const normalized = question.toLowerCase();
  return [
    "create ",
    "prepare ",
    "approve ",
    "reject ",
    "delete ",
    "cancel ",
    "post ",
    "file ",
    "send ",
    "mark ",
    "sync ",
    "update ",
  ].some((fragment) => normalized.includes(fragment));
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function hasNavigationIntent(question: string) {
  const normalized = question.toLowerCase();
  return (
    includesAny(normalized, ["open ", "view ", "show ", "take me", "go to ", "inspect "]) &&
    includesAny(normalized, [
      "invoice",
      "transaction",
      "record",
      "client",
      "business",
      "filing",
      "draft",
      "receipt",
      "upload",
    ])
  );
}

function sanitizeRecordQuery(query: string) {
  return query
    .replace(
      /^(open|view|show|inspect)\s+(the\s+)?(linked\s+)?(record\s+)?/i,
      ""
    )
    .replace(/^(take me to|go to)\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function buildSearchTokens(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );
}

function buildContainsClauses(query: string, fields: string[]) {
  const searchTokens = buildSearchTokens(query);

  return searchTokens.flatMap((token) =>
    fields.map((field) => ({
      [field]: {
        contains: token,
      },
    }))
  );
}

function dedupeById<T extends { id: string }>(items: T[], limit = items.length) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function dedupeStrings(values: string[], limit = values.length) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function resolveCurrencyMode(currencies: Iterable<string>, fallback: string) {
  const unique = Array.from(new Set(Array.from(currencies).filter(Boolean)));
  return unique.length <= 1 ? unique[0] ?? fallback : "MIXED";
}

function scoreSourceMatch(
  source: Pick<FinanceAssistantSource, "title" | "detail" | "badge">,
  query: string
) {
  const normalizedQuery = query.toLowerCase();
  const haystack = `${source.title} ${source.detail} ${source.badge ?? ""}`.toLowerCase();
  const tokens = buildSearchTokens(query);
  let score = 0;

  if (haystack.includes(normalizedQuery)) {
    score += 8;
  }
  if (source.title.toLowerCase() === normalizedQuery) {
    score += 4;
  }

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
}

async function loadAssistantContext(workspaceId: number, role: WorkspaceRole): Promise<AssistantContext> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      businessProfile: {
        select: {
          defaultCurrency: true,
          fiscalYearStartMonth: true,
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
    throw new Error("Workspace not found");
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    defaultCurrency: workspace.businessProfile?.defaultCurrency ?? "NGN",
    fiscalYearStartMonth: workspace.businessProfile?.fiscalYearStartMonth ?? 1,
    plan: workspace.subscription?.plan ?? "STARTER",
    role,
  };
}

async function searchWorkspaceRecords(
  context: AssistantContext,
  rawQuery: string
): Promise<{
  query: string;
  sources: FinanceAssistantSource[];
  bestSource: FinanceAssistantSource | null;
  modelContext: Record<string, unknown>;
}> {
  const query = sanitizeRecordQuery(normalizeText(rawQuery));
  if (!query) {
    return {
      query: "",
      sources: [],
      bestSource: null,
      modelContext: {
        query: null,
      },
    };
  }

  const numericId = Number(query);
  const containsDescriptionClauses = buildContainsClauses(query, ["reference", "description"]);
  const containsInvoiceClauses = buildContainsClauses(query, ["invoiceNumber", "paymentReference"]);
  const containsClientClauses = buildContainsClauses(query, ["name", "companyName", "email"]);
  const containsBusinessClauses = buildContainsClauses(query, ["name", "legalName"]);
  const containsFilingClauses = buildContainsClauses(query, [
    "reference",
    "title",
    "submissionReference",
  ]);
  const containsUploadClauses = buildContainsClauses(query, ["fileName"]);

  const [
    bankTransactions,
    ledgerTransactions,
    invoices,
    clients,
    clientBusinesses,
    filingDrafts,
    uploads,
  ] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { reference: { contains: query } },
          { description: { contains: query } },
          ...containsDescriptionClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ transactionDate: "desc" }],
      select: {
        id: true,
        description: true,
        reference: true,
        amount: true,
        currency: true,
        status: true,
        transactionDate: true,
      },
    }),
    prisma.ledgerTransaction.findMany({
      where: {
        clientBusiness: {
          workspaceId: context.workspaceId,
        },
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { reference: { contains: query } },
          { description: { contains: query } },
          ...containsDescriptionClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ transactionDate: "desc" }],
      select: {
        id: true,
        description: true,
        reference: true,
        amountMinor: true,
        currency: true,
        reviewStatus: true,
        transactionDate: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { invoiceNumber: { contains: query } },
          { paymentReference: { contains: query } },
          ...containsInvoiceClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ issueDate: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        dueDate: true,
        client: {
          select: {
            name: true,
            companyName: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { name: { contains: query } },
          { companyName: { contains: query } },
          { email: { contains: query } },
          ...containsClientClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
      },
    }),
    prisma.clientBusiness.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { name: { contains: query } },
          { legalName: { contains: query } },
          ...containsBusinessClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        legalName: true,
      },
    }),
    prisma.filingDraft.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { reference: { contains: query } },
          { title: { contains: query } },
          { submissionReference: { contains: query } },
          ...containsFilingClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 4,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        taxType: true,
        status: true,
        title: true,
        reference: true,
        submissionReference: true,
        taxPeriod: {
          select: {
            label: true,
          },
        },
      },
    }),
    prisma.bookkeepingUpload.findMany({
      where: {
        workspaceId: context.workspaceId,
        OR: [
          Number.isInteger(numericId) ? { id: numericId } : undefined,
          { fileName: { contains: query } },
          ...containsUploadClauses,
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      take: 3,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const rankedSources = [
    ...invoices.map((invoice) => ({
      source: {
        id: `search-invoice-${invoice.id}`,
        kind: "invoice" as const,
        title: `Invoice ${invoice.invoiceNumber}`,
        detail: `${invoice.client.companyName ?? invoice.client.name} · due ${shortDate(invoice.dueDate)} · ${formatMoney(invoice.totalAmount, context.defaultCurrency)}`,
        href: `/dashboard/invoices/${invoice.id}`,
        badge: invoice.status,
      },
      sortDate: invoice.dueDate.getTime(),
    })),
    ...bankTransactions.map((transaction) => ({
      source: {
        id: `search-bank-${transaction.id}`,
        kind: "bank_transaction" as const,
        title: transaction.description,
        detail: `${shortDate(transaction.transactionDate)} · ${formatMoney(transaction.amount, transaction.currency)}${transaction.reference ? ` · ref ${transaction.reference}` : ""}`,
        href: "/dashboard/banking/reconcile",
        badge: transaction.status,
      },
      sortDate: transaction.transactionDate.getTime(),
    })),
    ...ledgerTransactions.map((transaction) => ({
      source: {
        id: `search-ledger-${transaction.id}`,
        kind: "ledger_transaction" as const,
        title: transaction.description,
        detail: `${shortDate(transaction.transactionDate)} · ${formatMoney(transaction.amountMinor, transaction.currency)}${transaction.reference ? ` · ref ${transaction.reference}` : ""}`,
        href: "/dashboard/tax-summary",
        badge: transaction.reviewStatus,
      },
      sortDate: transaction.transactionDate.getTime(),
    })),
    ...clients.map((client) => ({
      source: {
        id: `search-client-${client.id}`,
        kind: "client" as const,
        title: client.companyName ?? client.name,
        detail: client.email,
        href: `/dashboard/clients/${client.id}`,
        badge: "Client",
      },
      sortDate: 0,
    })),
    ...clientBusinesses.map((business) => ({
      source: {
        id: `search-business-${business.id}`,
        kind: "client_business" as const,
        title: business.name,
        detail: business.legalName ?? "Client business",
        href: "/dashboard/client-businesses",
        badge: "Business",
      },
      sortDate: 0,
    })),
    ...filingDrafts.map((draft) => ({
      source: {
        id: `search-filing-${draft.id}`,
        kind: "filing_draft" as const,
        title: draft.title ?? `${draft.taxType} filing draft`,
        detail: `${draft.taxPeriod.label}${draft.reference ? ` · ref ${draft.reference}` : ""}${draft.submissionReference ? ` · submission ${draft.submissionReference}` : ""}`,
        href: `/dashboard/tax-filing/${draft.id}`,
        badge: draft.status,
      },
      sortDate: 0,
    })),
    ...uploads.map((upload) => ({
      source: {
        id: `search-upload-${upload.id}`,
        kind: "bookkeeping_upload" as const,
        title: upload.fileName,
        detail: `${upload.clientBusiness.name} · uploaded ${shortDate(upload.createdAt)}`,
        href: "/dashboard/bookkeeping/review",
        badge: upload.status,
      },
      sortDate: upload.createdAt.getTime(),
    })),
  ]
    .map((entry) => ({
      ...entry,
      score: scoreSourceMatch(entry.source, query),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.sortDate - left.sortDate ||
        left.source.title.localeCompare(right.source.title)
    );

  const sources = rankedSources.slice(0, 8).map((entry) => entry.source);

  return {
    query,
    sources,
    bestSource: sources[0] ?? null,
    modelContext: {
      query,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        dueDate: invoice.dueDate.toISOString(),
        totalAmountMinor: invoice.totalAmount,
        clientName: invoice.client.companyName ?? invoice.client.name,
      })),
      bankTransactions: bankTransactions.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        reference: transaction.reference,
        amountMinor: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        transactionDate: transaction.transactionDate.toISOString(),
      })),
      ledgerTransactions: ledgerTransactions.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        reference: transaction.reference,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        reviewStatus: transaction.reviewStatus,
        transactionDate: transaction.transactionDate.toISOString(),
      })),
      clients: clients.map((client) => ({
        id: client.id,
        displayName: client.companyName ?? client.name,
        email: client.email,
      })),
      clientBusinesses: clientBusinesses.map((business) => ({
        id: business.id,
        name: business.name,
        legalName: business.legalName,
      })),
      filingDrafts: filingDrafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        taxType: draft.taxType,
        status: draft.status,
        periodLabel: draft.taxPeriod.label,
        reference: draft.reference,
        submissionReference: draft.submissionReference,
      })),
      uploads: uploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        status: upload.status,
        createdAt: upload.createdAt.toISOString(),
        clientBusinessName: upload.clientBusiness.name,
      })),
    },
  };
}

async function runTaxSummaryTool(
  context: AssistantContext,
  args: {
    period?: AssistantPeriodPreset;
    comparePrevious?: boolean;
  } = {}
): Promise<ToolResult> {
  const period = buildPeriodRange(args.period ?? "THIS_MONTH");
  const summary = await getWorkspaceTaxSummary(context.workspaceId, {
    from: period.from,
    to: period.to,
  });
  const comparisonPeriod = args.comparePrevious ? getComparisonRange(period) : null;
  const comparisonSummary = comparisonPeriod
    ? await getWorkspaceTaxSummary(context.workspaceId, {
        from: comparisonPeriod.from,
        to: comparisonPeriod.to,
      })
    : null;

  const deltaNetVatMinor = comparisonSummary
    ? summary.totals.netVatMinor - comparisonSummary.totals.netVatMinor
    : null;
  const comparisonBusinesses = new Map(
    (comparisonSummary?.businesses ?? []).map((business) => [business.clientBusinessId, business])
  );
  const businessDrivers = summary.businesses
    .map((business) => {
      const previous = comparisonBusinesses.get(business.clientBusinessId);
      const deltaBusinessNetVatMinor = business.netVatMinor - (previous?.netVatMinor ?? 0);

      return {
        ...business,
        previousNetVatMinor: previous?.netVatMinor ?? 0,
        deltaNetVatMinor: deltaBusinessNetVatMinor,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.deltaNetVatMinor) - Math.abs(left.deltaNetVatMinor) ||
        Math.abs(right.netVatMinor) - Math.abs(left.netVatMinor)
    );
  const topBusinesses = (comparisonSummary ? businessDrivers : summary.businesses).slice(0, 4);
  const topChangeDriver = businessDrivers[0] ?? null;
  const warnings: string[] = [];

  if (summary.totals.draftCount > 0) {
    warnings.push(
      `${formatCount(summary.totals.draftCount, "ledger entry")} in ${period.label} is still pending review, so the tax position may move before filing.`
    );
  }
  if (summary.totals.transactionCount === 0) {
    warnings.push(`No ledger transactions were posted for ${period.label}.`);
  }

  const metrics: FinanceAssistantMetric[] = [
    {
      label: `Net VAT (${period.label})`,
      value: formatMoney(summary.totals.netVatMinor, summary.currencyMode),
      detail: "Output VAT less input VAT from workspace ledger activity in the selected period.",
    },
    {
      label: "Output VAT",
      value: formatMoney(summary.totals.outputVatMinor, summary.currencyMode),
      detail: "VAT expected on taxable sales and money-in transactions.",
    },
    {
      label: "Input VAT",
      value: formatMoney(summary.totals.inputVatMinor, summary.currencyMode),
      detail: "Recoverable VAT from expense-side activity.",
    },
    {
      label: "WHT payable",
      value: formatMoney(summary.totals.whtPayableMinor, summary.currencyMode),
      detail: "Withholding tax that looks payable from current ledger treatment.",
    },
  ];

  if (deltaNetVatMinor !== null && comparisonSummary) {
    metrics.push({
      label: "Change vs prior period",
      value: formatMoney(deltaNetVatMinor, summary.currencyMode),
      detail: `Compared with ${comparisonPeriod?.label ?? "the prior period"}.`,
    });
    if (topChangeDriver) {
      metrics.push({
        label: "Largest VAT movement",
        value: topChangeDriver.clientBusinessName,
        detail: `${topChangeDriver.deltaNetVatMinor >= 0 ? "Up" : "Down"} ${formatMoney(Math.abs(topChangeDriver.deltaNetVatMinor), summary.currencyMode)} versus ${comparisonPeriod?.label ?? "the prior period"}.`,
      });
    }
  }

  const summaryText =
    deltaNetVatMinor !== null && comparisonSummary
      ? `For ${period.label}, net VAT is ${formatMoney(summary.totals.netVatMinor, summary.currencyMode)}, which is ${deltaNetVatMinor >= 0 ? "up" : "down"} ${formatMoney(Math.abs(deltaNetVatMinor), summary.currencyMode)} versus ${comparisonPeriod?.label}.${topChangeDriver && topChangeDriver.deltaNetVatMinor !== 0 ? ` The biggest movement came from ${topChangeDriver.clientBusinessName}, ${topChangeDriver.deltaNetVatMinor >= 0 ? "up" : "down"} ${formatMoney(Math.abs(topChangeDriver.deltaNetVatMinor), summary.currencyMode)}.` : ""}`
      : `For ${period.label}, net VAT is ${formatMoney(summary.totals.netVatMinor, summary.currencyMode)} with ${formatCount(summary.totals.postedCount, "posted ledger entry")} and ${formatCount(summary.totals.draftCount, "pending ledger entry")}.`;

  return {
    name: "getTaxSummary",
    title: "Tax summary",
    summary: summaryText,
    metrics,
    sources: topBusinesses.map((business) => {
      const businessChange = business as typeof business & {
        deltaNetVatMinor?: number;
      };

      return {
        id: `tax-business-${business.clientBusinessId}`,
        kind: "client_business" as const,
        title: business.clientBusinessName,
        detail:
          typeof businessChange.deltaNetVatMinor === "number"
            ? `Net VAT ${formatMoney(business.netVatMinor, business.currency)} from ${business.postedCount} posted and ${business.draftCount} pending ledger entries. ${businessChange.deltaNetVatMinor === 0 ? "Flat versus the prior period." : `${businessChange.deltaNetVatMinor >= 0 ? "Up" : "Down"} ${formatMoney(Math.abs(businessChange.deltaNetVatMinor), business.currency)} versus ${comparisonPeriod?.label ?? "the prior period"}.`}`
            : `Net VAT ${formatMoney(business.netVatMinor, business.currency)} from ${business.postedCount} posted and ${business.draftCount} pending ledger entries.`,
        href: "/dashboard/tax-summary",
        badge: business.currency,
      };
    }),
    actions: [
      {
        id: "open-tax-summary",
        label: "Open tax summary",
        href: "/dashboard/tax-summary",
        description: "Review the VAT and WHT portfolio by business.",
        intent: "navigate",
      },
      {
        id: `open-tax-filing-${period.fromParam}`,
        label: "Review filing readiness",
        href:
          period.preset === "THIS_QUARTER" || period.preset === "LAST_QUARTER"
            ? `/dashboard/tax-filing?period=quarter&quarter=${String(getQuarterNumber(period.from))}&year=${String(period.from.getUTCFullYear())}`
            : `/dashboard/tax-filing?period=month&month=${formatMonthValue(period.from)}`,
        description: "Open the compliance page for the same period.",
        intent: "review",
      },
    ],
    warnings,
    modelContext: {
      period: {
        label: period.label,
        from: period.fromParam,
        to: period.toParam,
      },
      totals: summary.totals,
      currencyMode: summary.currencyMode,
      comparison: comparisonSummary
        ? {
            label: comparisonPeriod?.label ?? null,
            totals: comparisonSummary.totals,
          }
        : null,
      changeDrivers: businessDrivers.slice(0, 4).map((business) => ({
        clientBusinessId: business.clientBusinessId,
        clientBusinessName: business.clientBusinessName,
        netVatMinor: business.netVatMinor,
        previousNetVatMinor: business.previousNetVatMinor,
        deltaNetVatMinor: business.deltaNetVatMinor,
        currency: business.currency,
      })),
      businesses: topBusinesses,
    },
  };
}

async function runOverdueInvoicesTool(context: AssistantContext): Promise<ToolResult> {
  const today = new Date();
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      workspaceId: context.workspaceId,
      status: {
        not: "PAID",
      },
      OR: [
        {
          status: "OVERDUE",
        },
        {
          dueDate: {
            lt: today,
          },
        },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { totalAmount: "desc" }],
    take: 8,
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      dueDate: true,
      totalAmount: true,
      client: {
        select: {
          id: true,
          name: true,
          companyName: true,
        },
      },
    },
  });

  const totals = overdueInvoices.reduce(
    (acc, invoice) => {
      acc.totalAmount += invoice.totalAmount;
      acc.oldestDays = Math.max(acc.oldestDays, daysBetween(today, invoice.dueDate));
      return acc;
    },
    {
      totalAmount: 0,
      oldestDays: 0,
    }
  );

  const warnings =
    overdueInvoices.length === 0
      ? ["No overdue invoices are currently recorded in this workspace."]
      : [];

  return {
    name: "getOverdueInvoices",
    title: "Overdue invoices",
    summary:
      overdueInvoices.length > 0
        ? `${formatCount(overdueInvoices.length, "invoice")} is overdue for a total of ${formatMoney(totals.totalAmount, context.defaultCurrency)}. The oldest invoice is ${totals.oldestDays} days late.`
        : "No overdue invoices are currently recorded.",
    metrics: [
      {
        label: "Overdue invoices",
        value: String(overdueInvoices.length),
        detail: "Invoices whose due date has passed and are not marked paid.",
      },
      {
        label: "Overdue value",
        value: formatMoney(totals.totalAmount, context.defaultCurrency),
        detail: "Total billed value still sitting overdue in the workspace.",
      },
      {
        label: "Oldest overdue",
        value: `${totals.oldestDays} days`,
        detail: "Age of the oldest overdue invoice.",
      },
    ],
    sources: overdueInvoices.map((invoice) => ({
      id: `overdue-invoice-${invoice.id}`,
      kind: "invoice",
      title: `Invoice ${invoice.invoiceNumber}`,
      detail: `${invoice.client.companyName ?? invoice.client.name} · due ${shortDate(invoice.dueDate)} · ${formatMoney(invoice.totalAmount, context.defaultCurrency)}`,
      href: `/dashboard/invoices/${invoice.id}`,
      badge: invoice.status,
    })),
    actions: [
      {
        id: "open-overdue-invoices",
        label: "Open invoices",
        href: "/dashboard/invoices",
        description: "Review overdue invoices and chase collections.",
        intent: "review",
      },
      {
        id: "open-clients",
        label: "Open clients",
        href: "/dashboard/clients",
        description: "Review which customers are driving receivables.",
        intent: "navigate",
      },
    ],
    warnings,
    modelContext: {
      count: overdueInvoices.length,
      totalAmountMinor: totals.totalAmount,
      currency: context.defaultCurrency,
      oldestDays: totals.oldestDays,
      invoices: overdueInvoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.companyName ?? invoice.client.name,
        status: invoice.status,
        dueDate: invoice.dueDate.toISOString(),
        totalAmountMinor: invoice.totalAmount,
      })),
    },
  };
}

async function runUnmatchedBankTransactionsTool(context: AssistantContext): Promise<ToolResult> {
  const statuses = ["UNMATCHED", "SUGGESTED", "REVIEW_REQUIRED"] as const;
  const [count, transactions] = await Promise.all([
    prisma.bankTransaction.count({
      where: {
        workspaceId: context.workspaceId,
        status: {
          in: [...statuses],
        },
      },
    }),
    prisma.bankTransaction.findMany({
      where: {
        workspaceId: context.workspaceId,
        status: {
          in: [...statuses],
        },
      },
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        description: true,
        reference: true,
        amount: true,
        type: true,
        status: true,
        transactionDate: true,
        bankAccount: {
          select: {
            bankName: true,
            name: true,
          },
        },
        clientBusiness: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const totals = transactions.reduce(
    (acc, transaction) => {
      if (transaction.type === "DEBIT") {
        acc.debits += transaction.amount;
      } else {
        acc.credits += transaction.amount;
      }
      return acc;
    },
    { debits: 0, credits: 0 }
  );

  const warnings =
    count === 0
      ? ["No unmatched bank transactions are currently waiting in reconciliation."]
      : [];

  return {
    name: "getUnmatchedBankTransactions",
    title: "Unmatched bank transactions",
    summary:
      count > 0
        ? `${formatCount(count, "bank transaction")} is still waiting in reconciliation. The current sample includes ${formatMoney(totals.debits, context.defaultCurrency)} of debits and ${formatMoney(totals.credits, context.defaultCurrency)} of credits.`
        : "No unmatched bank transactions are waiting in reconciliation.",
    metrics: [
      {
        label: "Unmatched items",
        value: String(count),
        detail: "Bank transactions still in unmatched, suggested, or review-required states.",
      },
      {
        label: "Debit value in sample",
        value: formatMoney(totals.debits, context.defaultCurrency),
        detail: "Debit-side value in the surfaced review queue sample.",
      },
      {
        label: "Credit value in sample",
        value: formatMoney(totals.credits, context.defaultCurrency),
        detail: "Credit-side value in the surfaced review queue sample.",
      },
    ],
    sources: transactions.map((transaction) => ({
      id: `bank-transaction-${transaction.id}`,
      kind: "bank_transaction",
      title: transaction.description,
      detail: `${transaction.bankAccount.bankName} ${transaction.bankAccount.name} · ${shortDate(transaction.transactionDate)} · ${formatMoney(transaction.amount, context.defaultCurrency)}`,
      href: "/dashboard/banking/reconcile",
      badge: transaction.status,
    })),
    actions: [
      {
        id: "open-reconcile",
        label: "Open reconciliation queue",
        href: "/dashboard/banking/reconcile",
        description: "Review unmatched bank activity in the Professional banking workflow.",
        intent: "review",
      },
      {
        id: "open-banking",
        label: "Open banking",
        href: "/dashboard/banking",
        description: "Inspect imported accounts and statement runs.",
        intent: "navigate",
      },
    ],
    warnings,
    modelContext: {
      count,
      sampleTotalsMinor: totals,
      currency: context.defaultCurrency,
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        reference: transaction.reference,
        amountMinor: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        transactionDate: transaction.transactionDate.toISOString(),
        bankAccountName: transaction.bankAccount.name,
        bankName: transaction.bankAccount.bankName,
        clientBusinessName: transaction.clientBusiness?.name ?? null,
      })),
    },
  };
}

async function runCashMovementSummaryTool(
  context: AssistantContext,
  args: {
    period?: AssistantPeriodPreset;
  } = {}
): Promise<ToolResult> {
  const period = buildPeriodRange(args.period ?? "THIS_MONTH");
  const [bankTransactions, ledgerTransactions, overdueInvoices] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        workspaceId: context.workspaceId,
        transactionDate: {
          gte: period.from,
          lte: period.to,
        },
      },
      orderBy: [{ transactionDate: "desc" }],
      take: 50,
      select: {
        id: true,
        description: true,
        reference: true,
        amount: true,
        currency: true,
        type: true,
        status: true,
        transactionDate: true,
        bankAccount: {
          select: {
            bankName: true,
            name: true,
          },
        },
      },
    }),
    prisma.ledgerTransaction.findMany({
      where: {
        clientBusiness: {
          workspaceId: context.workspaceId,
        },
        reviewStatus: "POSTED",
        transactionDate: {
          gte: period.from,
          lte: period.to,
        },
      },
      orderBy: [{ transactionDate: "desc" }],
      take: 80,
      select: {
        id: true,
        description: true,
        amountMinor: true,
        currency: true,
        direction: true,
        transactionDate: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        workspaceId: context.workspaceId,
        status: {
          not: "PAID",
        },
        dueDate: {
          lt: new Date(),
        },
      },
      orderBy: [{ dueDate: "asc" }, { totalAmount: "desc" }],
      take: 4,
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        dueDate: true,
        status: true,
        client: {
          select: {
            name: true,
            companyName: true,
          },
        },
      },
    }),
  ]);

  const bankTotals = bankTransactions.reduce(
    (acc, transaction) => {
      if (transaction.type === "CREDIT") {
        acc.credits += transaction.amount;
      } else {
        acc.debits += transaction.amount;
      }

      if (["UNMATCHED", "SUGGESTED", "REVIEW_REQUIRED"].includes(transaction.status)) {
        acc.unmatchedCount += 1;
        acc.unmatchedAmountMinor += transaction.amount;
      }

      return acc;
    },
    {
      credits: 0,
      debits: 0,
      unmatchedCount: 0,
      unmatchedAmountMinor: 0,
    }
  );

  const ledgerTotals = ledgerTransactions.reduce(
    (acc, transaction) => {
      if (transaction.direction === "MONEY_IN") {
        acc.moneyIn += transaction.amountMinor;
      } else {
        acc.moneyOut += transaction.amountMinor;
      }
      return acc;
    },
    {
      moneyIn: 0,
      moneyOut: 0,
    }
  );

  const overdueTotalMinor = overdueInvoices.reduce(
    (sum, invoice) => sum + invoice.totalAmount,
    0
  );
  const currencyMode = resolveCurrencyMode(
    [
      ...bankTransactions.map((transaction) => transaction.currency),
      ...ledgerTransactions.map((transaction) => transaction.currency),
    ],
    context.defaultCurrency
  );
  const netBankMovementMinor = bankTotals.credits - bankTotals.debits;
  const netLedgerMovementMinor = ledgerTotals.moneyIn - ledgerTotals.moneyOut;
  const topBankTransactions = [...bankTransactions]
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 4);
  const warnings: string[] = [];

  if (bankTransactions.length === 0) {
    warnings.push(`No bank transactions were imported for ${period.label}.`);
  }
  if (ledgerTransactions.length === 0) {
    warnings.push(`No posted cash-affecting ledger entries were found for ${period.label}.`);
  }

  return {
    name: "getCashMovementSummary",
    title: "Cash movement summary",
    summary:
      bankTransactions.length > 0 || ledgerTransactions.length > 0
        ? `For ${period.label}, bank inflows total ${formatMoney(bankTotals.credits, currencyMode)} and outflows total ${formatMoney(bankTotals.debits, currencyMode)}, for net bank movement of ${formatMoney(netBankMovementMinor, currencyMode)}. Posted ledger cash movement is ${formatMoney(netLedgerMovementMinor, currencyMode)}. ${bankTotals.unmatchedCount > 0 ? `${formatCount(bankTotals.unmatchedCount, "bank item")} still needs reconciliation.` : "No imported bank items are waiting in the review queue."}`
        : `There is not enough imported bank or posted ledger activity to summarize cash movement for ${period.label}.`,
    metrics: [
      {
        label: "Net bank movement",
        value: formatMoney(netBankMovementMinor, currencyMode),
        detail: `Imported bank credits less debits for ${period.label}.`,
      },
      {
        label: "Posted cash movement",
        value: formatMoney(netLedgerMovementMinor, currencyMode),
        detail: "Posted ledger money-in less money-out for the same period.",
      },
      {
        label: "Unmatched bank items",
        value: String(bankTotals.unmatchedCount),
        detail: "Imported bank rows still blocking a clean cash position.",
      },
      {
        label: "Overdue receivables",
        value: formatMoney(overdueTotalMinor, context.defaultCurrency),
        detail: "Current overdue invoice value that may pressure collections.",
      },
    ],
    sources: [
      ...topBankTransactions.map((transaction) => ({
        id: `cash-bank-${transaction.id}`,
        kind: "bank_transaction" as const,
        title: transaction.description,
        detail: `${transaction.bankAccount.bankName} ${transaction.bankAccount.name} · ${shortDate(transaction.transactionDate)} · ${formatMoney(transaction.amount, transaction.currency)}`,
        href: "/dashboard/banking/reconcile",
        badge: transaction.status,
      })),
      ...overdueInvoices.slice(0, 3).map((invoice) => ({
        id: `cash-overdue-${invoice.id}`,
        kind: "invoice" as const,
        title: `Invoice ${invoice.invoiceNumber}`,
        detail: `${invoice.client.companyName ?? invoice.client.name} · due ${shortDate(invoice.dueDate)} · ${formatMoney(invoice.totalAmount, context.defaultCurrency)}`,
        href: `/dashboard/invoices/${invoice.id}`,
        badge: invoice.status,
      })),
    ].slice(0, 8),
    actions: [
      {
        id: "open-cash-reconcile",
        label: "Open reconciliation queue",
        href: "/dashboard/banking/reconcile",
        description: "Clear unmatched imported bank activity before relying on cash movement.",
        intent: "review",
      },
      {
        id: "open-cash-invoices",
        label: "Open overdue invoices",
        href: "/dashboard/invoices",
        description: "Chase receivables that are increasing cash pressure.",
        intent: "review",
      },
    ],
    warnings,
    modelContext: {
      period: {
        label: period.label,
        from: period.fromParam,
        to: period.toParam,
      },
      currencyMode,
      bankTotals: {
        ...bankTotals,
        netBankMovementMinor,
      },
      ledgerTotals: {
        ...ledgerTotals,
        netLedgerMovementMinor,
      },
      overdue: {
        count: overdueInvoices.length,
        totalAmountMinor: overdueTotalMinor,
      },
      topBankTransactions: topBankTransactions.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        reference: transaction.reference,
        amountMinor: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        status: transaction.status,
        transactionDate: transaction.transactionDate.toISOString(),
      })),
    },
  };
}

function percentile(values: number[], target: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(target * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

async function runExpenseAnomaliesTool(
  context: AssistantContext,
  args: {
    days?: number;
  } = {}
): Promise<ToolResult> {
  const days = Math.max(45, Math.min(Number(args.days) || 120, 365));
  const from = shiftDays(new Date(), -days);
  const transactions = await prisma.ledgerTransaction.findMany({
    where: {
      clientBusiness: {
        workspaceId: context.workspaceId,
      },
      direction: "MONEY_OUT",
      reviewStatus: "POSTED",
      transactionDate: {
        gte: from,
      },
    },
    orderBy: [{ transactionDate: "desc" }],
    take: 200,
    select: {
      id: true,
      transactionDate: true,
      description: true,
      reference: true,
      amountMinor: true,
      currency: true,
      vendor: {
        select: {
          name: true,
        },
      },
      category: {
        select: {
          name: true,
        },
      },
      clientBusiness: {
        select: {
          name: true,
        },
      },
    },
  });

  const amounts = transactions.map((transaction) => transaction.amountMinor);
  const p90 = percentile(amounts, 0.9);
  const historyByKey = new Map<string, number[]>();

  for (const transaction of transactions) {
    const key =
      normalizeText(transaction.vendor?.name).toLowerCase() ||
      normalizeText(transaction.category?.name).toLowerCase() ||
      "uncategorized";
    const bucket = historyByKey.get(key) ?? [];
    bucket.push(transaction.amountMinor);
    historyByKey.set(key, bucket);
  }

  const anomalies = transactions
    .map((transaction) => {
      const key =
        normalizeText(transaction.vendor?.name).toLowerCase() ||
        normalizeText(transaction.category?.name).toLowerCase() ||
        "uncategorized";
      const history = historyByKey.get(key) ?? [];
      const average =
        history.length > 0 ? history.reduce((sum, value) => sum + value, 0) / history.length : 0;
      const ratio = average > 0 ? transaction.amountMinor / average : 0;
      const possibleDuplicate = transactions.some((other) => {
        if (other.id === transaction.id) return false;
        const sameVendor =
          normalizeText(other.vendor?.name).toLowerCase() ===
          normalizeText(transaction.vendor?.name).toLowerCase();
        const sameDescription =
          normalizeText(other.description).toLowerCase() ===
          normalizeText(transaction.description).toLowerCase();
        const closeInDate =
          Math.abs(daysBetween(other.transactionDate, transaction.transactionDate)) <= 7;
        return other.amountMinor === transaction.amountMinor && closeInDate && (sameVendor || sameDescription);
      });

      let reason = "";
      let score = 0;

      if (history.length >= 3 && ratio >= 1.9 && transaction.amountMinor >= p90) {
        reason = `About ${(ratio * 100).toFixed(0)}% of the typical amount for this vendor/category.`;
        score = ratio;
      } else if (history.length <= 1 && transaction.amountMinor >= p90) {
        reason = "Large expense with very little vendor/category history in the current period.";
        score = 1.6;
      } else if (possibleDuplicate) {
        reason = "Looks close to another posted expense by amount and timing.";
        score = 1.5;
      }

      return {
        transaction,
        score,
        reason,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.transaction.amountMinor - left.transaction.amountMinor)
    .slice(0, 6);

  const warnings: string[] = [];
  if (transactions.length < 6) {
    warnings.push("Expense anomaly scoring is limited because there are only a few posted expense transactions in the lookback window.");
  }
  if (anomalies.length === 0) {
    warnings.push("No strong expense outliers were detected in the recent posted ledger activity.");
  }

  return {
    name: "getExpenseAnomalies",
    title: "Expense anomalies",
    summary:
      anomalies.length > 0
        ? `${formatCount(anomalies.length, "expense")} stands out in the last ${days} days. The largest flagged item is ${formatMoney(anomalies[0]?.transaction.amountMinor ?? 0, anomalies[0]?.transaction.currency ?? context.defaultCurrency)} for ${anomalies[0]?.transaction.vendor?.name ?? anomalies[0]?.transaction.description ?? "an expense"}.`
        : `No strong expense anomalies were detected in the last ${days} days.`,
    metrics: [
      {
        label: "Flagged anomalies",
        value: String(anomalies.length),
        detail: `Posted expense outliers identified over the last ${days} days.`,
      },
      {
        label: "Lookback window",
        value: `${days} days`,
        detail: "Historical window used for anomaly and outlier scoring.",
      },
    ],
    sources: anomalies.map((candidate) => ({
      id: `expense-anomaly-${candidate.transaction.id}`,
      kind: "ledger_transaction",
      title: candidate.transaction.vendor?.name ?? candidate.transaction.description,
      detail: `${shortDate(candidate.transaction.transactionDate)} · ${formatMoney(candidate.transaction.amountMinor, candidate.transaction.currency)} · ${candidate.reason}`,
      href: "/dashboard/tax-summary",
      badge: candidate.transaction.clientBusiness.name,
    })),
    actions: [
      {
        id: "open-bookkeeping-review",
        label: "Open bookkeeping review",
        href: "/dashboard/bookkeeping/review",
        description: "Review AI-captured documents and questionable spend before posting more activity.",
        intent: "review",
      },
      {
        id: "open-tax-summary-expenses",
        label: "Open tax summary",
        href: "/dashboard/tax-summary",
        description: "Review posted ledger activity by business and tax treatment.",
        intent: "navigate",
      },
    ],
    warnings,
    modelContext: {
      days,
      transactionsEvaluated: transactions.length,
      anomalies: anomalies.map((candidate) => ({
        id: candidate.transaction.id,
        description: candidate.transaction.description,
        reference: candidate.transaction.reference,
        vendorName: candidate.transaction.vendor?.name ?? null,
        categoryName: candidate.transaction.category?.name ?? null,
        clientBusinessName: candidate.transaction.clientBusiness.name,
        amountMinor: candidate.transaction.amountMinor,
        currency: candidate.transaction.currency,
        transactionDate: candidate.transaction.transactionDate.toISOString(),
        reason: candidate.reason,
        score: candidate.score,
      })),
    },
  };
}

async function runRevenueTrendTool(
  context: AssistantContext,
  args: {
    months?: number;
  } = {}
): Promise<ToolResult> {
  const months = Math.max(3, Math.min(Number(args.months) || 6, 12));
  const rangeStart = shiftMonths(startOfMonth(new Date()), -(months - 1));
  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: context.workspaceId,
      issueDate: {
        gte: rangeStart,
      },
    },
    orderBy: [{ issueDate: "desc" }],
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      totalAmount: true,
      issueDate: true,
      client: {
        select: {
          id: true,
          name: true,
          companyName: true,
        },
      },
    },
  });

  const topClients = listWorkspaceClients(context.workspaceId)
    .then((clients) =>
      clients
        .sort((left, right) => right.totalBilled - left.totalBilled)
        .slice(0, 5)
    );

  const monthlyTotals = new Map<string, number>();
  for (const invoice of invoices) {
    const key = invoice.issueDate.toISOString().slice(0, 7);
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + invoice.totalAmount);
  }

  const resolvedTopClients = await topClients;
  const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const paidAmount = invoices
    .filter((invoice) => invoice.status === "PAID")
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

  return {
    name: "getRevenueTrend",
    title: "Revenue trends",
    summary:
      resolvedTopClients.length > 0
        ? `Over the last ${months} months, ${resolvedTopClients[0]?.displayName ?? "your top client"} has billed the most at ${formatMoney(resolvedTopClients[0]?.totalBilled ?? 0, context.defaultCurrency)}. Total billed value in the same window is ${formatMoney(totalBilled, context.defaultCurrency)}.`
        : `No invoice revenue was found in the last ${months} months.`,
    metrics: [
      {
        label: `Billed revenue (${months}m)`,
        value: formatMoney(totalBilled, context.defaultCurrency),
        detail: "Total invoice value issued in the selected trend window.",
      },
      {
        label: "Collected revenue",
        value: formatMoney(paidAmount, context.defaultCurrency),
        detail: "Value of invoices already marked paid in the same window.",
      },
      {
        label: "Top client",
        value: resolvedTopClients[0]?.displayName ?? "None yet",
        detail: "Highest-billed client across the current workspace.",
      },
    ],
    sources: resolvedTopClients.map((client) => ({
      id: `revenue-client-${client.id}`,
      kind: "client",
      title: client.displayName,
      detail: `Billed ${formatMoney(client.totalBilled, context.defaultCurrency)} · paid ${formatMoney(client.totalPaid, context.defaultCurrency)} · outstanding ${formatMoney(client.outstandingBalance, context.defaultCurrency)}`,
      href: `/dashboard/clients/${client.id}`,
      badge: `${client.invoiceCount} invoices`,
    })),
    actions: [
      {
        id: "open-clients-revenue",
        label: "Open client list",
        href: "/dashboard/clients",
        description: "Review top-billing and high-balance clients.",
        intent: "navigate",
      },
      {
        id: "open-invoices-revenue",
        label: "Open invoices",
        href: "/dashboard/invoices",
        description: "Inspect invoice aging and collections against revenue trends.",
        intent: "review",
      },
    ],
    warnings:
      invoices.length === 0 ? ["No recent invoice activity was found for the revenue trend window."] : [],
    modelContext: {
      months,
      totalBilledMinor: totalBilled,
      totalPaidMinor: paidAmount,
      monthlyTotals: Array.from(monthlyTotals.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([month, amountMinor]) => ({ month, amountMinor })),
      topClients: resolvedTopClients.map((client) => ({
        id: client.id,
        displayName: client.displayName,
        totalBilledMinor: client.totalBilled,
        totalPaidMinor: client.totalPaid,
        outstandingBalanceMinor: client.outstandingBalance,
        invoiceCount: client.invoiceCount,
      })),
    },
  };
}

async function runFilingStatusTool(
  context: AssistantContext,
  args: {
    period?: AssistantPeriodPreset;
  } = {}
): Promise<ToolResult> {
  const range = buildPeriodRange(args.period ?? "THIS_MONTH");
  const periodState =
    range.preset === "THIS_QUARTER" || range.preset === "LAST_QUARTER"
      ? resolveTaxPeriodState(
          {
            period: "quarter",
            quarter: String(getQuarterNumber(range.from)),
            year: String(range.from.getUTCFullYear()),
          },
          range.from
        )
      : resolveTaxPeriodState(
          {
            period: "month",
            month: formatMonthValue(range.from),
          },
          range.from
        );

  const recordsResult = await getWorkspaceTaxRecords(context.workspaceId, {
    fromParam: periodState.fromParam,
    toParam: periodState.toParam,
  });
  const summary = buildTaxComplianceSummary({
    records: recordsResult.records,
    period: periodState,
    defaultCurrency: context.defaultCurrency,
    fiscalYearStartMonth: context.fiscalYearStartMonth,
  });

  const warning =
    "Filing readiness is derived from live tax records and the current filing-pack rules. Open the filing workspace to review the draft before export or manual submission.";
  const filingHref =
    range.preset === "THIS_QUARTER" || range.preset === "LAST_QUARTER"
      ? `/dashboard/tax-filing?period=quarter&quarter=${String(getQuarterNumber(range.from))}&year=${String(range.from.getUTCFullYear())}`
      : `/dashboard/tax-filing?period=month&month=${formatMonthValue(range.from)}`;

  return {
    name: "getFilingStatus",
    title: "Filing readiness",
    summary:
      summary.counts.totalRecords > 0
        ? `For ${periodState.label}, filing readiness is ${getReadinessLabel(summary.companyTax.readinessStatus).toLowerCase()}. Net VAT is ${formatMoney(summary.vat.netVat, summary.currency)} and the engine flagged ${summary.companyTax.readinessNotes.length} readiness note${summary.companyTax.readinessNotes.length === 1 ? "" : "s"}.`
        : `No tax records were found for ${periodState.label}, so filing readiness is incomplete.`,
    metrics: [
      {
        label: "Readiness",
        value: getReadinessLabel(summary.companyTax.readinessStatus),
        detail: "Derived from current tax records, categorizations, and readiness notes.",
      },
      {
        label: "Net VAT",
        value: formatMoney(summary.vat.netVat, summary.currency),
        detail: "Estimated net VAT position for the selected filing window.",
      },
      {
        label: "Tax-bearing records",
        value: String(summary.counts.taxBearingRecords),
        detail: "Records currently contributing to VAT or WHT position.",
      },
    ],
    sources: [
      {
        id: `filing-${periodState.label}`,
        kind: "filing_status",
        title: `${periodState.label} filing readiness`,
        detail: summary.companyTax.readinessNotes[0] ?? "No extra readiness notes were generated.",
        href: filingHref,
        badge: getReadinessLabel(summary.companyTax.readinessStatus),
      },
      ...summary.companyTax.readinessNotes.slice(1, 4).map((note, index) => ({
        id: `filing-note-${index}`,
        kind: "summary" as const,
        title: "Readiness note",
        detail: note,
        href: filingHref,
        badge: null,
      })),
    ],
    actions: [
      {
        id: "open-tax-filing",
        label: "Prepare filing draft",
        href: filingHref,
        description: "Open the tax filing review page for the same period before exporting or filing.",
        intent: "confirm",
      },
      {
        id: "open-tax-records",
        label: "Open tax records",
        href: "/dashboard/tax-records",
        description: "Fix missing categories or tax treatments before relying on the filing pack.",
        intent: "review",
      },
    ],
    warnings: [warning],
    modelContext: {
      period: {
        label: periodState.label,
        from: periodState.fromParam,
        to: periodState.toParam,
      },
      counts: summary.counts,
      vat: summary.vat,
      wht: summary.wht,
      companyTax: summary.companyTax,
    },
  };
}

async function runDuplicateExpensesTool(context: AssistantContext): Promise<ToolResult> {
  const recentUploads = await prisma.bookkeepingUpload.findMany({
    where: {
      workspaceId: context.workspaceId,
      duplicateOfUploadId: {
        not: null,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 6,
    select: {
      id: true,
      fileName: true,
      createdAt: true,
      duplicateConfidence: true,
      duplicateReason: true,
      duplicateOfUpload: {
        select: {
          id: true,
          fileName: true,
          createdAt: true,
        },
      },
      clientBusiness: {
        select: {
          name: true,
        },
      },
    },
  });

  const transactions = await prisma.ledgerTransaction.findMany({
    where: {
      clientBusiness: {
        workspaceId: context.workspaceId,
      },
      direction: "MONEY_OUT",
      transactionDate: {
        gte: shiftDays(new Date(), -120),
      },
    },
    orderBy: [{ transactionDate: "desc" }],
    take: 120,
    select: {
      id: true,
      description: true,
      amountMinor: true,
      currency: true,
      transactionDate: true,
      vendor: {
        select: {
          name: true,
        },
      },
    },
  });

  const ledgerPairs: Array<{
    leftId: number;
    rightId: number;
    vendorName: string | null;
    amountMinor: number;
    currency: string;
    daysApart: number;
    description: string;
  }> = [];

  for (let index = 0; index < transactions.length; index += 1) {
    const left = transactions[index];
    for (let compareIndex = index + 1; compareIndex < transactions.length; compareIndex += 1) {
      const right = transactions[compareIndex];
      if (left.amountMinor !== right.amountMinor) continue;
      const vendorLeft = normalizeText(left.vendor?.name).toLowerCase();
      const vendorRight = normalizeText(right.vendor?.name).toLowerCase();
      const descriptionLeft = normalizeText(left.description).toLowerCase();
      const descriptionRight = normalizeText(right.description).toLowerCase();
      const sameCounterparty = Boolean(vendorLeft) && vendorLeft === vendorRight;
      const sameDescription = descriptionLeft === descriptionRight;
      if (!sameCounterparty && !sameDescription) continue;

      const daysApart = Math.abs(daysBetween(left.transactionDate, right.transactionDate));
      if (daysApart > 7) continue;

      ledgerPairs.push({
        leftId: left.id,
        rightId: right.id,
        vendorName: left.vendor?.name ?? right.vendor?.name ?? null,
        amountMinor: left.amountMinor,
        currency: left.currency,
        daysApart,
        description: left.description,
      });
    }
  }

  const sources: FinanceAssistantSource[] = [
    ...recentUploads.map((upload) => ({
      id: `duplicate-upload-${upload.id}`,
      kind: "bookkeeping_upload" as const,
      title: upload.fileName,
      detail: `${upload.clientBusiness.name} · possible duplicate of ${upload.duplicateOfUpload?.fileName ?? "an earlier upload"} · confidence ${(Math.round((upload.duplicateConfidence ?? 0) * 1000) / 10).toFixed(1)}%`,
      href: "/dashboard/bookkeeping/review",
      badge: "Scanner",
    })),
    ...ledgerPairs.slice(0, 6).map((pair) => ({
      id: `duplicate-ledger-${pair.leftId}-${pair.rightId}`,
      kind: "ledger_transaction" as const,
      title: pair.vendorName ?? pair.description,
      detail: `${formatMoney(pair.amountMinor, pair.currency)} appears twice within ${pair.daysApart} days.`,
      href: "/dashboard/tax-summary",
      badge: "Ledger",
    })),
  ];

  const duplicateCount = recentUploads.length + ledgerPairs.length;

  return {
    name: "getDuplicateExpenses",
    title: "Duplicate expenses",
    summary:
      duplicateCount > 0
        ? `${formatCount(duplicateCount, "likely duplicate")} was found across scanner uploads and posted expense activity.`
        : "No likely duplicate expenses were surfaced from recent uploads or ledger activity.",
    metrics: [
      {
        label: "Possible duplicates",
        value: String(duplicateCount),
        detail: "Combined duplicate signals from scanned documents and ledger activity.",
      },
      {
        label: "Scanner duplicates",
        value: String(recentUploads.length),
        detail: "Receipt or invoice uploads with duplicate warnings already attached.",
      },
      {
        label: "Ledger pairs",
        value: String(ledgerPairs.length),
        detail: "Posted expense pairs with matching amount and near-identical timing.",
      },
    ],
    sources: sources.slice(0, 8),
    actions: [
      {
        id: "open-review-duplicates",
        label: "Open review queue",
        href: "/dashboard/bookkeeping/review",
        description: "Inspect duplicate scanner warnings before approving new drafts.",
        intent: "review",
      },
      {
        id: "open-tax-summary-duplicates",
        label: "Open tax summary",
        href: "/dashboard/tax-summary",
        description: "Review posted expense activity for duplicate ledger lines.",
        intent: "navigate",
      },
    ],
    warnings:
      duplicateCount === 0 ? ["No strong duplicate signals are currently visible in recent workspace data."] : [],
    modelContext: {
      duplicateUploads: recentUploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        duplicateOfUploadId: upload.duplicateOfUpload?.id ?? null,
        createdAt: upload.createdAt.toISOString(),
        duplicateConfidence: upload.duplicateConfidence,
        duplicateReason: upload.duplicateReason,
        clientBusinessName: upload.clientBusiness.name,
      })),
      ledgerPairs,
    },
  };
}

async function runExplainTransactionTool(
  context: AssistantContext,
  args: {
    query?: string;
  } = {}
): Promise<ToolResult> {
  const rawQuery = normalizeText(args.query);
  const query = rawQuery
    .replace(/^explain\s+(this\s+)?transaction\s+/i, "")
    .replace(/^explain\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  if (!query) {
    return {
      name: "explainTransaction",
      title: "Explain transaction",
      summary: "No transaction reference or description was provided to explain.",
      metrics: [],
      sources: [],
      actions: [],
      warnings: ["Ask with a transaction reference, invoice number, description, or vendor name to explain a specific item."],
      modelContext: {
        query: null,
      },
    };
  }

  const search = await searchWorkspaceRecords(context, query);
  const sources = search.sources.filter((source) =>
    source.kind === "bank_transaction" ||
    source.kind === "ledger_transaction" ||
    source.kind === "invoice"
  );
  const exactMatch = sources[0] ?? null;

  return {
    name: "explainTransaction",
    title: "Transaction explanation",
    summary:
      sources.length > 0
        ? `I found ${formatCount(sources.length, "matching record")} for "${query}". ${exactMatch ? `${exactMatch.title} is the closest match.` : "Review the surfaced records below to confirm the exact transaction."}`
        : `I could not find a bank transaction, ledger entry, or invoice in this workspace matching "${query}".`,
    metrics: [
      {
        label: "Matches found",
        value: String(sources.length),
        detail: "Records found across bank transactions, ledger entries, and invoices.",
      },
    ],
    sources,
    actions: [
      {
        id: "open-assistant-reconcile",
        label: "Open reconciliation queue",
        href: "/dashboard/banking/reconcile",
        description: "Useful when the match looks like a bank-side transaction.",
        intent: "review",
      },
      {
        id: "open-assistant-invoices",
        label: "Open invoices",
        href: "/dashboard/invoices",
        description: "Useful when the match looks invoice-related.",
        intent: "navigate",
      },
    ],
    warnings:
      sources.length === 0
        ? ["Try a more specific reference, invoice number, vendor name, or transaction description."]
        : [],
    modelContext: search.modelContext,
  };
}

async function runOpenLinkedRecordTool(
  context: AssistantContext,
  args: {
    query?: string;
  } = {}
): Promise<ToolResult> {
  const query = sanitizeRecordQuery(normalizeText(args.query));
  if (!query) {
    return {
      name: "openLinkedRecord",
      title: "Open linked record",
      summary: "No record reference was provided to open.",
      metrics: [],
      sources: [],
      actions: [],
      warnings: ["Ask with an invoice number, client name, filing reference, transaction reference, or upload filename."],
      modelContext: {
        query: null,
      },
    };
  }

  const search = await searchWorkspaceRecords(context, query);
  const bestSource = search.bestSource;

  return {
    name: "openLinkedRecord",
    title: "Open linked record",
    summary:
      bestSource && bestSource.href
        ? `The closest linked record for "${query}" is ${bestSource.title}. Use the action below to open it in the dashboard.`
        : search.sources.length > 0
          ? `I found ${formatCount(search.sources.length, "matching record")} for "${query}", but none had a direct dashboard link.`
          : `I could not find a matching workspace record for "${query}".`,
    metrics: [
      {
        label: "Matches found",
        value: String(search.sources.length),
        detail: "Workspace records matching the navigation request.",
      },
    ],
    sources: search.sources,
    actions:
      bestSource?.href
        ? [
            {
              id: `open-linked-${bestSource.id}`,
              label: `Open ${bestSource.title}`,
              href: bestSource.href,
              description: "Navigate directly to the closest matching workspace record.",
              intent: "navigate",
            },
          ]
        : [],
    warnings:
      search.sources.length > 1
        ? ["Multiple matching records were found. Review the cited records before choosing one."]
        : search.sources.length === 0
          ? ["Try a more specific invoice number, client name, filing reference, or transaction reference."]
          : [],
    modelContext: search.modelContext,
  };
}

async function runSuggestNextActionsTool(context: AssistantContext): Promise<ToolResult> {
  const [bookkeepingMetrics, overdue, unmatchedCount, filingTool] = await Promise.all([
    getWorkspaceBookkeepingMetrics(context.workspaceId),
    prisma.invoice.count({
      where: {
        workspaceId: context.workspaceId,
        status: {
          not: "PAID",
        },
        dueDate: {
          lt: new Date(),
        },
      },
    }),
    prisma.bankTransaction.count({
      where: {
        workspaceId: context.workspaceId,
        status: {
          in: ["UNMATCHED", "SUGGESTED", "REVIEW_REQUIRED"],
        },
      },
    }),
    runFilingStatusTool(context),
  ]);

  const actions: FinanceAssistantAction[] = [];
  const summaries: string[] = [];

  if (bookkeepingMetrics.pendingDraftCount > 0 || bookkeepingMetrics.queuedUploadCount > 0) {
    actions.push({
      id: "next-action-bookkeeping",
      label: "Review bookkeeping queue",
      href: "/dashboard/bookkeeping/review",
      description: "Clear pending scanned drafts before month-end close.",
      intent: "review",
    });
    summaries.push(
      `${formatCount(bookkeepingMetrics.pendingDraftCount, "draft")} is waiting in bookkeeping review`
    );
  }

  if (unmatchedCount > 0) {
    actions.push({
      id: "next-action-reconcile",
      label: "Open reconciliation queue",
      href: "/dashboard/banking/reconcile",
      description: "Match imported bank transactions before relying on cash positions.",
      intent: "review",
    });
    summaries.push(`${formatCount(unmatchedCount, "bank item")} is still unmatched`);
  }

  if (overdue > 0) {
    actions.push({
      id: "next-action-invoices",
      label: "Open overdue invoices",
      href: "/dashboard/invoices",
      description: "Chase collections and reduce cash flow pressure.",
      intent: "review",
    });
    summaries.push(`${formatCount(overdue, "invoice")} is overdue`);
  }

  if (filingTool.modelContext.companyTax && filingTool.modelContext.companyTax !== null) {
    actions.push({
      id: "next-action-filing",
      label: "Prepare filing draft",
      href: "/dashboard/tax-filing",
      description: "Review compliance readiness before export or submission.",
      intent: "confirm",
    });
  }

  actions.push({
    id: "next-action-billing",
    label: "Open billing page",
    href: "/dashboard/billing",
    description: "Review the current workspace plan, billing status, and upgrade options.",
    intent: "navigate",
  });

  return {
    name: "suggestNextActions",
    title: "Suggested next actions",
    summary:
      summaries.length > 0
        ? `Current priorities: ${summaries.slice(0, 3).join("; ")}.`
        : "No urgent review queues are visible right now, so the workspace is in a relatively clean state.",
    metrics: [
      {
        label: "Pending bookkeeping drafts",
        value: String(bookkeepingMetrics.pendingDraftCount),
        detail: "Drafts still waiting for an accountant review decision.",
      },
      {
        label: "Queued uploads",
        value: String(bookkeepingMetrics.queuedUploadCount),
        detail: "Recently uploaded bookkeeping documents not fully cleared yet.",
      },
      {
        label: "Overdue invoices",
        value: String(overdue),
        detail: "Open customer invoices that are already late.",
      },
      {
        label: "Unmatched bank items",
        value: String(unmatchedCount),
        detail: "Bank transactions still waiting for reconciliation attention.",
      },
    ],
    sources: [
      {
        id: "next-actions-summary",
        kind: "summary",
        title: "Workspace review priorities",
        detail:
          summaries[0] ?? "No urgent queues were detected from bookkeeping, invoicing, banking, or filing readiness.",
        href: "/dashboard",
        badge: context.plan,
      },
    ],
    actions: dedupeById(actions, 5),
    warnings: [],
    modelContext: {
      bookkeepingMetrics,
      overdueCount: overdue,
      unmatchedCount,
      filingSummary: filingTool.modelContext,
    },
  };
}

async function executeToolPlan(
  context: AssistantContext,
  plan: ToolPlan
): Promise<ToolResult> {
  if (plan.name === "getTaxSummary") {
    return runTaxSummaryTool(context, {
      period: plan.args?.period as AssistantPeriodPreset | undefined,
      comparePrevious: Boolean(plan.args?.comparePrevious),
    });
  }
  if (plan.name === "getOverdueInvoices") {
    return runOverdueInvoicesTool(context);
  }
  if (plan.name === "getUnmatchedBankTransactions") {
    return runUnmatchedBankTransactionsTool(context);
  }
  if (plan.name === "getExpenseAnomalies") {
    return runExpenseAnomaliesTool(context, {
      days: typeof plan.args?.days === "number" ? plan.args.days : undefined,
    });
  }
  if (plan.name === "getRevenueTrend") {
    return runRevenueTrendTool(context, {
      months: typeof plan.args?.months === "number" ? plan.args.months : undefined,
    });
  }
  if (plan.name === "getCashMovementSummary") {
    return runCashMovementSummaryTool(context, {
      period: plan.args?.period as AssistantPeriodPreset | undefined,
    });
  }
  if (plan.name === "getFilingStatus") {
    return runFilingStatusTool(context, {
      period: plan.args?.period as AssistantPeriodPreset | undefined,
    });
  }
  if (plan.name === "getDuplicateExpenses") {
    return runDuplicateExpensesTool(context);
  }
  if (plan.name === "explainTransaction") {
    return runExplainTransactionTool(context, {
      query: plan.args?.query as string | undefined,
    });
  }
  if (plan.name === "openLinkedRecord") {
    return runOpenLinkedRecordTool(context, {
      query: plan.args?.query as string | undefined,
    });
  }
  return runSuggestNextActionsTool(context);
}

function selectToolPlan(question: string): ToolPlan[] {
  const normalized = question.toLowerCase();
  const tools: ToolPlan[] = [];
  const period = resolvePeriodPreset(question);

  if (
    includesAny(normalized, [
      "vat",
      "wht",
      "tax",
      "filing",
      "compliance",
      "owe",
      "quarter",
      "month-end",
      "increase",
      "decrease",
    ])
  ) {
    tools.push({
      name: "getTaxSummary",
      args: {
        period,
        comparePrevious: includesAny(normalized, [
          "changed",
          "compare",
          "difference",
          "shift",
          "increase",
          "decrease",
          "up",
          "down",
          "why",
        ]),
      },
    });
  }

  if (includesAny(normalized, ["filing", "ready", "compliance", "return"])) {
    tools.push({
      name: "getFilingStatus",
      args: {
        period:
          normalized.includes("quarter") || normalized.includes("filing")
            ? period === "THIS_MONTH"
              ? "THIS_QUARTER"
              : period
            : period,
      },
    });
  }

  if (includesAny(normalized, ["overdue", "invoice", "client owes", "receivable", "unpaid invoice"])) {
    tools.push({
      name: "getOverdueInvoices",
    });
  }

  if (includesAny(normalized, ["unmatched", "reconcile", "bank transaction", "banking"])) {
    tools.push({
      name: "getUnmatchedBankTransactions",
    });
  }

  if (
    includesAny(normalized, [
      "cash flow",
      "cash movement",
      "cash position",
      "bank movement",
      "cash pressure",
      "collections pressure",
    ])
  ) {
    tools.push({
      name: "getCashMovementSummary",
      args: {
        period,
      },
    });
  }

  if (includesAny(normalized, ["unusual", "anomaly", "odd", "outlier", "suspicious expense"])) {
    tools.push({
      name: "getExpenseAnomalies",
    });
  }

  if (includesAny(normalized, ["duplicate", "duplicate expense"])) {
    tools.push({
      name: "getDuplicateExpenses",
    });
  }

  if (
    includesAny(normalized, [
      "highest revenue",
      "top client",
      "revenue",
      "sales trend",
      "contributes the most revenue",
    ])
  ) {
    tools.push({
      name: "getRevenueTrend",
      args: {
        months: normalized.includes("year") ? 12 : normalized.includes("quarter") ? 3 : 6,
      },
    });
  }

  if (includesAny(normalized, ["explain transaction", "explain this", "reference", "what is this transaction"])) {
    tools.push({
      name: "explainTransaction",
      args: {
        query: question,
      },
    });
  }

  if (hasNavigationIntent(question)) {
    tools.push({
      name: "openLinkedRecord",
      args: {
        query: question,
      },
    });
  }

  if (
    tools.length === 0 ||
    includesAny(normalized, [
      "next action",
      "what should i do",
      "what should i review first",
      "review first",
      "what should i do today",
      "review today",
      "month-end close",
      "close summary",
      "watchlist",
    ])
  ) {
    tools.push({
      name: "suggestNextActions",
    });
  }

  if (tools.length === 0) {
    tools.push({ name: "getTaxSummary", args: { period } });
    tools.push({ name: "getOverdueInvoices" });
    tools.push({ name: "getUnmatchedBankTransactions" });
  }

  return dedupeById(
    tools.map((tool) => ({ ...tool, id: tool.name })) as Array<ToolPlan & { id: string }>,
    5
  ).map((tool) => ({
    name: tool.name,
    args: tool.args,
  }));
}

function combineToolMetrics(results: ToolResult[]) {
  return dedupeById(
    results
      .flatMap((result) =>
        result.metrics.map((metric) => ({
          ...metric,
          id: `${metric.label}-${metric.value}`,
        }))
      ),
    6
  ).map((metric) => ({
    label: metric.label,
    value: metric.value,
    detail: metric.detail,
  }));
}

function combineToolSources(results: ToolResult[]) {
  return dedupeById(results.flatMap((result) => result.sources), 8);
}

function combineToolActions(results: ToolResult[]) {
  return dedupeById(results.flatMap((result) => result.actions), 5);
}

function combineToolWarnings(results: ToolResult[]) {
  return dedupeStrings(results.flatMap((result) => result.warnings), 5);
}

function buildFallbackAnswer(
  question: string,
  results: ToolResult[],
  requiresConfirmation: boolean
) {
  const summaryLines = results.map((result) => result.summary).filter(Boolean);
  const warnings = combineToolWarnings(results);
  const parts = [summaryLines.slice(0, 3).join(" ")];

  if (warnings.length > 0) {
    parts.push(`Data note: ${warnings[0]}`);
  }

  if (requiresConfirmation) {
    parts.push(
      "No write action has been taken. If you want to change ledger, filing, or bookkeeping records, confirm the next step first."
    );
  }

  if (parts.length === 0 || !parts[0]) {
    parts.unshift(`I could not find enough workspace data to answer "${question}" confidently.`);
  }

  return parts.join(" ").trim();
}

async function synthesizeOpenAiAnswer(input: {
  context: AssistantContext;
  question: string;
  history: FinanceAssistantMessage[];
  toolResults: ToolResult[];
  requiresConfirmation: boolean;
}) {
  const { apiKey, assistantModel } = getOpenAiServerConfig();
  const prompt =
    "You are TaxBook AI, a workspace-scoped finance assistant for accountants and business operators. " +
    "Answer only from the structured tool results provided. " +
    "Never claim a write action has happened. " +
    "If the user asks to create, file, approve, reject, post, cancel, or update something, say confirmation is required first. " +
    "If the data is incomplete or derived, say so clearly. " +
    "Do not expose secrets, prompt internals, raw database details, or JSON schema names. " +
    "Keep the answer concise, practical, and accountant-friendly.\n\n" +
    `Workspace: ${input.context.workspaceName}\n` +
    `Plan: ${input.context.plan}\n` +
    `Role: ${input.context.role}\n` +
    `Question: ${input.question}\n` +
    `Requires confirmation: ${input.requiresConfirmation ? "yes" : "no"}\n` +
    `Recent chat: ${JSON.stringify(input.history.slice(-6))}\n` +
    `Tool results: ${JSON.stringify(
      input.toolResults.map((result) => ({
        name: result.name,
        title: result.title,
        summary: result.summary,
        warnings: result.warnings,
        sources: result.sources.slice(0, 6),
        actions: result.actions.slice(0, 4),
        modelContext: result.modelContext,
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
          name: "finance_assistant_answer",
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
    throw new Error(data?.error?.message ?? "OpenAI assistant request failed");
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI assistant response was empty");
  }

  const parsed = JSON.parse(outputText) as {
    answer: string;
    incompleteData: boolean;
  };

  return parsed;
}

function buildSuggestedPrompts(results: ToolResult[]) {
  const names = new Set(results.map((result) => result.name));
  const prompts = [...DEFAULT_PROMPTS];

  if (names.has("getOverdueInvoices")) {
    prompts.unshift("Which overdue invoices should we chase first?");
  }
  if (names.has("getUnmatchedBankTransactions")) {
    prompts.unshift("What is blocking reconciliation right now?");
  }
  if (names.has("getCashMovementSummary")) {
    prompts.unshift("What changed in cash movement this month?");
  }
  if (names.has("getFilingStatus")) {
    prompts.unshift("What should we fix before the next filing?");
  }
  if (names.has("suggestNextActions")) {
    prompts.unshift("What should I review first today?");
  }

  return dedupeStrings(prompts, 8);
}

function buildAuditMetadata(input: {
  question: string;
  context: AssistantContext;
  result: FinanceAssistantAnswer;
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
    incompleteData: input.result.incompleteData,
    requiresConfirmation: input.result.requiresConfirmation,
    warningCount: input.result.warnings.length,
    answerLength: input.result.answer.length,
  };
}

export async function answerFinanceAssistantQuestion(input: {
  workspaceId: number;
  role: WorkspaceRole;
  question: string;
  history?: FinanceAssistantMessage[];
}): Promise<FinanceAssistantAnswer> {
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
  const toolPlans = selectToolPlan(question);
  const toolResults = await Promise.all(toolPlans.map((plan) => executeToolPlan(context, plan)));
  const supportingMetrics = combineToolMetrics(toolResults);
  const sources = combineToolSources(toolResults);
  const followUpActions = combineToolActions(toolResults);
  const warnings = combineToolWarnings(toolResults);
  const aiEnabled = hasOpenAiServerConfig();

  let answer = buildFallbackAnswer(question, toolResults, requiresConfirmation);
  let mode: "openai" | "fallback" = "fallback";
  let incompleteData = warnings.length > 0;

  if (aiEnabled) {
    try {
      const aiAnswer = await synthesizeOpenAiAnswer({
        context,
        question,
        history,
        toolResults,
        requiresConfirmation,
      });
      answer = aiAnswer.answer.trim() || answer;
      incompleteData = aiAnswer.incompleteData || warnings.length > 0;
      mode = "openai";
    } catch {
      mode = "fallback";
      incompleteData = true;
      warnings.unshift("Generative synthesis was unavailable, so this answer used the rule-based finance assistant.");
    }
  } else {
    warnings.unshift("OpenAI is not configured in this environment, so the assistant is running in rules-only mode.");
    incompleteData = true;
  }

  const result: FinanceAssistantAnswer = {
    answer,
    supportingMetrics,
    toolsInvoked: toolResults.map((tool) => tool.name),
    sources,
    followUpActions,
    warnings: dedupeStrings(warnings, 5),
    mode,
    aiEnabled,
    requiresConfirmation,
    incompleteData,
    suggestedPrompts: buildSuggestedPrompts(toolResults),
    auditMetadata: {},
  };

  result.auditMetadata = buildAuditMetadata({
    question,
    context,
    result,
  });

  return result;
}

export async function buildFinanceAssistantHomeState(input: {
  workspaceId: number;
  role: WorkspaceRole;
}): Promise<FinanceAssistantHomeState> {
  const context = await loadAssistantContext(input.workspaceId, input.role);
  const [taxTool, overdueTool, unmatchedTool, anomaliesTool, filingTool, nextActionsTool, cashTool] =
    await Promise.all([
      runTaxSummaryTool(context, { period: "THIS_MONTH" }),
      runOverdueInvoicesTool(context),
      runUnmatchedBankTransactionsTool(context),
      runExpenseAnomaliesTool(context),
      runFilingStatusTool(context, { period: "THIS_MONTH" }),
      runSuggestNextActionsTool(context),
      runCashMovementSummaryTool(context, { period: "THIS_MONTH" }),
    ]);

  const quickInsights: FinanceAssistantQuickInsight[] = [
    {
      id: "month-end-close",
      title: "Month-end close summary",
      summary: nextActionsTool.summary,
      tone: nextActionsTool.modelContext.unmatchedCount ? "destructive" : "secondary",
      href: "/dashboard",
      ctaLabel: "Open dashboard",
    },
    {
      id: "tax-risk",
      title: "Tax risk highlights",
      summary: `${taxTool.summary} ${filingTool.warnings[0] ?? ""}`.trim(),
      tone: filingTool.metrics[0]?.value === "Review ready" ? "secondary" : "outline",
      href: "/dashboard/tax-filing",
      ctaLabel: "Review compliance",
    },
    {
      id: "unusual-expenses",
      title: "Unusual expense alerts",
      summary: anomaliesTool.summary,
      tone: anomaliesTool.sources.length > 0 ? "outline" : "secondary",
      href: "/dashboard/bookkeeping/review",
      ctaLabel: "Inspect expenses",
    },
    {
      id: "cash-flow",
      title: "Cash flow pressure signals",
      summary: `${cashTool.summary} ${overdueTool.sources.length > 0 ? overdueTool.summary : ""}`.trim(),
      tone:
        overdueTool.sources.length > 0 || unmatchedTool.sources.length > 0 ? "destructive" : "secondary",
      href: "/dashboard/invoices",
      ctaLabel: "Review receivables",
    },
    {
      id: "unpaid-watchlist",
      title: "Unpaid invoice watchlist",
      summary: overdueTool.sources[0]?.detail ?? "No overdue invoices are currently on the watchlist.",
      tone: overdueTool.sources.length > 0 ? "outline" : "secondary",
      href: "/dashboard/invoices",
      ctaLabel: "Open invoices",
    },
  ];

  return {
    aiEnabled: hasOpenAiServerConfig(),
    quickInsights,
    suggestedPrompts: DEFAULT_PROMPTS,
  };
}
