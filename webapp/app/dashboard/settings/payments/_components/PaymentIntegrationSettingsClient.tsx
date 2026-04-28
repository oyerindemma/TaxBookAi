"use client";

import Link from "next/link";
import { useState } from "react";
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
import type { PaymentIntegrationSettingsState } from "@/lib/payment-integration-types";

type Props = {
  workspaceName: string;
  initialState: PaymentIntegrationSettingsState;
};

const selectClassName =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatMoney(amountMinor: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function connectionVariant(status: string) {
  if (status === "ACTIVE") return "secondary";
  if (status === "PAUSED") return "outline";
  return "destructive";
}

function eventVariant(status: string) {
  if (status === "PROCESSED") return "secondary";
  if (status === "IGNORED") return "outline";
  return "destructive";
}

function candidateVariant(status: string) {
  if (status === "READY_TO_RECONCILE" || status === "RECONCILED") return "secondary";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

function routeForCandidate(record: PaymentIntegrationSettingsState["recentCandidates"][number]) {
  if (record.invoiceId) {
    return `/dashboard/invoices/${record.invoiceId}`;
  }
  if (record.suggestedBankTransactionId || record.bankTransactionId) {
    const transactionId = record.suggestedBankTransactionId ?? record.bankTransactionId;
    return `/dashboard/banking/review?transactionId=${transactionId}`;
  }
  return "/dashboard/banking/review";
}

export default function PaymentIntegrationSettingsClient({
  workspaceName,
  initialState,
}: Props) {
  const [state, setState] = useState(initialState);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncDays, setSyncDays] = useState(
    String(state.connection?.settlementSyncWindowDays ?? 30)
  );

  async function refreshState() {
    const res = await fetch("/api/settings/payments", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to refresh payment settings");
    }
    setState(data);
    if (data?.connection?.settlementSyncWindowDays) {
      setSyncDays(String(data.connection.settlementSyncWindowDays));
    }
  }

  async function saveSettings(formData: FormData) {
    setBusyKey("save");
    setError(null);
    setSuccess(null);

    try {
      const body = {
        label: String(formData.get("label") ?? "").trim(),
        status: String(formData.get("status") ?? "ACTIVE").trim(),
        defaultClientBusinessId:
          String(formData.get("defaultClientBusinessId") ?? "").trim() || null,
        webhookEnabled: formData.get("webhookEnabled") === "on",
        autoSyncEnabled: formData.get("autoSyncEnabled") === "on",
        autoCreateCandidates: formData.get("autoCreateCandidates") === "on",
        settlementSyncWindowDays:
          String(formData.get("settlementSyncWindowDays") ?? "").trim() || "30",
        notes: String(formData.get("notes") ?? "").trim() || null,
      };

      const res = await fetch("/api/settings/payments", {
        method: state.connection ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save payment integration settings");
      }

      setState(data);
      setSuccess("Payment integration settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusyKey(null);
    }
  }

  async function runSync() {
    setBusyKey("sync");
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/payments/integrations/paystack/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          days: Number(syncDays) || state.connection?.settlementSyncWindowDays || 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to sync Paystack activity");
      }

      await refreshState();
      setSuccess(
        `Sync completed. Imported ${data.importedEventCount} payment event(s) and ${data.importedSettlementCount} settlement(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusyKey(null);
    }
  }

  const connection = state.connection;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Payment and tax integration</h1>
        <p className="text-muted-foreground">
          Connect Paystack payment activity to {workspaceName}, import settlements, and push
          payment signals into the accounting and tax workflow as transaction candidates.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Connection</CardDescription>
            <CardTitle className="text-2xl">
              {state.metrics.connectionConfigured ? "Configured" : "Pending"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {connection ? (
              <Badge variant={connectionVariant(connection.status)}>{connection.status}</Badge>
            ) : (
              "Save the Paystack settings below to start importing activity."
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payment events</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.eventCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Live charges and transfer events imported from Paystack
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Settlements</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.settlementCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Settlement payouts available for bank reconciliation
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending candidates</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.pendingCandidateCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {state.metrics.candidateCount} transaction candidate(s) in the pipeline
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook and runtime</CardTitle>
          <CardDescription>
            Point Paystack to this webhook to ingest live payment events. Secrets stay in server
            environment variables, while the workspace connection below controls routing and sync
            behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="paystack-webhook-url">Webhook URL</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="paystack-webhook-url"
                readOnly
                value={state.runtime.webhookUrl}
              />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.runtime.webhookUrl);
                  setSuccess("Webhook URL copied.");
                }}
              >
                Copy URL
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={state.runtime.paystackSecretConfigured ? "secondary" : "destructive"}>
              {state.runtime.paystackSecretConfigured
                ? "Paystack secret configured"
                : "Paystack secret missing"}
            </Badge>
            <Badge
              variant={state.runtime.paystackWebhookSecretConfigured ? "secondary" : "outline"}
            >
              {state.runtime.paystackWebhookSecretConfigured
                ? "Webhook secret configured"
                : "Webhook secret using fallback"}
            </Badge>
            <Badge variant={state.runtime.syncEnabled ? "secondary" : "destructive"}>
              {state.runtime.syncEnabled ? "Sync ready" : "Sync unavailable"}
            </Badge>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Legacy invoice-payment webhooks still remain supported, but this route imports raw
            payment activity, settlement data, and reconciliation candidates for the new accounting
            flow.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace connection</CardTitle>
          <CardDescription>
            Set the default business routing, candidate generation rules, and settlement sync
            window for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSettings(new FormData(event.currentTarget));
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="label">Connection label</Label>
                <Input
                  id="label"
                  name="label"
                  defaultValue={connection?.label ?? "Paystack payments"}
                  placeholder="Paystack payments"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={connection?.status ?? "ACTIVE"}
                  className={selectClassName}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="defaultClientBusinessId">Default client business</Label>
                <select
                  id="defaultClientBusinessId"
                  name="defaultClientBusinessId"
                  defaultValue={String(connection?.defaultClientBusinessId ?? "")}
                  className={selectClassName}
                >
                  <option value="">No default business</option>
                  {state.clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="settlementSyncWindowDays">Sync window (days)</Label>
                <Input
                  id="settlementSyncWindowDays"
                  name="settlementSyncWindowDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={connection?.settlementSyncWindowDays ?? 30}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="webhookEnabled"
                  defaultChecked={connection?.webhookEnabled ?? true}
                />
                Import live webhooks
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="autoSyncEnabled"
                  defaultChecked={connection?.autoSyncEnabled ?? true}
                />
                Include payments in sync runs
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="autoCreateCandidates"
                  defaultChecked={connection?.autoCreateCandidates ?? true}
                />
                Create transaction candidates automatically
              </label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Operator notes</Label>
              <textarea
                id="notes"
                name="notes"
                defaultValue={connection?.notes ?? ""}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add routing or reconciliation notes for this workspace."
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busyKey === "save"}>
                {busyKey === "save" ? "Saving..." : connection ? "Update connection" : "Save connection"}
              </Button>
              {connection ? (
                <div className="text-sm text-muted-foreground">
                  Last sync: {formatDateTime(connection.lastSyncCompletedAt)}
                </div>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual sync</CardTitle>
          <CardDescription>
            Backfill recent Paystack charges and settlements when you need to rebuild the
            accounting candidate queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="sync-window-days">Look back</Label>
            <Input
              id="sync-window-days"
              value={syncDays}
              onChange={(event) => setSyncDays(event.target.value)}
              type="number"
              min={1}
              max={90}
            />
          </div>
          <Button
            type="button"
            onClick={() => void runSync()}
            disabled={busyKey === "sync" || !state.runtime.syncEnabled}
          >
            {busyKey === "sync" ? "Syncing..." : "Run Paystack sync"}
          </Button>
          {connection?.lastSyncError ? (
            <div className="text-sm text-red-700">{connection.lastSyncError}</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>Live payment activity imported from webhooks and syncs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payment events have been imported for this workspace yet.
              </p>
            ) : (
              state.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border/70 px-3 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">
                        {event.reference ?? event.eventType}
                      </div>
                      <div className="text-muted-foreground">{event.eventType}</div>
                    </div>
                    <Badge variant={eventVariant(event.status)}>{event.status}</Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {formatMoney(event.amountMinor ?? 0, event.currency)}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(event.occurredAt)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Recent settlements</CardTitle>
            <CardDescription>Settlement payouts ready for bank matching.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.recentSettlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Paystack settlements have been imported yet.
              </p>
            ) : (
              state.recentSettlements.map((settlement) => (
                <div
                  key={settlement.id}
                  className="rounded-xl border border-border/70 px-3 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">
                        Settlement {settlement.externalSettlementId}
                      </div>
                      <div className="text-muted-foreground">
                        {settlement.bankAccountName ?? "Bank destination pending"}
                      </div>
                    </div>
                    <Badge variant={candidateVariant(settlement.status)}>{settlement.status}</Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    Net {formatMoney(settlement.netAmountMinor, settlement.currency)}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(settlement.settlementDate)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Candidate pipeline</CardTitle>
            <CardDescription>
              Payment transaction candidates with invoice, bank, and tax suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.recentCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transaction candidates have been generated yet.
              </p>
            ) : (
              state.recentCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-border/70 px-3 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{candidate.description}</div>
                      <div className="text-muted-foreground">
                        {candidate.counterpartyName ??
                          candidate.clientBusinessName ??
                          "No counterparty yet"}
                      </div>
                    </div>
                    <Badge variant={candidateVariant(candidate.status)}>{candidate.status}</Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {formatMoney(candidate.netAmountMinor || candidate.amountMinor, candidate.currency)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">VAT {candidate.suggestedVatTreatment}</Badge>
                    <Badge variant="outline">WHT {candidate.suggestedWhtTreatment}</Badge>
                    {candidate.invoiceNumber ? (
                      <Badge variant="outline">Invoice {candidate.invoiceNumber}</Badge>
                    ) : null}
                  </div>
                  {candidate.reconciliationReason ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {candidate.reconciliationReason}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <Button asChild variant="outline" size="sm">
                      <Link href={routeForCandidate(candidate)}>Open workflow</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
