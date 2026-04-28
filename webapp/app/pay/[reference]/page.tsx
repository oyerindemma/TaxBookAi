import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getPaymentRuntimeConfig,
  hasPaystackServerConfig,
} from "@/lib/env";
import {
  formatCurrencyNGN,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import { getPublicInvoicePaymentDetail } from "@/lib/invoice-records";
import InvoicePaymentPageClient from "./_components/InvoicePaymentPageClient";

type PageProps = {
  params: Promise<{ reference?: string }>;
  searchParams: Promise<{ trxref?: string; reference?: string; provider?: string }>;
};

export const runtime = "nodejs";

export default async function InvoicePaymentPage({
  params,
  searchParams,
}: PageProps) {
  const { reference } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = reference?.trim() ?? "";

  if (!identifier) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
        <Card className="w-full rounded-2xl bg-primary text-white shadow-glow">
          <CardHeader>
            <CardTitle>Payment link not found</CardTitle>
            <CardDescription className="text-slate-300">
              The payment reference is invalid.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const invoice = await getPublicInvoicePaymentDetail(identifier);

  if (!invoice) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
        <Card className="w-full rounded-2xl bg-primary text-white shadow-glow">
          <CardHeader>
            <CardTitle>Payment link unavailable</CardTitle>
            <CardDescription className="text-slate-300">
              This payment reference does not match an active invoice.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const { allowStubPayments } = getPaymentRuntimeConfig();
  const autoVerifyGatewayReference =
    resolvedSearchParams.trxref?.trim() ||
    resolvedSearchParams.reference?.trim() ||
    null;

  return (
    <main className="min-h-screen bg-primary px-6 py-12 text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
          <CardHeader className="space-y-3 border-b border-white/10 bg-white/5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
                TaxBook AI payments
              </p>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl">Invoice {invoice.invoiceNumber}</CardTitle>
              <CardDescription className="text-slate-300">
                Secure hosted payment page for{" "}
                <span className="font-medium text-white">
                  {invoice.client?.companyName ?? invoice.client?.name ?? "your client"}
                </span>
                .
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Invoice summary</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Issue date</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(invoice.issueDate))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Due date</span>
                    <span className="font-medium text-white">
                      {formatDashboardDate(new Date(invoice.dueDate))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payment reference</span>
                    <span className="font-medium text-white">
                      {invoice.paymentReference ?? "Not ready"}
                    </span>
                  </div>
                  {invoice.paidAt ? (
                    <div className="flex items-center justify-between">
                      <span>Paid at</span>
                      <span className="font-medium text-white">
                        {new Date(invoice.paidAt).toLocaleString("en-NG")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan">Bill to</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {invoice.client?.companyName ?? invoice.client?.name ?? "Client"}
                </p>
                <div className="mt-2 space-y-1 text-sm text-slate-300">
                  <p>{invoice.client?.email ?? "No billing email on file"}</p>
                  {invoice.client?.phone ? <p>{invoice.client.phone}</p> : null}
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
                  <span className="text-slate-300">VAT</span>
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
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-white/10 text-left text-slate-300">
                  <tr>
                    <th className="pb-3 font-medium">Description</th>
                    <th className="pb-3 font-medium">Qty</th>
                    <th className="pb-3 font-medium">Unit price</th>
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
                      <td className="py-3 font-medium text-white">
                        {formatCurrencyNGN(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
          <CardHeader>
            <CardTitle>Complete payment</CardTitle>
            <CardDescription className="text-slate-300">
              Checkout triggers the existing invoice payment confirmation flow, which then syncs
              ledger income and tax records.
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
            />

            <Separator className="bg-white/10" />

            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">What happens after payment?</p>
              <p>1. The invoice is marked paid.</p>
              <p>2. Income is posted into the ledger automatically.</p>
              <p>3. VAT and WHT records become available in the tax dashboard.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
              <p>
                Need a copy of the invoice instead? Ask the sender for the invoice PDF or payment
                instructions.
              </p>
              <Button variant="ghost" asChild>
                <Link href="/">TaxBook</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
