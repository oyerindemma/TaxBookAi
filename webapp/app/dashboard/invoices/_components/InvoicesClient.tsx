"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import {
  formatCurrencyNGN,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ReceiptText } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type Invoice = {
  id: number;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  issueDate: string | Date;
  dueDate: string | Date;
  totalAmount: number;
  paymentPagePath?: string | null;
  client: { id: number; name: string; companyName: string | null };
};

type Props = {
  role: Role;
  initialInvoices: Invoice[];
};

export default function InvoicesClient({ role, initialInvoices }: Props) {
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function updateStatus(invoiceId: number, status: Invoice["status"]) {
    if (!canEdit) return;
    setUpdatingId(invoiceId);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to update invoice");
      }

      setInvoices((prev) =>
        prev.map((invoice) =>
          invoice.id === invoiceId ? { ...invoice, ...data.invoice } : invoice
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  }

  const totalOutstanding = useMemo(() => {
    return invoices
      .filter((invoice) => invoice.status !== "PAID")
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  }, [invoices]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground">
            Track client billing and payment status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              asChild
              className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <Link href="/dashboard/invoices/new">
                <Plus className="size-4" />
                New invoice
              </Link>
            </Button>
          ) : (
            <Button disabled>New invoice</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total invoices</CardDescription>
            <CardTitle className="text-xl">{invoices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
            <CardTitle className="text-xl">{formatCurrencyNGN(totalOutstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid invoices</CardDescription>
            <CardTitle className="text-xl">
              {invoices.filter((invoice) => invoice.status === "PAID").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invoice list</CardTitle>
          <CardDescription>Recent invoices for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ReceiptText className="size-5" />
              </div>
              <p className="mt-3 text-sm font-medium">No invoices yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create an invoice, send it to a client, and track payment here.
              </p>
              {canEdit ? (
                <Button asChild className="mt-4">
                  <Link href="/dashboard/invoices/new">
                    <Plus className="size-4" />
                    Create invoice
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Invoice</th>
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Issue</th>
                  <th className="pb-3 font-medium">Due</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                  {canEdit && <th className="pb-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-b-0">
                    <td className="py-3">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-3">
                      {invoice.client ? (
                        <Link
                          href={`/dashboard/clients/${invoice.client.id}`}
                          className="hover:underline"
                        >
                          {invoice.client.companyName ?? invoice.client.name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3">
                      {formatDashboardDate(new Date(invoice.issueDate))}
                    </td>
                    <td className="py-3">
                      {formatDashboardDate(new Date(invoice.dueDate))}
                    </td>
                    <td className="py-3">{formatCurrencyNGN(invoice.totalAmount)}</td>
                    <td className="py-3">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    {canEdit && (
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {invoice.paymentPagePath && invoice.status !== "PAID" ? (
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={invoice.paymentPagePath}>Pay page</Link>
                            </Button>
                          ) : null}
                          {invoice.status !== "PAID" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === invoice.id}
                              onClick={() => updateStatus(invoice.id, "PAID")}
                            >
                              Mark paid
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updatingId === invoice.id}
                              onClick={() => updateStatus(invoice.id, "SENT")}
                            >
                              Mark unpaid
                            </Button>
                          )}
                          {invoice.status === "DRAFT" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updatingId === invoice.id}
                              onClick={() => updateStatus(invoice.id, "SENT")}
                            >
                              Mark sent
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
