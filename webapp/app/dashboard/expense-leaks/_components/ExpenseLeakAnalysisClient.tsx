"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
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
import { useOfflineSync } from "@/app/dashboard/_components/OfflineSyncProvider";
import {
  EXPENSE_LEAK_FINDING_SEVERITIES,
  EXPENSE_LEAK_FINDING_STATUSES,
  EXPENSE_LEAK_FINDING_TYPES,
  type ExpenseLeakCenterResponse,
  type ExpenseLeakFindingListItem,
} from "@/lib/expense-leak-types";
import { formatDashboardCurrency } from "@/lib/dashboard-formatting";
import {
  ExpenseLeakSeverityBadge,
  ExpenseLeakStatusBadge,
  ExpenseLeakTypeBadge,
} from "@/app/dashboard/_components/ExpenseLeakBadges";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type Filters = {
  query: string;
  status: string;
  severity: string;
  type: string;
};

type Props = {
  role: Role;
  workspaceId: number;
  initialData: ExpenseLeakCenterResponse;
};

const FILTER_DEFAULTS: Filters = {
  query: "",
  status: "",
  severity: "",
  type: "",
};

function canManageFindings(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
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

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function SummaryStat({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="rounded-2xl border border-cyan/10 bg-slate-50 shadow-none">
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
    </Card>
  );
}

function FilterSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FindingActionButtons({
  finding,
  editable,
  busy,
  onUpdateStatus,
}: {
  finding: ExpenseLeakFindingListItem;
  editable: boolean;
  busy: boolean;
  onUpdateStatus: (
    finding: ExpenseLeakFindingListItem,
    status: "OPEN" | "DISMISSED" | "RESOLVED"
  ) => Promise<void>;
}) {
  if (!editable) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {finding.status !== "RESOLVED" ? (
        <Button
          size="sm"
          onClick={() => onUpdateStatus(finding, "RESOLVED")}
          disabled={busy}
        >
          Resolve
        </Button>
      ) : null}
      {finding.status !== "DISMISSED" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdateStatus(finding, "DISMISSED")}
          disabled={busy}
        >
          Dismiss
        </Button>
      ) : null}
      {finding.status !== "OPEN" ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onUpdateStatus(finding, "OPEN")}
          disabled={busy}
        >
          Reopen
        </Button>
      ) : null}
    </div>
  );
}

export default function ExpenseLeakAnalysisClient({
  role,
  workspaceId,
  initialData,
}: Props) {
  const editable = canManageFindings(role);
  const { snapshot, submitAction } = useOfflineSync();
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyFindingId, setBusyFindingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyFindingStatusLocally(
    current: ExpenseLeakCenterResponse,
    findingId: number,
    status: "OPEN" | "DISMISSED" | "RESOLVED"
  ) {
    const target = current.findings.find((finding) => finding.id === findingId);
    if (!target || target.status === status) {
      return current;
    }

    const nextTimestamp = new Date().toISOString();
    let openCount = current.summary.openCount;
    let dismissedCount = current.summary.dismissedCount;
    let resolvedCount = current.summary.resolvedCount;
    let criticalOpenCount = current.summary.criticalOpenCount;
    let warningOpenCount = current.summary.warningOpenCount;
    let infoOpenCount = current.summary.infoOpenCount;
    let openEstimatedSavingsMinor = current.summary.openEstimatedSavingsMinor;

    if (target.status === "OPEN") {
      openCount -= 1;
      openEstimatedSavingsMinor -= target.estimatedSavingsMinor;
      if (target.severity === "CRITICAL") criticalOpenCount -= 1;
      if (target.severity === "WARNING") warningOpenCount -= 1;
      if (target.severity === "INFO") infoOpenCount -= 1;
    } else if (target.status === "DISMISSED") {
      dismissedCount -= 1;
    } else {
      resolvedCount -= 1;
    }

    if (status === "OPEN") {
      openCount += 1;
      openEstimatedSavingsMinor += target.estimatedSavingsMinor;
      if (target.severity === "CRITICAL") criticalOpenCount += 1;
      if (target.severity === "WARNING") warningOpenCount += 1;
      if (target.severity === "INFO") infoOpenCount += 1;
    } else if (status === "DISMISSED") {
      dismissedCount += 1;
    } else {
      resolvedCount += 1;
    }

    return {
      ...current,
      findings: current.findings.map((finding) =>
        finding.id === findingId
          ? {
              ...finding,
              status,
              dismissedAt: status === "DISMISSED" ? nextTimestamp : null,
              resolvedAt: status === "RESOLVED" ? nextTimestamp : null,
              lastStatusChangedAt: nextTimestamp,
            }
          : finding
      ),
      summary: {
        ...current.summary,
        openCount,
        dismissedCount,
        resolvedCount,
        criticalOpenCount,
        warningOpenCount,
        infoOpenCount,
        openEstimatedSavingsMinor,
      },
    };
  }

  async function loadFindings(nextFilters: Filters) {
    setLoading(true);
    setError(null);

    try {
      const query = buildQueryString(nextFilters);
      const response = await fetch(`/api/expense-leaks${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const payload = await parseJson<ExpenseLeakCenterResponse & { error?: string }>(response);

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to load expense leak findings.");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshFindings() {
    if (!snapshot.isOnline) {
      setError("Reconnect to refresh live leak findings.");
      return;
    }

    setRefreshing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/expense-leaks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filters),
      });
      const payload = await parseJson<ExpenseLeakCenterResponse & { error?: string }>(response);

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to refresh expense leak findings.");
      }

      setData(payload);
      setMessage("Leak findings refreshed from live workspace spend patterns.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Network error.");
    } finally {
      setRefreshing(false);
    }
  }

  async function updateFindingStatus(
    finding: ExpenseLeakFindingListItem,
    status: "OPEN" | "DISMISSED" | "RESOLVED"
  ) {
    setBusyFindingId(finding.id);
    setError(null);
    setMessage(null);

    try {
      const result = await submitAction<{
        ok: true;
        finding: ExpenseLeakFindingListItem;
      }>({
        kind: "EXPENSE_LEAK_STATUS_UPDATE",
        url: `/api/expense-leaks/${finding.id}`,
        body: {
          status,
          lastKnownChangeAt: finding.lastStatusChangedAt,
        },
        target: {
          workspaceId,
          recordType: "EXPENSE_LEAK_FINDING",
          recordId: finding.id,
          label: finding.title,
          href: "/dashboard/expense-leaks",
        },
        actionLabel:
          status === "RESOLVED"
            ? "Resolve expense leak"
            : status === "DISMISSED"
              ? "Dismiss expense leak"
              : "Reopen expense leak",
        successMessage:
          status === "RESOLVED"
            ? "Finding resolved."
            : status === "DISMISSED"
              ? "Finding dismissed."
              : "Finding reopened.",
        queuedMessage:
          status === "RESOLVED"
            ? "Expense leak resolution queued. It will sync when you reconnect."
            : status === "DISMISSED"
              ? "Expense leak dismissal queued. It will sync when you reconnect."
              : "Expense leak reopen queued. It will sync when you reconnect.",
      });

      if (result.status === "queued") {
        setData((current) => applyFindingStatusLocally(current, finding.id, status));
        setMessage(result.action.queuedMessage);
        return;
      }

      if (result.status === "conflict") {
        throw new Error(result.payload.error);
      }

      await loadFindings(filters);
      setMessage(
        status === "RESOLVED"
          ? "Finding resolved."
          : status === "DISMISSED"
            ? "Finding dismissed."
            : "Finding reopened."
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Network error.");
    } finally {
      setBusyFindingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Open findings"
          value={String(data.summary.openCount)}
          description="Ranked spend patterns that still look worth reviewing."
        />
        <SummaryStat
          label="Estimated savings"
          value={formatDashboardCurrency(data.summary.openEstimatedSavingsMinor, "NGN")}
          description="Current upside if the open findings turn out to be real waste."
        />
        <SummaryStat
          label="Critical findings"
          value={String(data.summary.criticalOpenCount)}
          description="The biggest spend leaks by potential financial impact."
        />
        <SummaryStat
          label="Resolved findings"
          value={String(data.summary.resolvedCount)}
          description="Leak candidates the team has already closed out."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter findings</CardTitle>
          <CardDescription>
            Narrow the list by status, severity, finding type, or vendor and transaction text.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="expense-leak-query">Search</Label>
              <Input
                id="expense-leak-query"
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="Search vendors or findings"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expense-leak-status">Status</Label>
              <FilterSelect
                id="expense-leak-status"
                value={filters.status}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    status: value,
                  }))
                }
                options={EXPENSE_LEAK_FINDING_STATUSES.map((status) => ({
                  value: status,
                  label: status,
                }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expense-leak-severity">Severity</Label>
              <FilterSelect
                id="expense-leak-severity"
                value={filters.severity}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    severity: value,
                  }))
                }
                options={EXPENSE_LEAK_FINDING_SEVERITIES.map((severity) => ({
                  value: severity,
                  label: severity,
                }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expense-leak-type">Type</Label>
              <FilterSelect
                id="expense-leak-type"
                value={filters.type}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    type: value,
                  }))
                }
                options={EXPENSE_LEAK_FINDING_TYPES.map((type) => ({
                  value: type,
                  label:
                    type === "RECURRING_SPEND"
                      ? "Recurring spend"
                      : type === "DUPLICATE_VENDOR_CHARGE"
                        ? "Duplicate charge"
                        : "Spend spike",
                }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => loadFindings(filters)} disabled={loading}>
              Apply filters
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFilters(FILTER_DEFAULTS);
                void loadFindings(FILTER_DEFAULTS);
              }}
              disabled={loading}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={refreshFindings}
              disabled={refreshing || !snapshot.isOnline}
            >
              <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              {!snapshot.isOnline
                ? "Reconnect to refresh"
                : refreshing
                  ? "Refreshing..."
                  : "Refresh scan"}
            </Button>
          </div>

          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Loading expense leak findings...
          </CardContent>
        </Card>
      ) : data.findings.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No savings issues found</CardTitle>
            <CardDescription>
              Import and post more transactions, then refresh the scan to check for duplicates,
              unusual spend, or recurring costs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={refreshFindings}
              disabled={refreshing || !snapshot.isOnline}
            >
              <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              {!snapshot.isOnline
                ? "Reconnect to refresh"
                : refreshing
                  ? "Refreshing..."
                  : "Refresh scan"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.findings.map((finding) => (
            <Card key={finding.id} className="rounded-2xl border border-cyan/10">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <ExpenseLeakSeverityBadge severity={finding.severity} />
                      <ExpenseLeakStatusBadge status={finding.status} />
                      <ExpenseLeakTypeBadge type={finding.type} />
                      {finding.clientBusiness ? (
                        <Badge variant="outline" className="border-cyan/20 bg-cyan/5 text-slate-700">
                          {finding.clientBusiness.name}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{finding.title}</CardTitle>
                      <CardDescription className="text-sm leading-6">
                        {finding.summary}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-4 py-3 lg:min-w-[220px]">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Estimated savings
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      {formatDashboardCurrency(
                        finding.estimatedSavingsMinor,
                        finding.currency
                      )}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {finding.recordCount} source transaction
                      {finding.recordCount === 1 ? "" : "s"} linked
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {finding.explanation ? (
                  <div className="rounded-xl border border-cyan/10 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    {finding.explanation}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-cyan/10 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      First detected
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-950">
                      {formatDateTime(finding.firstDetectedAt)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan/10 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Last detected
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-950">
                      {formatDateTime(finding.lastDetectedAt)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan/10 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Last workflow update
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-950">
                      {formatDateTime(finding.lastStatusChangedAt)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-950">Evidence</div>
                  <div className="flex flex-wrap gap-2">
                    {finding.evidenceLinks.length > 0 ? (
                      finding.evidenceLinks.map((link) => (
                        <Link
                          key={`${finding.id}-${link.recordType}-${link.recordId ?? "na"}-${link.href}`}
                          href={link.href}
                          className="rounded-full border border-cyan/20 bg-cyan/5 px-3 py-1.5 text-xs text-slate-700 transition hover:border-cyan/40 hover:text-slate-950"
                        >
                          {link.label}
                          {link.secondaryLabel ? (
                            <span className="ml-1 text-slate-500">{link.secondaryLabel}</span>
                          ) : null}
                        </Link>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No source transactions linked yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {finding.recommendedActionHref && finding.recommendedActionLabel ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={finding.recommendedActionHref}>
                        {finding.recommendedActionLabel}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {finding.primaryRecordHref ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={finding.primaryRecordHref}>Open primary record</Link>
                    </Button>
                  ) : null}
                  <FindingActionButtons
                    finding={finding}
                    editable={editable}
                    busy={busyFindingId === finding.id}
                    onUpdateStatus={updateFindingStatus}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
