"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceTimeline } from "@/components/invoices/invoice-timeline";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrencyNGN,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type InvoiceItem = {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  paymentReference: string | null;
  paymentUrl: string | null;
  paymentPagePath: string | null;
  paidAt: string | Date | null;
  issueDate: string | Date;
  dueDate: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  vatTreatment: "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
  whtTreatment: "NONE" | "PAYABLE" | "RECEIVABLE";
  taxCategory: string | null;
  taxEvidenceStatus: string;
  estimatedWhtRate: number;
  estimatedWhtAmountMinor: number;
  notes: string | null;
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  } | null;
  client: {
    id: number;
    name: string;
    companyName: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    taxId: string | null;
  } | null;
  items: InvoiceItem[];
  ledgerEntry: {
    id: number;
    transactionDate: string;
    amountMinor: number;
    currency: string;
    reference: string | null;
    reviewStatus: string;
    description: string;
    createdAt: string;
  } | null;
  taxRecord: {
    id: number;
    kind: string;
    amountKobo: number;
    computedTax: number;
    netAmount: number;
    currency: string;
    taxRate: number;
    occurredOn: string;
    source: string | null;
  } | null;
  vatRecords: Array<{
    id: number;
    vatAmountMinor: number;
    basisAmountMinor: number;
    direction: string;
    reviewed: boolean;
    taxPeriod: {
      id: number;
      label: string;
      status: string;
    };
  }>;
  whtRecords: Array<{
    id: number;
    whtAmountMinor: number;
    basisAmountMinor: number;
    whtRate: number;
    direction: string;
    reviewed: boolean;
    taxPeriod: {
      id: number;
      label: string;
      status: string;
    };
  }>;
  sync: {
    ledgerPosted: boolean;
    taxTracked: boolean;
    vatRecordCount: number;
    whtRecordCount: number;
  };
};

type Props = {
  role: Role;
  initialInvoice: Invoice;
  initialReminderSummary: {
    lastSentAt: string | null;
    lastSentLabel: string | null;
    lastSentChannel: "EMAIL" | "WHATSAPP" | null;
    lastAttemptAt: string | null;
    lastAttemptStatus: "SENT" | "FAILED" | "SKIPPED" | null;
    lastFailureMessage: string | null;
    nextReminderAt: string | null;
    nextReminderLabel: string | null;
    history: Array<{
      createdAt: string;
      type: string;
      typeLabel: string;
      channel: "EMAIL" | "WHATSAPP";
      status: "SENT" | "FAILED" | "SKIPPED";
      delivered: boolean;
      provider: string;
      recipient: string | null;
      error: string | null;
    }>;
  };
  initialNotice?: {
    kind: "success" | "error" | "info";
    message: string;
  } | null;
};

function formatDateTime(value: string | Date | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTreatment(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function renderReminderStatusTone(status: "SENT" | "FAILED" | "SKIPPED") {
  if (status === "SENT") {
    return "border-cyan/30 bg-cyan/10 text-cyan";
  }
  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }
  return "border-blue/30 bg-blue/10 text-blue";
}

export default function InvoiceDetailClient({
  role,
  initialInvoice,
  initialReminderSummary,
  initialNotice = null,
}: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [invoice, setInvoice] = useState<Invoice | null>(initialInvoice);
  const [reminderSummary, setReminderSummary] = useState(initialReminderSummary);
  const [error, setError] = useState<string | null>(
    initialNotice?.kind === "error" ? initialNotice.message : null
  );
  const [actionMessage, setActionMessage] = useState<string | null>(
    initialNotice && initialNotice.kind !== "error" ? initialNotice.message : null
  );
  const [updating, setUpdating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [creatingPaymentLink, setCreatingPaymentLink] = useState(false);
  const [creatingPortalLink, setCreatingPortalLink] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalExpiresAt, setPortalExpiresAt] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  async function updateStatus(status: Invoice["status"]) {
    if (!canEdit || !invoice) return;
    setUpdating(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to update invoice");
      }
      setInvoice(data?.invoice ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUpdating(false);
    }
  }

  async function markInvoicePaid() {
    if (!canEdit || !invoice || invoice.status === "PAID") return;
    setMarkingPaid(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to confirm invoice payment");
      }

      if (data?.invoice) {
        setInvoice(data.invoice);
      }

      const confirmation = data?.confirmation;
      const messageParts = ["Invoice marked as paid."];
      if (confirmation?.ledgerEntryCreated || confirmation?.ledgerConfirmed) {
        messageParts.push("Ledger entry created.");
      }
      if (confirmation?.taxSyncRan || confirmation?.taxConfirmed) {
        messageParts.push("Tax sync completed.");
      }
      if (confirmation?.needsReview) {
        messageParts.push("Payment integrity needs review.");
      }
      setActionMessage(messageParts.join(" "));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function createPaymentLink() {
    if (!canEdit || !invoice) return;
    setCreatingPaymentLink(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payment-link`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to create payment link");
      }
      setInvoice(data?.invoice ?? null);
      setActionMessage(
        "Hosted payment page ready. Verified gateway payment will mark this invoice paid and sync ledger and tax automatically."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreatingPaymentLink(false);
    }
  }

  async function startPaystackCheckout() {
    if (!canEdit || !invoice || invoice.status === "PAID") return;

    setStartingCheckout(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pay`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to start Paystack checkout");
      }

      if (typeof data?.authorizationUrl === "string" && data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }

      throw new Error("Payment authorization URL was not returned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setStartingCheckout(false);
    }
  }

  async function createPortalLink() {
    if (!canEdit || !invoice) return;
    setCreatingPortalLink(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/portal-link`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to create secure client portal link");
      }

      setPortalUrl(data?.portalUrl ?? null);
      setPortalExpiresAt(data?.expiresAt ?? null);
      if (typeof data?.paymentReference === "string" && data.paymentReference) {
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                paymentReference: data.paymentReference,
                paymentUrl: data.paymentUrl ?? prev.paymentUrl,
              }
            : prev
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreatingPortalLink(false);
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  async function sendReminderNow() {
    if (!canEdit || !invoice || invoice.status === "PAID") return;
    setSendingReminder(true);
    setError(null);
    setActionMessage(null);
    setReminderMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["EMAIL"] }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to send reminder");
      }

      if (data?.summary) {
        setReminderSummary(data.summary);
      }
      setReminderMessage(data?.message ?? "Reminder sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSendingReminder(false);
    }
  }

  if (!invoice) {
    return (
      <Card className="rounded-2xl bg-primary text-white shadow-glow">
        <CardHeader>
          <CardTitle>Invoice not found</CardTitle>
          <CardDescription className="text-slate-300">
            The invoice might have been removed.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const paymentPageHref = invoice.paymentPagePath ?? invoice.paymentUrl;
  const expectedCashReceived = invoice.totalAmount - invoice.estimatedWhtAmountMinor;
  const timelineItems = [
    {
      label: "Invoice created",
      detail: `Invoice ${invoice.invoiceNumber} was prepared for ${
        invoice.client?.companyName ?? invoice.client?.name ?? "the client"
      }.`,
      date: formatDateTime(invoice.createdAt),
    },
    {
      label: "Invoice issued",
      detail: `Due ${formatDashboardDate(new Date(invoice.dueDate))}.`,
      date: formatDateTime(invoice.issueDate),
      tone: "warning" as const,
    },
    ...(invoice.paymentReference
      ? [
          {
            label: "Payment page ready",
            detail: `Payment reference ${invoice.paymentReference}`,
            date: formatDateTime(invoice.updatedAt),
            href: paymentPageHref,
            tone: "warning" as const,
          },
        ]
      : []),
    ...(invoice.paidAt
      ? [
          {
            label: "Payment confirmed",
            detail: "Funds have been confirmed for this invoice.",
            date: formatDateTime(invoice.paidAt),
            tone: "success" as const,
          },
        ]
      : []),
    ...(invoice.ledgerEntry
      ? [
          {
            label: "Ledger synced",
            detail: `${formatCurrencyNGN(invoice.ledgerEntry.amountMinor)} posted to the ledger.`,
            date: formatDateTime(invoice.ledgerEntry.transactionDate),
            tone: "success" as const,
          },
        ]
      : []),
    ...(invoice.sync.taxTracked
      ? [
          {
            label: "Tax engine linked",
            detail: `${invoice.sync.vatRecordCount} VAT record(s) and ${invoice.sync.whtRecordCount} WHT record(s) are attached to this invoice flow.`,
            href: "/dashboard/tax",
            tone: "success" as const,
          },
        ]
      : []),
  ];

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">
          {actionMessage}
        </div>
      ) : null}

      {reminderMessage ? (
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">
          {reminderMessage}
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
                  Invoice flow
                </p>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {invoice.invoiceNumber}
                </h1>
                <p className="max-w-2xl text-sm text-slate-300">
                  Keep billing, customer payment, ledger posting, and tax tracking aligned from a
                  single invoice record.
                </p>
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-slate-300">
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Client
                  </span>
                  <span className="font-medium text-white">
                    {invoice.client?.companyName ?? invoice.client?.name ?? "Client"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Total due
                  </span>
                  <span className="font-medium text-white">
                    {formatCurrencyNGN(invoice.totalAmount)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Issue / due
                  </span>
                  <span className="font-medium text-white">
                    {formatDashboardDate(new Date(invoice.issueDate))} to{" "}
                    {formatDashboardDate(new Date(invoice.dueDate))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2" data-print-hide="true">
              {canEdit && invoice.status !== "PAID" ? (
                <Button
                  type="button"
                  disabled={startingCheckout}
                  onClick={startPaystackCheckout}
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  aria-label="Start Paystack checkout for this invoice"
                >
                  {startingCheckout ? "Redirecting..." : "Pay with Paystack"}
                </Button>
              ) : null}
              {paymentPageHref && invoice.status !== "PAID" ? (
                <Button
                  asChild
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                >
                  <a href={paymentPageHref} target="_blank" rel="noreferrer">
                    Open client payment page
                  </a>
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  disabled={creatingPortalLink}
                  onClick={createPortalLink}
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  aria-label="Generate secure client portal link"
                >
                  {creatingPortalLink ? "Generating portal..." : "Generate secure client portal"}
                </Button>
              ) : null}
              {canEdit && invoice.status !== "PAID" && !paymentPageHref ? (
                <Button
                  type="button"
                  disabled={creatingPaymentLink}
                  onClick={createPaymentLink}
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  aria-label="Create hosted invoice payment link"
                >
                  {creatingPaymentLink ? "Creating link..." : "Create payment link"}
                </Button>
              ) : null}
              {canEdit && invoice.status !== "PAID" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={markingPaid}
                  onClick={markInvoicePaid}
                  aria-label="Mark invoice as paid and sync ledger and tax"
                >
                  {markingPaid ? "Marking as paid..." : "Mark as paid"}
                </Button>
              ) : null}
              {canEdit && invoice.status === "PAID" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={updating}
                  onClick={() => updateStatus("SENT")}
                  aria-label="Mark invoice as unpaid"
                >
                  Mark unpaid
                </Button>
              ) : null}
              {canEdit && invoice.status === "DRAFT" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={updating}
                  onClick={() => updateStatus("SENT")}
                  aria-label="Mark invoice as sent"
                >
                  Mark sent
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={handlePrint} aria-label="Print invoice">
                Print / PDF
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/dashboard/invoices">Back to invoices</Link>
              </Button>
            </div>
          </div>

          {portalUrl ? (
            <div className="mt-5 rounded-2xl border border-cyan/20 bg-cyan/10 p-4 text-sm text-cyan">
              <p className="font-medium text-white">Secure client portal link ready</p>
              <p className="mt-1 break-all">{portalUrl}</p>
              <p className="mt-2 text-cyan/90">
                {portalExpiresAt
                  ? `This link stays active until ${formatDateTime(portalExpiresAt) ?? portalExpiresAt}.`
                  : "Share this link directly with your client."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  asChild
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                >
                  <a href={portalUrl} target="_blank" rel="noreferrer">
                    Open secure portal
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl border border-white/10 bg-primary text-white">
          <CardHeader>
            <CardTitle>Invoice breakdown</CardTitle>
            <CardDescription className="text-slate-300">
              VAT is included in the invoice total. WHT is shown as an expected credit when
              applicable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Billed to</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {invoice.client?.companyName ?? invoice.client?.name ?? "Client"}
                </p>
                <div className="mt-3 space-y-1 text-sm text-slate-300">
                  <p>{invoice.client?.email ?? "No email on file"}</p>
                  {invoice.client?.phone ? <p>{invoice.client.phone}</p> : null}
                  {invoice.client?.address ? (
                    <p className="whitespace-pre-line">{invoice.client.address}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Tax posture</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>VAT treatment</span>
                    <span className="font-medium text-white">{formatTreatment(invoice.vatTreatment)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>WHT treatment</span>
                    <span className="font-medium text-white">{formatTreatment(invoice.whtTreatment)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Tax category</span>
                    <span className="font-medium text-white">
                      {invoice.taxCategory ? formatTreatment(invoice.taxCategory) : "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Evidence status</span>
                    <span className="font-medium text-white">
                      {formatTreatment(invoice.taxEvidenceStatus)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Subtotal</span>
                  <span className="font-medium text-white">
                    {formatCurrencyNGN(invoice.subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">VAT on invoice</span>
                  <span className="font-medium text-white">
                    {formatCurrencyNGN(invoice.taxAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Expected WHT credit</span>
                  <span className="font-medium text-white">
                    {invoice.estimatedWhtAmountMinor > 0
                      ? formatCurrencyNGN(invoice.estimatedWhtAmountMinor)
                      : "₦0"}
                  </span>
                </div>
                <Separator className="bg-white/10" />
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Total due</span>
                  <span>{formatCurrencyNGN(invoice.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Expected cash received after WHT</span>
                  <span className="font-medium text-cyan">
                    {formatCurrencyNGN(expectedCashReceived)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription className="text-slate-300">
                Invoice issuance, payment, ledger sync, and tax readiness.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvoiceTimeline items={timelineItems} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Sync overview</CardTitle>
              <CardDescription className="text-slate-300">
                Reusing the existing ledger and tax engine outputs.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Payment</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {invoice.status === "PAID" ? "Confirmed" : "Awaiting payment"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {invoice.paymentReference ?? "Generate a payment page before sharing."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Ledger</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {invoice.sync.ledgerPosted ? "Posted" : "Pending"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {invoice.ledgerEntry
                    ? `Entry #${invoice.ledgerEntry.id} on ${formatDashboardDate(
                        new Date(invoice.ledgerEntry.transactionDate)
                      )}`
                    : "A paid invoice will post into the central ledger automatically."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Tax</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {invoice.sync.taxTracked ? "Tracked" : "Ready when computed"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {invoice.sync.taxTracked
                    ? `${invoice.sync.vatRecordCount} VAT and ${invoice.sync.whtRecordCount} WHT records connected.`
                    : "The tax engine will pick this invoice up in the relevant VAT/WHT period."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
              <CardDescription className="text-slate-300">
                Email is active first. WhatsApp stays ready behind the same reminder pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan">Last sent</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {reminderSummary.lastSentLabel ?? "No reminder sent yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {reminderSummary.lastSentAt
                      ? `${formatDateTime(reminderSummary.lastSentAt)}${
                          reminderSummary.lastSentChannel
                            ? ` via ${reminderSummary.lastSentChannel.toLowerCase()}`
                            : ""
                        }`
                      : "The reminder engine will log the first successful send here."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan">Next reminder due</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {reminderSummary.nextReminderLabel ?? "No scheduled reminders remaining"}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {reminderSummary.nextReminderAt
                      ? formatDateTime(reminderSummary.nextReminderAt)
                      : invoice.status === "PAID"
                        ? "The invoice is already paid."
                        : "No further automatic reminders are currently queued."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEdit && invoice.status !== "PAID" ? (
                  <Button
                    type="button"
                    onClick={sendReminderNow}
                    disabled={sendingReminder}
                    className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                    aria-label="Send invoice reminder now"
                  >
                    {sendingReminder ? "Sending reminder..." : "Send reminder now"}
                  </Button>
                ) : null}
                <Badge
                  variant="outline"
                  className={reminderSummary.lastAttemptStatus
                    ? renderReminderStatusTone(reminderSummary.lastAttemptStatus)
                    : "border-white/10 text-slate-300"}
                >
                  {reminderSummary.lastAttemptStatus
                    ? `Last attempt: ${reminderSummary.lastAttemptStatus.toLowerCase()}`
                    : "No reminder attempts yet"}
                </Badge>
              </div>

              {reminderSummary.lastFailureMessage ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {reminderSummary.lastFailureMessage}
                </div>
              ) : null}

              <div className="space-y-3">
                <p className="text-sm font-medium text-white">Recent reminder activity</p>
                {reminderSummary.history.length === 0 ? (
                  <p className="text-sm text-slate-300">
                    No reminders have been attempted for this invoice yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {reminderSummary.history.map((entry, index) => (
                      <div
                        key={`${entry.createdAt}-${entry.type}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{entry.typeLabel}</p>
                            <p className="text-sm text-slate-300">
                              {formatDateTime(entry.createdAt)} via {entry.channel.toLowerCase()}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={renderReminderStatusTone(entry.status)}
                          >
                            {entry.status.toLowerCase()}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">
                          {entry.recipient ?? "No recipient"} • {entry.provider}
                          {entry.delivered ? " delivered" : " queued / previewed"}
                        </p>
                        {entry.error ? (
                          <p className="mt-2 text-sm text-red-100">{entry.error}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-2xl border border-white/10 bg-primary text-white">
          <CardHeader>
            <CardTitle>Invoice items</CardTitle>
            <CardDescription className="text-slate-300">
              Line items billed on this invoice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoice.items.length === 0 ? (
              <p className="text-sm text-slate-300">No line items recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 text-slate-300">
                    <tr className="text-left">
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium">Qty</th>
                      <th className="pb-3 font-medium">Unit price</th>
                      <th className="pb-3 font-medium">VAT</th>
                      <th className="pb-3 font-medium">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-3 text-white">{item.description}</td>
                        <td className="py-3 text-slate-300">{item.quantity}</td>
                        <td className="py-3 text-slate-300">
                          {formatCurrencyNGN(item.unitPrice)}
                        </td>
                        <td className="py-3 text-slate-300">{item.taxRate}%</td>
                        <td className="py-3 font-medium text-white">
                          {formatCurrencyNGN(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Ledger posting</CardTitle>
              <CardDescription className="text-slate-300">
                Income entries reuse the existing central ledger sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoice.ledgerEntry ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">Description</span>
                    <span className="font-medium text-white">{invoice.ledgerEntry.description}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">Amount</span>
                    <span className="font-medium text-white">
                      {formatCurrencyNGN(invoice.ledgerEntry.amountMinor)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">Reference</span>
                    <span className="font-medium text-white">
                      {invoice.ledgerEntry.reference ?? "Auto-synced"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">Posted on</span>
                    <span className="font-medium text-white">
                      {formatDateTime(invoice.ledgerEntry.transactionDate)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  No ledger entry yet. Once payment is confirmed, the backend will post this
                  invoice into the ledger automatically.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Tax impact</CardTitle>
              <CardDescription className="text-slate-300">
                VAT and WHT visibility using the existing tax engine and stored records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">VAT on invoice</span>
                  <span className="font-medium text-white">
                    {formatCurrencyNGN(invoice.taxAmount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-slate-300">Expected WHT</span>
                  <span className="font-medium text-white">
                    {invoice.estimatedWhtAmountMinor > 0
                      ? `${formatCurrencyNGN(invoice.estimatedWhtAmountMinor)} (${invoice.estimatedWhtRate}%)`
                      : "Not applicable"}
                  </span>
                </div>
              </div>

              {invoice.taxRecord ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                  <p className="font-medium text-white">Tax record #{invoice.taxRecord.id}</p>
                  <p className="mt-1 text-slate-300">
                    Source {invoice.taxRecord.source ?? "invoice"} · recorded on{" "}
                    {formatDashboardDate(new Date(invoice.taxRecord.occurredOn))}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  The invoice tax record is created when payment is confirmed.
                </p>
              )}

              {(invoice.vatRecords.length > 0 || invoice.whtRecords.length > 0) && (
                <div className="space-y-3">
                  {invoice.vatRecords.map((record) => (
                    <div
                      key={`vat-${record.id}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
                    >
                      <p className="font-medium text-white">
                        VAT · {record.taxPeriod.label}
                      </p>
                      <p className="mt-1 text-slate-300">
                        {formatCurrencyNGN(record.vatAmountMinor)} on basis{" "}
                        {formatCurrencyNGN(record.basisAmountMinor)}
                      </p>
                    </div>
                  ))}
                  {invoice.whtRecords.map((record) => (
                    <div
                      key={`wht-${record.id}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
                    >
                      <p className="font-medium text-white">
                        WHT · {record.taxPeriod.label}
                      </p>
                      <p className="mt-1 text-slate-300">
                        {formatCurrencyNGN(record.whtAmountMinor)} at {record.whtRate}% on basis{" "}
                        {formatCurrencyNGN(record.basisAmountMinor)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/tax">Open tax dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-2xl border border-white/10 bg-primary text-white">
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription className="text-slate-300">
            Additional instructions, memo, or payment context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">
            {invoice.notes?.trim() || "No notes added."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
