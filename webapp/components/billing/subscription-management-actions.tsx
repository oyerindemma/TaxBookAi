"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SubscriptionManagementActionsProps = {
  canManage: boolean;
  canCancel: boolean;
  canVerify: boolean;
  reference?: string | null;
};

export function SubscriptionManagementActions({
  canManage,
  canCancel,
  canVerify,
  reference,
}: SubscriptionManagementActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!canManage && !canCancel && !canVerify) {
    return null;
  }

  async function runAction(action: "manage" | "cancel" | "verify") {
    setMessage(null);
    setError(null);
    setPendingAction(action);

    try {
      const endpoint =
        action === "manage"
          ? "/api/billing/manage"
          : action === "cancel"
            ? "/api/billing/cancel"
            : "/api/billing/verify";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "verify"
            ? JSON.stringify({ reference })
            : JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }

      setMessage(
        data.message ??
          (action === "manage"
            ? "A Paystack customer portal link was requested."
            : action === "cancel"
              ? "Subscription auto-renew has been updated."
              : "Billing status rechecked successfully.")
      );
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error running billing action");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canVerify ? (
          <Button
            type="button"
            variant="outline"
            disabled={!reference || pendingAction !== null}
            onClick={() => runAction("verify")}
          >
            {pendingAction === "verify" ? "Checking..." : "Recheck billing"}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => runAction("manage")}
          >
            {pendingAction === "manage" ? "Sending..." : "Email portal link"}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => runAction("cancel")}
          >
            {pendingAction === "cancel" ? "Updating..." : "Cancel auto-renew"}
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
