"use client";

import { useEffect, useState, startTransition } from "react";
import type {
  SystemMonitorEventLevel,
  SystemMonitorHealth,
  SystemMonitorIssue,
  SystemMonitorIssueLevel,
  SystemMonitorSnapshot,
} from "@/lib/system-monitor-types";
import { formatCurrencyNGN } from "@/lib/dashboard-formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

function getHealthBadgeClass(health: SystemMonitorHealth) {
  if (health === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (health === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getIssueClass(level: SystemMonitorIssueLevel) {
  return level === "critical"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function getEventClass(level: SystemMonitorEventLevel) {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function MonitorStatCard(input: {
  label: string;
  value: string;
  detail: string;
  health: SystemMonitorHealth;
}) {
  return (
    <Card className="border-primary/15 bg-primary/5 shadow-glow">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{input.label}</CardDescription>
          <Badge variant="outline" className={getHealthBadgeClass(input.health)}>
            {input.health}
          </Badge>
        </div>
        <CardTitle className="text-2xl text-cyan">{input.value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{input.detail}</CardContent>
    </Card>
  );
}

function IssueList(input: {
  title: string;
  description: string;
  items: SystemMonitorIssue[];
  emptyLabel: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{input.title}</CardTitle>
        <CardDescription>{input.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {input.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{input.emptyLabel}</p>
        ) : (
          input.items.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-xl border p-4 ${getIssueClass(issue.level)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{issue.title}</div>
                <Badge variant="outline" className={getIssueClass(issue.level)}>
                  {issue.level}
                </Badge>
              </div>
              <p className="mt-2 text-sm">{issue.detail}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-80">
                {issue.invoiceId ? <span>Invoice #{issue.invoiceId}</span> : null}
                {issue.reference ? <span>{issue.reference}</span> : null}
                {issue.createdAt ? <span>{formatDateTime(issue.createdAt)}</span> : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function SystemMonitorClient({
  initialSnapshot,
}: {
  initialSnapshot: SystemMonitorSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSnapshot(silent = false) {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch("/api/system-monitor", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to refresh the system monitor.");
      }

      const nextSnapshot = (await response.json()) as SystemMonitorSnapshot;
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setError(null);
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the system monitor."
      );
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSnapshot(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-primary/15 bg-gradient-primary p-6 text-white shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">System Monitor</h1>
              <Badge variant="outline" className="border-white/30 bg-white/10 text-white">
                {snapshot.workspace.name}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-white/80">
              Internal visibility for payments, ledger posting, and tax sync across the active
              workspace.
            </p>
            <p className="text-xs text-white/70">
              Last updated {formatDateTime(snapshot.generatedAt)}
            </p>
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
                void refreshSnapshot(false);
              }}
              aria-label="Refresh system monitor"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh now"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MonitorStatCard
          label="Successful payments"
          value={String(snapshot.payments.success)}
          detail={`${snapshot.payments.last24HoursSuccess} successful payments in the last 24 hours.`}
          health={snapshot.payments.health}
        />
        <MonitorStatCard
          label="Pending payments"
          value={String(snapshot.payments.pending)}
          detail={`${snapshot.payments.failed} failed payments currently need attention.`}
          health={snapshot.payments.pending > 0 ? "warning" : "healthy"}
        />
        <MonitorStatCard
          label="Ledger issues"
          value={String(
            snapshot.ledgerIntegrity.missingLedgerCount +
              snapshot.ledgerIntegrity.orphanLedgerCount +
              snapshot.ledgerIntegrity.duplicateLedgerCount
          )}
          detail={`${snapshot.ledgerIntegrity.matchedCount} successful payments are reconciled to a single MONEY_IN ledger entry.`}
          health={snapshot.ledgerIntegrity.health}
        />
        <MonitorStatCard
          label="Missing tax sync"
          value={String(snapshot.taxSync.missingTaxCount)}
          detail={`${snapshot.taxSync.syncedCount} paid invoices already have linked tax records.`}
          health={snapshot.taxSync.health}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Payments overview</CardTitle>
                <CardDescription>
                  Recent payment rows and current processing volume.
                </CardDescription>
              </div>
              <Badge variant="outline" className={getHealthBadgeClass(snapshot.payments.health)}>
                {snapshot.payments.health}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
                <div className="mt-2 text-xl font-semibold">{snapshot.payments.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Success</div>
                <div className="mt-2 text-xl font-semibold text-emerald-700">
                  {snapshot.payments.success}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs uppercase tracking-wide text-amber-700">Pending</div>
                <div className="mt-2 text-xl font-semibold text-amber-700">
                  {snapshot.payments.pending}
                </div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="text-xs uppercase tracking-wide text-red-700">Failed</div>
                <div className="mt-2 text-xl font-semibold text-red-700">
                  {snapshot.payments.failed}
                </div>
              </div>
            </div>

            {snapshot.payments.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment rows yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      <th className="pb-3 font-medium">Invoice</th>
                      <th className="pb-3 font-medium">Reference</th>
                      <th className="pb-3 font-medium">Provider</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.payments.recent.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b last:border-b-0 hover:bg-muted/40"
                      >
                        <td className="py-3 font-medium">{payment.invoiceNumber}</td>
                        <td className="py-3 text-xs text-muted-foreground">{payment.reference}</td>
                        <td className="py-3">{payment.provider}</td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={
                              payment.status === "SUCCESS"
                                ? getHealthBadgeClass("healthy")
                                : payment.status === "FAILED"
                                  ? getIssueClass("critical")
                                  : getIssueClass("warning")
                            }
                          >
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="py-3">{formatCurrencyNGN(payment.amountMinor)}</td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {formatDateTime(payment.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <IssueList
          title="Error and alerts"
          description="High-signal conditions that need manual review."
          items={snapshot.alerts.items}
          emptyLabel="No active financial alerts."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <IssueList
          title="Ledger integrity"
          description={`${snapshot.ledgerIntegrity.checkedPayments} successful payments checked against invoice MONEY_IN ledger rows.`}
          items={snapshot.ledgerIntegrity.issues}
          emptyLabel="Ledger posting looks clean for the current workspace."
        />

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Tax sync status</CardTitle>
                <CardDescription>
                  Tax tracking health for paid invoices in this workspace.
                </CardDescription>
              </div>
              <Badge variant="outline" className={getHealthBadgeClass(snapshot.taxSync.health)}>
                {snapshot.taxSync.health}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Checked</div>
                <div className="mt-2 text-xl font-semibold">{snapshot.taxSync.checkedPayments}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Synced</div>
                <div className="mt-2 text-xl font-semibold text-emerald-700">
                  {snapshot.taxSync.syncedCount}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs uppercase tracking-wide text-amber-700">Missing</div>
                <div className="mt-2 text-xl font-semibold text-amber-700">
                  {snapshot.taxSync.missingTaxCount}
                </div>
              </div>
            </div>

            {snapshot.taxSync.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid invoices to evaluate yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      <th className="pb-3 font-medium">Invoice</th>
                      <th className="pb-3 font-medium">Paid</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Tax record</th>
                      <th className="pb-3 font-medium">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.taxSync.recent.map((row) => (
                      <tr
                        key={`${row.invoiceId}:${row.taxRecordId ?? "missing"}`}
                        className="border-b last:border-b-0 hover:bg-muted/40"
                      >
                        <td className="py-3 font-medium">{row.invoiceNumber}</td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {formatDateTime(row.paidAt)}
                        </td>
                        <td className="py-3">{formatCurrencyNGN(row.totalAmountMinor)}</td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={
                              row.taxRecordId
                                ? getHealthBadgeClass("healthy")
                                : getIssueClass("warning")
                            }
                          >
                            {row.taxRecordId ? `#${row.taxRecordId}` : "Missing"}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {row.taxRecordId ? formatDateTime(row.taxRecordedAt) : "Not synced"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {snapshot.taxSync.issues.length > 0 ? (
              <div className="space-y-3">
                {snapshot.taxSync.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`rounded-xl border p-4 ${getIssueClass(issue.level)}`}
                  >
                    <div className="font-medium">{issue.title}</div>
                    <p className="mt-2 text-sm">{issue.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Live event stream</CardTitle>
          <CardDescription>
            Recent payment, ledger, and tax lifecycle events from the workspace audit stream.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshot.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent system events yet.</p>
          ) : (
            snapshot.events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={getEventClass(event.level)}>
                      {event.level}
                    </Badge>
                    <span className="font-medium">{event.action}</span>
                    {event.status ? (
                      <span className="text-xs text-muted-foreground">{event.status}</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{event.summary}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{event.actorLabel}</span>
                    {event.invoiceId ? <span>Invoice #{event.invoiceId}</span> : null}
                    {event.reference ? <span>{event.reference}</span> : null}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
