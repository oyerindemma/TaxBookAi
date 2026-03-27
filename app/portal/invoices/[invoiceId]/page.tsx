import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceTimeline } from "@/components/invoices/invoice-timeline";
import { InvoicePrintButton } from "@/components/invoices/invoice-print-button";
import {
  formatCurrencyNGN,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import {
  getInvoicePortalAccessFromCookies,
  getLatestInvoicePortalView,
} from "@/lib/invoice-portal";
import { getInvoiceDetailById } from "@/lib/invoice-records";
import { getPaymentRuntimeConfig, hasPaystackServerConfig } from "@/lib/env";
import InvoicePaymentPageClient from "@/app/pay/[reference]/_components/InvoicePaymentPageClient";

type PageProps = {
  params: Promise<{
    invoiceId?: string;
  }>;
  searchParams: Promise<{
    trxref?: string;
    reference?: string;
    provider?: string;
  }>;
};

function parseId(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDateTime(value: string | Date | null | undefined) {
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

export const runtime = "nodejs";

export default async function PortalInvoicePage({ params, searchParams }: PageProps) {
  const { invoiceId } = await params;
  const parsedInvoiceId = parseId(invoiceId);
  if (!parsedInvoiceId) {
    notFound();
  }

  const access = await getInvoicePortalAccessFromCookies(parsedInvoiceId);
  if (!access) {
    return (
      <main className="min-h-screen bg-primary px-6 py-12 text-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center">
          <Card className="w-full rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>Secure link required</CardTitle>
              <CardDescription className="text-slate-300">
                This invoice portal is only available through the secure link shared with you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-300">
                Reopen the original invoice link from your email or ask the sender to generate a
                fresh portal link.
              </p>
              <Button asChild className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90">
                <Link href="/portal">Return to client portal</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const invoice = await getInvoiceDetailById(parsedInvoiceId);
  if (!invoice) {
    notFound();
  }

  const lastViewedAt = await getLatestInvoicePortalView(invoice.workspaceId, invoice.id);
  const { allowStubPayments } = getPaymentRuntimeConfig();
  const resolvedSearchParams = await searchParams;
  const autoVerifyGatewayReference =
    resolvedSearchParams.trxref?.trim() ||
    resolvedSearchParams.reference?.trim() ||
    null;

  const issuerName = invoice.clientBusiness?.name ?? invoice.workspace?.name ?? "TaxBook AI";
  const expectedCashReceived = invoice.totalAmount - invoice.estimatedWhtAmountMinor;
  const timelineItems = [
    {
      label: "Issued",
      detail: `Invoice ${invoice.invoiceNumber} was issued for payment.`,
      date: formatDateTime(invoice.issueDate),
      tone: "warning" as const,
    },
    ...(lastViewedAt
      ? [
          {
            label: "Viewed",
            detail: "This secure invoice link has been opened.",
            date: formatDateTime(lastViewedAt),
            tone: "success" as const,
          },
        ]
      : []),
    ...(invoice.paidAt
      ? [
          {
            label: "Paid",
            detail: "Payment has been confirmed and the invoice is closed.",
            date: formatDateTime(invoice.paidAt),
            tone: "success" as const,
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen bg-primary px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="space-y-6">
          <Card className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
            <CardHeader className="space-y-4 border-b border-white/10 bg-white/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
                    Secure invoice portal
                  </p>
                  <div className="space-y-1">
                    <CardTitle className="text-3xl">{invoice.invoiceNumber}</CardTitle>
                    <CardDescription className="text-slate-300">
                      {issuerName} sent you this invoice through TaxBook AI.
                    </CardDescription>
                  </div>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan">From</p>
                  <p className="mt-2 text-lg font-semibold text-white">{issuerName}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {invoice.clientBusiness?.defaultCurrency ?? "NGN"} billing
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan">Billed to</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {invoice.client?.companyName ?? invoice.client?.name ?? "Client"}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-slate-300">
                    <p>{invoice.client?.email ?? "No billing email on file"}</p>
                    {invoice.client?.phone ? <p>{invoice.client.phone}</p> : null}
                    {invoice.client?.address ? (
                      <p className="whitespace-pre-line">{invoice.client.address}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Issue date</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(invoice.issueDate))}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span>Due date</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(invoice.dueDate))}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span>Payment reference</span>
                    <span className="font-medium text-white">
                      {invoice.paymentReference ?? "Pending"}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Subtotal</span>
                    <span className="font-medium text-white">
                      {formatCurrencyNGN(invoice.subtotal)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span>VAT</span>
                    <span className="font-medium text-white">
                      {formatCurrencyNGN(invoice.taxAmount)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span>Expected WHT credit</span>
                    <span className="font-medium text-white">
                      {invoice.estimatedWhtAmountMinor > 0
                        ? formatCurrencyNGN(invoice.estimatedWhtAmountMinor)
                        : "₦0"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 text-left text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Unit price</th>
                      <th className="px-4 py-3 font-medium">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="border-b border-white/10 last:border-b-0">
                        <td className="px-4 py-3 text-white">{item.description}</td>
                        <td className="px-4 py-3 text-slate-300">{item.quantity}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {formatCurrencyNGN(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {formatCurrencyNGN(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    <span>Total amount</span>
                    <span>{formatCurrencyNGN(invoice.totalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Expected cash after WHT</span>
                    <span className="font-medium text-cyan">
                      {formatCurrencyNGN(expectedCashReceived)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>Pay this invoice</CardTitle>
              <CardDescription className="text-slate-300">
                Payments are processed through the existing TaxBook AI invoice payment flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <InvoicePaymentPageClient
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                amountMinor={invoice.totalAmount}
                paymentReference={invoice.paymentReference}
                initialStatus={invoice.status}
                initialPaidAt={invoice.paidAt ? new Date(invoice.paidAt).toISOString() : null}
                canSimulate={allowStubPayments}
                hasPaystackCheckout={hasPaystackServerConfig()}
                autoVerifyGatewayReference={autoVerifyGatewayReference}
                checkoutPath={`/api/portal/invoices/${invoice.id}/checkout`}
                verifyPath={`/api/portal/invoices/${invoice.id}/verify`}
              />

              <div className="flex flex-wrap gap-2">
                <InvoicePrintButton className="w-full sm:w-auto" />
                {invoice.paymentReference ? (
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full sm:w-auto"
                  >
                    <Link href={`/pay/${encodeURIComponent(invoice.paymentReference)}`}>
                      Open hosted pay page
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                Your payment is protected by secure server-side validation before the invoice can be
                viewed or charged.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Status timeline</CardTitle>
              <CardDescription className="text-slate-300">
                Issued, viewed, and paid status for this invoice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvoiceTimeline items={timelineItems} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
