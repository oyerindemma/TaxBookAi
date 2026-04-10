"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import TransactionReviewRowActions from "./TransactionReviewRowActions";
import TransactionReviewStatusBadge, {
  type TransactionReviewStatus,
} from "./TransactionReviewStatusBadge";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type ReconciliationStatus =
  | "UNMATCHED"
  | "SUGGESTED"
  | "MATCHED"
  | "IGNORED"
  | "SPLIT"
  | "REVIEW_REQUIRED";
type TransactionSource = "CSV_IMPORT" | "MANUAL";
type VatTreatment = "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
type WhtTreatment = "NONE" | "PAYABLE" | "RECEIVABLE";
type TaxTreatmentSource = "UNSET" | "SUGGESTED" | "MANUAL";
type PostingReadiness = "NOT_READY" | "REVIEW_REQUIRED" | "READY_TO_POST";

type ReviewDashboard = {
  accounts: Array<{
    id: number;
    name: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    currency: string;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
  }>;
  clientBusinesses: Array<{
    id: number;
    name: string;
    defaultCurrency: string;
    categories: Array<{
      id: number;
      name: string;
      type: string;
    }>;
  }>;
  transactions: ReviewTransaction[];
  summary: {
    total: number;
    byReviewStatus: Record<TransactionReviewStatus, number>;
    lowConfidenceCount: number;
    readyToPostCount: number;
    reviewRequiredCount: number;
    duplicateCount: number;
    suspiciousCount: number;
    pendingSuggestionCount: number;
  };
};

type ReviewTransaction = {
  id: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
  type: "CREDIT" | "DEBIT";
  source: TransactionSource;
  status: ReconciliationStatus;
  reviewStatus: TransactionReviewStatus;
  currency: string;
  sourceRowNumber: number | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: {
    id: number;
    fullName: string;
    email: string;
  } | null;
  bankAccount: {
    id: number;
    name: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    currency: string;
  };
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  } | null;
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
  suggestedCategory: {
    id: number;
    name: string;
    type: string;
  } | null;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: TaxTreatmentSource;
  usesSuggestedTaxFallback: boolean;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
  autoBookkeepingConfidence: number | null;
  autoBookkeepingReason: string | null;
  autoBookkeepingProvider: string | null;
  autoBookkeepingProcessedAt: string | null;
  postingReadiness: PostingReadiness;
  possibleDuplicateOf: {
    id: number;
    transactionDate: string;
    description: string;
    reference: string | null;
    amountMinor: number;
  } | null;
  duplicateConfidence: number | null;
  duplicateReason: string | null;
  suspiciousPatternScore: number | null;
  suspiciousPatternReason: string | null;
};

type Filters = {
  query: string;
  reviewStatus: string;
  categorizationState: string;
  confidenceBand: string;
  postingReadiness: string;
  bankAccountId: string;
  clientBusinessId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
};

type EditForm = {
  reviewStatus: TransactionReviewStatus;
  reviewNotes: string;
  description: string;
  reference: string;
  transactionDate: string;
  categoryId: string;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: string;
  whtRate: string;
};

type FieldErrors = Partial<
  Record<
    | "reviewStatus"
    | "reviewNotes"
    | "description"
    | "reference"
    | "transactionDate"
    | "categoryId"
    | "vatTreatment"
    | "whtTreatment"
    | "vatRate"
    | "whtRate"
    | "transactionIds",
    string
  >
>;

type Props = {
  role: Role;
  initialData: ReviewDashboard;
  developmentBillingBypass?: boolean;
  initialSelectedTransactionId?: number | null;
};

const FILTER_DEFAULTS: Filters = {
  query: "",
  reviewStatus: "",
  categorizationState: "",
  confidenceBand: "",
  postingReadiness: "",
  bankAccountId: "",
  clientBusinessId: "",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
};

const REVIEW_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All review states" },
  { value: "IMPORTED", label: "Imported" },
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "POSTED", label: "Posted" },
  { value: "FLAGGED", label: "Flagged" },
];

const CATEGORIZATION_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All categorization states" },
  { value: "NEEDS_SUGGESTION", label: "Needs suggestion" },
  { value: "SUGGESTED", label: "Suggested" },
  { value: "UNCATEGORIZED", label: "Uncategorized" },
  { value: "CATEGORIZED", label: "Categorized" },
];

const CONFIDENCE_BAND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All confidence bands" },
  { value: "LOW", label: "Low confidence" },
  { value: "MEDIUM", label: "Medium confidence" },
  { value: "HIGH", label: "High confidence" },
];

const POSTING_READINESS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All readiness states" },
  { value: "NOT_READY", label: "Not ready" },
  { value: "REVIEW_REQUIRED", label: "Review required" },
  { value: "READY_TO_POST", label: "Ready to post" },
];

const VAT_TREATMENT_OPTIONS: Array<{ value: VatTreatment; label: string }> = [
  { value: "NONE", label: "No VAT" },
  { value: "INPUT", label: "Input VAT" },
  { value: "OUTPUT", label: "Output VAT" },
  { value: "EXEMPT", label: "VAT exempt" },
];

const WHT_TREATMENT_OPTIONS: Array<{ value: WhtTreatment; label: string }> = [
  { value: "NONE", label: "No WHT" },
  { value: "PAYABLE", label: "WHT payable" },
  { value: "RECEIVABLE", label: "WHT receivable" },
];

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatConfidence(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No confidence score";
  }

  return `${Math.round(value * 100)}% confidence`;
}

function isLowConfidence(value: number | null) {
  return typeof value === "number" && value < 0.55;
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }

  return `${value}%`;
}

function formatRateInputValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatTaxTreatmentSource(value: TaxTreatmentSource, usesSuggestedFallback: boolean) {
  if (value === "MANUAL") return "Manual override";
  if (value === "SUGGESTED") return "Stored suggestion";
  if (usesSuggestedFallback) return "Suggestion fallback";
  return "Unspecified";
}

function formatPostingReadiness(value: PostingReadiness) {
  if (value === "READY_TO_POST") return "Ready to post";
  if (value === "REVIEW_REQUIRED") return "Review required";
  return "Not ready";
}

function postingReadinessClassName(value: PostingReadiness) {
  if (value === "READY_TO_POST") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (value === "REVIEW_REQUIRED") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function formatTaxSuggestion(transaction: ReviewTransaction) {
  const parts: string[] = [];

  if (transaction.vatTreatment !== "NONE") {
    parts.push(`VAT ${formatStatusLabel(transaction.vatTreatment)}`);
  }
  if (transaction.whtTreatment !== "NONE") {
    parts.push(`WHT ${formatStatusLabel(transaction.whtTreatment)}`);
  }
  if (parts.length === 0 && transaction.usesSuggestedTaxFallback) {
    parts.push("No tax suggested");
  }

  return parts.join(" · ") || "No tax signal";
}

function formatStatusLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildQueryString(filters: Filters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params.toString();
}

function getEditFormDefaults(transaction: ReviewTransaction | null): EditForm {
  if (!transaction) {
    return {
      reviewStatus: "IMPORTED",
      reviewNotes: "",
      description: "",
      reference: "",
      transactionDate: "",
      categoryId: "",
      vatTreatment: "NONE",
      whtTreatment: "NONE",
      vatRate: "",
      whtRate: "",
    };
  }

  return {
    reviewStatus: transaction.reviewStatus,
    reviewNotes: transaction.reviewNotes ?? "",
    description: transaction.description,
    reference: transaction.reference ?? "",
    transactionDate: transaction.transactionDate.slice(0, 10),
    categoryId: transaction.category ? String(transaction.category.id) : "",
    vatTreatment: transaction.vatTreatment,
    whtTreatment: transaction.whtTreatment,
    vatRate: formatRateInputValue(transaction.vatRate),
    whtRate: formatRateInputValue(transaction.whtRate),
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getCategoryOptions(
  transaction: ReviewTransaction | null,
  clientBusinesses: ReviewDashboard["clientBusinesses"]
) {
  if (!transaction) {
    return [] as Array<{ value: string; label: string }>;
  }

  if (transaction.clientBusiness) {
    const business = clientBusinesses.find(
      (candidate) => candidate.id === transaction.clientBusiness?.id
    );

    return (
      business?.categories.map((category) => ({
        value: String(category.id),
        label: category.name,
      })) ?? []
    );
  }

  return clientBusinesses.flatMap((business) =>
    business.categories.map((category) => ({
      value: String(category.id),
      label: `${business.name} · ${category.name}`,
    }))
  );
}

const textareaClassName =
  "min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function TransactionReviewClient({
  role,
  initialData,
  developmentBillingBypass,
  initialSelectedTransactionId = null,
}: Props) {
  const editable = canEdit(role);
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);
  const [bulkStatus, setBulkStatus] = useState<TransactionReviewStatus>("PENDING_REVIEW");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(
    initialSelectedTransactionId
  );
  const [editForm, setEditForm] = useState<EditForm>(getEditFormDefaults(null));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkSuggesting, setBulkSuggesting] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [categorizingId, setCategorizingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTransaction =
    data.transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;
  const visibleIds = data.transactions.map((transaction) => transaction.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((transactionId) => selectedIds.has(transactionId));
  const categoryOptions = getCategoryOptions(selectedTransaction, data.clientBusinesses);
  const activeFilters = Object.values(filters).some(Boolean);
  const pendingSuggestionCount = data.summary.pendingSuggestionCount;
  const visibleAutoBookkeepingIds = data.transactions
    .filter((transaction) => transaction.reviewStatus !== "POSTED")
    .map((transaction) => transaction.id);

  useEffect(() => {
    setEditForm(getEditFormDefaults(selectedTransaction));
    setFieldErrors({});
  }, [selectedTransactionId, selectedTransaction]);

  useEffect(() => {
    if (
      selectedTransactionId !== null &&
      !data.transactions.some((transaction) => transaction.id === selectedTransactionId)
    ) {
      setSelectedTransactionId(null);
    }

    setSelectedIds((current) => {
      const next = new Set<number>();
      for (const id of current) {
        if (data.transactions.some((transaction) => transaction.id === id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [data.transactions, selectedTransactionId]);

  async function loadReviewQueue(nextFilters: Filters) {
    setLoading(true);
    setError(null);

    try {
      const query = buildQueryString(nextFilters);
      const response = await fetch(
        `/api/banking/transactions/review${query ? `?${query}` : ""}`,
        {
          cache: "no-store",
        }
      );
      const payload = await parseJson<ReviewDashboard & { error?: string }>(response);

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to load the review queue.");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSingleUpdate(
    transactionId: number,
    body: Record<string, unknown>,
    successMessage: string
  ) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/banking/transactions/review/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await parseJson<{
        error?: string;
        fieldErrors?: FieldErrors;
      }>(response);

      if (!response.ok) {
        setFieldErrors(payload?.fieldErrors ?? {});
        throw new Error(payload?.error ?? "Failed to update transaction.");
      }

      setFieldErrors({});
      setMessage(successMessage);
      await loadReviewQueue(filters);
      setSelectedTransactionId(transactionId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSelectedTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTransaction || !editable || saving) return;

    await submitSingleUpdate(
      selectedTransaction.id,
      {
        reviewStatus: editForm.reviewStatus,
        reviewNotes: editForm.reviewNotes,
        description: editForm.description,
        reference: editForm.reference,
        transactionDate: editForm.transactionDate,
        categoryId: editForm.categoryId || null,
        vatTreatment: editForm.vatTreatment,
        whtTreatment: editForm.whtTreatment,
        vatRate: editForm.vatRate,
        whtRate: editForm.whtRate,
      },
      "Transaction review updated."
    );
  }

  async function handleQuickStatusUpdate(
    transactionId: number,
    reviewStatus: TransactionReviewStatus,
    successMessage: string
  ) {
    if (!editable || saving) return;

    await submitSingleUpdate(
      transactionId,
      { reviewStatus },
      successMessage
    );
  }

  async function handleDeleteTransaction(transaction: ReviewTransaction) {
    if (!editable || deletingId !== null) return;

    const confirmed = window.confirm(
      `Delete "${transaction.description}" from the active workspace?`
    );
    if (!confirmed) return;

    setDeletingId(transaction.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/banking/transactions/review/${transaction.id}`, {
        method: "DELETE",
      });

      const payload = await parseJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to delete transaction.");
      }

      setSelectedTransactionId((current) => (current === transaction.id ? null : current));
      setMessage("Transaction deleted.");
      await loadReviewQueue(filters);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Network error.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAutoBookkeepingAction(
    transactionId: number,
    action: "suggest" | "approve" | "reject",
    successMessage: string
  ) {
    if (!editable || categorizingId !== null) return;

    setCategorizingId(transactionId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/banking/transactions/auto-bookkeeping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId,
          action,
        }),
      });

      const payload = await parseJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update auto-bookkeeping.");
      }

      setMessage(successMessage);
      await loadReviewQueue(filters);
      setSelectedTransactionId(transactionId);
    } catch (categorizationError) {
      setError(
        categorizationError instanceof Error ? categorizationError.message : "Network error."
      );
    } finally {
      setCategorizingId(null);
    }
  }

  async function handleBulkUpdate() {
    if (!editable || bulkUpdating || selectedIds.size === 0) return;

    setBulkUpdating(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/banking/transactions/review/bulk", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionIds: Array.from(selectedIds),
          reviewStatus: bulkStatus,
        }),
      });

      const payload = await parseJson<{
        error?: string;
        fieldErrors?: FieldErrors;
        updatedCount?: number;
        skippedCount?: number;
      }>(response);

      if (!response.ok) {
        setFieldErrors(payload?.fieldErrors ?? {});
        throw new Error(payload?.error ?? "Failed to update selected transactions.");
      }

      setSelectedIds(new Set());
      setMessage(
        payload?.updatedCount
          ? `Updated ${payload.updatedCount} transaction${
              payload.updatedCount === 1 ? "" : "s"
            }.`
          : "Selected transactions were already in that status."
      );
      await loadReviewQueue(filters);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Network error.");
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleBulkSuggest(transactionIds?: number[]) {
    if (!editable || bulkSuggesting) return;

    setBulkSuggesting(true);
    setError(null);
    setMessage(null);
      setFieldErrors({});

    try {
      const response = await fetch("/api/banking/transactions/auto-bookkeeping/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "suggest",
          transactionIds,
          limit: transactionIds?.length ? undefined : 100,
        }),
      });

      const payload = await parseJson<{
        error?: string;
        fieldErrors?: FieldErrors;
        processedCount?: number;
        updatedCount?: number;
      }>(response);

      if (!response.ok) {
        setFieldErrors(payload?.fieldErrors ?? {});
        throw new Error(payload?.error ?? "Failed to suggest bookkeeping treatments.");
      }

      setMessage(
        payload?.updatedCount
          ? `Generated ${payload.updatedCount} bookkeeping suggestion${
              payload.updatedCount === 1 ? "" : "s"
            }.`
          : "No new bookkeeping suggestions were generated."
      );
      await loadReviewQueue(filters);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Network error.");
    } finally {
      setBulkSuggesting(false);
    }
  }

  async function handleBulkApprove() {
    if (!editable || bulkApproving || selectedIds.size === 0) return;

    setBulkApproving(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/banking/transactions/auto-bookkeeping/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "approve",
          transactionIds: Array.from(selectedIds),
        }),
      });

      const payload = await parseJson<{
        error?: string;
        fieldErrors?: FieldErrors;
        updatedCount?: number;
      }>(response);

      if (!response.ok) {
        setFieldErrors(payload?.fieldErrors ?? {});
        throw new Error(payload?.error ?? "Failed to approve selected suggestions.");
      }

      setSelectedIds(new Set());
      setMessage(
        payload?.updatedCount
          ? `Approved ${payload.updatedCount} bookkeeping suggestion${
              payload.updatedCount === 1 ? "" : "s"
            }.`
          : "No selected transactions had pending suggestions to approve."
      );
      await loadReviewQueue(filters);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Network error.");
    } finally {
      setBulkApproving(false);
    }
  }

  function toggleTransactionSelection(transactionId: number, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const transactionId of visibleIds) {
        if (checked) {
          next.add(transactionId);
        } else {
          next.delete(transactionId);
        }
      }
      return next;
    });
  }

  const flattenedCategoryOptions = data.clientBusinesses.flatMap((business) =>
    business.categories.map((category) => ({
      value: String(category.id),
      label: `${business.name} · ${category.name}`,
    }))
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Transaction review</h1>
          <p className="text-muted-foreground">
            Review workspace transactions before categorization, reconciliation, and tax treatment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Active workspace scoped</Badge>
          {developmentBillingBypass ? (
            <Badge variant="outline">Development billing bypass</Badge>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/dashboard/banking">Open transaction engine</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/banking/reconcile">Open reconciliation</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="border-primary/10 bg-primary text-white shadow-glow">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/70">Visible transactions</CardDescription>
            <CardTitle className="text-2xl">{data.summary.total}</CardTitle>
            <p className="text-sm text-white/70">Filtered to the current review queue view.</p>
          </CardHeader>
        </Card>
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Pending review</CardDescription>
            <CardTitle className="text-2xl text-amber-950">
              {data.summary.byReviewStatus.PENDING_REVIEW}
            </CardTitle>
            <p className="text-sm text-amber-900/80">
              Transactions that still need a reviewer decision.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-rose-200 bg-rose-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Flagged</CardDescription>
            <CardTitle className="text-2xl text-rose-950">
              {data.summary.byReviewStatus.FLAGGED}
            </CardTitle>
            <p className="text-sm text-rose-900/80">
              Exceptions that should stay visible before downstream posting.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-amber-200 bg-amber-50/70">
          <CardHeader className="pb-2">
            <CardDescription>Low confidence</CardDescription>
            <CardTitle className="text-2xl text-amber-950">
              {data.summary.lowConfidenceCount}
            </CardTitle>
            <p className="text-sm text-amber-900/80">
              Items that should stay in the review queue before bulk approval.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Ready to post</CardDescription>
            <CardTitle className="text-2xl text-cyan-950">
              {data.summary.readyToPostCount}
            </CardTitle>
            <p className="text-sm text-cyan-900/80">
              Categorized transactions with treatments ready for the next accounting step.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-sky-200 bg-sky-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Pending suggestions</CardDescription>
            <CardTitle className="text-2xl text-sky-950">
              {pendingSuggestionCount}
            </CardTitle>
            <p className="text-sm text-sky-900/80">
              Suggested categories and tax treatments waiting for approval or rejection.
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search by description, merchant, note, duplicate reason, or category and narrow the
            queue by review state, confidence, readiness, or date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await loadReviewQueue(filters);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="review-query">Search</Label>
                <Input
                  id="review-query"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder="Description, reference, note, account, or category"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-status-filter">Review status</Label>
                <select
                  id="review-status-filter"
                  value={filters.reviewStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      reviewStatus: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {REVIEW_STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-categorization-filter">Categorization</Label>
                <select
                  id="review-categorization-filter"
                  value={filters.categorizationState}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      categorizationState: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIZATION_STATE_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-confidence-filter">Confidence</Label>
                <select
                  id="review-confidence-filter"
                  value={filters.confidenceBand}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      confidenceBand: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CONFIDENCE_BAND_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-posting-filter">Posting readiness</Label>
                <select
                  id="review-posting-filter"
                  value={filters.postingReadiness}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      postingReadiness: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {POSTING_READINESS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-bank-account-filter">Bank account</Label>
                <select
                  id="review-bank-account-filter"
                  value={filters.bankAccountId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      bankAccountId: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All bank accounts</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-business-filter">Client business</Label>
                <select
                  id="review-business-filter"
                  value={filters.clientBusinessId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      clientBusinessId: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All businesses</option>
                  {data.clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-category-filter">Category</Label>
                <select
                  id="review-category-filter"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All categories</option>
                  {flattenedCategoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-date-from">Date from</Label>
                <Input
                  id="review-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, dateFrom: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-date-to">Date to</Label>
                <Input
                  id="review-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, dateTo: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Refreshing..." : "Apply filters"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!editable || bulkSuggesting || visibleAutoBookkeepingIds.length === 0}
                onClick={() =>
                  handleBulkSuggest(visibleAutoBookkeepingIds.slice(0, 200))
                }
              >
                {bulkSuggesting ? "Suggesting..." : "Suggest visible queue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  const nextFilters = {
                    ...filters,
                    confidenceBand: "LOW",
                    postingReadiness: "REVIEW_REQUIRED",
                  };
                  setFilters(nextFilters);
                  await loadReviewQueue(nextFilters);
                }}
              >
                Low-confidence queue
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || !activeFilters}
                onClick={async () => {
                  setFilters(FILTER_DEFAULTS);
                  await loadReviewQueue(FILTER_DEFAULTS);
                }}
              >
                Clear filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {selectedIds.size > 0 ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="space-y-1">
              <div className="font-medium">
                {selectedIds.size} transaction{selectedIds.size === 1 ? "" : "s"} selected
              </div>
              <p className="text-sm text-muted-foreground">
                Apply a workspace-scoped review update, generate bookkeeping suggestions, or bulk
                approve ready items in one pass.
              </p>
              {fieldErrors.transactionIds ? (
                <p className="text-sm text-destructive">{fieldErrors.transactionIds}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as TransactionReviewStatus)
                }
                className={cn(
                  "flex h-10 min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm",
                  fieldErrors.reviewStatus ? "border-destructive" : null
                )}
              >
                {REVIEW_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button onClick={handleBulkUpdate} disabled={bulkUpdating}>
                {bulkUpdating ? "Updating..." : "Update selected"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBulkSuggest(Array.from(selectedIds))}
                disabled={bulkSuggesting}
              >
                {bulkSuggesting ? "Suggesting..." : "Suggest bookkeeping"}
              </Button>
              <Button
                variant="outline"
                onClick={handleBulkApprove}
                disabled={bulkApproving}
              >
                {bulkApproving ? "Approving..." : "Approve suggestions"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkUpdating || bulkApproving}
              >
                Clear selection
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>
            Use bulk actions for the queue, then open any row to capture notes and finer edits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center">
              <h2 className="text-lg font-semibold">
                {activeFilters ? "No transactions match these filters" : "No transactions to review"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeFilters
                  ? "Adjust the review filters or clear them to bring more transactions back into view."
                  : "Import a bank statement or add manual activity in the transaction engine to seed the review queue."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/dashboard/banking">Open transaction engine</Link>
                </Button>
                <Button asChild>
                  <Link href="/dashboard/banking/reconcile">Import statement</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="border-b px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisible(event.target.checked)}
                        disabled={!editable}
                        aria-label="Select all visible transactions"
                      />
                    </th>
                    <th className="border-b px-3 py-3">Date</th>
                    <th className="border-b px-3 py-3">Transaction</th>
                    <th className="border-b px-3 py-3">Account</th>
                    <th className="border-b px-3 py-3 text-right">Amount</th>
                    <th className="border-b px-3 py-3">Review state</th>
                    <th className="border-b px-3 py-3">Current category</th>
                    <th className="border-b px-3 py-3">Auto-bookkeeping</th>
                    <th className="border-b px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((transaction) => (
                    <tr key={transaction.id} className="align-top hover:bg-muted/30">
                      <td className="border-b px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(transaction.id)}
                          onChange={(event) =>
                            toggleTransactionSelection(transaction.id, event.target.checked)
                          }
                          disabled={!editable}
                          aria-label={`Select transaction ${transaction.description}`}
                        />
                      </td>
                      <td className="border-b px-3 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-left font-medium hover:text-primary"
                          onClick={() => setSelectedTransactionId(transaction.id)}
                        >
                          {formatDate(transaction.transactionDate)}
                        </button>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {transaction.source === "MANUAL" ? "Manual" : "CSV import"}
                        </div>
                      </td>
                      <td className="border-b px-3 py-3">
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left font-medium hover:text-primary"
                            onClick={() => setSelectedTransactionId(transaction.id)}
                          >
                            {transaction.description}
                          </button>
                          {transaction.reference ? (
                            <div className="text-xs text-muted-foreground">
                              Ref: {transaction.reference}
                            </div>
                          ) : null}
                          {transaction.normalizedMerchantName ? (
                            <div className="text-xs text-muted-foreground">
                              Merchant: {transaction.normalizedMerchantName}
                            </div>
                          ) : null}
                          {transaction.reviewNotes ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {transaction.reviewNotes}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-b px-3 py-3">
                        <div className="font-medium">{transaction.bankAccount.accountName}</div>
                        <div className="text-xs text-muted-foreground">
                          {transaction.clientBusiness?.name ?? "No business linked"}
                        </div>
                      </td>
                      <td className="border-b px-3 py-3 text-right">
                        <div
                          className={cn(
                            "font-medium",
                            transaction.type === "CREDIT"
                              ? "text-emerald-700"
                              : "text-foreground"
                          )}
                        >
                          {transaction.type === "CREDIT" ? "+" : "-"}
                          {formatMoney(transaction.amountMinor, transaction.currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatStatusLabel(transaction.status)}
                        </div>
                      </td>
                      <td className="border-b px-3 py-3">
                        <div className="space-y-2">
                          <TransactionReviewStatusBadge status={transaction.reviewStatus} />
                          <Badge
                            variant="outline"
                            className={postingReadinessClassName(transaction.postingReadiness)}
                          >
                            {formatPostingReadiness(transaction.postingReadiness)}
                          </Badge>
                          {transaction.reviewedAt ? (
                            <div className="text-xs text-muted-foreground">
                              {transaction.reviewedBy?.fullName ?? "Reviewed"} ·{" "}
                              {formatDateTime(transaction.reviewedAt)}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-b px-3 py-3">
                        {transaction.category ? (
                          <div>
                            <div className="font-medium">{transaction.category.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatStatusLabel(transaction.category.type)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="border-b px-3 py-3">
                        {transaction.suggestedCategory || transaction.usesSuggestedTaxFallback ? (
                          <div className="space-y-2">
                            <div>
                              <div className="font-medium">
                                {transaction.suggestedCategory?.name ?? "Tax treatment suggestion"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatConfidence(
                                  transaction.autoBookkeepingConfidence ??
                                    transaction.suggestionConfidence
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatTaxSuggestion(transaction)}
                            </div>
                            {transaction.suggestionReason ? (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {transaction.suggestionReason}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              {transaction.duplicateReason ? (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                                  Duplicate risk
                                </Badge>
                              ) : null}
                              {transaction.suspiciousPatternReason ? (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-900">
                                  Suspicious pattern
                                </Badge>
                              ) : null}
                              {isLowConfidence(
                                transaction.autoBookkeepingConfidence ??
                                  transaction.suggestionConfidence
                              ) ? (
                                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-900">
                                  Low confidence
                                </Badge>
                              ) : null}
                            </div>
                            {editable ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleAutoBookkeepingAction(
                                      transaction.id,
                                      "approve",
                                      "Bookkeeping suggestion approved."
                                    )
                                  }
                                  disabled={categorizingId === transaction.id}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleAutoBookkeepingAction(
                                      transaction.id,
                                      "reject",
                                      "Bookkeeping suggestion rejected."
                                    )
                                  }
                                  disabled={categorizingId === transaction.id}
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : !transaction.category && editable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleAutoBookkeepingAction(
                                transaction.id,
                                "suggest",
                                "Bookkeeping suggestion generated."
                              )
                            }
                            disabled={categorizingId === transaction.id}
                          >
                            {categorizingId === transaction.id ? "Suggesting..." : "Suggest"}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">No pending suggestion</span>
                        )}
                      </td>
                      <td className="border-b px-3 py-3">
                        <TransactionReviewRowActions
                          disabled={
                            saving ||
                            deletingId === transaction.id ||
                            categorizingId === transaction.id
                          }
                          canEdit={editable}
                          onOpen={() => setSelectedTransactionId(transaction.id)}
                          onMarkReviewed={() =>
                            handleQuickStatusUpdate(
                              transaction.id,
                              "REVIEWED",
                              "Transaction marked reviewed."
                            )
                          }
                          onFlag={() =>
                            handleQuickStatusUpdate(
                              transaction.id,
                              "FLAGGED",
                              "Transaction flagged for follow-up."
                            )
                          }
                          onDelete={() => handleDeleteTransaction(transaction)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={selectedTransactionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransactionId(null);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedTransaction ? (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>{selectedTransaction.description}</SheetTitle>
                <SheetDescription>
                  Review notes, status, and metadata stay scoped to the active workspace.
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-2">
                <TransactionReviewStatusBadge status={selectedTransaction.reviewStatus} />
                <Badge variant="outline">{formatStatusLabel(selectedTransaction.status)}</Badge>
                <Badge variant="outline">
                  {selectedTransaction.source === "MANUAL" ? "Manual" : "CSV import"}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Transaction summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium">
                        {formatMoney(
                          selectedTransaction.amountMinor,
                          selectedTransaction.currency
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Date</span>
                      <span>{formatDate(selectedTransaction.transactionDate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Bank account</span>
                      <span>{selectedTransaction.bankAccount.accountName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Business</span>
                      <span>{selectedTransaction.clientBusiness?.name ?? "Unassigned"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Reference</span>
                      <span>{selectedTransaction.reference ?? "None"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Review metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Reviewed by</span>
                      <span>{selectedTransaction.reviewedBy?.fullName ?? "Not yet reviewed"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Reviewed at</span>
                      <span>
                        {selectedTransaction.reviewedAt
                          ? formatDateTime(selectedTransaction.reviewedAt)
                          : "Not yet reviewed"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Category</span>
                      <span>{selectedTransaction.category?.name ?? "Unassigned"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Suggested category</span>
                      <span>
                        {selectedTransaction.suggestedCategory?.name ?? "No pending suggestion"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Suggestion confidence</span>
                      <span>
                        {formatConfidence(
                          selectedTransaction.autoBookkeepingConfidence ??
                            selectedTransaction.suggestionConfidence
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Posting readiness</span>
                      <span>{formatPostingReadiness(selectedTransaction.postingReadiness)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Import row</span>
                      <span>{selectedTransaction.sourceRowNumber ?? "Manual entry"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Applied tax treatment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">VAT</span>
                      <span>{formatStatusLabel(selectedTransaction.vatTreatment)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">VAT rate</span>
                      <span>{formatRate(selectedTransaction.vatRate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">VAT amount</span>
                      <span>
                        {formatMoney(
                          selectedTransaction.vatAmountMinor,
                          selectedTransaction.currency
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">WHT</span>
                      <span>{formatStatusLabel(selectedTransaction.whtTreatment)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">WHT rate</span>
                      <span>{formatRate(selectedTransaction.whtRate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">WHT amount</span>
                      <span>
                        {formatMoney(
                          selectedTransaction.whtAmountMinor,
                          selectedTransaction.currency
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Source</span>
                      <span>
                        {formatTaxTreatmentSource(
                          selectedTransaction.taxTreatmentSource,
                          selectedTransaction.usesSuggestedTaxFallback
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Auto-bookkeeping</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Normalized merchant</span>
                      <span>{selectedTransaction.normalizedMerchantName ?? "Not inferred"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Provider</span>
                      <span>{selectedTransaction.autoBookkeepingProvider ?? "Heuristic"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Processed at</span>
                      <span>
                        {selectedTransaction.autoBookkeepingProcessedAt
                          ? formatDateTime(selectedTransaction.autoBookkeepingProcessedAt)
                          : "Not processed"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Duplicate check</span>
                      <span>
                        {selectedTransaction.duplicateReason
                          ? formatConfidence(selectedTransaction.duplicateConfidence)
                          : "No strong duplicate signal"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Pattern review</span>
                      <span>
                        {selectedTransaction.suspiciousPatternReason
                          ? formatConfidence(selectedTransaction.suspiciousPatternScore)
                          : "No suspicious pattern"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <form className="space-y-4" onSubmit={handleSaveSelectedTransaction}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-date">Transaction date</Label>
                    <Input
                      id="drawer-date"
                      type="date"
                      value={editForm.transactionDate}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          transactionDate: event.target.value,
                        }))
                      }
                      className={fieldErrors.transactionDate ? "border-destructive" : undefined}
                    />
                    {fieldErrors.transactionDate ? (
                      <p className="text-xs text-destructive">{fieldErrors.transactionDate}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-review-status">Review status</Label>
                    <select
                      id="drawer-review-status"
                      value={editForm.reviewStatus}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          reviewStatus: event.target.value as TransactionReviewStatus,
                        }))
                      }
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        fieldErrors.reviewStatus ? "border-destructive" : null
                      )}
                    >
                      {REVIEW_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.reviewStatus ? (
                      <p className="text-xs text-destructive">{fieldErrors.reviewStatus}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="drawer-description">Description</Label>
                    <Input
                      id="drawer-description"
                      value={editForm.description}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      className={fieldErrors.description ? "border-destructive" : undefined}
                    />
                    {fieldErrors.description ? (
                      <p className="text-xs text-destructive">{fieldErrors.description}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-reference">Reference</Label>
                    <Input
                      id="drawer-reference"
                      value={editForm.reference}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          reference: event.target.value,
                        }))
                      }
                      className={fieldErrors.reference ? "border-destructive" : undefined}
                    />
                    {fieldErrors.reference ? (
                      <p className="text-xs text-destructive">{fieldErrors.reference}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-category">Category</Label>
                    <select
                      id="drawer-category"
                      value={editForm.categoryId}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          categoryId: event.target.value,
                        }))
                      }
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        fieldErrors.categoryId ? "border-destructive" : null
                      )}
                    >
                      <option value="">No category</option>
                      {categoryOptions.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.categoryId ? (
                      <p className="text-xs text-destructive">{fieldErrors.categoryId}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-vat-treatment">VAT treatment</Label>
                    <select
                      id="drawer-vat-treatment"
                      value={editForm.vatTreatment}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          vatTreatment: event.target.value as VatTreatment,
                        }))
                      }
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        fieldErrors.vatTreatment ? "border-destructive" : null
                      )}
                    >
                      {VAT_TREATMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.vatTreatment ? (
                      <p className="text-xs text-destructive">{fieldErrors.vatTreatment}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-vat-rate">VAT rate (%)</Label>
                    <Input
                      id="drawer-vat-rate"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={editForm.vatRate}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          vatRate: event.target.value,
                        }))
                      }
                      className={fieldErrors.vatRate ? "border-destructive" : undefined}
                      placeholder="7.5"
                    />
                    {fieldErrors.vatRate ? (
                      <p className="text-xs text-destructive">{fieldErrors.vatRate}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-wht-treatment">WHT treatment</Label>
                    <select
                      id="drawer-wht-treatment"
                      value={editForm.whtTreatment}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          whtTreatment: event.target.value as WhtTreatment,
                        }))
                      }
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        fieldErrors.whtTreatment ? "border-destructive" : null
                      )}
                    >
                      {WHT_TREATMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.whtTreatment ? (
                      <p className="text-xs text-destructive">{fieldErrors.whtTreatment}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drawer-wht-rate">WHT rate (%)</Label>
                    <Input
                      id="drawer-wht-rate"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={editForm.whtRate}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          whtRate: event.target.value,
                        }))
                      }
                      className={fieldErrors.whtRate ? "border-destructive" : undefined}
                      placeholder="5"
                    />
                    {fieldErrors.whtRate ? (
                      <p className="text-xs text-destructive">{fieldErrors.whtRate}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="drawer-review-notes">Review notes</Label>
                    <textarea
                      id="drawer-review-notes"
                      value={editForm.reviewNotes}
                      disabled={!editable || saving}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          reviewNotes: event.target.value,
                        }))
                      }
                      className={cn(
                        textareaClassName,
                        fieldErrors.reviewNotes ? "border-destructive" : null
                      )}
                      placeholder="Capture why this transaction was reviewed, flagged, or posted."
                    />
                    {fieldErrors.reviewNotes ? (
                      <p className="text-xs text-destructive">{fieldErrors.reviewNotes}</p>
                    ) : null}
                  </div>

                  {selectedTransaction.suggestedCategory ||
                  selectedTransaction.usesSuggestedTaxFallback ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Suggestion rationale</Label>
                      <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                        {selectedTransaction.autoBookkeepingReason ??
                          selectedTransaction.suggestionReason ??
                          "No explanation was attached to this suggestion."}
                      </div>
                    </div>
                  ) : null}

                  {selectedTransaction.possibleDuplicateOf ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Possible duplicate</Label>
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                        {selectedTransaction.duplicateReason ??
                          "This transaction closely matches earlier activity in the workspace."}
                        <div className="mt-2 text-xs text-amber-900/80">
                          Similar item: {selectedTransaction.possibleDuplicateOf.description} on{" "}
                          {formatDate(selectedTransaction.possibleDuplicateOf.transactionDate)} for{" "}
                          {formatMoney(
                            selectedTransaction.possibleDuplicateOf.amountMinor,
                            selectedTransaction.currency
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedTransaction.suspiciousPatternReason ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Pattern alert</Label>
                      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-950">
                        {selectedTransaction.suspiciousPatternReason}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {editable ? (
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save review changes"}
                    </Button>
                  ) : null}
                  {editable && selectedTransaction.reviewStatus !== "REVIEWED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        handleQuickStatusUpdate(
                          selectedTransaction.id,
                          "REVIEWED",
                          "Transaction marked reviewed."
                        )
                      }
                    >
                      Mark reviewed
                    </Button>
                  ) : null}
                  {editable && selectedTransaction.reviewStatus !== "FLAGGED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        handleQuickStatusUpdate(
                          selectedTransaction.id,
                          "FLAGGED",
                          "Transaction flagged for follow-up."
                        )
                      }
                    >
                      Flag transaction
                    </Button>
                  ) : null}
                  {editable &&
                  !selectedTransaction.category &&
                  !selectedTransaction.suggestedCategory ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={categorizingId === selectedTransaction.id}
                      onClick={() =>
                        handleAutoBookkeepingAction(
                          selectedTransaction.id,
                          "suggest",
                          "Bookkeeping suggestion generated."
                        )
                      }
                    >
                      {categorizingId === selectedTransaction.id
                        ? "Suggesting..."
                        : "Suggest bookkeeping"}
                    </Button>
                  ) : null}
                  {editable &&
                  (selectedTransaction.suggestedCategory ||
                    selectedTransaction.usesSuggestedTaxFallback) ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={categorizingId === selectedTransaction.id}
                      onClick={() =>
                        handleAutoBookkeepingAction(
                          selectedTransaction.id,
                          "approve",
                          "Bookkeeping suggestion approved."
                        )
                      }
                    >
                      Approve suggestion
                    </Button>
                  ) : null}
                  {editable &&
                  (selectedTransaction.suggestedCategory ||
                    selectedTransaction.usesSuggestedTaxFallback) ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={categorizingId === selectedTransaction.id}
                      onClick={() =>
                        handleAutoBookkeepingAction(
                          selectedTransaction.id,
                          "reject",
                          "Bookkeeping suggestion rejected."
                        )
                      }
                    >
                      Reject suggestion
                    </Button>
                  ) : null}
                  {editable ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deletingId === selectedTransaction.id}
                      onClick={() => handleDeleteTransaction(selectedTransaction)}
                    >
                      {deletingId === selectedTransaction.id ? "Deleting..." : "Delete"}
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
