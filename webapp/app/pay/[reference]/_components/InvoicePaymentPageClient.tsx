"use client";

import { useEffect, useRef, useState } from "react";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyNGN } from "@/lib/dashboard-formatting";

type Props = {
  invoiceId: number;
  invoiceNumber: string;
  amountMinor: number;
  initialStatus: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  initialPaidAt: string | null;
  paymentReference: string | null;
  canSimulate: boolean;
  hasPaystackCheckout: boolean;
  autoVerifyGatewayReference: string | null;
  checkoutPath?: string;
  verifyPath?: string;
};

type PaymentConfirmation = {
  ledgerConfirmed?: boolean;
  taxConfirmed?: boolean;
  alreadyProcessed?: boolean;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-NG");
}

function buildPostingStatusMessage(
  confirmation: PaymentConfirmation | null | undefined,
  fallback: string
) {
  if (!confirmation) {
    return fallback;
  }

  const parts: string[] = [];
  if (confirmation.alreadyProcessed) {
    parts.push("This payment was already confirmed earlier.");
  } else {
    parts.push("Payment confirmed.");
  }

  if (confirmation.ledgerConfirmed) {
    parts.push("Ledger posted.");
  }

  if (confirmation.taxConfirmed) {
    parts.push("Tax sync completed.");
  }

  return parts.join(" ");
}

export default function InvoicePaymentPageClient({
  invoiceId,
  invoiceNumber,
  amountMinor,
  initialStatus,
  initialPaidAt,
  paymentReference,
  canSimulate,
  hasPaystackCheckout,
  autoVerifyGatewayReference,
  checkoutPath,
  verifyPath,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [paidAt, setPaidAt] = useState(initialPaidAt);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    autoVerifyGatewayReference ? "Verifying your Paystack payment..." : null
  );
  const [confirming, setConfirming] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const hasAutoVerified = useRef(false);

  async function handleConfirmPayment() {
    if (!paymentReference) return;
    setConfirming(true);
    setError(null);
    setInfo(null);

    try {
      const now = new Date().toISOString();
      const res = await fetch("/api/payments/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "payment.confirmed",
          reference: paymentReference,
          provider: "stub",
          paidAt: now,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to confirm payment");
        return;
      }

      setStatus("PAID");
      setPaidAt(now);
      setInfo(
        buildPostingStatusMessage(
          data?.confirmation,
          "Payment confirmed. Ledger and tax records are syncing from the invoice backend."
        )
      );
    } catch {
      setError("Network error confirming payment");
    } finally {
      setConfirming(false);
    }
  }

  async function handlePaystackCheckout() {
    if (!paymentReference) return;
    setStartingCheckout(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(
        checkoutPath ?? `/api/payments/checkout/${encodeURIComponent(paymentReference)}`,
        {
          method: "POST",
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to start checkout");
        return;
      }

      if (typeof data?.url === "string" && data.url) {
        window.location.assign(data.url);
        return;
      }

      setError("Checkout URL was not returned by the server.");
    } catch {
      setError("Network error starting checkout");
    } finally {
      setStartingCheckout(false);
    }
  }

  async function handleVerifyPaystack(gatewayReference: string) {
    if (!paymentReference) return;
    setConfirming(true);
    setError(null);
    setInfo("Verifying your Paystack payment...");

    try {
      const res = await fetch(
        verifyPath ?? `/api/payments/verify/${encodeURIComponent(paymentReference)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gatewayReference }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to verify payment");
        setInfo(null);
        return;
      }

      setStatus("PAID");
      setPaidAt(data?.invoice?.paidAt ?? new Date().toISOString());
      setInfo(
        buildPostingStatusMessage(
          {
            ...data?.confirmation,
            alreadyProcessed: data?.alreadyProcessed,
          },
          data?.alreadyProcessed
            ? "This Paystack payment was already confirmed earlier."
            : "Paystack payment verified. Ledger and tax updates now reflect this invoice."
        )
      );
    } catch {
      setError("Network error verifying payment");
      setInfo(null);
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (
      !autoVerifyGatewayReference ||
      !paymentReference ||
      status === "PAID" ||
      hasAutoVerified.current
    ) {
      return;
    }

    hasAutoVerified.current = true;
    void handleVerifyPaystack(autoVerifyGatewayReference);
  }, [autoVerifyGatewayReference, paymentReference, status]);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300">Payment status</span>
          <InvoiceStatusBadge status={status} />
        </div>
        <p className="text-sm text-slate-300">
          Invoice {invoiceNumber} for {formatCurrencyNGN(amountMinor)} is linked to{" "}
          <span className="font-medium text-white">
            {paymentReference ?? `invoice id ${invoiceId}`}
          </span>
          .
        </p>
      </div>

      {paidAt ? (
        <p className="text-sm text-slate-300">Payment recorded on {formatDate(paidAt)}.</p>
      ) : null}

      {info ? (
        <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan">
          {info}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {status !== "PAID" ? (
        <div className="space-y-3">
          {paymentReference && hasPaystackCheckout ? (
            <Button
              type="button"
              onClick={handlePaystackCheckout}
              disabled={startingCheckout || confirming}
              className="w-full rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
              aria-label="Pay this invoice with Paystack"
            >
              {startingCheckout ? "Opening Paystack..." : "Pay with Paystack"}
            </Button>
          ) : null}

          {canSimulate ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirmPayment}
              disabled={confirming || startingCheckout || !paymentReference}
              className="w-full"
              aria-label="Simulate payment confirmation"
            >
              {confirming ? "Confirming..." : "Simulate payment confirmation"}
            </Button>
          ) : null}

          {!hasPaystackCheckout && !canSimulate ? (
            <p className="text-sm text-slate-300">
              Online checkout is not enabled in this environment yet. The sender can still confirm
              payment through the existing invoice payment workflow.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-300">
          Payment has been confirmed. The invoice is closed and its ledger/tax entries are linked.
        </p>
      )}
    </section>
  );
}
