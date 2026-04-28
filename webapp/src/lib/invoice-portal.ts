import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getInvoicePortalSecret, getOptionalSessionCookieDomain } from "@/lib/env";

export const INVOICE_PORTAL_COOKIE_NAME = "taxbook_invoice_portal";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MIN_PORTAL_TTL_MS = 7 * DAY_IN_MS;
const DEFAULT_PORTAL_GRACE_MS = 30 * DAY_IN_MS;

type PortalTokenPayload = {
  invoiceId: number;
  exp: number;
  nonce: string;
};

type PortalTokenValidation =
  | {
      ok: true;
      payload: PortalTokenPayload;
    }
  | {
      ok: false;
      reason: "invalid" | "expired";
    };

function encodeBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function signPortalPayload(encodedPayload: string) {
  return encodeBase64Url(
    crypto.createHmac("sha256", getInvoicePortalSecret()).update(encodedPayload).digest()
  );
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getInvoicePortalExpiry(dueDate: Date) {
  const dueTime = dueDate.getTime();
  const minExpiry = Date.now() + MIN_PORTAL_TTL_MS;
  return new Date(Math.max(dueTime + DEFAULT_PORTAL_GRACE_MS, minExpiry));
}

export function createInvoicePortalToken(input: { invoiceId: number; expiresAt: Date }) {
  const payload: PortalTokenPayload = {
    invoiceId: input.invoiceId,
    exp: input.expiresAt.getTime(),
    nonce: crypto.randomBytes(12).toString("hex"),
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPortalPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: input.expiresAt,
  };
}

export function validateInvoicePortalToken(token: string | null | undefined): PortalTokenValidation {
  const trimmedToken = token?.trim();
  if (!trimmedToken) {
    return { ok: false, reason: "invalid" };
  }

  const parts = trimmedToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "invalid" };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signPortalPayload(encodedPayload);

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))
  ) {
    return { ok: false, reason: "invalid" };
  }

  const payload = safeJsonParse<PortalTokenPayload>(decodeBase64Url(encodedPayload));
  if (!payload || !Number.isInteger(payload.invoiceId) || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: "invalid" };
  }

  if (payload.exp <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}

export function buildInvoicePortalAccessUrl(requestUrl: string, token: string) {
  const origin = new URL(requestUrl).origin;
  return `${origin}/portal/access/${encodeURIComponent(token)}`;
}

export function buildInvoicePortalCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    ...(getOptionalSessionCookieDomain()
      ? {
          domain: getOptionalSessionCookieDomain() ?? undefined,
        }
      : {}),
  };
}

export async function getInvoicePortalAccessFromCookies(invoiceId: number) {
  const cookieStore = await cookies();
  const token = cookieStore.get(INVOICE_PORTAL_COOKIE_NAME)?.value ?? null;
  const validation = validateInvoicePortalToken(token);

  if (!validation.ok) return null;
  if (validation.payload.invoiceId !== invoiceId) return null;

  return {
    token,
    invoiceId: validation.payload.invoiceId,
    expiresAt: new Date(validation.payload.exp),
  };
}

export async function getLatestInvoicePortalView(workspaceId: number, invoiceId: number) {
  const candidates = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: "INVOICE_PORTAL_VIEWED",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 25,
    select: {
      createdAt: true,
      metadata: true,
    },
  });

  for (const candidate of candidates) {
    const parsed = candidate.metadata ? safeJsonParse<Record<string, unknown>>(candidate.metadata) : null;
    if (parsed && parsed.invoiceId === invoiceId) {
      return candidate.createdAt;
    }
  }

  return null;
}
