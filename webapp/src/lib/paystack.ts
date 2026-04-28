import "server-only";

import { getPaystackServerConfig } from "@/lib/env";
import { verifyPaystackWebhookSignatureWithSecret } from "@/lib/paystack-security";

const PAYSTACK_API_BASE_URL = "https://api.paystack.co";

type PaystackSuccessResponse<T> = {
  status: true;
  message: string;
  data: T;
};

type PaystackListMeta = {
  total?: number;
  skipped?: number;
  perPage?: number;
  page?: number;
  pageCount?: number;
  next?: string | null;
  previous?: string | null;
};

type PaystackListResponse<T> = {
  status: true;
  message: string;
  data: T[];
  meta?: PaystackListMeta;
};

type PaystackErrorResponse = {
  status: false;
  message: string;
};

export type PaystackCustomer = {
  email?: string | null;
  customer_code?: string | null;
};

export type PaystackPlanObject = {
  plan_code?: string | null;
  name?: string | null;
};

export type PaystackSubscriptionPayload = {
  subscription_code?: string | null;
  email_token?: string | null;
  status?: string | null;
  next_payment_date?: string | null;
  customer?: PaystackCustomer | null;
  plan?: PaystackPlanObject | string | null;
  metadata?: unknown;
};

export type PaystackTransactionInitializeData = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackTransactionVerificationData = {
  id?: string | number;
  status: string;
  reference: string;
  amount: number;
  currency?: string | null;
  paid_at?: string | null;
  customer?: PaystackCustomer | null;
  plan_object?: PaystackPlanObject | null;
  subscription?: PaystackSubscriptionPayload | null;
  metadata?: unknown;
};

export type PaystackTransactionListItem = {
  id?: string | number;
  status?: string | null;
  reference?: string | null;
  amount?: number | null;
  fees?: number | null;
  currency?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  gateway_response?: string | null;
  channel?: string | null;
  customer?: Record<string, unknown> | PaystackCustomer | null;
  metadata?: unknown;
  authorization?: Record<string, unknown> | null;
  settlement?: unknown;
};

export type PaystackSettlementListItem = {
  id?: string | number;
  status?: string | null;
  currency?: string | null;
  settlement_date?: string | null;
  created_at?: string | null;
  total_processed?: number | null;
  total_fees?: number | null;
  total_processed_by_payment_processor?: number | null;
  total_transferred?: number | null;
  transactions_count?: number | null;
  transfer_code?: string | null;
  metadata?: unknown;
  destination?: Record<string, unknown> | null;
};

export type PaystackSubscriptionManagementEmailData = {
  sent?: boolean;
};

export type PaystackSubscriptionDisableData = {
  subscription_code?: string | null;
  status?: string | null;
};

async function paystackRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { secretKey } = getPaystackServerConfig();

  const response = await fetch(`${PAYSTACK_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as PaystackSuccessResponse<T> | PaystackErrorResponse;

  if (!response.ok || !payload.status) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : "Paystack request failed";
    throw new Error(message);
  }

  return payload.data;
}

async function paystackListRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T[]; meta: PaystackListMeta | null }> {
  const { secretKey } = getPaystackServerConfig();

  const response = await fetch(`${PAYSTACK_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as PaystackListResponse<T> | PaystackErrorResponse;

  if (!response.ok || !payload.status) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : "Paystack request failed";
    throw new Error(message);
  }

  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    meta:
      "meta" in payload && payload.meta && typeof payload.meta === "object"
        ? payload.meta
        : null,
  };
}

function buildListQuery(input: {
  page?: number;
  perPage?: number;
  from?: string | null;
  to?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (typeof input.page === "number" && Number.isFinite(input.page) && input.page > 0) {
    searchParams.set("page", String(Math.trunc(input.page)));
  }
  if (
    typeof input.perPage === "number" &&
    Number.isFinite(input.perPage) &&
    input.perPage > 0
  ) {
    searchParams.set("perPage", String(Math.trunc(input.perPage)));
  }
  if (input.from) {
    searchParams.set("from", input.from);
  }
  if (input.to) {
    searchParams.set("to", input.to);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function initializePaystackTransaction(input: {
  email: string;
  amount: number;
  planCode?: string | null;
  reference: string;
  callbackUrl: string;
  metadata: string;
}) {
  return paystackRequest<PaystackTransactionInitializeData>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      ...(input.planCode ? { plan: input.planCode } : {}),
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: "NGN",
      metadata: input.metadata,
    }),
  });
}

export async function verifyPaystackTransaction(reference: string) {
  return paystackRequest<PaystackTransactionVerificationData>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function listPaystackTransactions(input: {
  page?: number;
  perPage?: number;
  from?: string | null;
  to?: string | null;
}) {
  return paystackListRequest<PaystackTransactionListItem>(
    `/transaction${buildListQuery(input)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function listPaystackSettlements(input: {
  page?: number;
  perPage?: number;
  from?: string | null;
  to?: string | null;
}) {
  return paystackListRequest<PaystackSettlementListItem>(
    `/settlement${buildListQuery(input)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function sendPaystackSubscriptionManagementEmail(subscriptionCode: string) {
  return paystackRequest<PaystackSubscriptionManagementEmailData>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/email`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function disablePaystackSubscription(input: {
  subscriptionCode: string;
  emailToken: string;
}) {
  return paystackRequest<PaystackSubscriptionDisableData>("/subscription/disable", {
    method: "POST",
    body: JSON.stringify({
      code: input.subscriptionCode,
      token: input.emailToken,
    }),
  });
}

export function verifyPaystackSignature(rawBody: string, signature: string | null | undefined) {
  let webhookSecret: string;
  try {
    webhookSecret = getPaystackServerConfig().webhookSecret;
  } catch {
    return false;
  }
  return verifyPaystackWebhookSignatureWithSecret({
    rawBody,
    signature,
    webhookSecret,
  });
}
