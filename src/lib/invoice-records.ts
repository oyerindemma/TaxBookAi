import "server-only";

import type { Prisma, TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/invoices";

const INVOICE_LEDGER_REFERENCE_PREFIX = "INVOICE:";

const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  totalAmount: true,
  paymentReference: true,
  paymentUrl: true,
  client: {
    select: {
      id: true,
      name: true,
      companyName: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const invoiceDetailSelect = {
  id: true,
  workspaceId: true,
  invoiceNumber: true,
  status: true,
  paymentReference: true,
  paymentUrl: true,
  paidAt: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
  vatTreatment: true,
  whtTreatment: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  workspace: {
    select: {
      id: true,
      name: true,
    },
  },
  client: {
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      address: true,
      taxId: true,
    },
  },
  items: {
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      taxRate: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const invoiceClientSelect = {
  id: true,
  name: true,
  companyName: true,
  email: true,
} satisfies Prisma.ClientSelect;

type InvoiceDetailBase = Prisma.InvoiceGetPayload<{
  select: typeof invoiceDetailSelect;
}>;

export type WorkspaceInvoiceListItem = Prisma.InvoiceGetPayload<{
  select: typeof invoiceListSelect;
}> & {
  paymentPagePath: string | null;
};

export type WorkspaceInvoiceDetail = InvoiceDetailBase & {
  paymentPagePath: string | null;
  estimatedWhtRate: number;
  estimatedWhtAmountMinor: number;
  ledgerEntry: {
    id: number;
    transactionDate: string;
    amountMinor: number;
    currency: string;
    reference: string | null;
    reviewStatus: string;
    description: string;
    createdAt: string;
  } | null;
  taxRecord: {
    id: number;
    kind: string;
    amountKobo: number;
    computedTax: number;
    netAmount: number;
    currency: string;
    taxRate: number;
    occurredOn: string;
    source: string | null;
  } | null;
  vatRecords: Array<{
    id: number;
    vatAmountMinor: number;
    basisAmountMinor: number;
    direction: string;
    reviewed: boolean;
    taxPeriod: {
      id: number;
      label: string;
      status: string;
    };
  }>;
  whtRecords: Array<{
    id: number;
    whtAmountMinor: number;
    basisAmountMinor: number;
    whtRate: number;
    direction: string;
    reviewed: boolean;
    taxPeriod: {
      id: number;
      label: string;
      status: string;
    };
  }>;
  sync: {
    ledgerPosted: boolean;
    taxTracked: boolean;
    vatRecordCount: number;
    whtRecordCount: number;
  };
};

export type InvoiceFormClientOption = Prisma.ClientGetPayload<{
  select: typeof invoiceClientSelect;
}> & {
  displayName: string;
};

function getClientDisplayName(client: Pick<InvoiceFormClientOption, "companyName" | "name">) {
  return client.companyName?.trim() || client.name;
}

function buildInvoicePaymentPagePath(paymentReference: string | null | undefined) {
  return paymentReference ? `/pay/${encodeURIComponent(paymentReference)}` : null;
}

function buildInvoiceLedgerReference(invoiceId: number) {
  return `${INVOICE_LEDGER_REFERENCE_PREFIX}${invoiceId}`;
}

function inferInvoiceWhtRate(taxCategory: TaxCategory | null) {
  if (taxCategory === "RENT" || taxCategory === "PROFESSIONAL_SERVICE") return 10;
  if (taxCategory === "PURCHASE_SERVICES" || taxCategory === "SALES_SERVICES") return 5;
  return 5;
}

function enrichInvoiceListItem(
  invoice: Prisma.InvoiceGetPayload<{
    select: typeof invoiceListSelect;
  }>
) {
  return {
    ...invoice,
    paymentPagePath: buildInvoicePaymentPagePath(invoice.paymentReference),
  } satisfies WorkspaceInvoiceListItem;
}

async function enrichInvoiceDetail(invoice: InvoiceDetailBase): Promise<WorkspaceInvoiceDetail> {
  const [ledgerEntry, taxRecord, vatRecords, whtRecords] = await Promise.all([
    prisma.ledgerTransaction.findFirst({
      where: {
        reference: buildInvoiceLedgerReference(invoice.id),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        transactionDate: true,
        amountMinor: true,
        currency: true,
        reference: true,
        reviewStatus: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.taxRecord.findUnique({
      where: { invoiceId: invoice.id },
      select: {
        id: true,
        kind: true,
        amountKobo: true,
        computedTax: true,
        netAmount: true,
        currency: true,
        taxRate: true,
        occurredOn: true,
        source: true,
      },
    }),
    prisma.vATRecord.findMany({
      where: {
        invoiceId: invoice.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        vatAmountMinor: true,
        basisAmountMinor: true,
        direction: true,
        reviewed: true,
        taxPeriod: {
          select: {
            id: true,
            label: true,
            status: true,
          },
        },
      },
    }),
    prisma.wHTRecord.findMany({
      where: {
        invoiceId: invoice.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        whtAmountMinor: true,
        basisAmountMinor: true,
        whtRate: true,
        direction: true,
        reviewed: true,
        taxPeriod: {
          select: {
            id: true,
            label: true,
            status: true,
          },
        },
      },
    }),
  ]);

  const estimatedWhtRate = invoice.whtTreatment !== "NONE" ? inferInvoiceWhtRate(invoice.taxCategory) : 0;
  const estimatedWhtAmountMinor =
    invoice.whtTreatment !== "NONE"
      ? Math.round(invoice.subtotal * (estimatedWhtRate / 100))
      : 0;

  return {
    ...invoice,
    paymentPagePath: buildInvoicePaymentPagePath(invoice.paymentReference),
    estimatedWhtRate,
    estimatedWhtAmountMinor,
    ledgerEntry: ledgerEntry
      ? {
          id: ledgerEntry.id,
          transactionDate: ledgerEntry.transactionDate.toISOString(),
          amountMinor: ledgerEntry.amountMinor,
          currency: ledgerEntry.currency,
          reference: ledgerEntry.reference,
          reviewStatus: ledgerEntry.reviewStatus,
          description: ledgerEntry.description,
          createdAt: ledgerEntry.createdAt.toISOString(),
        }
      : null,
    taxRecord: taxRecord
      ? {
          ...taxRecord,
          occurredOn: taxRecord.occurredOn.toISOString(),
        }
      : null,
    vatRecords: vatRecords.map((record) => ({
      id: record.id,
      vatAmountMinor: record.vatAmountMinor,
      basisAmountMinor: record.basisAmountMinor,
      direction: record.direction,
      reviewed: record.reviewed,
      taxPeriod: {
        id: record.taxPeriod.id,
        label: record.taxPeriod.label,
        status: record.taxPeriod.status,
      },
    })),
    whtRecords: whtRecords.map((record) => ({
      id: record.id,
      whtAmountMinor: record.whtAmountMinor,
      basisAmountMinor: record.basisAmountMinor,
      whtRate: record.whtRate,
      direction: record.direction,
      reviewed: record.reviewed,
      taxPeriod: {
        id: record.taxPeriod.id,
        label: record.taxPeriod.label,
        status: record.taxPeriod.status,
      },
    })),
    sync: {
      ledgerPosted: Boolean(ledgerEntry),
      taxTracked: Boolean(taxRecord) || vatRecords.length > 0 || whtRecords.length > 0,
      vatRecordCount: vatRecords.length,
      whtRecordCount: whtRecords.length,
    },
  };
}

export async function refreshWorkspaceInvoiceStatuses(workspaceId: number) {
  await prisma.invoice.updateMany({
    where: {
      workspaceId,
      status: "SENT",
      dueDate: { lt: startOfToday() },
    },
    data: { status: "OVERDUE" },
  });
}

export async function listWorkspaceInvoices(workspaceId: number) {
  await refreshWorkspaceInvoiceStatuses(workspaceId);

  const invoices = await prisma.invoice.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: invoiceListSelect,
  });

  return invoices.map((invoice) => enrichInvoiceListItem(invoice));
}

export async function getWorkspaceInvoiceDetail(workspaceId: number, invoiceId: number) {
  await refreshWorkspaceInvoiceStatuses(workspaceId);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    select: invoiceDetailSelect,
  });

  if (!invoice) return null;

  return enrichInvoiceDetail(invoice);
}

export async function getInvoiceDetailById(invoiceId: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId },
    select: invoiceDetailSelect,
  });

  if (!invoice) return null;

  return enrichInvoiceDetail(invoice);
}

export async function getPublicInvoicePaymentDetail(identifier: string) {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) return null;

  const numericId = Number(trimmedIdentifier);
  const invoice = await prisma.invoice.findFirst({
    where: Number.isFinite(numericId) && Number.isInteger(numericId) && numericId > 0
      ? {
          OR: [{ id: numericId }, { paymentReference: trimmedIdentifier }],
        }
      : {
          paymentReference: trimmedIdentifier,
        },
    select: invoiceDetailSelect,
  });

  if (!invoice) return null;

  return enrichInvoiceDetail(invoice);
}

export async function listInvoiceFormClients(workspaceId: number) {
  const clients = await prisma.client.findMany({
    where: { workspaceId },
    orderBy: [{ companyName: "asc" }, { name: "asc" }],
    select: invoiceClientSelect,
  });

  return clients.map((client) => ({
    ...client,
    displayName: getClientDisplayName(client),
  }));
}
