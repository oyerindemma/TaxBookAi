"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import RecurringInvoiceForm, {
  EMPTY_RECURRING_INVOICE_FORM_VALUES,
  type RecurringInvoiceFormValues,
} from "@/app/dashboard/recurring-invoices/_components/RecurringInvoiceForm";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ClientOption = {
  id: number;
  displayName: string;
  email: string;
};

type Props = {
  role: Role;
  clients: ClientOption[];
};

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

export default function RecurringInvoiceCreateClient({ role, clients }: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(values: RecurringInvoiceFormValues) {
    if (!canEdit) return;
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/recurring-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializePayload(values)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to create recurring invoice");
        return;
      }

      router.push(`/dashboard/invoices/recurring/${data.recurringInvoice.id}`);
      router.refresh();
    } catch {
      setError("Network error creating recurring invoice");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Card className="rounded-2xl bg-primary text-white shadow-glow">
        <CardHeader>
          <CardTitle>Read-only access</CardTitle>
          <CardDescription className="text-slate-300">
            You need member access or higher to create recurring invoice templates.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">New recurring invoice</h1>
          <p className="text-muted-foreground">
            Build a reusable template that generates standard invoices on schedule.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/invoices/recurring">Back to recurring invoices</Link>
        </Button>
      </div>

      <RecurringInvoiceForm
        title="Create recurring template"
        description="Set the client, schedule, tax posture, and line items once. TaxBook will generate normal invoices from this template."
        submitLabel="Create recurring invoice"
        clients={clients}
        initialValues={EMPTY_RECURRING_INVOICE_FORM_VALUES}
        saving={saving}
        error={error}
        disabled={clients.length === 0}
        onSubmit={handleCreate}
      />
    </section>
  );
}
