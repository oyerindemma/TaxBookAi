import "server-only";

import type { Client, Invoice, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ClientInvoiceLike = Pick<
  Invoice,
  "id" | "invoiceNumber" | "status" | "issueDate" | "dueDate" | "subtotal" | "taxAmount" | "totalAmount"
>;

type ClientLike = Pick<
  Client,
  "id" | "workspaceId" | "name" | "companyName" | "email" | "phone" | "address" | "taxId" | "notes" | "createdAt" | "updatedAt"
>;

type ClientWithInvoices = ClientLike & {
  invoices: ClientInvoiceLike[];
};

export type ClientInvoiceAnalytics = {
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
};

export type WorkspaceClientListItem = ClientLike &
  ClientInvoiceAnalytics & {
    displayName: string;
  };

export type WorkspaceClientDetail = WorkspaceClientListItem & {
  invoices: ClientInvoiceLike[];
};

type ClientQueryResult = Prisma.ClientGetPayload<{
  include: {
    invoices: {
      select: {
        id: true;
        invoiceNumber: true;
        status: true;
        issueDate: true;
        dueDate: true;
        subtotal: true;
        taxAmount: true;
        totalAmount: true;
      };
      orderBy: { issueDate: "desc" };
    };
  };
}>;

export type NormalizedClientPayload = {
  name: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
};

const invoiceSummarySelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
} satisfies Prisma.InvoiceSelect;

export function getClientDisplayName(client: Pick<Client, "companyName" | "name">) {
  return client.companyName?.trim() || client.name;
}

export function normalizeClientText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeClientEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidClientEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function parseClientPayload(body: {
  name?: unknown;
  companyName?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  taxId?: unknown;
  notes?: unknown;
}): { data: NormalizedClientPayload } | { error: string } {
  const companyName = normalizeClientText(body.companyName);
  const name = normalizeClientText(body.name) ?? companyName;
  if (!name) {
    return { error: "name or companyName is required" };
  }

  const emailInput = normalizeClientText(body.email);
  if (!emailInput) {
    return { error: "email is required" };
  }

  const email = normalizeClientEmail(emailInput);
  if (!isValidClientEmail(email)) {
    return { error: "Invalid email" };
  }

  return {
    data: {
      name,
      companyName,
      email,
      phone: normalizeClientText(body.phone),
      address: normalizeClientText(body.address),
      taxId: normalizeClientText(body.taxId),
      notes: normalizeClientText(body.notes),
    },
  };
}

export function summarizeClientInvoices(
  invoices: ClientInvoiceLike[]
): ClientInvoiceAnalytics {
  const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const totalPaid = invoices
    .filter((invoice) => invoice.status === "PAID")
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

  return {
    invoiceCount: invoices.length,
    totalBilled,
    totalPaid,
    outstandingBalance: totalBilled - totalPaid,
  };
}

function mapClientWithInvoices(client: ClientWithInvoices): WorkspaceClientDetail {
  return {
    ...client,
    displayName: getClientDisplayName(client),
    ...summarizeClientInvoices(client.invoices),
  };
}

export async function listWorkspaceClients(workspaceId: number) {
  const clients = await prisma.client.findMany({
    where: { workspaceId },
    orderBy: [{ companyName: "asc" }, { name: "asc" }],
    include: {
      invoices: {
        select: invoiceSummarySelect,
        orderBy: { issueDate: "desc" },
      },
    },
  });

  return clients.map((client) => mapClientWithInvoices(client));
}

export async function getWorkspaceClientDetail(
  workspaceId: number,
  clientId: number
) {
  const client = (await prisma.client.findFirst({
    where: { id: clientId, workspaceId },
    include: {
      invoices: {
        select: invoiceSummarySelect,
        orderBy: { issueDate: "desc" },
      },
    },
  })) as ClientQueryResult | null;

  if (!client) return null;
  return mapClientWithInvoices(client);
}
