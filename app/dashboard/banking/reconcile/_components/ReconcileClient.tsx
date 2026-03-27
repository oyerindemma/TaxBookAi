"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type BankTransactionStatus =
  | "UNMATCHED"
  | "SUGGESTED"
  | "MATCHED"
  | "IGNORED"
  | "SPLIT"
  | "REVIEW_REQUIRED";
type SuggestedType = "INCOME" | "EXPENSE" | "TRANSFER" | "OWNER_DRAW" | "UNKNOWN";
type VatTreatment = "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
type WhtTreatment = "NONE" | "PAYABLE" | "RECEIVABLE";

type BankAccount = {
  id: number;
  name: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientBusiness = {
  id: number;
  name: string;
  defaultCurrency: string;
  categories: Array<{
    id: number;
    name: string;
    type: string;
  }>;
};

type ImportHistory = {
  id: number;
  fileName: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  warningCount: number;
  bankAccount: {
    id: number;
    name: string;
    accountName: string;
  };
  clientBusiness: {
    id: number;
    name: string;
  } | null;
  uploadedByName: string | null;
};

type MatchSuggestion = {
  id: number;
  matchType: string;
  status: string;
  score: number;
  rationale: string | null;
  matchedAmountMinor: number | null;
  createdAt: string;
  approvedAt: string | null;
  target: {
    title: string;
    subtitle: string | null;
    amountMinor: number | null;
    reference: string | null;
    kind: string;
    linkedId: number | null;
    clientBusinessName: string | null;
  };
};

type Transaction = {
  id: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
  debitAmountMinor: number | null;
  creditAmountMinor: number | null;
  balanceAmountMinor: number | null;
  type: "CREDIT" | "DEBIT";
  status: BankTransactionStatus;
  currency: string;
  sourceRowNumber: number | null;
  reviewNotes: string | null;
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
  statementImport: {
    id: number;
    fileName: string;
    status: string;
    createdAt: string;
    importedCount: number;
    duplicateCount: number;
    failedCount: number;
  } | null;
  matchedLedgerEntryId: number | null;
  matchedInvoiceId: number | null;
  categorization: {
    suggestedType: SuggestedType;
    counterpartyName: string | null;
    suggestedCategoryName: string | null;
    suggestedVatTreatment: VatTreatment;
    suggestedWhtTreatment: WhtTreatment;
    narrationMeaning: string | null;
    confidenceScore: number | null;
    provider: string | null;
    vatRelevance: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
    whtRelevance: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
    vatRate: number;
    whtRate: number;
  };
  approvedMatch: MatchSuggestion | null;
  suggestions: MatchSuggestion[];
  splitLines: Array<{
    id: number;
    description: string;
    reference: string | null;
    amountMinor: number;
    direction: string;
    currency: string;
    vatAmountMinor: number;
    whtAmountMinor: number;
    vatTreatment: VatTreatment;
    whtTreatment: WhtTreatment;
    vendorName: string | null;
    categoryName: string | null;
    ledgerTransactionId: number | null;
  }>;
};

type DashboardResponse = {
  accounts: BankAccount[];
  clientBusinesses: ClientBusiness[];
  imports: ImportHistory[];
  invoiceOptions: Array<{
    id: number;
    invoiceNumber: string;
    clientName: string;
    status: string;
    totalAmount: number;
    paymentReference: string | null;
    issueDate: string;
    dueDate: string;
  }>;
  ledgerOptions: Array<{
    id: number;
    description: string;
    reference: string | null;
    amountMinor: number;
    currency: string;
    direction: "MONEY_IN" | "MONEY_OUT";
    reviewStatus: string;
    transactionDate: string;
    clientBusinessId: number;
    clientBusinessName: string;
  }>;
  transactions: Transaction[];
  summary: {
    total: number;
    byStatus: Record<BankTransactionStatus, number>;
  };
  aiConfigured: boolean;
};

type PreviewResponse = {
  preview: {
    headers: string[];
    suggestedMapping: Record<string, string | null>;
    previewRows: Array<Record<string, string>>;
    guidance: string[];
  };
};

type AccountForm = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  clientBusinessId: string;
};

type Filters = {
  status: string;
  bankAccountId: string;
  clientBusinessId: string;
  importId: string;
  query: string;
};

type TransactionForm = {
  clientBusinessId: string;
  description: string;
  reference: string;
  vendorName: string;
  categoryName: string;
  categoryId: string;
  suggestedType: SuggestedType;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatAmount: string;
  whtAmount: string;
  notes: string;
  invoiceId: string;
  ledgerTransactionId: string;
  ledgerSearch: string;
  ledgerAmountFilter: "tight" | "standard" | "wide" | "any";
  ledgerDateWindow: "7" | "14" | "30" | "any";
  splitLines: Array<{
    description: string;
    reference: string;
    amount: string;
    vendorName: string;
    categoryName: string;
    categoryId: string;
    suggestedType: SuggestedType;
    vatTreatment: VatTreatment;
    whtTreatment: WhtTreatment;
    vatAmount: string;
    whtAmount: string;
    notes: string;
  }>;
};

type ImportDiagnostics = {
  kind: "error" | "warning";
  guidance: string[];
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
};

type MappingFieldKey =
  | "transactionDate"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "reference";

const FIELD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "", label: "Not mapped" },
  { key: "transactionDate", label: "Transaction date" },
  { key: "description", label: "Description" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "amount", label: "Amount" },
  { key: "balance", label: "Balance" },
  { key: "reference", label: "Reference" },
];

type Props = {
  role: Role;
  developmentBillingBypass?: boolean;
};

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function formatMoney(amountMinor: number | null | undefined, currency: string) {
  if (typeof amountMinor !== "number") return "Not set";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function minorToInput(amountMinor: number | null | undefined) {
  if (typeof amountMinor !== "number") return "";
  return (amountMinor / 100).toFixed(2);
}

function inputToMinor(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function getMappedHeader(
  mapping: Record<string, string | null>,
  field: MappingFieldKey
) {
  return mapping[field] ?? null;
}

function getMappedFieldForHeader(
  mapping: Record<string, string | null>,
  header: string
) {
  return (
    (Object.entries(mapping).find(([, value]) => value === header)?.[0] as MappingFieldKey | undefined) ??
    null
  );
}

function getHeaderSamples(
  preview: PreviewResponse["preview"],
  header: string
) {
  return preview.previewRows
    .map((row) => row[header] ?? "")
    .filter((value) => value.trim() !== "")
    .slice(0, 2);
}

function getMappingReadiness(
  preview: PreviewResponse["preview"] | null,
  mapping: Record<string, string | null>
) {
  if (!preview) {
    return {
      ready: false,
      blockers: ["Preview the CSV before importing."],
      mappedCount: 0,
      totalCount: FIELD_OPTIONS.length - 1,
    };
  }

  const blockers: string[] = [];
  if (!getMappedHeader(mapping, "transactionDate")) {
    blockers.push("Map the transaction date column.");
  }
  if (!getMappedHeader(mapping, "description")) {
    blockers.push("Map the narration or description column.");
  }
  if (
    !getMappedHeader(mapping, "amount") &&
    !getMappedHeader(mapping, "debit") &&
    !getMappedHeader(mapping, "credit")
  ) {
    blockers.push("Map a single amount column or the debit/credit columns.");
  }

  const uniqueHeaders = new Map<string, string[]>();
  Object.entries(mapping).forEach(([field, header]) => {
    if (!header) return;
    uniqueHeaders.set(header, [...(uniqueHeaders.get(header) ?? []), field]);
  });

  uniqueHeaders.forEach((fields, header) => {
    if (fields.length > 1) {
      blockers.push(`Column "${header}" is mapped more than once.`);
    }
  });

  const mappedCount = FIELD_OPTIONS.filter((option) => option.key).reduce((count, option) => {
    return mapping[option.key] ? count + 1 : count;
  }, 0);

  return {
    ready: blockers.length === 0,
    blockers,
    mappedCount,
    totalCount: FIELD_OPTIONS.length - 1,
  };
}

function hasActiveFilters(filters: Filters) {
  return Boolean(
    filters.status ||
      filters.bankAccountId ||
      filters.clientBusinessId ||
      filters.importId ||
      filters.query.trim()
  );
}

function sumSplitLineAmounts(lines: TransactionForm["splitLines"]) {
  return lines.reduce((sum, line) => sum + (inputToMinor(line.amount) ?? 0), 0);
}

function getConfidenceMeta(
  score: number | null | undefined,
  kind: "categorization" | "match"
) {
  if (typeof score !== "number") {
    return {
      label: "Needs review",
      helper: "No confidence score is available yet.",
      className: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }

  if (kind === "match") {
    if (score >= 0.85) {
      return {
        label: "Strong match",
        helper: `${Math.round(score * 100)}% confidence`,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      };
    }
    if (score >= 0.7) {
      return {
        label: "Good match",
        helper: `${Math.round(score * 100)}% confidence`,
        className: "border-sky-200 bg-sky-50 text-sky-900",
      };
    }
    return {
      label: "Possible match",
      helper: `${Math.round(score * 100)}% confidence`,
      className: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }

  if (score >= 0.8) {
    return {
      label: "High confidence",
      helper: `${Math.round(score * 100)}% confidence`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }
  if (score >= 0.6) {
    return {
      label: "Medium confidence",
      helper: `${Math.round(score * 100)}% confidence`,
      className: "border-sky-200 bg-sky-50 text-sky-900",
    };
  }
  return {
    label: "Low confidence",
    helper: `${Math.round(score * 100)}% confidence`,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  };
}

function getSuggestedActionLabel(suggestion: MatchSuggestion) {
  if (suggestion.matchType === "INVOICE") {
    return "Approve invoice match";
  }
  if (suggestion.matchType === "LEDGER_TRANSACTION") {
    return "Approve ledger match";
  }
  if (suggestion.matchType === "BOOKKEEPING_DRAFT") {
    return "Approve draft match";
  }
  return "Approve suggested match";
}

function badgeVariant(status: BankTransactionStatus) {
  switch (status) {
    case "MATCHED":
      return "secondary" as const;
    case "IGNORED":
      return "outline" as const;
    case "REVIEW_REQUIRED":
      return "destructive" as const;
    case "SPLIT":
      return "secondary" as const;
    default:
      return "default" as const;
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function getTransactionStateMeta(transaction: Transaction, bestSuggestion: MatchSuggestion | null) {
  if (transaction.status === "MATCHED") {
    return {
      label: "Matched",
      cardClassName: "border-emerald-200 bg-emerald-50/30",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }

  if (transaction.status === "SPLIT") {
    return {
      label: "Partially matched",
      cardClassName: "border-sky-200 bg-sky-50/30",
      badgeClassName: "border-sky-200 bg-sky-50 text-sky-900",
    };
  }

  if (
    transaction.status === "REVIEW_REQUIRED" ||
    (bestSuggestion && bestSuggestion.score < 0.7)
  ) {
    return {
      label: "Suspicious",
      cardClassName: "border-amber-200 bg-amber-50/30",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }

  if (transaction.status === "SUGGESTED") {
    return {
      label: "Auto-match ready",
      cardClassName: "border-cyan/30 bg-cyan/10",
      badgeClassName: "border-cyan/30 bg-cyan/10 text-primary",
    };
  }

  if (transaction.status === "IGNORED") {
    return {
      label: "Ignored",
      cardClassName: "border-slate-200 bg-slate-50/50",
      badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  return {
    label: "Unmatched",
    cardClassName: "border-slate-200 bg-white",
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function getSuggestionAmountDeltaMinor(transaction: Transaction, suggestion: MatchSuggestion) {
  return typeof suggestion.target.amountMinor === "number"
    ? suggestion.target.amountMinor - transaction.amountMinor
    : null;
}

function formatMoneyDelta(deltaMinor: number, currency: string) {
  if (deltaMinor === 0) return "Exact amount";
  const sign = deltaMinor > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(deltaMinor), currency)}`;
}

function getSuggestionAmountMeta(transaction: Transaction, suggestion: MatchSuggestion) {
  const deltaMinor = getSuggestionAmountDeltaMinor(transaction, suggestion);
  if (deltaMinor === null) {
    return {
      label: "Amount unavailable",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (deltaMinor === 0) {
    return {
      label: "Exact amount",
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }

  const tolerance = Math.max(250, Math.round(transaction.amountMinor * 0.05));
  if (Math.abs(deltaMinor) <= tolerance) {
    return {
      label: `Close: ${formatMoneyDelta(deltaMinor, transaction.currency)}`,
      className: "border-sky-200 bg-sky-50 text-sky-900",
    };
  }

  return {
    label: `Gap: ${formatMoneyDelta(deltaMinor, transaction.currency)}`,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  };
}

function getSuggestionDateMeta(suggestion: MatchSuggestion) {
  const rationale = suggestion.rationale?.toLowerCase() ?? "";

  if (rationale.includes("same-day timing")) {
    return {
      label: "Same-day timing",
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }

  if (rationale.includes("date is very close")) {
    return {
      label: "Date very close",
      className: "border-sky-200 bg-sky-50 text-sky-900",
    };
  }

  if (rationale.includes("review window")) {
    return {
      label: "Within review window",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  return {
    label: "Date signal in rationale",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function getDateDistanceInDays(leftIso: string, rightIso: string) {
  const left = new Date(leftIso).getTime();
  const right = new Date(rightIso).getTime();
  return Math.round(Math.abs(left - right) / (24 * 60 * 60 * 1000));
}

function buildTransactionForm(transaction: Transaction): TransactionForm {
  const bestInvoiceSuggestion = transaction.suggestions.find(
    (suggestion) => suggestion.matchType === "INVOICE" && suggestion.target.linkedId
  );
  const bestLedgerSuggestion = transaction.suggestions.find(
    (suggestion) =>
      suggestion.matchType === "LEDGER_TRANSACTION" && suggestion.target.linkedId
  );

  return {
    clientBusinessId: transaction.clientBusiness ? String(transaction.clientBusiness.id) : "",
    description: transaction.description,
    reference: transaction.reference ?? "",
    vendorName: transaction.categorization.counterpartyName ?? "",
    categoryName: transaction.categorization.suggestedCategoryName ?? "",
    categoryId: "",
    suggestedType: transaction.categorization.suggestedType,
    vatTreatment: transaction.categorization.suggestedVatTreatment,
    whtTreatment: transaction.categorization.suggestedWhtTreatment,
    vatAmount: "",
    whtAmount: "",
    notes: transaction.reviewNotes ?? transaction.categorization.narrationMeaning ?? "",
    invoiceId: transaction.matchedInvoiceId
      ? String(transaction.matchedInvoiceId)
      : bestInvoiceSuggestion?.target.linkedId
        ? String(bestInvoiceSuggestion.target.linkedId)
        : "",
    ledgerTransactionId: transaction.matchedLedgerEntryId
      ? String(transaction.matchedLedgerEntryId)
      : bestLedgerSuggestion?.target.linkedId
        ? String(bestLedgerSuggestion.target.linkedId)
        : "",
    ledgerSearch: "",
    ledgerAmountFilter: "wide",
    ledgerDateWindow: "30",
    splitLines: [
      {
        description: transaction.description,
        reference: transaction.reference ?? "",
        amount: minorToInput(transaction.amountMinor),
        vendorName: transaction.categorization.counterpartyName ?? "",
        categoryName: transaction.categorization.suggestedCategoryName ?? "",
        categoryId: "",
        suggestedType: transaction.categorization.suggestedType,
        vatTreatment: transaction.categorization.suggestedVatTreatment,
        whtTreatment: transaction.categorization.suggestedWhtTreatment,
        vatAmount: "",
        whtAmount: "",
        notes: "",
      },
      {
        description: "",
        reference: "",
        amount: "0.00",
        vendorName: "",
        categoryName: "",
        categoryId: "",
        suggestedType: transaction.type === "CREDIT" ? "INCOME" : "EXPENSE",
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        vatAmount: "",
        whtAmount: "",
        notes: "",
      },
    ],
  };
}

function getLedgerOptionsForTransaction(
  transaction: Transaction,
  form: TransactionForm,
  ledgerOptions: DashboardResponse["ledgerOptions"]
) {
  const businessId = Number(form.clientBusinessId || transaction.clientBusiness?.id || 0) || null;
  const expectedDirection = transaction.type === "CREDIT" ? "MONEY_IN" : "MONEY_OUT";
  const transactionDateMs = new Date(transaction.transactionDate).getTime();
  const selectedLedgerId = Number(form.ledgerTransactionId || 0) || null;
  const search = form.ledgerSearch.trim().toLowerCase();
  const dateWindowDays =
    form.ledgerDateWindow === "any" ? null : Number(form.ledgerDateWindow);
  const amountTolerance =
    form.ledgerAmountFilter === "tight"
      ? Math.max(100, Math.round(transaction.amountMinor * 0.005))
      : form.ledgerAmountFilter === "standard"
        ? Math.max(100, Math.round(transaction.amountMinor * 0.02))
        : form.ledgerAmountFilter === "wide"
          ? Math.max(250, Math.round(transaction.amountMinor * 0.05))
          : null;

  const ranked = ledgerOptions
    .filter((option) => option.direction === expectedDirection)
    .filter((option) => !businessId || option.clientBusinessId === businessId)
    .filter((option) => {
      if (!search) return true;
      const haystack = [
        option.description,
        option.reference ?? "",
        option.clientBusinessName,
        option.reviewStatus,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .map((option) => ({
      option,
      amountDelta: Math.abs(option.amountMinor - transaction.amountMinor),
      dateDelta: Math.abs(new Date(option.transactionDate).getTime() - transactionDateMs),
    }))
    .filter((entry) => {
      if (amountTolerance === null) return true;
      return entry.amountDelta <= amountTolerance;
    })
    .filter((entry) => {
      if (dateWindowDays === null) return true;
      return entry.dateDelta <= dateWindowDays * 24 * 60 * 60 * 1000;
    })
    .sort((left, right) => {
      if (left.amountDelta !== right.amountDelta) {
        return left.amountDelta - right.amountDelta;
      }
      return left.dateDelta - right.dateDelta;
    })
    .slice(0, 20)
    .map((entry) => entry.option);

  if (
    selectedLedgerId &&
    !ranked.some((option) => option.id === selectedLedgerId)
  ) {
    const selectedOption = ledgerOptions.find((option) => option.id === selectedLedgerId);
    if (selectedOption) {
      return [selectedOption, ...ranked];
    }
  }

  return ranked;
}

function buildInitialFilters(): Filters {
  return {
    status: "",
    bankAccountId: "",
    clientBusinessId: "",
    importId: "",
    query: "",
  };
}

export default function ReconcileClient({
  role,
  developmentBillingBypass = false,
}: Props) {
  const editable = canEdit(role);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => buildInitialFilters());
  const [accountForm, setAccountForm] = useState<AccountForm>({
    accountName: "",
    bankName: "",
    accountNumber: "",
    currency: "NGN",
    clientBusinessId: "",
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDiagnostics, setImportDiagnostics] = useState<ImportDiagnostics | null>(null);
  const [forms, setForms] = useState<Record<number, TransactionForm>>({});
  const [splittingTransactionId, setSplittingTransactionId] = useState<number | null>(null);
  const [workingTransactionId, setWorkingTransactionId] = useState<number | null>(null);

  async function loadDashboard(activeFilters = filters) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (activeFilters.status) params.set("status", activeFilters.status);
      if (activeFilters.bankAccountId) params.set("bankAccountId", activeFilters.bankAccountId);
      if (activeFilters.clientBusinessId) {
        params.set("clientBusinessId", activeFilters.clientBusinessId);
      }
      if (activeFilters.importId) params.set("importId", activeFilters.importId);
      if (activeFilters.query) params.set("query", activeFilters.query);

      const response = await fetch(
        `/api/banking/reconcile${params.toString() ? `?${params.toString()}` : ""}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as DashboardResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load reconciliation dashboard");
      }

      setDashboard(data);
      setForms((current) => {
        const next = { ...current };
        data.transactions.forEach((transaction) => {
          if (!next[transaction.id]) {
            next[transaction.id] = buildTransactionForm(transaction);
          }
        });
        return next;
      });

      if (!selectedBusinessId && data.clientBusinesses.length === 1) {
        setSelectedBusinessId(String(data.clientBusinesses[0].id));
      }

      if (!selectedAccountId && data.accounts.length === 1) {
        setSelectedAccountId(String(data.accounts[0].id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // Initial load only; filter application is explicit from the review controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAccount() {
    if (!editable || savingAccount) return;
    setSavingAccount(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/banking/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...accountForm,
          clientBusinessId: accountForm.clientBusinessId || null,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create bank account");
      }

      setAccountForm({
        accountName: "",
        bankName: "",
        accountNumber: "",
        currency: "NGN",
        clientBusinessId: "",
      });
      setMessage("Bank account created.");
      await loadDashboard();
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : "Network error");
    } finally {
      setSavingAccount(false);
    }
  }

  async function previewImport() {
    if (!editable || previewing) return;
    if (!selectedFile) {
      setError("Choose a CSV file to preview.");
      return;
    }
    if (!selectedAccountId) {
      setError("Select a bank account before previewing the CSV.");
      return;
    }
    if (!selectedBusinessId) {
      setError("Select a client business before previewing the CSV.");
      return;
    }

    setPreviewing(true);
    setError(null);
    setMessage(null);
    setImportDiagnostics(null);

    try {
      const formData = new FormData();
      formData.append("mode", "preview");
      formData.append("file", selectedFile);

      const response = await fetch("/api/banking/import", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as PreviewResponse & { error?: string };

      if (!response.ok || !data.preview) {
        throw new Error(data.error ?? "Failed to preview CSV");
      }

      setPreview(data.preview);
      setMapping(data.preview.suggestedMapping);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Network error");
    } finally {
      setPreviewing(false);
    }
  }

  async function importStatement() {
    if (!editable || importing) return;
    if (!selectedFile || !selectedAccountId || !selectedBusinessId) {
      setError("Choose the CSV file, bank account, and client business before importing.");
      return;
    }
    if (!preview) {
      setError("Preview the CSV and confirm the column mapping before importing.");
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);
    setImportDiagnostics(null);

    try {
      const formData = new FormData();
      formData.append("mode", "import");
      formData.append("file", selectedFile);
      formData.append("bankAccountId", selectedAccountId);
      formData.append("clientBusinessId", selectedBusinessId);
      formData.append("mapping", JSON.stringify(mapping));

      const response = await fetch("/api/banking/import", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        inserted?: number;
        duplicateCount?: number;
        failedCount?: number;
        guidance?: string[];
        errors?: ImportDiagnostics["errors"];
      };

      if (!response.ok) {
        setImportDiagnostics({
          kind: "error",
          guidance: data.guidance ?? [],
          errors: data.errors ?? [],
        });
        throw new Error(data.error ?? "Failed to import statement");
      }

      setPreview(null);
      setSelectedFile(null);
      setMapping({});
      setImportDiagnostics(
        (data.guidance?.length ?? 0) > 0 || (data.errors?.length ?? 0) > 0 || (data.failedCount ?? 0) > 0
          ? {
              kind: "warning",
              guidance: data.guidance ?? [],
              errors: data.errors ?? [],
            }
          : null
      );
      setMessage(
        `Imported ${data.inserted ?? 0} transactions. Duplicates skipped: ${
          data.duplicateCount ?? 0
        }. Failed rows: ${data.failedCount ?? 0}.`
      );
      await loadDashboard();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Network error");
    } finally {
      setImporting(false);
    }
  }

  function updateForm(
    transactionId: number,
    field: keyof TransactionForm,
    value: string | TransactionForm["splitLines"]
  ) {
    setForms((current) => {
      const existing = current[transactionId];
      if (existing) {
        return {
          ...current,
          [transactionId]: {
            ...existing,
            [field]: value,
          },
        };
      }

      const baseTransaction = dashboard?.transactions.find(
        (transaction) => transaction.id === transactionId
      );
      if (!baseTransaction) return current;

      return {
        ...current,
        [transactionId]: {
          ...buildTransactionForm(baseTransaction),
          [field]: value,
        },
      };
    });
  }

  function updateSplitLine(
    transactionId: number,
    index: number,
    field: keyof TransactionForm["splitLines"][number],
    value: string
  ) {
    setForms((current) => {
      const form = current[transactionId];
      if (!form) return current;
      const nextLines = [...form.splitLines];
      nextLines[index] = {
        ...nextLines[index],
        [field]: value,
      };
      return {
        ...current,
        [transactionId]: {
          ...form,
          splitLines: nextLines,
        },
      };
    });
  }

  function addSplitLine(transaction: Transaction, form: TransactionForm) {
    const remainingMinor = transaction.amountMinor - sumSplitLineAmounts(form.splitLines);
    updateForm(transaction.id, "splitLines", [
      ...form.splitLines,
      {
        description: "",
        reference: "",
        amount: minorToInput(remainingMinor > 0 ? remainingMinor : 0),
        vendorName: "",
        categoryName: "",
        categoryId: "",
        suggestedType: transaction.type === "CREDIT" ? "INCOME" : "EXPENSE",
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        vatAmount: "",
        whtAmount: "",
        notes: "",
      },
    ]);
  }

  function removeSplitLine(transactionId: number, index: number) {
    setForms((current) => {
      const form = current[transactionId];
      if (!form || form.splitLines.length <= 2) return current;

      return {
        ...current,
        [transactionId]: {
          ...form,
          splitLines: form.splitLines.filter((_, lineIndex) => lineIndex !== index),
        },
      };
    });
  }

  function updateMappingField(field: MappingFieldKey, header: string) {
    setMapping((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (next[key] === header && key !== field) {
          next[key] = null;
        }
      });
      next[field] = header || null;
      return next;
    });
  }

  async function runTransactionAction(
    transactionId: number,
    action:
      | "reclassify"
      | "create_ledger"
      | "ignore"
      | "split"
      | "link_invoice"
      | "link_ledger",
    payload?: Record<string, unknown>
  ) {
    if (!editable || workingTransactionId) return;
    setWorkingTransactionId(transactionId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/banking/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          transactionId,
          ...payload,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update the bank transaction");
      }

      setMessage(
        action === "ignore"
          ? "Transaction ignored."
          : action === "split"
            ? "Transaction split and posted."
            : action === "link_invoice"
              ? "Invoice linked and posted."
              : action === "link_ledger"
                ? "Existing ledger entry linked."
              : action === "create_ledger"
                ? "Ledger transaction created."
                : "Classification updated."
      );
      if (action === "split") {
        setSplittingTransactionId(null);
      }
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Network error");
    } finally {
      setWorkingTransactionId(null);
    }
  }

  async function approveMatch(transactionId: number, matchId: number) {
    if (!editable || workingTransactionId) return;
    setWorkingTransactionId(transactionId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/banking/matches/${matchId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to approve suggestion");
      }

      setMessage("Suggested match approved.");
      await loadDashboard();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Network error");
    } finally {
      setWorkingTransactionId(null);
    }
  }

  const transactions = dashboard?.transactions ?? [];
  const accounts = dashboard?.accounts ?? [];
  const clientBusinesses = dashboard?.clientBusinesses ?? [];
  const imports = dashboard?.imports ?? [];
  const invoiceOptions = dashboard?.invoiceOptions ?? [];
  const ledgerOptions = dashboard?.ledgerOptions ?? [];
  const totalUnmatched =
    (dashboard?.summary.byStatus.UNMATCHED ?? 0) +
    (dashboard?.summary.byStatus.SUGGESTED ?? 0) +
    (dashboard?.summary.byStatus.REVIEW_REQUIRED ?? 0);
  const totalReconciled =
    (dashboard?.summary.byStatus.MATCHED ?? 0) + (dashboard?.summary.byStatus.SPLIT ?? 0);
  const discrepancyCount = transactions.filter((transaction) => {
    const bestSuggestion = transaction.suggestions[0] ?? null;
    const amountDelta = bestSuggestion
      ? getSuggestionAmountDeltaMinor(transaction, bestSuggestion)
      : null;
    return (
      transaction.status === "REVIEW_REQUIRED" ||
      (bestSuggestion !== null &&
        (bestSuggestion.score < 0.7 ||
          (typeof amountDelta === "number" &&
            Math.abs(amountDelta) > Math.max(250, Math.round(transaction.amountMinor * 0.05)))))
    );
  }).length;
  const autoMatchReadyCount = transactions.filter((transaction) => {
    const bestSuggestion = transaction.suggestions[0] ?? null;
    return (
      transaction.status !== "MATCHED" &&
      transaction.status !== "SPLIT" &&
      transaction.status !== "IGNORED" &&
      bestSuggestion !== null &&
      bestSuggestion.score >= 0.85
    );
  }).length;
  const displayTransactions = [...transactions].sort((left, right) => {
    const rank = (transaction: Transaction) => {
      if (transaction.status === "REVIEW_REQUIRED") return 0;
      if (transaction.status === "SUGGESTED") return 1;
      if (transaction.status === "UNMATCHED") return 2;
      if (transaction.status === "MATCHED") return 3;
      if (transaction.status === "SPLIT") return 4;
      return 5;
    };

    const rankDifference = rank(left) - rank(right);
    if (rankDifference !== 0) return rankDifference;

    const leftBest = left.suggestions[0]?.score ?? -1;
    const rightBest = right.suggestions[0]?.score ?? -1;
    if (leftBest !== rightBest) return rightBest - leftBest;

    return new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
  });
  const importAccounts = selectedBusinessId
    ? accounts.filter(
        (account) => String(account.clientBusinessId ?? "") === selectedBusinessId
      )
    : accounts;
  const mappingFields = FIELD_OPTIONS.filter(
    (option): option is { key: MappingFieldKey; label: string } => option.key !== ""
  );
  const requiredMappingFields = mappingFields.filter(
    (option) => option.key === "transactionDate" || option.key === "description"
  );
  const optionalMappingFields = mappingFields.filter(
    (option) => !requiredMappingFields.some((requiredField) => requiredField.key === option.key)
  );
  const mappingReadiness = getMappingReadiness(preview, mapping);
  const queueHasFilters = hasActiveFilters(filters);
  const noAccounts = accounts.length === 0;
  const noBusinesses = clientBusinesses.length === 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Bank Statement Reconciliation</h1>
          <p className="text-muted-foreground">
            Import CSV statements, classify them for Nigerian bookkeeping, and reconcile each
            line before it reaches the ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">CSV first</Badge>
          <Badge variant={dashboard?.aiConfigured ? "secondary" : "outline"}>
            {dashboard?.aiConfigured ? "AI categorization enabled" : "Fallback heuristics mode"}
          </Badge>
        </div>
      </div>

      {!dashboard?.aiConfigured && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            `OPENAI_API_KEY` is not configured. Statement import still works, but categorization
            confidence is reduced and suggestions come from local heuristics.
          </CardContent>
        </Card>
      )}

      {developmentBillingBypass ? (
        <Card className="border-dashed border-amber-300 bg-amber-50/60">
          <CardContent className="pt-6 text-sm text-amber-950">
            Development billing bypass is active. Banking reconciliation is unlocked locally
            without the Business plan, but production plan checks still apply.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div>{error}</div>
          <Button type="button" size="sm" variant="outline" onClick={() => loadDashboard()}>
            Retry
          </Button>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/10 bg-primary text-white shadow-glow">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/70">Transactions in queue</CardDescription>
            <CardTitle className="text-2xl">{dashboard?.summary.total ?? 0}</CardTitle>
            <p className="text-sm text-white/70">
              Unresolved bank lines stay pinned to the top for faster review.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Still unmatched</CardDescription>
            <CardTitle className="text-2xl text-amber-950">{totalUnmatched}</CardTitle>
            <p className="text-sm text-amber-900/80">
              Includes unmatched, suggested, and review-required transactions.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Reconciled</CardDescription>
            <CardTitle className="text-2xl text-emerald-950">{totalReconciled}</CardTitle>
            <p className="text-sm text-emerald-900/80">
              Fully matched plus split transactions already posted into the ledger.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-cyan/30 bg-cyan/10">
          <CardHeader className="pb-2">
            <CardDescription>Discrepancies</CardDescription>
            <CardTitle className="text-2xl text-primary">{discrepancyCount}</CardTitle>
            <p className="text-sm text-primary/80">
              {autoMatchReadyCount} ready for one-click acceptance right now.
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import bank statement</CardTitle>
            <CardDescription>
            Preview the CSV, confirm the column mapping, then import transactions into the
            review queue. Sample file:{" "}
            <Link href="/docs/sample-bank-statement.csv" className="underline underline-offset-2">
              sample-bank-statement.csv
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {noBusinesses ? (
            <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
              Create or select a client business before importing bank statements.
            </div>
          ) : null}
          {noAccounts ? (
            <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
              Create a bank account in the panel on the right before you preview a CSV.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="clientBusinessId">Client business</Label>
              <select
                  id="clientBusinessId"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedBusinessId}
                onChange={(event) => {
                  setSelectedBusinessId(event.target.value);
                  const businessId = Number(event.target.value);
                  const account = accounts.find(
                    (candidate) => candidate.clientBusinessId === businessId
                  );
                  if (account) {
                    if (!selectedAccountId || account.id !== Number(selectedAccountId)) {
                      setSelectedAccountId(String(account.id));
                    }
                  } else {
                    setSelectedAccountId("");
                  }
                }}
                disabled={!editable}
              >
                  <option value="">Select a business</option>
                  {clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bankAccountId">Bank account</Label>
                <select
                  id="bankAccountId"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  disabled={!editable}
                >
                  <option value="">Select an account</option>
                  {importAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} · {account.bankName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="csvFile">CSV file</Label>
                <Input
                  id="csvFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  disabled={!editable}
                />
                {selectedFile ? (
                  <div className="text-xs text-muted-foreground">
                    {selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={previewImport} disabled={!editable || previewing}>
                {previewing ? "Previewing..." : "Preview mapping"}
              </Button>
              <Button
                type="button"
                onClick={importStatement}
                disabled={!editable || importing || !preview || !mappingReadiness.ready}
              >
                {importing ? "Importing..." : "Import statement"}
              </Button>
            </div>

            {preview ? (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3",
                    mappingReadiness.ready
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {mappingReadiness.ready ? "Mapping looks ready" : "Mapping needs attention"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {mappingReadiness.mappedCount} of {mappingReadiness.totalCount} import fields mapped
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMapping(preview.suggestedMapping)}
                        disabled={!editable}
                      >
                        Use suggested mapping
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMapping({})}
                        disabled={!editable}
                      >
                        Clear mapping
                      </Button>
                    </div>
                  </div>
                  {!mappingReadiness.ready ? (
                    <div className="mt-3 space-y-1 text-sm text-amber-900">
                      {mappingReadiness.blockers.map((blocker) => (
                        <div key={blocker}>{blocker}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-medium">Required mapping</div>
                      <div className="space-y-3">
                        {requiredMappingFields.map((field) => {
                          const mappedHeader = getMappedHeader(mapping, field.key);
                          const suggestedHeader = getMappedHeader(preview.suggestedMapping, field.key);
                          const samples = mappedHeader ? getHeaderSamples(preview, mappedHeader) : [];

                          return (
                            <div key={field.key} className="rounded-md border border-slate-200 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium">{field.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {field.key === "amount"
                                      ? "Use this for a signed amount column, or leave it empty and map debit/credit below."
                                      : "Required to import the statement."}
                                  </div>
                                </div>
                                <Badge variant={mappedHeader ? "secondary" : "outline"}>
                                  {mappedHeader ? "Mapped" : "Missing"}
                                </Badge>
                              </div>
                              <div className="mt-3 grid gap-3">
                                <select
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={mappedHeader ?? ""}
                                  onChange={(event) => updateMappingField(field.key, event.target.value)}
                                  disabled={!editable}
                                >
                                  <option value="">Not mapped</option>
                                  {preview.headers.map((header) => (
                                    <option key={`${field.key}-${header}`} value={header}>
                                      {header}
                                      {suggestedHeader === header ? " • suggested" : ""}
                                    </option>
                                  ))}
                                </select>
                                <div className="text-xs text-muted-foreground">
                                  {samples.length > 0
                                    ? `Examples: ${samples.join(" • ")}`
                                    : suggestedHeader
                                      ? `Suggested from column "${suggestedHeader}".`
                                      : "No sample values available for this field yet."}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-medium">Optional or supporting columns</div>
                      <div className="space-y-3">
                        {optionalMappingFields.map((field) => {
                          const mappedHeader = getMappedHeader(mapping, field.key);
                          const suggestedHeader = getMappedHeader(preview.suggestedMapping, field.key);
                          const samples = mappedHeader ? getHeaderSamples(preview, mappedHeader) : [];

                          return (
                            <div key={field.key} className="rounded-md border border-slate-200 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium">{field.label}</div>
                                {suggestedHeader ? (
                                  <div className="text-xs text-muted-foreground">
                                    Suggested: {suggestedHeader}
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-3 grid gap-3">
                                <select
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={mappedHeader ?? ""}
                                  onChange={(event) => updateMappingField(field.key, event.target.value)}
                                  disabled={!editable}
                                >
                                  <option value="">Not mapped</option>
                                  {preview.headers.map((header) => (
                                    <option key={`${field.key}-${header}`} value={header}>
                                      {header}
                                    </option>
                                  ))}
                                </select>
                                <div className="text-xs text-muted-foreground">
                                  {samples.length > 0
                                    ? `Examples: ${samples.join(" • ")}`
                                    : "Map this only if the export includes it."}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-medium">Preview rows</div>
                      {preview.previewRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No data rows available.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-slate-200">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                {preview.headers.map((header) => {
                                  const mappedField = getMappedFieldForHeader(mapping, header);
                                  return (
                                    <th
                                      key={header}
                                      className={cn(
                                        "px-3 py-2 font-medium",
                                        mappedField ? "bg-sky-50 text-sky-900" : undefined
                                      )}
                                    >
                                      <div className="space-y-1">
                                        <div>{header}</div>
                                        {mappedField ? (
                                          <div className="text-[10px] uppercase tracking-wide text-sky-700">
                                            {statusLabel(mappedField)}
                                          </div>
                                        ) : null}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.previewRows.map((row, rowIndex) => (
                                <tr key={`${rowIndex}-${Object.keys(row).join("-")}`} className="border-t">
                                  {preview.headers.map((header) => (
                                    <td key={header} className="px-3 py-2 text-slate-700">
                                      {row[header] || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-muted/20 p-4">
                      <div className="mb-2 text-sm font-medium">Import guidance</div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {preview.guidance.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {importDiagnostics ? (
              <div
                className={cn(
                  "rounded-lg border px-4 py-4",
                  importDiagnostics.kind === "error"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-amber-200 bg-amber-50"
                )}
              >
                <div className="text-sm font-medium">
                  {importDiagnostics.kind === "error" ? "Import needs fixes" : "Import completed with warnings"}
                </div>
                {importDiagnostics.guidance.length > 0 ? (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {importDiagnostics.guidance.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                ) : null}
                {importDiagnostics.errors.length > 0 ? (
                  <div className="mt-3 space-y-2 text-sm">
                    {importDiagnostics.errors.slice(0, 8).map((issue, index) => (
                      <div key={`${issue.row}-${issue.field}-${index}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                        Row {issue.row} · {issue.field}: {issue.message}
                      </div>
                    ))}
                    {importDiagnostics.errors.length > 8 ? (
                      <div className="text-xs text-muted-foreground">
                        Showing the first 8 row issues.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create bank account</CardTitle>
            <CardDescription>
              Keep each account linked to the client business that owns the statement activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="accountName">Account name</Label>
                <Input
                  id="accountName"
                  value={accountForm.accountName}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      accountName: event.target.value,
                    }))
                  }
                  disabled={!editable}
                  placeholder="Main operating account"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bankName">Bank</Label>
                <Input
                  id="bankName"
                  value={accountForm.bankName}
                  onChange={(event) =>
                    setAccountForm((current) => ({ ...current, bankName: event.target.value }))
                  }
                  disabled={!editable}
                  placeholder="Access Bank"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountNumber">Account number</Label>
                <Input
                  id="accountNumber"
                  value={accountForm.accountNumber}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      accountNumber: event.target.value,
                    }))
                  }
                  disabled={!editable}
                  placeholder="0123456789"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountCurrency">Currency</Label>
                <Input
                  id="accountCurrency"
                  value={accountForm.currency}
                  onChange={(event) =>
                    setAccountForm((current) => ({ ...current, currency: event.target.value }))
                  }
                  disabled={!editable}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountBusiness">Client business</Label>
                <select
                  id="accountBusiness"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={accountForm.clientBusinessId}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      clientBusinessId: event.target.value,
                    }))
                  }
                  disabled={!editable}
                >
                  <option value="">Select a business</option>
                  {clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="button" onClick={submitAccount} disabled={!editable || savingAccount}>
              {savingAccount ? "Saving..." : "Save account"}
            </Button>

            <div className="space-y-2">
              {accounts.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No bank accounts yet. Create one here so imported statements are tied to the
                  right business account.
                </div>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="rounded-md border border-slate-200 px-3 py-3">
                    <div className="font-medium">{account.accountName}</div>
                    <div className="text-sm text-muted-foreground">
                      {account.bankName} · {account.accountNumber} · {account.currency}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {account.clientBusinessName ?? "Client business not linked"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Recent bank statement imports and their row outcomes.</CardDescription>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
              No statement imports yet. Preview and import a CSV to start the reconciliation queue.
            </div>
          ) : (
            <div className="space-y-3">
              {imports.map((statementImport) => (
                <div key={statementImport.id} className="rounded-md border border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{statementImport.fileName}</div>
                      <div className="text-sm text-muted-foreground">
                        {statementImport.bankAccount.name}
                        {statementImport.clientBusiness ? ` · ${statementImport.clientBusiness.name}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{statusLabel(statementImport.status)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                    <div>Rows: {statementImport.rowCount}</div>
                    <div>Imported: {statementImport.importedCount}</div>
                    <div>Duplicates: {statementImport.duplicateCount}</div>
                    <div>Failed: {statementImport.failedCount}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>
            Unresolved and suspicious lines are surfaced first. Filter by status, import batch,
            bank account, or free-text narration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="grid gap-2">
              <Label htmlFor="filterStatus">Status</Label>
              <select
                id="filterStatus"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="">All statuses</option>
                {[
                  "UNMATCHED",
                  "SUGGESTED",
                  "MATCHED",
                  "SPLIT",
                  "REVIEW_REQUIRED",
                  "IGNORED",
                ].map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filterBankAccount">Bank account</Label>
              <select
                id="filterBankAccount"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.bankAccountId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, bankAccountId: event.target.value }))
                }
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filterBusiness">Client business</Label>
              <select
                id="filterBusiness"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.clientBusinessId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    clientBusinessId: event.target.value,
                  }))
                }
              >
                <option value="">All businesses</option>
                {clientBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filterImport">Import batch</Label>
              <select
                id="filterImport"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.importId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, importId: event.target.value }))
                }
              >
                <option value="">All imports</option>
                {imports.map((statementImport) => (
                  <option key={statementImport.id} value={statementImport.id}>
                    {statementImport.fileName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filterQuery">Search</Label>
              <Input
                id="filterQuery"
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder="Narration, reference, vendor"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => loadDashboard(filters)}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const nextFilters = buildInitialFilters();
                setFilters(nextFilters);
                loadDashboard(nextFilters);
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Loading reconciliation queue...
            </CardContent>
          </Card>
        ) : displayTransactions.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
              <div>
                {noAccounts
                  ? "Create a bank account first, then import a CSV statement to populate the review queue."
                  : imports.length === 0
                    ? "Import a bank statement CSV to start reconciliation."
                    : queueHasFilters
                      ? "No bank transactions match the current filters."
                      : "All imported transactions are currently cleared from the active queue."}
              </div>
              {queueHasFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const nextFilters = buildInitialFilters();
                    setFilters(nextFilters);
                    loadDashboard(nextFilters);
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          displayTransactions.map((transaction) => {
            const form = forms[transaction.id] ?? buildTransactionForm(transaction);
            const transactionBusy = workingTransactionId === transaction.id;
            const anyTransactionBusy = workingTransactionId !== null;
            const categorizationConfidence = getConfidenceMeta(
              transaction.categorization.confidenceScore,
              "categorization"
            );
            const bestSuggestion = transaction.suggestions[0] ?? null;
            const bestSuggestionConfidence = bestSuggestion
              ? getConfidenceMeta(bestSuggestion.score, "match")
              : null;
            const bestSuggestionAmountMeta = bestSuggestion
              ? getSuggestionAmountMeta(transaction, bestSuggestion)
              : null;
            const bestSuggestionDateMeta = bestSuggestion
              ? getSuggestionDateMeta(bestSuggestion)
              : null;
            const transactionStateMeta = getTransactionStateMeta(transaction, bestSuggestion);
            const actionable =
              transaction.status !== "MATCHED" &&
              transaction.status !== "IGNORED" &&
              transaction.status !== "SPLIT";
            const splitTotalMinor = sumSplitLineAmounts(form.splitLines);
            const splitDifferenceMinor = transaction.amountMinor - splitTotalMinor;
            const splitBalanced = splitDifferenceMinor === 0;
            const manualLedgerLabel =
              transaction.type === "DEBIT" ? "Create expense" : "Create income entry";
            const canLinkInvoice = transaction.type === "CREDIT";
            const ledgerMatchOptions = getLedgerOptionsForTransaction(
              transaction,
              form,
              ledgerOptions
            );
            const canLinkLedger = ledgerMatchOptions.length > 0;

            return (
              <Card
                key={transaction.id}
                className={cn("border transition-colors", transactionStateMeta.cardClassName)}
              >
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{transaction.description}</CardTitle>
                        <Badge variant={badgeVariant(transaction.status)}>
                          {statusLabel(transaction.status)}
                        </Badge>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                            transactionStateMeta.badgeClassName
                          )}
                        >
                          {transactionStateMeta.label}
                        </span>
                        {bestSuggestionConfidence ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              bestSuggestionConfidence.className
                            )}
                          >
                            {bestSuggestionConfidence.label}
                          </span>
                        ) : null}
                      </div>
                      <CardDescription>
                        {new Date(transaction.transactionDate).toLocaleDateString()} ·{" "}
                        {transaction.bankAccount.name}
                        {transaction.reference ? ` · Ref ${transaction.reference}` : ""}
                        {transaction.sourceRowNumber ? ` · Row ${transaction.sourceRowNumber}` : ""}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">
                        {formatMoney(transaction.amountMinor, transaction.currency)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {transaction.type}
                        {transaction.balanceAmountMinor !== null
                          ? ` · Balance ${formatMoney(transaction.balanceAmountMinor, transaction.currency)}`
                          : ""}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {actionable ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan/20 bg-primary px-4 py-3 text-white shadow-glow">
                      <div className="space-y-1">
                        {bestSuggestion ? (
                          <>
                            <div className="text-sm font-medium">
                              Best suggestion: {bestSuggestion.target.title}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              {bestSuggestionConfidence ? (
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2 py-0.5 font-medium",
                                    bestSuggestionConfidence.className
                                  )}
                                >
                                  {bestSuggestionConfidence.helper}
                                </span>
                              ) : null}
                              {bestSuggestionAmountMeta ? (
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2 py-0.5 font-medium",
                                    bestSuggestionAmountMeta.className
                                  )}
                                >
                                  {bestSuggestionAmountMeta.label}
                                </span>
                              ) : null}
                              {bestSuggestionDateMeta ? (
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2 py-0.5 font-medium",
                                    bestSuggestionDateMeta.className
                                  )}
                                >
                                  {bestSuggestionDateMeta.label}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-white/70">
                              {bestSuggestion.target.reference
                                ? ` · Ref ${bestSuggestion.target.reference}`
                                : ""}
                              {bestSuggestion.rationale ? ` · ${bestSuggestion.rationale}` : ""}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-medium">No clear match yet</div>
                            <div className="text-xs text-white/70">
                              Reclassify, post manually, ignore, or split this bank line.
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {bestSuggestion ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => approveMatch(transaction.id, bestSuggestion.id)}
                            disabled={!editable || anyTransactionBusy}
                            className="bg-gradient-primary text-white shadow-glow hover:opacity-90"
                          >
                            {transactionBusy ? "Working..." : getSuggestedActionLabel(bestSuggestion)}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={splittingTransactionId === transaction.id ? "secondary" : "outline"}
                          onClick={() =>
                            setSplittingTransactionId((current) =>
                              current === transaction.id ? null : transaction.id
                            )
                          }
                          disabled={!editable || anyTransactionBusy}
                        >
                          {splittingTransactionId === transaction.id ? "Hide split" : "Split"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => runTransactionAction(transaction.id, "ignore")}
                          disabled={!editable || anyTransactionBusy}
                        >
                          Mark ignored
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">AI or heuristic categorization</div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              categorizationConfidence.className
                            )}
                          >
                            {categorizationConfidence.label}
                          </span>
                          <Badge variant="outline">
                            {transaction.categorization.provider === "openai"
                              ? "AI"
                              : "Heuristic"}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          Suggested type:{" "}
                          <span className="font-medium text-foreground">
                            {statusLabel(transaction.categorization.suggestedType)}
                          </span>
                        </div>
                        <div>
                          Counterparty:{" "}
                          <span className="font-medium text-foreground">
                            {transaction.categorization.counterpartyName ?? "Not clear"}
                          </span>
                        </div>
                        <div>
                          Category:{" "}
                          <span className="font-medium text-foreground">
                            {transaction.categorization.suggestedCategoryName ?? "Not set"}
                          </span>
                        </div>
                        <div>
                          VAT:{" "}
                          <span className="font-medium text-foreground">
                            {transaction.categorization.vatRelevance} ({transaction.categorization.suggestedVatTreatment})
                          </span>
                        </div>
                        <div>
                          WHT:{" "}
                          <span className="font-medium text-foreground">
                            {transaction.categorization.whtRelevance} ({transaction.categorization.suggestedWhtTreatment})
                          </span>
                        </div>
                        <div>
                          Confidence:{" "}
                          <span className="font-medium text-foreground">
                            {categorizationConfidence.helper}
                          </span>
                        </div>
                        <div>
                          Meaning:{" "}
                          <span className="font-medium text-foreground">
                            {transaction.categorization.narrationMeaning ?? "No narration summary"}
                          </span>
                        </div>
                      </div>
                      {transaction.approvedMatch ? (
                        <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                          Approved match: {transaction.approvedMatch.target.title}
                          {transaction.approvedMatch.target.reference
                            ? ` · Ref ${transaction.approvedMatch.target.reference}`
                            : ""}
                        </div>
                      ) : null}
                      {transaction.status === "IGNORED" ? (
                        <div className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          This bank transaction has been ignored and will not be posted to the ledger.
                        </div>
                      ) : null}
                      {transaction.splitLines.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Split lines</div>
                          {transaction.splitLines.map((line) => (
                            <div key={line.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                              <div className="font-medium">{line.description}</div>
                              <div className="text-muted-foreground">
                                {formatMoney(line.amountMinor, line.currency)}
                                {line.categoryName ? ` · ${line.categoryName}` : ""}
                                {line.vendorName ? ` · ${line.vendorName}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                      <div className="text-sm font-medium">Reconciliation suggestions</div>
                      {transaction.suggestions.length === 0 ? (
                        <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                          No strong suggestions yet. Reclassify this line, create an expense or
                          ledger entry, link an existing ledger item or invoice, or split it
                          before posting.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {transaction.suggestions.map((suggestion) => {
                            const suggestionConfidenceMeta = getConfidenceMeta(
                              suggestion.score,
                              "match"
                            );
                            const suggestionAmountMeta = getSuggestionAmountMeta(
                              transaction,
                              suggestion
                            );
                            const suggestionDateMeta = getSuggestionDateMeta(suggestion);

                            return (
                              <div
                                key={suggestion.id}
                                className={cn(
                                  "rounded-md border px-3 py-3",
                                  suggestion.id === bestSuggestion?.id
                                    ? "border-emerald-200 bg-emerald-50/60"
                                    : "border-slate-200"
                                )}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-medium">{suggestion.target.title}</div>
                                      <span
                                        className={cn(
                                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                          suggestionConfidenceMeta.className
                                        )}
                                      >
                                        {suggestionConfidenceMeta.label}
                                      </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {suggestion.target.subtitle ?? suggestion.target.kind}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <span
                                        className={cn(
                                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                          suggestionAmountMeta.className
                                        )}
                                      >
                                        {suggestionAmountMeta.label}
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                          suggestionDateMeta.className
                                        )}
                                      >
                                        {suggestionDateMeta.label}
                                      </span>
                                    </div>
                                    {suggestion.target.reference ? (
                                      <div className="text-xs text-muted-foreground">
                                        Reference: {suggestion.target.reference}
                                      </div>
                                    ) : null}
                                    {suggestion.rationale ? (
                                      <div className="text-xs text-muted-foreground">
                                        Why: {suggestion.rationale}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium">
                                      {suggestionConfidenceMeta.helper}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {suggestion.target.amountMinor !== null
                                        ? formatMoney(
                                            suggestion.target.amountMinor,
                                            transaction.currency
                                          )
                                        : "No amount"}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => approveMatch(transaction.id, suggestion.id)}
                                    disabled={!editable || anyTransactionBusy}
                                    className={
                                      suggestion.id === bestSuggestion?.id
                                        ? "bg-gradient-primary text-white shadow-glow hover:opacity-90"
                                        : undefined
                                    }
                                  >
                                    {suggestion.id === bestSuggestion?.id
                                      ? "Accept best match"
                                      : "Approve this match"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {actionable ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-4">
                        <details
                          {...(transaction.suggestions.length === 0 ||
                          transaction.status === "REVIEW_REQUIRED"
                            ? { open: true }
                            : {})}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium">
                            Reclassify and refresh suggestions
                          </summary>
                          <div className="mt-4 space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="grid gap-2">
                                <Label htmlFor={`business-${transaction.id}`}>Client business</Label>
                                <select
                                  id={`business-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.clientBusinessId}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "clientBusinessId", event.target.value)
                                  }
                                  disabled={!editable}
                                >
                                  <option value="">Select business</option>
                                  {clientBusinesses.map((business) => (
                                    <option key={business.id} value={business.id}>
                                      {business.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`type-${transaction.id}`}>Suggested type</Label>
                                <select
                                  id={`type-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.suggestedType}
                                  onChange={(event) =>
                                    updateForm(
                                      transaction.id,
                                      "suggestedType",
                                      event.target.value as SuggestedType
                                    )
                                  }
                                  disabled={!editable}
                                >
                                  {["INCOME", "EXPENSE", "TRANSFER", "OWNER_DRAW", "UNKNOWN"].map((type) => (
                                    <option key={type} value={type}>
                                      {statusLabel(type)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`counterparty-${transaction.id}`}>Counterparty</Label>
                                <Input
                                  id={`counterparty-${transaction.id}`}
                                  value={form.vendorName}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "vendorName", event.target.value)
                                  }
                                  disabled={!editable}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`category-${transaction.id}`}>Category</Label>
                                <Input
                                  id={`category-${transaction.id}`}
                                  value={form.categoryName}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "categoryName", event.target.value)
                                  }
                                  disabled={!editable}
                                  placeholder="Revenue, Operations, Professional fees"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`vat-${transaction.id}`}>VAT treatment</Label>
                                <select
                                  id={`vat-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.vatTreatment}
                                  onChange={(event) =>
                                    updateForm(
                                      transaction.id,
                                      "vatTreatment",
                                      event.target.value as VatTreatment
                                    )
                                  }
                                  disabled={!editable}
                                >
                                  {["NONE", "INPUT", "OUTPUT", "EXEMPT"].map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`wht-${transaction.id}`}>WHT treatment</Label>
                                <select
                                  id={`wht-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.whtTreatment}
                                  onChange={(event) =>
                                    updateForm(
                                      transaction.id,
                                      "whtTreatment",
                                      event.target.value as WhtTreatment
                                    )
                                  }
                                  disabled={!editable}
                                >
                                  {["NONE", "PAYABLE", "RECEIVABLE"].map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor={`notes-${transaction.id}`}>Review notes</Label>
                              <textarea
                                id={`notes-${transaction.id}`}
                                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={form.notes}
                                onChange={(event) =>
                                  updateForm(transaction.id, "notes", event.target.value)
                                }
                                disabled={!editable}
                              />
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                runTransactionAction(transaction.id, "reclassify", {
                                  clientBusinessId: form.clientBusinessId || null,
                                  suggestedType: form.suggestedType,
                                  counterpartyName: form.vendorName,
                                  categoryName: form.categoryName,
                                  vatTreatment: form.vatTreatment,
                                  whtTreatment: form.whtTreatment,
                                  notes: form.notes,
                                })
                              }
                              disabled={!editable || anyTransactionBusy}
                            >
                              {transactionBusy ? "Refreshing..." : "Save classification and refresh"}
                            </Button>
                          </div>
                        </details>

                        <details
                          {...(transaction.suggestions.length === 0 ? { open: true } : {})}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium">
                            Create expense or ledger entry
                          </summary>
                          <div className="mt-4 space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="grid gap-2">
                                <Label htmlFor={`description-${transaction.id}`}>Ledger description</Label>
                                <Input
                                  id={`description-${transaction.id}`}
                                  value={form.description}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "description", event.target.value)
                                  }
                                  disabled={!editable}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`reference-${transaction.id}`}>Reference</Label>
                                <Input
                                  id={`reference-${transaction.id}`}
                                  value={form.reference}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "reference", event.target.value)
                                  }
                                  disabled={!editable}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`vatAmount-${transaction.id}`}>VAT amount</Label>
                                <Input
                                  id={`vatAmount-${transaction.id}`}
                                  value={form.vatAmount}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "vatAmount", event.target.value)
                                  }
                                  disabled={!editable}
                                  placeholder={`Suggested ${transaction.categorization.vatRate}% if relevant`}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`whtAmount-${transaction.id}`}>WHT amount</Label>
                                <Input
                                  id={`whtAmount-${transaction.id}`}
                                  value={form.whtAmount}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "whtAmount", event.target.value)
                                  }
                                  disabled={!editable}
                                  placeholder={`Suggested ${transaction.categorization.whtRate}% if relevant`}
                                />
                              </div>
                            </div>

                            <Button
                              type="button"
                              onClick={() =>
                                runTransactionAction(transaction.id, "create_ledger", {
                                  clientBusinessId: form.clientBusinessId || null,
                                  description: form.description,
                                  reference: form.reference,
                                  vendorName: form.vendorName,
                                  categoryId: form.categoryId || null,
                                  categoryName: form.categoryName,
                                  suggestedType: form.suggestedType,
                                  vatTreatment: form.vatTreatment,
                                  whtTreatment: form.whtTreatment,
                                  vatAmountMinor: inputToMinor(form.vatAmount),
                                  whtAmountMinor: inputToMinor(form.whtAmount),
                                  notes: form.notes,
                                })
                              }
                              disabled={!editable || anyTransactionBusy}
                            >
                              {transactionBusy ? "Posting..." : manualLedgerLabel}
                            </Button>
                          </div>
                        </details>

                        <details
                          {...(bestSuggestion?.matchType === "LEDGER_TRANSACTION"
                            ? { open: true }
                            : {})}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium">
                            Match existing ledger entry
                          </summary>
                          <div className="mt-4 space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="grid gap-2 md:col-span-3">
                                <Label htmlFor={`ledger-search-${transaction.id}`}>Search ledger entries</Label>
                                <Input
                                  id={`ledger-search-${transaction.id}`}
                                  value={form.ledgerSearch}
                                  onChange={(event) =>
                                    updateForm(transaction.id, "ledgerSearch", event.target.value)
                                  }
                                  disabled={!editable}
                                  placeholder="Search by description, reference, business, or review status"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`ledger-amount-filter-${transaction.id}`}>
                                  Amount filter
                                </Label>
                                <select
                                  id={`ledger-amount-filter-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.ledgerAmountFilter}
                                  onChange={(event) =>
                                    updateForm(
                                      transaction.id,
                                      "ledgerAmountFilter",
                                      event.target.value as TransactionForm["ledgerAmountFilter"]
                                    )
                                  }
                                  disabled={!editable}
                                >
                                  <option value="tight">Exact or very close</option>
                                  <option value="standard">Within 2%</option>
                                  <option value="wide">Within 5%</option>
                                  <option value="any">Any amount</option>
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`ledger-date-filter-${transaction.id}`}>
                                  Date filter
                                </Label>
                                <select
                                  id={`ledger-date-filter-${transaction.id}`}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.ledgerDateWindow}
                                  onChange={(event) =>
                                    updateForm(
                                      transaction.id,
                                      "ledgerDateWindow",
                                      event.target.value as TransactionForm["ledgerDateWindow"]
                                    )
                                  }
                                  disabled={!editable}
                                >
                                  <option value="7">Within 7 days</option>
                                  <option value="14">Within 14 days</option>
                                  <option value="30">Within 30 days</option>
                                  <option value="any">Any date</option>
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label>Type filter</Label>
                                <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                                  {transaction.type === "CREDIT" ? "Money in only" : "Money out only"}
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor={`ledger-${transaction.id}`}>Unmatched ledger entry</Label>
                              <select
                                id={`ledger-${transaction.id}`}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={form.ledgerTransactionId}
                                onChange={(event) =>
                                  updateForm(transaction.id, "ledgerTransactionId", event.target.value)
                                }
                                disabled={!editable}
                              >
                                <option value="">Select a ledger entry</option>
                                {ledgerMatchOptions.map((ledgerEntry) => (
                                  <option key={ledgerEntry.id} value={ledgerEntry.id}>
                                    {ledgerEntry.description} · {ledgerEntry.clientBusinessName} ·{" "}
                                    {formatMoney(ledgerEntry.amountMinor, ledgerEntry.currency)} ·{" "}
                                    {new Date(ledgerEntry.transactionDate).toLocaleDateString()}
                                    {ledgerEntry.reference ? ` · Ref ${ledgerEntry.reference}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {ledgerMatchOptions.length > 0 ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    Quick picks
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {ledgerMatchOptions.length} candidate
                                    {ledgerMatchOptions.length === 1 ? "" : "s"} after filters
                                  </div>
                                </div>
                                <div className="grid gap-2">
                                  {ledgerMatchOptions.slice(0, 4).map((ledgerEntry) => {
                                    const amountDeltaMinor =
                                      ledgerEntry.amountMinor - transaction.amountMinor;
                                    const dateDeltaDays = getDateDistanceInDays(
                                      transaction.transactionDate,
                                      ledgerEntry.transactionDate
                                    );
                                    const selected = form.ledgerTransactionId === String(ledgerEntry.id);

                                    return (
                                      <button
                                        key={ledgerEntry.id}
                                        type="button"
                                        onClick={() =>
                                          updateForm(
                                            transaction.id,
                                            "ledgerTransactionId",
                                            String(ledgerEntry.id)
                                          )
                                        }
                                        disabled={!editable}
                                        className={cn(
                                          "rounded-xl border px-3 py-3 text-left transition hover:border-cyan hover:bg-cyan/5",
                                          selected
                                            ? "border-cyan bg-cyan/10 shadow-glow"
                                            : "border-slate-200"
                                        )}
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="space-y-1">
                                            <div className="font-medium">{ledgerEntry.description}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {ledgerEntry.clientBusinessName}
                                              {ledgerEntry.reference ? ` · Ref ${ledgerEntry.reference}` : ""}
                                            </div>
                                          </div>
                                          <div className="text-right text-xs text-muted-foreground">
                                            <div className="font-medium text-foreground">
                                              {formatMoney(ledgerEntry.amountMinor, ledgerEntry.currency)}
                                            </div>
                                            <div>{dateDeltaDays} day{dateDeltaDays === 1 ? "" : "s"} apart</div>
                                          </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900">
                                            {amountDeltaMinor === 0
                                              ? "Exact amount"
                                              : `Delta ${formatMoneyDelta(amountDeltaMinor, ledgerEntry.currency)}`}
                                          </span>
                                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                                            {ledgerEntry.reviewStatus}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}

                            <div className="text-xs text-muted-foreground">
                              Use this when the ledger entry already exists from invoices,
                              receipts, or another posting flow and you only need to reconcile the
                              bank line against it.
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                runTransactionAction(transaction.id, "link_ledger", {
                                  clientBusinessId: form.clientBusinessId || null,
                                  ledgerTransactionId: form.ledgerTransactionId || null,
                                })
                              }
                              disabled={
                                !editable ||
                                anyTransactionBusy ||
                                !canLinkLedger ||
                                !form.ledgerTransactionId
                              }
                            >
                              {transactionBusy ? "Linking..." : "Link ledger entry"}
                            </Button>

                            {!canLinkLedger ? (
                              <div className="text-xs text-amber-700">
                                No unmatched ledger entries fit this transaction yet. Post it
                                manually or refresh the classification first.
                              </div>
                            ) : null}
                          </div>
                        </details>

                        <details
                          {...(bestSuggestion?.matchType === "INVOICE" ? { open: true } : {})}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium">
                            Link invoice
                          </summary>
                          <div className="mt-4 space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor={`invoice-${transaction.id}`}>Open invoice</Label>
                              <select
                                id={`invoice-${transaction.id}`}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={form.invoiceId}
                                onChange={(event) =>
                                  updateForm(transaction.id, "invoiceId", event.target.value)
                                }
                                disabled={!editable}
                              >
                                <option value="">Select an invoice</option>
                                {invoiceOptions.map((invoice) => (
                                  <option key={invoice.id} value={invoice.id}>
                                    {invoice.invoiceNumber} · {invoice.clientName} ·{" "}
                                    {formatMoney(invoice.totalAmount, transaction.currency)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              Linking invoices is available for credit transactions and will post
                              the receipt into revenue while marking the invoice paid.
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                runTransactionAction(transaction.id, "link_invoice", {
                                  clientBusinessId: form.clientBusinessId || null,
                                  invoiceId: form.invoiceId || null,
                                })
                              }
                              disabled={!editable || anyTransactionBusy || !canLinkInvoice || !form.invoiceId}
                            >
                              {transactionBusy ? "Linking..." : "Link invoice"}
                            </Button>

                            {!canLinkInvoice ? (
                              <div className="text-xs text-amber-700">
                                Only credit transactions can be linked directly to invoices.
                              </div>
                            ) : null}
                          </div>
                        </details>
                      </div>

                      {splittingTransactionId === transaction.id ? (
                        <div className="space-y-3 rounded-lg border border-dashed border-slate-300 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">Split transaction</div>
                              <div className="text-xs text-muted-foreground">
                                Allocate the full bank amount across multiple accounting lines.
                              </div>
                            </div>
                            <div
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs font-medium",
                                splitBalanced
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                  : "border-amber-200 bg-amber-50 text-amber-900"
                              )}
                            >
                              Allocated {formatMoney(splitTotalMinor, transaction.currency)} · Remaining{" "}
                              {formatMoney(splitDifferenceMinor, transaction.currency)}
                            </div>
                          </div>

                          {form.splitLines.map((line, index) => (
                            <div
                              key={`${transaction.id}-${index}`}
                              className="grid gap-3 rounded-md border border-slate-200 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm font-medium">Split line {index + 1}</div>
                                {form.splitLines.length > 2 ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeSplitLine(transaction.id, index)}
                                    disabled={!editable || anyTransactionBusy}
                                  >
                                    Remove line
                                  </Button>
                                ) : null}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="grid gap-2">
                                  <Label>Line description</Label>
                                  <Input
                                    value={line.description}
                                    onChange={(event) =>
                                      updateSplitLine(
                                        transaction.id,
                                        index,
                                        "description",
                                        event.target.value
                                      )
                                    }
                                    disabled={!editable}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Line amount</Label>
                                  <Input
                                    value={line.amount}
                                    onChange={(event) =>
                                      updateSplitLine(
                                        transaction.id,
                                        index,
                                        "amount",
                                        event.target.value
                                      )
                                    }
                                    disabled={!editable}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Vendor or counterparty</Label>
                                  <Input
                                    value={line.vendorName}
                                    onChange={(event) =>
                                      updateSplitLine(
                                        transaction.id,
                                        index,
                                        "vendorName",
                                        event.target.value
                                      )
                                    }
                                    disabled={!editable}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Category</Label>
                                  <Input
                                    value={line.categoryName}
                                    onChange={(event) =>
                                      updateSplitLine(
                                        transaction.id,
                                        index,
                                        "categoryName",
                                        event.target.value
                                      )
                                    }
                                    disabled={!editable}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => addSplitLine(transaction, form)}
                              disabled={!editable || anyTransactionBusy}
                            >
                              Add split line
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                runTransactionAction(transaction.id, "split", {
                                  clientBusinessId: form.clientBusinessId || null,
                                  lines: form.splitLines.map((line) => ({
                                    description: line.description,
                                    reference: line.reference,
                                    amountMinor: inputToMinor(line.amount),
                                    vendorName: line.vendorName,
                                    categoryId: line.categoryId || null,
                                    categoryName: line.categoryName,
                                    suggestedType: line.suggestedType,
                                    vatTreatment: line.vatTreatment,
                                    whtTreatment: line.whtTreatment,
                                    vatAmountMinor: inputToMinor(line.vatAmount),
                                    whtAmountMinor: inputToMinor(line.whtAmount),
                                    notes: line.notes,
                                  })),
                                })
                              }
                              disabled={!editable || anyTransactionBusy || !splitBalanced}
                            >
                              {transactionBusy ? "Saving..." : "Save split"}
                            </Button>
                            {!splitBalanced ? (
                              <div className="text-xs text-amber-700">
                                The split total must equal the bank transaction amount before you can save it.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </section>
  );
}
