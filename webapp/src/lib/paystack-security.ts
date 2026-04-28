import crypto from "node:crypto";
import type { DeploymentStage } from "@/lib/env";

export function isStubPaymentModeAllowed(input: {
  deploymentStage: DeploymentStage;
  explicitAllowStubPayments?: boolean | null;
}) {
  if (input.deploymentStage === "production") return false;
  return input.explicitAllowStubPayments ?? input.deploymentStage === "development";
}

export function createPaystackWebhookSignature(rawBody: string, webhookSecret: string) {
  return crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
}

export function verifyPaystackWebhookSignatureWithSecret(input: {
  rawBody: string;
  signature?: string | null;
  webhookSecret?: string | null;
}) {
  const signature = input.signature?.trim();
  const webhookSecret = input.webhookSecret?.trim();
  if (!signature || !webhookSecret) return false;

  const expected = createPaystackWebhookSignature(input.rawBody, webhookSecret);
  if (expected.length !== signature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
