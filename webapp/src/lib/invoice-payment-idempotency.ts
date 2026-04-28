export function isSuccessfulInvoicePaymentReplay(input: {
  existingPayment:
    | {
        status?: string | null;
        providerTransactionId?: string | null;
      }
    | null
    | undefined;
  providerTransactionId?: string | null;
}) {
  const existing = input.existingPayment;
  if (!existing || String(existing.status ?? "").toUpperCase() !== "SUCCESS") {
    return false;
  }

  const expectedProviderTransactionId = input.providerTransactionId?.trim();
  if (!expectedProviderTransactionId) {
    return true;
  }

  return existing.providerTransactionId === expectedProviderTransactionId;
}
