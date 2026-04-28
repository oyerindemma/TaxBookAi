"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrencyNGN, formatDashboardDate } from "@/lib/dashboard-formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import RecurringInvoiceForm, {
  type RecurringInvoiceFormValues,
} from "@/app/dashboard/recurring-invoices/_components/RecurringInvoiceForm";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ClientOption = {
  id: number;
  displayName: string;
  email: string;
};

type RecurringGeneratedInvoice = {
  id: number;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  paymentReference: string | null;
  paymentPagePath: string | null;
  createdAt: string;
};

type RecurringInvoiceDetail = {
  id: number;
  clientId: number;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  dueInDays: number;
  invoiceStatus: "DRAFT" | "SENT";
  paymentEnabled: boolean;
  currency: string;
  vatTreatment: "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
  whtTreatment: "NONE" | "PAYABLE" | "RECEIVABLE";
  taxCategory: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  templateItemCount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  generatedInvoiceCount: number;
  lastGeneratedInvoice: RecurringGeneratedInvoice | null;
  generatedInvoices: RecurringGeneratedInvoice[];
  client: {
    id: number;
    name: string;
    companyName: string | null;
    email: string;
  };
  templateItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
};

type Props = {
  role: Role;
  clients: ClientOption[];
  initialRecurringInvoice: RecurringInvoiceDetail;
};

function frequencyLabel(value: RecurringInvoiceDetail["frequency"]) {
  switch (value) {
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "QUARTERLY":
      return "Quarterly";
  }
}

function formatLabel(value: string | null) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ").toLowerCase();
}

function toFormValues(recurringInvoice: RecurringInvoiceDetail): RecurringInvoiceFormValues {
  return {
    clientId: String(recurringInvoice.clientId),
    frequency: recurringInvoice.frequency,
    startDate: recurringInvoice.startDate.slice(0, 10),
    nextRunAt: recurringInvoice.nextRunAt.slice(0, 10),
    endDate: recurringInvoice.endDate?.slice(0, 10) ?? "",
    dueInDays: String(recurringInvoice.dueInDays),
    invoiceStatus: recurringInvoice.invoiceStatus,
    paymentEnabled: recurringInvoice.paymentEnabled,
    currency: recurringInvoice.currency,
    vatTreatment:
      recurringInvoice.vatTreatment === "INPUT"
        ? "OUTPUT"
        : recurringInvoice.vatTreatment,
    whtTreatment: recurringInvoice.whtTreatment,
    taxCategory: recurringInvoice.taxCategory ?? "SALES_SERVICES",
    active: recurringInvoice.active,
    notes: recurringInvoice.notes ?? "",
    items: recurringInvoice.templateItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: (item.unitPrice / 100).toFixed(2),
      taxRate: String(item.taxRate),
    })),
  };
}

function serializePayload(values: RecurringInvoiceFormValues) {
  return {
    clientId: Number(values.clientId),
    frequency: values.frequency,
    startDate: values.startDate,
    nextRunAt: values.nextRunAt,
    endDate: values.endDate || null,
    dueInDays: Number(values.dueInDays),
    invoiceStatus: values.invoiceStatus,
    paymentEnabled: values.paymentEnabled,
    currency: values.currency,
    vatTreatment: values.vatTreatment,
    whtTreatment: values.whtTreatment,
    taxCategory: values.taxCategory || null,
    active: values.active,
    notes: values.notes,
    items: values.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      taxRate: Number(item.taxRate),
    })),
  };
}

export default function RecurringInvoiceDetailClient({
  role,
  clients,
  initialRecurringInvoice,
}: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [recurringInvoice, setRecurringInvoice] = useState(initialRecurringInvoice);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleUpdate(values: RecurringInvoiceFormValues) {
    if (!canEdit) return;
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/recurring-invoices/${recurringInvoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializePayload(values)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to update recurring invoice");
        return;
      }

      setRecurringInvoice(data.recurringInvoice);
      setMessage("Recurring invoice updated.");
      router.refresh();
    } catch {
      setError("Network error updating recurring invoice");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(nextActive: boolean) {
    const nextValues = {
      ...toFormValues(recurringInvoice),
      active: nextActive,
    };
    await handleUpdate(nextValues);
  }

  async function handleGenerateNow() {
    if (!canEdit) return;
    setError(null);
    setMessage(null);
    setGenerating(true);

    try {
      const res = await fetch(`/api/recurring-invoices/${recurringInvoice.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to generate invoice");
        return;
      }

      setRecurringInvoice(data.recurringInvoice);
      setMessage(`Generated invoice ${data.invoice.invoiceNumber}.`);
      router.refresh();
    } catch {
      setError("Network error generating invoice");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!canEdit) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete recurring invoice for ${recurringInvoice.displayName}? This cannot be undone.`
          );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/recurring-invoices/${recurringInvoice.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to delete recurring invoice");
        return;
      }

      router.push("/dashboard/invoices/recurring");
      router.refresh();
    } catch {
      setError("Network error deleting recurring invoice");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">
          {message}
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
                  Recurring invoice
                </p>
                <Badge variant={recurringInvoice.active ? "secondary" : "outline"}>
                  {recurringInvoice.active ? "Active" : "Paused"}
                </Badge>
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {recurringInvoice.displayName}
                </h1>
                <p className="max-w-2xl text-sm text-slate-300">
                  {frequencyLabel(recurringInvoice.frequency)} billing template that generates{" "}
                  {recurringInvoice.invoiceStatus.toLowerCase()} invoices for{" "}
                  {recurringInvoice.client.companyName ?? recurringInvoice.client.name}.
                </p>
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-slate-300">
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Next run
                  </span>
                  <span className="font-medium text-white">
                    {formatDashboardDate(new Date(recurringInvoice.nextRunAt))}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Per run total
                  </span>
                  <span className="font-medium text-white">
                    {formatCurrencyNGN(recurringInvoice.totalAmount)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Generated invoices
                  </span>
                  <span className="font-medium text-white">
                    {recurringInvoice.generatedInvoiceCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/invoices/recurring">Back to templates</Link>
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleToggleActive(!recurringInvoice.active)}
                  disabled={saving}
                >
                  {recurringInvoice.active ? "Pause template" : "Resume template"}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  onClick={handleGenerateNow}
                  disabled={generating}
                >
                  {generating ? "Generating..." : "Generate invoice now"}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-2xl border border-white/10 bg-primary text-white">
          <CardHeader>
            <CardTitle>Schedule summary</CardTitle>
            <CardDescription className="text-slate-300">
              This template continues through the normal invoice, reminder, payment, ledger,
              and tax flow after each generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Schedule</p>
                <div className="mt-3 space-y-2 text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>Frequency</span>
                    <span className="font-medium text-white">
                      {frequencyLabel(recurringInvoice.frequency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Start date</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(recurringInvoice.startDate))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Next run</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(recurringInvoice.nextRunAt))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>End date</span>
                    <span className="font-medium text-white">
                      {recurringInvoice.endDate
                        ? formatDashboardDate(new Date(recurringInvoice.endDate))
                        : "No end date"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Generation defaults</p>
                <div className="mt-3 space-y-2 text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>Invoice status</span>
                    <span className="font-medium text-white">
                      {recurringInvoice.invoiceStatus.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Due terms</span>
                    <span className="font-medium text-white">
                      {recurringInvoice.dueInDays} day(s)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Payment link</span>
                    <span className="font-medium text-white">
                      {recurringInvoice.paymentEnabled ? "Prepared automatically" : "Manual"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Currency</span>
                    <span className="font-medium text-white">
                      {recurringInvoice.currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Tax posture</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3 text-slate-300">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      VAT
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {formatLabel(recurringInvoice.vatTreatment)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      WHT
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {formatLabel(recurringInvoice.whtTreatment)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Tax category
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {formatLabel(recurringInvoice.taxCategory)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {recurringInvoice.notes ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Template notes</p>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
                  {recurringInvoice.notes}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-white/10 bg-primary text-white">
          <CardHeader>
            <CardTitle>Generated invoice history</CardTitle>
            <CardDescription className="text-slate-300">
              Each generated invoice continues through the normal payment, reminder, ledger,
              and tax pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recurringInvoice.generatedInvoices.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No invoices have been generated from this template yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr className="text-left text-slate-300">
                      <th className="pb-3 font-medium">Invoice</th>
                      <th className="pb-3 font-medium">Issue date</th>
                      <th className="pb-3 font-medium">Total</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringInvoice.generatedInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-3">
                          <Link
                            href={`/dashboard/invoices/${invoice.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="py-3">
                          {formatDashboardDate(new Date(invoice.issueDate))}
                        </td>
                        <td className="py-3">{formatCurrencyNGN(invoice.totalAmount)}</td>
                        <td className="py-3">
                          <Badge variant={invoice.status === "PAID" ? "secondary" : "outline"}>
                            {invoice.status.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" asChild>
                              <Link href={`/dashboard/invoices/${invoice.id}`}>Open</Link>
                            </Button>
                            {invoice.paymentPagePath && invoice.status !== "PAID" ? (
                              <Button type="button" size="sm" variant="outline" asChild>
                                <a
                                  href={invoice.paymentPagePath}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Pay page
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RecurringInvoiceForm
        key={`${recurringInvoice.id}-${recurringInvoice.updatedAt}`}
        title="Edit recurring template"
        description="Update the schedule, template items, and invoice defaults used for future generated invoices."
        submitLabel="Save changes"
        clients={clients}
        initialValues={toFormValues(recurringInvoice)}
        saving={saving}
        error={error}
        disabled={!canEdit}
        onSubmit={handleUpdate}
      />
    </section>
  );
}
