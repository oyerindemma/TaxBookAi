import "server-only";

import crypto from "crypto";
import { getPaystackServerConfig } from "@/lib/env";

const PAYSTACK_API_BASE_URL = "https://api.paystack.co";

type PaystackSuccessResponse<T> = {
  status: true;
  message: string;
  data: T;
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
  if (!signature) return false;
  let secretKey: string;
  try {
    secretKey = getPaystackServerConfig().secretKey;
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const provided = signature.trim();

  if (expected.length !== provided.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
