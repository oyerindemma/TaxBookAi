import "server-only";

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PaymentIntegrationProvider } from "@prisma/client";
import {
  listPaystackSettlements,
  listPaystackTransactions,
  verifyPaystackSignature,
  type PaystackSettlementListItem,
  type PaystackTransactionListItem,
} from "@/lib/paystack";

export type NormalizedPaymentActivityEvent = {
  provider: PaymentIntegrationProvider;
  eventType: "CHARGE_SUCCESS" | "CHARGE_FAILED" | "TRANSFER_SUCCESS" | "TRANSFER_FAILED" | "REFUND" | "UNKNOWN";
  dedupeKey: string;
  externalEventId: string | null;
  reference: string | null;
  amountMinor: number | null;
  feesAmountMinor: number | null;
  netAmountMinor: number | null;
  currency: string;
  occurredAt: Date;
  description: string;
  counterpartyName: string | null;
  metadata: Record<string, unknown> | null;
  payload: Prisma.InputJsonValue;
};

export type NormalizedPaymentSettlement = {
  provider: PaymentIntegrationProvider;
  externalSettlementId: string;
  status: "PENDING" | "SUCCESS" | "PARTIAL" | "FAILED";
  settlementDate: Date | null;
  currency: string;
  grossAmountMinor: number;
  feesAmountMinor: number;
  netAmountMinor: number;
  transactionCount: number;
  bankCode: string | null;
  bankAccountName: string | null;
  bankAccountNumberMasked: string | null;
  description: string;
  payload: Prisma.InputJsonValue;
};

export type PaymentProviderAdapter = {
  provider: PaymentIntegrationProvider;
  verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean;
  parseWebhook(rawBody: string): { events: NormalizedPaymentActivityEvent[] };
  listRecentEvents(input: {
    from: Date;
    to: Date;
    perPage?: number;
    maxPages?: number;
  }): Promise<NormalizedPaymentActivityEvent[]>;
  listSettlements(input: {
    from: Date;
    to: Date;
    perPage?: number;
    maxPages?: number;
  }): Promise<NormalizedPaymentSettlement[]>;
};

function readObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDate(value: unknown) {
  const text = readString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCurrency(value: unknown) {
  return readString(value)?.toUpperCase() ?? "NGN";
}

function hashKey(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function maskAccountNumber(value: unknown) {
  const text = readString(value);
  if (!text) return null;
  const visible = text.replace(/\s+/g, "");
  if (visible.length <= 4) return visible;
  return `${"*".repeat(Math.max(0, visible.length - 4))}${visible.slice(-4)}`;
}

function normalizeWebhookEventType(value: string | null) {
  const event = value?.toLowerCase() ?? "";
  if (event === "charge.success") return "CHARGE_SUCCESS" as const;
  if (event === "charge.failed") return "CHARGE_FAILED" as const;
  if (event === "transfer.success") return "TRANSFER_SUCCESS" as const;
  if (event === "transfer.failed") return "TRANSFER_FAILED" as const;
  if (event.includes("refund")) return "REFUND" as const;
  return "UNKNOWN" as const;
}

function buildCounterpartyName(source: Record<string, unknown> | null, metadata: Record<string, unknown> | null) {
  const firstName = readString(source?.first_name);
  const lastName = readString(source?.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return (
    readString(source?.name) ??
    readString(source?.email) ??
    readString(metadata?.customerName) ??
    readString(metadata?.customer_name) ??
    readString(metadata?.vendorName) ??
    readString(metadata?.vendor_name) ??
    null
  );
}

function normalizeTransactionEvent(
  item: PaystackTransactionListItem,
  payload: Prisma.InputJsonValue
): NormalizedPaymentActivityEvent {
  const metadata = readObject(item.metadata);
  const customer = readObject(item.customer);
  const externalEventId =
    item.id !== undefined && item.id !== null ? String(item.id) : readString(item.reference);
  const reference = readString(item.reference);
  const amountMinor = readNumber(item.amount);
  const feesAmountMinor = readNumber(item.fees) ?? 0;
  const netAmountMinor =
    amountMinor !== null ? Math.max(0, amountMinor - (feesAmountMinor ?? 0)) : null;
  const status = readString(item.status)?.toLowerCase() ?? "";
  const eventType = status === "success" ? "CHARGE_SUCCESS" : "CHARGE_FAILED";
  const occurredAt =
    readDate(item.paid_at) ?? readDate(item.created_at) ?? new Date();
  const counterpartyName = buildCounterpartyName(customer, metadata);
  const description = reference
    ? `Paystack charge ${reference}`
    : counterpartyName
      ? `Paystack charge from ${counterpartyName}`
      : "Paystack charge";

  return {
    provider: PaymentIntegrationProvider.PAYSTACK,
    eventType,
    dedupeKey: hashKey(
      [
        "sync-transaction",
        externalEventId ?? "none",
        reference ?? "none",
        amountMinor ?? "none",
        occurredAt.toISOString(),
      ].join("|")
    ),
    externalEventId,
    reference,
    amountMinor,
    feesAmountMinor,
    netAmountMinor,
    currency: normalizeCurrency(item.currency),
    occurredAt,
    description,
    counterpartyName,
    metadata,
    payload,
  };
}

function normalizeSettlementStatus(value: unknown) {
  const normalized = readString(value)?.toUpperCase() ?? "";
  if (normalized === "SUCCESS" || normalized === "SUCCESSFUL" || normalized === "PAID") {
    return "SUCCESS" as const;
  }
  if (normalized === "PARTIAL") {
    return "PARTIAL" as const;
  }
  if (normalized === "FAILED" || normalized === "ERROR") {
    return "FAILED" as const;
  }
  return "PENDING" as const;
}

function normalizeSettlement(item: PaystackSettlementListItem): NormalizedPaymentSettlement | null {
  const externalSettlementId =
    item.id !== undefined && item.id !== null ? String(item.id) : null;
  if (!externalSettlementId) return null;

  const destination = readObject(item.destination);
  const grossAmountMinor =
    readNumber(item.total_processed) ??
    readNumber(item.total_processed_by_payment_processor) ??
    0;
  const feesAmountMinor = readNumber(item.total_fees) ?? 0;
  const netAmountMinor = readNumber(item.total_transferred) ?? Math.max(0, grossAmountMinor - feesAmountMinor);
  const settlementDate =
    readDate(item.settlement_date) ?? readDate(item.created_at) ?? null;

  return {
    provider: PaymentIntegrationProvider.PAYSTACK,
    externalSettlementId,
    status: normalizeSettlementStatus(item.status),
    settlementDate,
    currency: normalizeCurrency(item.currency),
    grossAmountMinor,
    feesAmountMinor,
    netAmountMinor,
    transactionCount: Math.max(0, Math.trunc(readNumber(item.transactions_count) ?? 0)),
    bankCode: readString(destination?.bank_code) ?? readString(item.transfer_code),
    bankAccountName: readString(destination?.account_name),
    bankAccountNumberMasked:
      maskAccountNumber(destination?.account_number) ?? maskAccountNumber(destination?.recipient_code),
    description: `Paystack settlement ${externalSettlementId}`,
    payload: item as Prisma.InputJsonValue,
  };
}

function parsePaystackWebhook(rawBody: string) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return { events: [] };
  }

  const data = readObject(payload.data);
  const metadata = readObject(data?.metadata);
  const customer = readObject(data?.customer);
  const eventType = normalizeWebhookEventType(readString(payload.event));
  const externalEventId =
    data?.id !== undefined && data?.id !== null ? String(data.id) : null;
  const reference =
    readString(data?.reference) ??
    readString(data?.transaction_reference) ??
    readString(data?.transfer_code);
  const amountMinor = readNumber(data?.amount);
  const feesAmountMinor = readNumber(data?.fees) ?? 0;
  const netAmountMinor =
    amountMinor !== null ? Math.max(0, amountMinor - (feesAmountMinor ?? 0)) : null;
  const occurredAt =
    readDate(data?.paid_at) ??
    readDate(data?.created_at) ??
    readDate(data?.transaction_date) ??
    new Date();
  const counterpartyName = buildCounterpartyName(customer, metadata);
  const description =
    readString(data?.gateway_response) ??
    (reference ? `Paystack event ${reference}` : `Paystack ${eventType.toLowerCase()}`);

  return {
    events: [
      {
        provider: PaymentIntegrationProvider.PAYSTACK,
        eventType,
        dedupeKey: hashKey(
          [
            "webhook",
            eventType,
            externalEventId ?? "none",
            reference ?? "none",
            amountMinor ?? "none",
            occurredAt.toISOString(),
          ].join("|")
        ),
        externalEventId,
        reference,
        amountMinor,
        feesAmountMinor,
        netAmountMinor,
        currency: normalizeCurrency(data?.currency),
        occurredAt,
        description,
        counterpartyName,
        metadata,
        payload: payload as Prisma.InputJsonValue,
      },
    ],
  };
}

async function paginateTransactions(input: {
  from: Date;
  to: Date;
  perPage?: number;
  maxPages?: number;
}) {
  const events: NormalizedPaymentActivityEvent[] = [];
  const perPage = Math.min(Math.max(input.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await listPaystackTransactions({
      page,
      perPage,
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    });

    result.data.forEach((item) => {
      events.push(normalizeTransactionEvent(item, item as Prisma.InputJsonValue));
    });

    if (!result.meta?.pageCount || page >= result.meta.pageCount || result.data.length < perPage) {
      break;
    }
  }

  return events;
}

async function paginateSettlements(input: {
  from: Date;
  to: Date;
  perPage?: number;
  maxPages?: number;
}) {
  const settlements: NormalizedPaymentSettlement[] = [];
  const perPage = Math.min(Math.max(input.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await listPaystackSettlements({
      page,
      perPage,
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    });

    result.data.forEach((item) => {
      const normalized = normalizeSettlement(item);
      if (normalized) {
        settlements.push(normalized);
      }
    });

    if (!result.meta?.pageCount || page >= result.meta.pageCount || result.data.length < perPage) {
      break;
    }
  }

  return settlements;
}

export const paystackPaymentProviderAdapter: PaymentProviderAdapter = {
  provider: PaymentIntegrationProvider.PAYSTACK,
  verifyWebhookSignature(rawBody, signature) {
    return verifyPaystackSignature(rawBody, signature);
  },
  parseWebhook(rawBody) {
    return parsePaystackWebhook(rawBody);
  },
  async listRecentEvents(input) {
    return paginateTransactions(input);
  },
  async listSettlements(input) {
    return paginateSettlements(input);
  },
};

export function getPaymentProviderAdapter(provider: PaymentIntegrationProvider) {
  if (provider === PaymentIntegrationProvider.PAYSTACK) {
    return paystackPaymentProviderAdapter;
  }

  throw new Error(`Unsupported payment integration provider: ${provider}`);
}
