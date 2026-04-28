import assert from "node:assert/strict";
import test from "node:test";
import { isSuccessfulInvoicePaymentReplay } from "./invoice-payment-idempotency";
import {
  createPaystackWebhookSignature,
  isStubPaymentModeAllowed,
  verifyPaystackWebhookSignatureWithSecret,
} from "./paystack-security";

test("stub payments cannot be enabled in production even when explicitly requested", () => {
  assert.equal(
    isStubPaymentModeAllowed({
      deploymentStage: "production",
      explicitAllowStubPayments: true,
    }),
    false
  );
  assert.equal(
    isStubPaymentModeAllowed({
      deploymentStage: "development",
      explicitAllowStubPayments: null,
    }),
    true
  );
  assert.equal(
    isStubPaymentModeAllowed({
      deploymentStage: "preview",
      explicitAllowStubPayments: null,
    }),
    false
  );
});

test("Paystack webhook signature verification uses the configured webhook secret", () => {
  const rawBody = JSON.stringify({
    event: "charge.success",
    data: {
      id: 123,
      reference: "PAY-12-ABC",
      amount: 250_000,
    },
  });
  const signature = createPaystackWebhookSignature(rawBody, "whsec_test");

  assert.equal(
    verifyPaystackWebhookSignatureWithSecret({
      rawBody,
      signature,
      webhookSecret: "whsec_test",
    }),
    true
  );
  assert.equal(
    verifyPaystackWebhookSignatureWithSecret({
      rawBody,
      signature,
      webhookSecret: "different_secret",
    }),
    false
  );
});

test("successful invoice payment webhooks are recognized as safe replays", () => {
  assert.equal(
    isSuccessfulInvoicePaymentReplay({
      existingPayment: {
        status: "SUCCESS",
        providerTransactionId: "123",
      },
      providerTransactionId: "123",
    }),
    true
  );
  assert.equal(
    isSuccessfulInvoicePaymentReplay({
      existingPayment: {
        status: "SUCCESS",
        providerTransactionId: "123",
      },
      providerTransactionId: "456",
    }),
    false
  );
  assert.equal(
    isSuccessfulInvoicePaymentReplay({
      existingPayment: {
        status: "PENDING",
        providerTransactionId: "123",
      },
      providerTransactionId: "123",
    }),
    false
  );
});
