"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  Landmark,
  RefreshCw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
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
import type { TransactionTaxPeriodPreset, TransactionTaxSummary } from "@/lib/transaction-tax";
import {
  TransactionTaxDrilldownTable,
  TransactionTaxFutureModulesCard,
  TransactionTaxLiabilityExplanationCards,
  TransactionTaxSummaryTable,
} from "./TransactionTaxTables";

export type TransactionTaxCenterFilters = {
  query: string;
  reviewStatus: string;
  clientBusinessId: string;
  bankAccountId: string;
  categoryId: string;
  periodPreset: TransactionTaxPeriodPreset;
  dateFrom: string;
  dateTo: string;
};

const PERIOD_PRESET_OPTIONS: Array<{
  value: TransactionTaxPeriodPreset;
  label: string;
}> = [
  { value: "CURRENT_MONTH", label: "Current month" },
  { value: "PREVIOUS_MONTH", label: "Previous month" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "CURRENT_QUARTER", label: "Current quarter" },
  { value: "YEAR_TO_DATE", label: "Year to date" },
  { value: "CUSTOM", label: "Custom range" },
];

const REVIEW_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All review states" },
  { value: "IMPORTED", label: "Imported" },
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "POSTED", label: "Posted" },
  { value: "FLAGGED", label: "Flagged" },
];

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getPeriodPresetRange(preset: TransactionTaxPeriodPreset, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (preset) {
    case "PREVIOUS_MONTH": {
      const dateFrom = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const dateTo = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      return { dateFrom, dateTo };
    }
    case "LAST_30_DAYS": {
      const dateTo = new Date(Date.UTC(year, month, now.getUTCDate(), 23, 59, 59, 999));
      const dateFrom = new Date(dateTo.getTime() - 29 * 24 * 60 * 60 * 1000);
      dateFrom.setUTCHours(0, 0, 0, 0);
      return { dateFrom, dateTo };
    }
    case "CURRENT_QUARTER": {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const dateFrom = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0));
      const dateTo = new Date(Date.UTC(year, quarterStartMonth + 3, 0, 23, 59, 59, 999));
      return { dateFrom, dateTo };
    }
    case "YEAR_TO_DATE": {
      const dateFrom = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const dateTo = new Date(Date.UTC(year, month, now.getUTCDate(), 23, 59, 59, 999));
      return { dateFrom, dateTo };
    }
    case "CUSTOM":
      return { dateFrom: null, dateTo: null };
    case "CURRENT_MONTH":
    default: {
      const dateFrom = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const dateTo = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
      return { dateFrom, dateTo };
    }
  }
}

function buildDefaultFilters(): TransactionTaxCenterFilters {
  const currentMonth = getPeriodPresetRange("CURRENT_MONTH");

  return {
    query: "",
    reviewStatus: "",
    clientBusinessId: "",
    bankAccountId: "",
    categoryId: "",
    periodPreset: "CURRENT_MONTH",
    dateFrom: currentMonth.dateFrom ? toDateInputValue(currentMonth.dateFrom) : "",
    dateTo: currentMonth.dateTo ? toDateInputValue(currentMonth.dateTo) : "",
  };
}

function buildQueryString(filters: TransactionTaxCenterFilters) {
  const params = new URLSearchParams();

  if (filters.query) params.set("query", filters.query);
  if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  if (filters.clientBusinessId) params.set("clientBusinessId", filters.clientBusinessId);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.periodPreset) params.set("periodPreset", filters.periodPreset);

  if (filters.periodPreset === "CUSTOM") {
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  }

  return params.toString();
}

function isDefaultFilterState(filters: TransactionTaxCenterFilters) {
  const defaults = buildDefaultFilters();

  return (
    filters.query === defaults.query &&
    filters.reviewStatus === defaults.reviewStatus &&
    filters.clientBusinessId === defaults.clientBusinessId &&
    filters.bankAccountId === defaults.bankAccountId &&
    filters.categoryId === defaults.categoryId &&
    filters.periodPreset === defaults.periodPreset &&
    filters.dateFrom === defaults.dateFrom &&
    filters.dateTo === defaults.dateTo
  );
}

function TaxStatCard({
  label,
  value,
  description,
  accentClassName,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  accentClassName: string;
  icon: typeof BadgePercent;
}) {
  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{label}</CardDescription>
          <div className={`flex size-10 items-center justify-center rounded-2xl ${accentClassName}`}>
            <Icon className="size-5" />
          </div>
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function TransactionTaxCenterClient({
  workspaceName,
  initialSummary,
  initialFilters,
}: {
  workspaceName: string;
  initialSummary: TransactionTaxSummary;
  initialFilters: TransactionTaxCenterFilters;
}) {
  const pathname = usePathname();
  const [summary, setSummary] = useState(initialSummary);
  const [filters, setFilters] = useState<TransactionTaxCenterFilters>(initialFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSummary(
    nextFilters: TransactionTaxCenterFilters,
    options?: {
      silent?: boolean;
      syncUrl?: boolean;
    }
  ) {
    const silent = Boolean(options?.silent);

    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const query = buildQueryString(nextFilters);
      const response = await fetch(`/api/tax/summary${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as TransactionTaxSummary & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refresh the tax liability center.");
      }

      startTransition(() => {
        setSummary(payload);
        setError(null);
      });

      if (options?.syncUrl && typeof window !== "undefined") {
        const href = query ? `${pathname}?${query}` : pathname;
        window.history.replaceState(null, "", href);
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the tax liability center."
      );
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }

  const refreshSummaryOnInterval = useEffectEvent(
    async (
      nextFilters: TransactionTaxCenterFilters,
      options?: {
        silent?: boolean;
        syncUrl?: boolean;
      }
    ) => {
      await refreshSummary(nextFilters, options);
    }
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSummaryOnInterval(filters, { silent: true });
    }, summary.liability.refreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [filters, summary.liability.refreshIntervalMs]);

  useEffect(() => {
    function refreshOnVisibility() {
      if (document.visibilityState === "visible") {
        void refreshSummaryOnInterval(filters, { silent: true });
      }
    }

    window.addEventListener("focus", refreshOnVisibility);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      window.removeEventListener("focus", refreshOnVisibility);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [filters]);

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshSummary(filters, { syncUrl: true });
  }

  async function handleResetFilters() {
    const nextFilters = buildDefaultFilters();
    setFilters(nextFilters);
    await refreshSummary(nextFilters, { syncUrl: true });
  }

  function handlePeriodPresetChange(value: TransactionTaxPeriodPreset) {
    if (value === "CUSTOM") {
      setFilters((current) => ({
        ...current,
        periodPreset: value,
      }));
      return;
    }

    const range = getPeriodPresetRange(value);
    setFilters((current) => ({
      ...current,
      periodPreset: value,
      dateFrom: range.dateFrom ? toDateInputValue(range.dateFrom) : "",
      dateTo: range.dateTo ? toDateInputValue(range.dateTo) : "",
    }));
  }

  const activeFilters = !isDefaultFilterState(filters);

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-primary p-6 text-white shadow-glow">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                Real-time liability
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                {workspaceName}
              </Badge>
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                Nigeria VAT + WHT
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Tax Liability Center</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Live VAT and WHT payable values update from transaction tax treatments, explain
                what changed, and trace every liability movement back to the source transaction.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-white/70">
              <span>Last updated {formatDateTime(summary.liability.refreshedAt)}</span>
              <span>Selected period {summary.scope.dateLabel}</span>
              <span>{summary.totalMatchingTransactions} matching transactions</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {error ? (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {error}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              onClick={() => {
                void refreshSummary(filters);
              }}
              disabled={isRefreshing}
            >
              <RefreshCw className="size-4" />
              {isRefreshing ? "Refreshing..." : "Refresh now"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/dashboard/banking/review">
                Open review queue
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TaxStatCard
          label="Current VAT due"
          value={formatMoney(summary.liability.vatDueMinor, summary.currency)}
          description={summary.explanations.taxes.find((item) => item.taxType === "VAT")?.summary ??
            `VAT due for ${summary.scope.dateLabel}.`}
          icon={BadgePercent}
          accentClassName="bg-amber-100 text-amber-900"
        />
        <TaxStatCard
          label="Current WHT due"
          value={formatMoney(summary.liability.whtDueMinor, summary.currency)}
          description={summary.explanations.taxes.find((item) => item.taxType === "WHT")?.summary ??
            `WHT due for ${summary.scope.dateLabel}.`}
          icon={Landmark}
          accentClassName="bg-emerald-100 text-emerald-900"
        />
        <TaxStatCard
          label="Total live tax due"
          value={formatMoney(summary.liability.totalDueMinor, summary.currency)}
          description={`Transaction-derived payable balance for ${summary.scope.dateLabel}. Export-ready response shapes stay aligned with this total.`}
          icon={ShieldCheck}
          accentClassName="bg-primary/10 text-primary"
        />
        <TaxStatCard
          label="Refresh cadence"
          value={`${Math.round(summary.liability.refreshIntervalMs / 1000)}s`}
          description="The center silently recomputes from workspace transactions and refreshes again when the tab regains focus."
          icon={TimerReset}
          accentClassName="bg-sky-100 text-sky-900"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Slice VAT and WHT by review state, business, bank account, category, or period while
            keeping the center scoped to the active workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleApplyFilters}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="tax-center-query">Search</Label>
                <Input
                  id="tax-center-query"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder="Description, reference, account, business, or category"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-review-status">Review status</Label>
                <select
                  id="tax-center-review-status"
                  value={filters.reviewStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      reviewStatus: event.target.value,
                    }))
                  }
                  className={selectClassName}
                >
                  {REVIEW_STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-business">Client business</Label>
                <select
                  id="tax-center-business"
                  value={filters.clientBusinessId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      clientBusinessId: event.target.value,
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="">All businesses</option>
                  {summary.options.clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-bank-account">Bank account</Label>
                <select
                  id="tax-center-bank-account"
                  value={filters.bankAccountId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      bankAccountId: event.target.value,
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="">All bank accounts</option>
                  {summary.options.bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-category">Category</Label>
                <select
                  id="tax-center-category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="">All categories</option>
                  {summary.options.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.clientBusinessName} · {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-period-preset">Period</Label>
                <select
                  id="tax-center-period-preset"
                  value={filters.periodPreset}
                  onChange={(event) =>
                    handlePeriodPresetChange(event.target.value as TransactionTaxPeriodPreset)
                  }
                  className={selectClassName}
                >
                  {PERIOD_PRESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-date-from">Date from</Label>
                <Input
                  id="tax-center-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      periodPreset: "CUSTOM",
                      dateFrom: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-center-date-to">Date to</Label>
                <Input
                  id="tax-center-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      periodPreset: "CUSTOM",
                      dateTo: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Apply filters"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isRefreshing || !activeFilters}
                onClick={() => {
                  void handleResetFilters();
                }}
              >
                Reset to current month
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isRefreshing}
                onClick={() => {
                  const nextFilters = {
                    ...filters,
                    reviewStatus: "PENDING_REVIEW",
                  } satisfies TransactionTaxCenterFilters;
                  setFilters(nextFilters);
                  void refreshSummary(nextFilters, { syncUrl: true });
                }}
              >
                Pending review only
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <TransactionTaxLiabilityExplanationCards
        explanations={summary.explanations.taxes}
        currency={summary.currency}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <TransactionTaxSummaryTable
          title="VAT summary"
          description={`Output, input, and exempt VAT buckets for ${summary.scope.dateLabel}.`}
          rows={summary.vat.rows}
          currency={summary.currency}
        />
        <TransactionTaxSummaryTable
          title="WHT summary"
          description={`Payable and receivable WHT buckets for ${summary.scope.dateLabel}.`}
          rows={summary.wht.rows}
          currency={summary.currency}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <TransactionTaxDrilldownTable rows={summary.transactions} />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scope snapshot</CardTitle>
              <CardDescription>
                Quick context for the live response shape that powers exports and downstream tax
                modules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Response mode
                </div>
                <div className="mt-1 font-medium">{summary.liability.mode}</div>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Comparison window
                </div>
                <div className="mt-1 font-medium">
                  {summary.explanations.comparisonDateLabel ?? "Not available for this filter set"}
                </div>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Source traceability
                </div>
                <div className="mt-1 text-muted-foreground">
                  Each drill-down row points back to the originating bank transaction so review,
                  posting readiness, and future PAYE or CIT layers can reuse the same source chain.
                </div>
              </div>
            </CardContent>
          </Card>

          <TransactionTaxFutureModulesCard items={summary.explanations.futureModules} />
        </div>
      </div>
    </section>
  );
}
