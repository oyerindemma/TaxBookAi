import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceInvoiceDetail } from "@/lib/invoice-records";
import { getInvoiceReminderSummary } from "@/lib/invoice-reminders";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import InvoiceDetailClient from "./_components/InvoiceDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvoicePageNotice = {
  kind: "success" | "error" | "info";
  message: string;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function buildInvoicePaymentNotice(
  params: Record<string, string | string[] | undefined>
): InvoicePageNotice | null {
  const payment = getSingleSearchParam(params.payment);
  if (!payment) {
    return null;
  }

  const ledger = getSingleSearchParam(params.ledger);
  const tax = getSingleSearchParam(params.tax);
  const paymentStatus = getSingleSearchParam(params.payment_status);

  if (payment === "success" || payment === "already_processed") {
    const parts = [
      payment === "already_processed"
        ? "This Paystack payment was already confirmed earlier."
        : "Paystack payment confirmed.",
    ];

    if (ledger === "posted") {
      parts.push("Ledger entry confirmed.");
    }

    if (tax === "synced") {
      parts.push("Tax sync confirmed.");
    }

    return {
      kind: "success",
      message: parts.join(" "),
    };
  }

  if (payment === "not_successful") {
    return {
      kind: "info",
      message: paymentStatus
        ? `Paystack still reports this payment as ${paymentStatus}.`
        : "Paystack has not marked this payment successful yet.",
    };
  }

  const messageMap: Record<string, string> = {
    invalid_reference: "The Paystack callback did not include a valid payment reference.",
    not_found: "We could not find the invoice linked to this Paystack payment.",
    configuration_error: "Paystack is not configured correctly in this environment.",
    reference_mismatch: "The verified Paystack transaction did not match this invoice.",
    amount_mismatch: "The verified Paystack amount did not match the invoice total.",
    processing_failed: "We could not finish posting this payment into accounting.",
    verification_error: "We could not verify this Paystack payment right now.",
  };

  return {
    kind: payment === "not_successful" ? "info" : "error",
    message: messageMap[payment] ?? "We could not finish this invoice payment flow.",
  };
}

export const runtime = "nodejs";

export default async function InvoiceDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoice</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to view invoices.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoice not found</h1>
          <p className="text-muted-foreground">
            The invoice id in the URL is invalid.
          </p>
        </div>
      </section>
    );
  }

  const invoice = await getWorkspaceInvoiceDetail(membership.workspaceId, invoiceId);

  if (!invoice) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoice not found</h1>
          <p className="text-muted-foreground">
            The invoice may have been removed or does not belong to this workspace.
          </p>
        </div>
      </section>
    );
  }

  const reminderSummary = await getInvoiceReminderSummary(membership.workspaceId, invoiceId);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialNotice = buildInvoicePaymentNotice(resolvedSearchParams);

  return (
    <InvoiceDetailClient
      role={membership.role}
      initialInvoice={invoice}
      initialReminderSummary={reminderSummary}
      initialNotice={initialNotice}
    />
  );
}
