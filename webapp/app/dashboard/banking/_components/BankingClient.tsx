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

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type BankTransactionStatus =
  | "UNMATCHED"
  | "SUGGESTED"
  | "MATCHED"
  | "IGNORED"
  | "SPLIT"
  | "REVIEW_REQUIRED";
type BankTransactionSource = "CSV_IMPORT" | "MANUAL";
type BankTransactionDirection = "INCOME" | "EXPENSE";

type Account = {
  id: number;
  name: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
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
  source: BankTransactionSource;
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
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
  matchedLedgerEntryId: number | null;
  matchedInvoiceId: number | null;
  categorization: {
    suggestedType: string;
    counterpartyName: string | null;
    suggestedCategoryName: string | null;
    suggestedVatTreatment: string;
    suggestedWhtTreatment: string;
    narrationMeaning: string | null;
    confidenceScore: number | null;
    provider: string | null;
    vatRelevance: string;
    whtRelevance: string;
    vatRate: number;
    whtRate: number;
  };
  approvedMatch: {
    id: number;
    matchType: string;
    status: string;
    score: number;
    rationale: string | null;
    target: {
      title: string;
      subtitle: string | null;
      reference: string | null;
      kind: string;
      linkedId: number | null;
      clientBusinessName: string | null;
    };
  } | null;
  suggestions: Array<{
    id: number;
    matchType: string;
    status: string;
    score: number;
    rationale: string | null;
    target: {
      title: string;
      subtitle: string | null;
      reference: string | null;
      kind: string;
      linkedId: number | null;
      clientBusinessName: string | null;
    };
  }>;
};

type DashboardLoadStatus = "ok" | "error" | "no_workspace";

type DashboardResponse = {
  status: DashboardLoadStatus;
  error: string | null;
  accounts: Account[];
  clientBusinesses: ClientBusiness[];
  imports: ImportHistory[];
  transactions: Transaction[];
  summary: {
    total: number;
    posted: number;
    unmatched: number;
    failed: number;
    byStatus: Record<BankTransactionStatus, number>;
  };
};

type Filters = {
  query: string;
  status: string;
  bankAccountId: string;
  clientBusinessId: string;
  importId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
};

type CreateForm = {
  bankAccountId: string;
  clientBusinessId: string;
  categoryId: string;
  date: string;
  description: string;
  reference: string;
  amount: string;
  currency: string;
  direction: BankTransactionDirection;
  status: "UNMATCHED" | "REVIEW_REQUIRED" | "IGNORED";
  notes: string;
};

type CreateFieldErrors = Partial<
  Record<
    | "bankAccountId"
    | "clientBusinessId"
    | "date"
    | "description"
    | "amount"
    | "currency"
    | "direction"
    | "status"
    | "reference"
    | "notes",
    string
  >
>;

type Props = {
  initialManualDate: string;
  role: Role;
  developmentBillingBypass?: boolean;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "UNMATCHED", label: "Unmatched" },
  { value: "SUGGESTED", label: "Suggested" },
  { value: "MATCHED", label: "Matched" },
  { value: "SPLIT", label: "Split" },
  { value: "REVIEW_REQUIRED", label: "Review required" },
  { value: "IGNORED", label: "Ignored" },
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

function getDirection(transaction: Transaction): BankTransactionDirection {
  return transaction.type === "CREDIT" ? "INCOME" : "EXPENSE";
}

function getSourceLabel(source: BankTransactionSource) {
  return source === "MANUAL" ? "Manual" : "CSV import";
}

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function getStatusBadge(status: BankTransactionStatus) {
  if (status === "MATCHED" || status === "SPLIT") return "secondary" as const;
  if (status === "REVIEW_REQUIRED") return "destructive" as const;
  if (status === "IGNORED") return "outline" as const;
  return "default" as const;
}

function getDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getCreateFormDefaults(initialManualDate = getDateInputValue()): CreateForm {
  return {
    bankAccountId: "",
    clientBusinessId: "",
    categoryId: "",
    date: initialManualDate,
    description: "",
    reference: "",
    amount: "",
    currency: "NGN",
    direction: "EXPENSE",
    status: "UNMATCHED",
    notes: "",
  };
}

function getFilterDefaults(): Filters {
  return {
    query: "",
    status: "",
    bankAccountId: "",
    clientBusinessId: "",
    importId: "",
    categoryId: "",
    dateFrom: "",
    dateTo: "",
  };
}

function buildQueryString(filters: Filters) {
  const params = new URLSearchParams();

  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  if (filters.clientBusinessId) params.set("clientBusinessId", filters.clientBusinessId);
  if (filters.importId) params.set("importId", filters.importId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  return params.toString();
}

function hasActiveFilters(filters: Filters) {
  return Boolean(buildQueryString(filters));
}

function summarizeImports(imports: ImportHistory[]) {
  return imports.reduce(
    (summary, current) => ({
      importedCount: summary.importedCount + current.importedCount,
      duplicateCount: summary.duplicateCount + current.duplicateCount,
      failedCount: summary.failedCount + current.failedCount,
    }),
    {
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
    }
  );
}

function flattenCategories(clientBusinesses: ClientBusiness[]) {
  return clientBusinesses.flatMap((business) =>
    business.categories.map((category) => ({
      ...category,
      clientBusinessId: business.id,
      clientBusinessName: business.name,
    }))
  );
}

function scrollToManualTransactionForm() {
  document
    .getElementById("manual-transaction-form")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function BankingClient({
  initialManualDate,
  role,
  developmentBillingBypass = false,
}: Props) {
  const editable = canEdit(role);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => getFilterDefaults());
  const [createForm, setCreateForm] = useState<CreateForm>(() =>
    getCreateFormDefaults(initialManualDate)
  );
  const [createFieldErrors, setCreateFieldErrors] = useState<CreateFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);

  async function loadTransactions(activeFilters = filters) {
    setLoading(true);
    setError(null);

    try {
      const query = buildQueryString(activeFilters);
      const response = await fetch(
        `/api/banking/transactions${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as DashboardResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load transactions.");
      }

      setDashboard(data);
      setError(data.status === "error" ? data.error ?? "Failed to load transactions." : null);

      if (!createForm.clientBusinessId && data.clientBusinesses.length === 1) {
        const business = data.clientBusinesses[0];
        setCreateForm((current) => ({
          ...current,
          clientBusinessId: String(business.id),
          currency: business.defaultCurrency,
        }));
      }

      if (!createForm.bankAccountId && data.accounts.length === 1) {
        setCreateForm((current) => ({
          ...current,
          bankAccountId: String(data.accounts[0].id),
          currency: data.accounts[0].currency,
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transactions = dashboard?.transactions ?? [];
  const accounts = dashboard?.accounts ?? [];
  const clientBusinesses = dashboard?.clientBusinesses ?? [];
  const imports = dashboard?.imports ?? [];
  const dashboardStatus = dashboard?.status ?? "ok";
  const categoryOptions = flattenCategories(clientBusinesses);
  const selectedTransaction =
    selectedTransactionId === null
      ? null
      : transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;

  const filteredAccountOptions = createForm.clientBusinessId
    ? accounts.filter((account) =>
        String(account.clientBusinessId ?? "") === createForm.clientBusinessId
      )
    : accounts;

  const filteredCategoryOptions = createForm.clientBusinessId
    ? categoryOptions.filter(
        (category) => String(category.clientBusinessId) === createForm.clientBusinessId
      )
    : categoryOptions;

  const importSummary = summarizeImports(imports);
  const manualCount = transactions.filter((transaction) => transaction.source === "MANUAL").length;
  const importedCount = transactions.filter(
    (transaction) => transaction.source === "CSV_IMPORT"
  ).length;
  const uncategorizedCount = transactions.filter((transaction) => !transaction.category).length;
  const hasFilters = hasActiveFilters(filters);
  const showTransactionsEmptyState =
    !loading && dashboardStatus !== "error" && transactions.length === 0;
  const showWorkspaceEmptyState = showTransactionsEmptyState && !hasFilters;

  async function submitManualTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || submitting) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);
    setCreateFieldErrors({});

    try {
      const response = await fetch("/api/banking/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...createForm,
          categoryId: createForm.categoryId || null,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        fieldErrors?: CreateFieldErrors;
        transactionId?: number;
      };

      if (!response.ok) {
        setCreateFieldErrors(data.fieldErrors ?? {});
        throw new Error(data.error ?? "Failed to create transaction.");
      }

      setCreateForm((current) => ({
        ...getCreateFormDefaults(getDateInputValue()),
        clientBusinessId: current.clientBusinessId,
        bankAccountId: current.bankAccountId,
        currency: current.currency,
      }));
      setMessage("Manual transaction created.");
      await loadTransactions(filters);
      if (typeof data.transactionId === "number") {
        setSelectedTransactionId(data.transactionId);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Transaction Engine</h1>
          <p className="text-muted-foreground">
            Import bank activity into the active workspace, add manual transactions, and review
            everything before deeper reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Active workspace scoped</Badge>
          {dashboardStatus === "no_workspace" ? (
            <Badge variant="outline">No workspace</Badge>
          ) : null}
          {showWorkspaceEmptyState ? <Badge variant="outline">No data yet</Badge> : null}
          {developmentBillingBypass ? (
            <Badge variant="outline">Development billing bypass</Badge>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/dashboard/banking/review">Open review queue</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/banking/reconcile">Open CSV importer</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
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
            <CardDescription className="text-white/70">Visible transactions</CardDescription>
            <CardTitle className="text-2xl">{dashboard?.summary.total ?? 0}</CardTitle>
            <p className="text-sm text-white/70">Filtered to the active workspace only.</p>
          </CardHeader>
        </Card>
        <Card className="border-cyan/30 bg-cyan/10">
          <CardHeader className="pb-2">
            <CardDescription>Manual vs imported</CardDescription>
            <CardTitle className="text-2xl text-primary">
              {manualCount} / {importedCount}
            </CardTitle>
            <p className="text-sm text-primary/80">Manual first, imported from CSV second.</p>
          </CardHeader>
        </Card>
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Uncategorized</CardDescription>
            <CardTitle className="text-2xl text-amber-950">{uncategorizedCount}</CardTitle>
            <p className="text-sm text-amber-900/80">
              Transactions still waiting for a saved category assignment.
            </p>
          </CardHeader>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Import rollup</CardDescription>
            <CardTitle className="text-2xl text-emerald-950">
              {importSummary.importedCount}
            </CardTitle>
            <p className="text-sm text-emerald-900/80">
              Imported with {importSummary.duplicateCount} duplicates skipped and{" "}
              {importSummary.failedCount} failed rows.
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Statement imports</CardTitle>
            <CardDescription>
              Bring in a bank CSV, skip duplicates, then review transactions before posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/banking/review">Review imported transactions</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/banking/reconcile">Import bank statement</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs/sample-bank-statement.csv">Download sample CSV</Link>
              </Button>
            </div>

            {imports.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                No statements imported yet. Import a CSV to start the review queue for this
                workspace.
              </div>
            ) : (
              <div className="space-y-3">
                {imports.slice(0, 4).map((statementImport) => (
                  <div key={statementImport.id} className="rounded-md border px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{statementImport.fileName}</div>
                        <div className="text-sm text-muted-foreground">
                          {statementImport.bankAccount.accountName}
                          {statementImport.clientBusiness
                            ? ` · ${statementImport.clientBusiness.name}`
                            : ""}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {getStatusLabel(statementImport.status)}
                      </Badge>
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

        <Card id="manual-transaction-form">
          <CardHeader>
            <CardTitle>Manual transaction</CardTitle>
            <CardDescription>
              Add a workspace-scoped bank transaction when the source row is missing or needs to
              be captured before the next statement import.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitManualTransaction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="manual-business">Client business</Label>
                <select
                  id="manual-business"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={createForm.clientBusinessId}
                  onChange={(event) => {
                    const nextBusinessId = event.target.value;
                    const business = clientBusinesses.find(
                      (entry) => String(entry.id) === nextBusinessId
                    );
                    setCreateForm((current) => ({
                      ...current,
                      clientBusinessId: nextBusinessId,
                      categoryId: "",
                      currency: business?.defaultCurrency ?? current.currency,
                    }));
                  }}
                  disabled={!editable || clientBusinesses.length === 0}
                >
                  <option value="">Select a business</option>
                  {clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
                {createFieldErrors.clientBusinessId ? (
                  <p className="text-sm text-rose-600">{createFieldErrors.clientBusinessId}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="manual-account">Bank account</Label>
                <select
                  id="manual-account"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={createForm.bankAccountId}
                  onChange={(event) => {
                    const nextAccountId = event.target.value;
                    const account = accounts.find(
                      (entry) => String(entry.id) === nextAccountId
                    );
                    setCreateForm((current) => ({
                      ...current,
                      bankAccountId: nextAccountId,
                      currency: account?.currency ?? current.currency,
                    }));
                  }}
                  disabled={!editable || accounts.length === 0}
                >
                  <option value="">Select an account</option>
                  {filteredAccountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} · {account.bankName}
                    </option>
                  ))}
                </select>
                {createFieldErrors.bankAccountId ? (
                  <p className="text-sm text-rose-600">{createFieldErrors.bankAccountId}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="manual-date">Date</Label>
                  <Input
                    id="manual-date"
                    type="date"
                    value={createForm.date}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, date: event.target.value }))
                    }
                    disabled={!editable}
                  />
                  {createFieldErrors.date ? (
                    <p className="text-sm text-rose-600">{createFieldErrors.date}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual-amount">Amount</Label>
                  <Input
                    id="manual-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={createForm.amount}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    disabled={!editable}
                  />
                  {createFieldErrors.amount ? (
                    <p className="text-sm text-rose-600">{createFieldErrors.amount}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="manual-description">Description</Label>
                <Input
                  id="manual-description"
                  placeholder="Customer transfer for March bookkeeping retainer"
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={!editable}
                />
                {createFieldErrors.description ? (
                  <p className="text-sm text-rose-600">{createFieldErrors.description}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="manual-reference">Reference</Label>
                  <Input
                    id="manual-reference"
                    placeholder="NIP-2049385"
                    value={createForm.reference}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        reference: event.target.value,
                      }))
                    }
                    disabled={!editable}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual-currency">Currency</Label>
                  <Input
                    id="manual-currency"
                    value={createForm.currency}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    disabled={!editable}
                  />
                  {createFieldErrors.currency ? (
                    <p className="text-sm text-rose-600">{createFieldErrors.currency}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="manual-direction">Direction</Label>
                  <select
                    id="manual-direction"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.direction}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        direction: event.target.value as BankTransactionDirection,
                      }))
                    }
                    disabled={!editable}
                  >
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual-status">Status</Label>
                  <select
                    id="manual-status"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        status: event.target.value as CreateForm["status"],
                      }))
                    }
                    disabled={!editable}
                  >
                    <option value="UNMATCHED">Unmatched</option>
                    <option value="REVIEW_REQUIRED">Review required</option>
                    <option value="IGNORED">Ignored</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual-category">Category</Label>
                  <select
                    id="manual-category"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.categoryId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                    disabled={!editable || filteredCategoryOptions.length === 0}
                  >
                    <option value="">No category</option>
                    {filteredCategoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} · {category.type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="manual-notes">Notes</Label>
                <textarea
                  id="manual-notes"
                  rows={3}
                  value={createForm.notes}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  disabled={!editable}
                  className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Optional review note for later reconciliation."
                />
              </div>

              <Button
                type="submit"
                disabled={!editable || submitting || accounts.length === 0 || clientBusinesses.length === 0}
              >
                {submitting ? "Saving..." : "Create manual transaction"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction list</CardTitle>
          <CardDescription>
            Filter by status, category, date range, account, import batch, or search terms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-4 xl:grid-cols-8">
            <div className="grid gap-2 xl:col-span-2">
              <Label htmlFor="filter-query">Search</Label>
              <Input
                id="filter-query"
                value={filters.query}
                placeholder="Description, reference, counterparty"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, query: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filter-status">Status</Label>
              <select
                id="filter-status"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filter-business">Business</Label>
              <select
                id="filter-business"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.clientBusinessId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    clientBusinessId: event.target.value,
                    categoryId:
                      current.categoryId &&
                      !categoryOptions.some(
                        (category) =>
                          String(category.id) === current.categoryId &&
                          String(category.clientBusinessId) === event.target.value
                      )
                        ? ""
                        : current.categoryId,
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
              <Label htmlFor="filter-account">Account</Label>
              <select
                id="filter-account"
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
              <Label htmlFor="filter-category">Category</Label>
              <select
                id="filter-category"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.categoryId}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, categoryId: event.target.value }))
                }
              >
                <option value="">All categories</option>
                {categoryOptions
                  .filter(
                    (category) =>
                      !filters.clientBusinessId ||
                      String(category.clientBusinessId) === filters.clientBusinessId
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filter-date-from">Date from</Label>
              <Input
                id="filter-date-from"
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, dateFrom: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filter-date-to">Date to</Label>
              <Input
                id="filter-date-to"
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, dateTo: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => loadTransactions(filters)}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const nextFilters = getFilterDefaults();
                setFilters(nextFilters);
                loadTransactions(nextFilters);
              }}
            >
              Clear filters
            </Button>
          </div>

          {loading ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Loading transactions...
            </div>
          ) : dashboardStatus === "error" ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Transaction data is temporarily unavailable. Reload the page to try again.
            </div>
          ) : showTransactionsEmptyState ? (
            hasFilters ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No transactions match these filters. Clear filters or add another transaction.
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-8">
                <div className="space-y-2">
                  <div className="text-base font-medium text-foreground">No transactions yet</div>
                  <p className="text-sm text-muted-foreground">
                    Import a bank statement or add a manual transaction to get started.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/dashboard/banking/reconcile">Import bank statement</Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={scrollToManualTransactionForm}>
                    Add manual transaction
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Direction</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">View</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const direction = getDirection(transaction);
                    return (
                      <tr key={transaction.id} className="border-t">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(transaction.transactionDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {transaction.description}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {transaction.reference
                              ? `Ref ${transaction.reference}`
                              : "No reference"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{transaction.bankAccount.accountName}</div>
                          <div className="text-xs text-muted-foreground">
                            {transaction.clientBusiness?.name ?? "No business"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              direction === "INCOME"
                                ? "bg-emerald-50 text-emerald-900"
                                : "bg-amber-50 text-amber-900"
                            )}
                          >
                            {direction === "INCOME" ? "Money In" : "Money Out"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {transaction.category?.name ?? "Unassigned"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusBadge(transaction.status)}>
                            {getStatusLabel(transaction.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {getSourceLabel(transaction.source)}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-medium whitespace-nowrap",
                            direction === "INCOME" ? "text-emerald-700" : "text-amber-700"
                          )}
                        >
                          {formatMoney(transaction.amountMinor, transaction.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTransactionId(transaction.id)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={selectedTransaction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransactionId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedTransaction ? (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selectedTransaction.description}</SheetTitle>
                <SheetDescription>
                  {formatDate(selectedTransaction.transactionDate)} ·{" "}
                  {selectedTransaction.bankAccount.accountName} ·{" "}
                  {formatMoney(selectedTransaction.amountMinor, selectedTransaction.currency)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getStatusBadge(selectedTransaction.status)}>
                    {getStatusLabel(selectedTransaction.status)}
                  </Badge>
                  <Badge variant="outline">{getSourceLabel(selectedTransaction.source)}</Badge>
                  <Badge variant="outline">
                    {getDirection(selectedTransaction) === "INCOME" ? "Income" : "Expense"}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Transaction details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      <div>Date: {formatDate(selectedTransaction.transactionDate)}</div>
                      <div>Reference: {selectedTransaction.reference ?? "Not provided"}</div>
                      <div>Currency: {selectedTransaction.currency}</div>
                      <div>
                        Category: {selectedTransaction.category?.name ?? "Unassigned"}
                      </div>
                      <div>
                        Row source:{" "}
                        {selectedTransaction.sourceRowNumber
                          ? `CSV row ${selectedTransaction.sourceRowNumber}`
                          : "Manual entry"}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Workspace scope</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      <div>Business: {selectedTransaction.clientBusiness?.name ?? "Not linked"}</div>
                      <div>Account: {selectedTransaction.bankAccount.accountName}</div>
                      <div>Bank: {selectedTransaction.bankAccount.bankName}</div>
                      <div>
                        Account number: {selectedTransaction.bankAccount.accountNumber}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Categorization signals</CardTitle>
                    <CardDescription>
                      Ready for later AI categorization and reconciliation improvements.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <div>
                      Suggested type: {getStatusLabel(selectedTransaction.categorization.suggestedType)}
                    </div>
                    <div>
                      Suggested category:{" "}
                      {selectedTransaction.categorization.suggestedCategoryName ?? "Not suggested"}
                    </div>
                    <div>
                      Counterparty:{" "}
                      {selectedTransaction.categorization.counterpartyName ?? "Not identified"}
                    </div>
                    <div>
                      Confidence:{" "}
                      {typeof selectedTransaction.categorization.confidenceScore === "number"
                        ? `${Math.round(selectedTransaction.categorization.confidenceScore * 100)}%`
                        : "Not scored"}
                    </div>
                    <div>
                      Provider: {selectedTransaction.categorization.provider ?? "Not available"}
                    </div>
                    <div>
                      Meaning:{" "}
                      {selectedTransaction.categorization.narrationMeaning ?? "No explanation yet"}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Reconciliation status</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <div>
                      Matched ledger entry:{" "}
                      {selectedTransaction.matchedLedgerEntryId ?? "Not linked"}
                    </div>
                    <div>
                      Matched invoice: {selectedTransaction.matchedInvoiceId ?? "Not linked"}
                    </div>
                    <div>
                      Approved match:{" "}
                      {selectedTransaction.approvedMatch
                        ? selectedTransaction.approvedMatch.target.title
                        : "None approved"}
                    </div>
                    <div>
                      Suggestions available: {selectedTransaction.suggestions.length}
                    </div>
                    {selectedTransaction.statementImport ? (
                      <div>
                        Import batch: {selectedTransaction.statementImport.fileName} (
                        {getStatusLabel(selectedTransaction.statementImport.status)})
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {selectedTransaction.reviewNotes ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Review notes</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {selectedTransaction.reviewNotes}
                    </CardContent>
                  </Card>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/dashboard/banking/reconcile">Open in reconcile</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
