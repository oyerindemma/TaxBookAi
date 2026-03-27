import "server-only";

import { logAudit } from "@/lib/audit";
import { getDeploymentStage } from "@/lib/env";
import { logError, logInfo } from "@/lib/logger";

export type PaymentLifecycleEvent =
  | "PAYMENT_INIT"
  | "PAYMENT_CALLBACK_RECEIVED"
  | "PAYMENT_WEBHOOK_RECEIVED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_FAILED"
  | "LEDGER_POSTED"
  | "TAX_SYNCED";

type PaymentLifecycleLogInput = {
  event: PaymentLifecycleEvent;
  invoiceId: number | null;
  reference: string | null;
  workspaceId: number | null;
  status: string;
  actorUserId?: number | null;
  metadata?: Record<string, unknown>;
  error?: unknown;
  timestamp?: Date;
};

export async function logPaymentLifecycleEvent(input: PaymentLifecycleLogInput) {
  const timestamp = (input.timestamp ?? new Date()).toISOString();
  const payload = {
    invoiceId: input.invoiceId,
    reference: input.reference,
    workspaceId: input.workspaceId,
    status: input.status,
    timestamp,
    ...(input.metadata ?? {}),
  };

  if (input.event === "PAYMENT_FAILED") {
    logError(
      "payments",
      input.event,
      input.error ?? new Error(`Payment lifecycle failed with status ${input.status}`),
      payload
    );
  } else {
    logInfo("payments", input.event, payload);
  }

  if (
    getDeploymentStage() === "production" &&
    typeof input.workspaceId === "number" &&
    input.workspaceId > 0
  ) {
    await logAudit({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: input.event,
      metadata: payload,
    });
  }
}
