"use client";

import Link from "next/link";
import { useState } from "react";
import { BellDot, RefreshCcw } from "lucide-react";
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
import type {
  WorkspaceAlertCenterResponse,
  WorkspaceAlertListItem,
} from "@/lib/workspace-alert-types";
import {
  WORKSPACE_ALERT_SEVERITIES,
  WORKSPACE_ALERT_STATUSES,
  WORKSPACE_ALERT_TYPES,
} from "@/lib/workspace-alert-types";
import {
  WorkspaceAlertSeverityBadge,
  WorkspaceAlertStatusBadge,
  WorkspaceAlertTypeBadge,
} from "@/app/dashboard/_components/WorkspaceAlertBadges";

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
  initialData: WorkspaceAlertCenterResponse;
};

const FILTER_DEFAULTS: Filters = {
  query: "",
  status: "",
  severity: "",
  type: "",
};

function canManageAlerts(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
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

function SummaryStat({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
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

export default function NotificationCenterClient({
  role,
  workspaceId,
  initialData,
}: Props) {
  const editable = canManageAlerts(role);
  const { snapshot, submitAction } = useOfflineSync();
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyAlertStatusLocally(
    current: WorkspaceAlertCenterResponse,
    alertId: number,
    status: "OPEN" | "SNOOZED" | "RESOLVED",
    snoozedUntil: string | null
  ) {
    const target = current.alerts.find((alert) => alert.id === alertId);
    if (!target || target.status === status) {
      return current;
    }

    const nextTimestamp = new Date().toISOString();
    let openCount = current.summary.openCount;
    let snoozedCount = current.summary.snoozedCount;
    let resolvedCount = current.summary.resolvedCount;
    let criticalOpenCount = current.summary.criticalOpenCount;
    let warningOpenCount = current.summary.warningOpenCount;
    let infoOpenCount = current.summary.infoOpenCount;

    if (target.status === "OPEN") {
      openCount -= 1;
      if (target.severity === "CRITICAL") criticalOpenCount -= 1;
      if (target.severity === "WARNING") warningOpenCount -= 1;
      if (target.severity === "INFO") infoOpenCount -= 1;
    } else if (target.status === "SNOOZED") {
      snoozedCount -= 1;
    } else {
      resolvedCount -= 1;
    }

    if (status === "OPEN") {
      openCount += 1;
      if (target.severity === "CRITICAL") criticalOpenCount += 1;
      if (target.severity === "WARNING") warningOpenCount += 1;
      if (target.severity === "INFO") infoOpenCount += 1;
    } else if (status === "SNOOZED") {
      snoozedCount += 1;
    } else {
      resolvedCount += 1;
    }

    return {
      ...current,
      alerts: current.alerts.map((alert) =>
        alert.id === alertId
          ? {
              ...alert,
              status,
              snoozedUntil: status === "SNOOZED" ? snoozedUntil : null,
              resolvedAt: status === "RESOLVED" ? nextTimestamp : null,
              lastStatusChangedAt: nextTimestamp,
            }
          : alert
      ),
      summary: {
        ...current.summary,
        activeCount: openCount + snoozedCount,
        openCount,
        snoozedCount,
        resolvedCount,
        criticalOpenCount,
        warningOpenCount,
        infoOpenCount,
      },
    };
  }

  async function loadAlerts(nextFilters: Filters, sync = false) {
    setLoading(true);
    setError(null);

    try {
      const query = buildQueryString(nextFilters);
      const response = await fetch(
        `/api/alerts${query || sync ? `?${query}${query && sync ? "&" : ""}${
          sync ? "sync=1" : ""
        }` : ""}`,
        {
          cache: "no-store",
        }
      );
      const payload = await parseJson<WorkspaceAlertCenterResponse & { error?: string }>(response);

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to load alerts.");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAlerts() {
    if (!snapshot.isOnline) {
      setError("Reconnect to refresh live alerts.");
      return;
    }

    setRefreshing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...filters,
        }),
      });
      const payload = await parseJson<WorkspaceAlertCenterResponse & { error?: string }>(response);

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Failed to refresh alerts.");
      }

      setData(payload);
      setMessage("Alerts refreshed from live workspace signals.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Network error.");
    } finally {
      setRefreshing(false);
    }
  }

  async function updateAlertStatus(
    alert: WorkspaceAlertListItem,
    status: "OPEN" | "SNOOZED" | "RESOLVED"
  ) {
    setBusyAlertId(alert.id);
    setError(null);
    setMessage(null);

    try {
      const snoozedUntil = (() => {
        if (status !== "SNOOZED") {
          return null;
        }

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.toISOString();
      })();
      const result = await submitAction<{
        ok: true;
        alert: WorkspaceAlertListItem;
      }>({
        kind: "WORKSPACE_ALERT_STATUS_UPDATE",
        url: `/api/alerts/${alert.id}`,
        body: {
          status,
          snoozedUntil,
          lastKnownChangeAt: alert.lastStatusChangedAt,
        },
        target: {
          workspaceId,
          recordType: "WORKSPACE_ALERT",
          recordId: alert.id,
          label: alert.title,
          href: "/dashboard/notifications",
        },
        actionLabel:
          status === "RESOLVED"
            ? "Resolve alert"
            : status === "SNOOZED"
              ? "Snooze alert"
              : "Reopen alert",
        successMessage:
          status === "RESOLVED"
            ? "Alert resolved."
            : status === "SNOOZED"
              ? "Alert snoozed for 7 days."
              : "Alert reopened.",
        queuedMessage:
          status === "RESOLVED"
            ? "Alert resolution queued. It will sync when you reconnect."
            : status === "SNOOZED"
              ? "Alert snooze queued. It will sync when you reconnect."
              : "Alert reopen queued. It will sync when you reconnect.",
      });

      if (result.status === "queued") {
        setData((current) =>
          applyAlertStatusLocally(current, alert.id, status, snoozedUntil)
        );
        setMessage(result.action.queuedMessage);
        return;
      }

      if (result.status === "conflict") {
        throw new Error(result.payload.error);
      }

      await loadAlerts(filters);
      setMessage(
        status === "RESOLVED"
          ? "Alert resolved."
          : status === "SNOOZED"
            ? "Alert snoozed for 7 days."
            : "Alert reopened."
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Network error.");
    } finally {
      setBusyAlertId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Open alerts"
          value={data.summary.openCount}
          description="Issues that still need attention right now."
        />
        <SummaryStat
          label="Critical alerts"
          value={data.summary.criticalOpenCount}
          description="The highest-severity blockers in the current workspace."
        />
        <SummaryStat
          label="Snoozed alerts"
          value={data.summary.snoozedCount}
          description="Alerts intentionally deferred for a later check-in."
        />
        <SummaryStat
          label="Resolved alerts"
          value={data.summary.resolvedCount}
          description="Signals that have already been cleared or auto-resolved."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter alerts</CardTitle>
          <CardDescription>
            Narrow the notification center by state, severity, alert type, or record text.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="alert-query">Search</Label>
              <Input
                id="alert-query"
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="Search alerts or records"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alert-status">Status</Label>
              <select
                id="alert-status"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="">All statuses</option>
                {WORKSPACE_ALERT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alert-severity">Severity</Label>
              <select
                id="alert-severity"
                value={filters.severity}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    severity: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="">All severities</option>
                {WORKSPACE_ALERT_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alert-type">Alert type</Label>
              <select
                id="alert-type"
                value={filters.type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="">All alert types</option>
                {WORKSPACE_ALERT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => loadAlerts(filters)} disabled={loading}>
              {loading ? "Loading..." : "Apply filters"}
            </Button>
            <Button
              variant="outline"
              onClick={refreshAlerts}
              disabled={refreshing || !snapshot.isOnline}
            >
              <RefreshCcw className="size-4" />
              {!snapshot.isOnline
                ? "Reconnect to refresh"
                : refreshing
                  ? "Refreshing..."
                  : "Refresh signals"}
            </Button>
          </div>

          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active alerts</CardTitle>
          <CardDescription>
            Each alert links back to the specific records driving the signal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.alerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan/20 bg-white/5 px-4 py-10 text-center text-sm text-muted-foreground">
              No alerts match the current filters.
            </div>
          ) : (
            data.alerts.map((alert) => (
              <div key={alert.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-medium text-slate-950">{alert.title}</div>
                      <WorkspaceAlertSeverityBadge severity={alert.severity} />
                      <WorkspaceAlertStatusBadge status={alert.status} />
                      <WorkspaceAlertTypeBadge type={alert.type} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {alert.clientBusiness ? `${alert.clientBusiness.name} · ` : ""}
                      First seen {formatDateTime(alert.firstDetectedAt)} · Last detected{" "}
                      {formatDateTime(alert.lastDetectedAt)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-3 py-2 text-right">
                    <div className="text-lg font-semibold text-slate-950">{alert.recordCount}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      linked record{alert.recordCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-700">{alert.message}</p>
                {alert.explanation ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {alert.explanation}
                  </p>
                ) : null}

                {alert.sourceRecords.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {alert.sourceRecords.map((record) => (
                      <Link
                        key={`${alert.id}-${record.recordType}-${record.recordId ?? record.href}`}
                        href={record.href}
                        className="rounded-full border border-cyan/20 bg-cyan/5 px-3 py-1.5 text-xs text-slate-700 transition hover:border-cyan/40 hover:text-slate-950"
                      >
                        {record.label}
                        {record.secondaryLabel ? (
                          <span className="ml-1 text-slate-500">{record.secondaryLabel}</span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {alert.recommendedActionHref && alert.recommendedActionLabel ? (
                    <Button asChild size="sm">
                      <Link href={alert.recommendedActionHref}>
                        {alert.recommendedActionLabel}
                      </Link>
                    </Button>
                  ) : null}

                  {editable ? (
                    <>
                      {alert.status !== "RESOLVED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAlertId === alert.id}
                          onClick={() => updateAlertStatus(alert, "RESOLVED")}
                        >
                          Resolve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAlertId === alert.id}
                          onClick={() => updateAlertStatus(alert, "OPEN")}
                        >
                          Reopen
                        </Button>
                      )}

                      {alert.status !== "SNOOZED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAlertId === alert.id}
                          onClick={() => updateAlertStatus(alert, "SNOOZED")}
                        >
                          Snooze 7 days
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAlertId === alert.id}
                          onClick={() => updateAlertStatus(alert, "OPEN")}
                        >
                          Reopen now
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan/10 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                      <BellDot className="size-3.5" />
                      Viewer access can inspect alerts but cannot change state.
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
