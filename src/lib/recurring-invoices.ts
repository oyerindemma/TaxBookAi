import "server-only";

import {
  InvoiceStatus,
  Prisma,
  RecurringInvoice as RecurringInvoiceModel,
  RecurringInvoiceFrequency,
  TaxCategory,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getClientDisplayName } from "@/lib/clients";
import { getAppUrl } from "@/lib/env";
import { sendInvoiceSentReminder } from "@/lib/invoice-reminders";
import {
  buildInvoicePaymentReference,
  buildInvoicePaymentUrl,
} from "@/lib/invoice-payments";
import {
  buildInvoiceNumber,
  computeInvoiceTotals,
  parseDate,
  type ComputedInvoiceTotals,
  type InvoiceItemInput,
} from "@/lib/invoices";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type StoredRecurringTemplateItem = ComputedInvoiceTotals["items"][number];

const recurringGeneratedInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  totalAmount: true,
  paymentReference: true,
  createdAt: true,
} satisfies Prisma.InvoiceSelect;

const recurringInvoiceListInclude = {
  client: true,
  generatedInvoices: {
    orderBy: [{ issueDate: "desc" }, { id: "desc" }],
    take: 1,
    select: recurringGeneratedInvoiceSelect,
  },
  _count: {
    select: {
      generatedInvoices: true,
    },
  },
} satisfies Prisma.RecurringInvoiceInclude;

const recurringInvoiceDetailInclude = {
  client: true,
  generatedInvoices: {
    orderBy: [{ issueDate: "desc" }, { id: "desc" }],
    take: 12,
    select: recurringGeneratedInvoiceSelect,
  },
  _count: {
    select: {
      generatedInvoices: true,
    },
  },
} satisfies Prisma.RecurringInvoiceInclude;

type HydratedRecurringInvoiceList = Prisma.RecurringInvoiceGetPayload<{
  include: typeof recurringInvoiceListInclude;
}>;

type HydratedRecurringInvoiceDetail = Prisma.RecurringInvoiceGetPayload<{
  include: typeof recurringInvoiceDetailInclude;
}>;

type GeneratedInvoiceRecord = Prisma.InvoiceGetPayload<{
  select: typeof recurringGeneratedInvoiceSelect;
}>;

export type TemplateInvoiceStatus = "DRAFT" | "SENT";

export type RecurringGeneratedInvoiceSummary = {
  id: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  paymentReference: string | null;
  paymentPagePath: string | null;
  createdAt: Date;
};

export type WorkspaceRecurringInvoice = Omit<
  RecurringInvoiceModel,
  "itemsJson" | "invoiceStatus" | "startDate"
> & {
  startDate: Date;
  invoiceStatus: TemplateInvoiceStatus;
  client: {
    id: number;
    name: string;
    companyName: string | null;
    email: string;
  };
  displayName: string;
  templateItems: StoredRecurringTemplateItem[];
  templateItemCount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  generatedInvoiceCount: number;
  lastGeneratedInvoice: RecurringGeneratedInvoiceSummary | null;
};

export type WorkspaceRecurringInvoiceDetail = WorkspaceRecurringInvoice & {
  generatedInvoices: RecurringGeneratedInvoiceSummary[];
};

export type NormalizedRecurringInvoicePayload = {
  clientId: number;
  frequency: RecurringInvoiceFrequency;
  startDate: Date;
  endDate: Date | null;
  nextRunAt: Date;
  dueInDays: number;
  invoiceStatus: TemplateInvoiceStatus;
  paymentEnabled: boolean;
  currency: string;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  taxCategory: TaxCategory | null;
  active: boolean;
  itemsJson: string;
  notes: string | null;
};

type GeneratedInvoiceSummary = {
  invoiceId: number;
  invoiceNumber: string;
  recurringInvoiceId: number;
  status: InvoiceStatus;
};

const ALLOWED_TEMPLATE_STATUSES = ["DRAFT", "SENT"] as const;
const RECURRING_FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY"] as const;
const VAT_TREATMENTS = ["NONE", "INPUT", "OUTPUT", "EXEMPT"] as const;
const WHT_TREATMENTS = ["NONE", "PAYABLE", "RECEIVABLE"] as const;
const TAX_CATEGORIES = [
  "SALES_GOODS",
  "SALES_SERVICES",
  "PURCHASE_GOODS",
  "PURCHASE_SERVICES",
  "OPERATING_EXPENSE",
  "PROFESSIONAL_SERVICE",
  "RENT",
  "PAYROLL",
  "ASSET_PURCHASE",
  "TAX_PAYMENT",
  "OTHER",
] as const;

function isRecurringFrequency(value: string): value is RecurringInvoiceFrequency {
  return RECURRING_FREQUENCIES.includes(value as RecurringInvoiceFrequency);
}

function isTemplateInvoiceStatus(value: string): value is TemplateInvoiceStatus {
  return ALLOWED_TEMPLATE_STATUSES.includes(
    value as (typeof ALLOWED_TEMPLATE_STATUSES)[number]
  );
}

function isVatTreatment(value: string): value is VatTreatment {
  return VAT_TREATMENTS.includes(value as VatTreatment);
}

function isWhtTreatment(value: string): value is WhtTreatment {
  return WHT_TREATMENTS.includes(value as WhtTreatment);
}

function isTaxCategory(value: string): value is TaxCategory {
  return TAX_CATEGORIES.includes(value as TaxCategory);
}

function normalizeTemplateInvoiceStatus(value: InvoiceStatus): TemplateInvoiceStatus {
  return value === "SENT" ? "SENT" : "DRAFT";
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== "string") return "NGN";
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "NGN";
  if (!/^[A-Z]{3,8}$/.test(normalized)) return null;
  return normalized;
}

function normalizeVatTreatment(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return isVatTreatment(normalized) ? normalized : "NONE";
}

function normalizeWhtTreatment(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return isWhtTreatment(normalized) ? normalized : "NONE";
}

function normalizeTaxCategory(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return isTaxCategory(normalized) ? normalized : null;
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function parseDueInDays(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    return null;
  }
  return parsed;
}

function parseStoredTemplateItems(itemsJson: string) {
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredRecurringTemplateItem => {
      return (
        item &&
        typeof item.description === "string" &&
        typeof item.quantity === "number" &&
        Number.isFinite(item.quantity) &&
        typeof item.unitPrice === "number" &&
        Number.isFinite(item.unitPrice) &&
        typeof item.taxRate === "number" &&
        Number.isFinite(item.taxRate) &&
        typeof item.lineTotal === "number" &&
        Number.isFinite(item.lineTotal)
      );
    });
  } catch {
    return [];
  }
}

function summarizeTemplateItems(items: StoredRecurringTemplateItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    subtotal,
    taxAmount: totalAmount - subtotal,
    totalAmount,
    templateItemCount: items.length,
  };
}

function buildInvoicePaymentPagePath(paymentReference: string | null | undefined) {
  return paymentReference ? `/pay/${encodeURIComponent(paymentReference)}` : null;
}

function mapGeneratedInvoice(invoice: GeneratedInvoiceRecord): RecurringGeneratedInvoiceSummary {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalAmount: invoice.totalAmount,
    paymentReference: invoice.paymentReference,
    paymentPagePath: buildInvoicePaymentPagePath(invoice.paymentReference),
    createdAt: invoice.createdAt,
  };
}

function mapRecurringInvoiceBase(
  recurringInvoice: HydratedRecurringInvoiceList | HydratedRecurringInvoiceDetail
) {
  const templateItems = parseStoredTemplateItems(recurringInvoice.itemsJson);
  const summary = summarizeTemplateItems(templateItems);
  const generatedInvoices = recurringInvoice.generatedInvoices.map(mapGeneratedInvoice);

  return {
    id: recurringInvoice.id,
    workspaceId: recurringInvoice.workspaceId,
    clientId: recurringInvoice.clientId,
    frequency: recurringInvoice.frequency,
    startDate: recurringInvoice.startDate ?? recurringInvoice.nextRunAt,
    endDate: recurringInvoice.endDate,
    nextRunAt: recurringInvoice.nextRunAt,
    dueInDays: recurringInvoice.dueInDays,
    invoiceStatus: normalizeTemplateInvoiceStatus(recurringInvoice.invoiceStatus),
    paymentEnabled: recurringInvoice.paymentEnabled,
    currency: recurringInvoice.currency,
    vatTreatment: recurringInvoice.vatTreatment,
    whtTreatment: recurringInvoice.whtTreatment,
    taxCategory: recurringInvoice.taxCategory,
    active: recurringInvoice.active,
    notes: recurringInvoice.notes,
    createdAt: recurringInvoice.createdAt,
    updatedAt: recurringInvoice.updatedAt,
    client: {
      id: recurringInvoice.client.id,
      name: recurringInvoice.client.name,
      companyName: recurringInvoice.client.companyName,
      email: recurringInvoice.client.email,
    },
    displayName: getClientDisplayName(recurringInvoice.client),
    templateItems,
    generatedInvoiceCount: recurringInvoice._count.generatedInvoices,
    lastGeneratedInvoice: generatedInvoices[0] ?? null,
    ...summary,
  } satisfies WorkspaceRecurringInvoice;
}

function mapRecurringInvoice(
  recurringInvoice: HydratedRecurringInvoiceList
): WorkspaceRecurringInvoice {
  return mapRecurringInvoiceBase(recurringInvoice);
}

function mapRecurringInvoiceDetail(
  recurringInvoice: HydratedRecurringInvoiceDetail
): WorkspaceRecurringInvoiceDetail {
  return {
    ...mapRecurringInvoiceBase(recurringInvoice),
    generatedInvoices: recurringInvoice.generatedInvoices.map(mapGeneratedInvoice),
  };
}

function advanceRecurringRunAt(date: Date, frequency: RecurringInvoiceFrequency) {
  const next = new Date(date);
  if (frequency === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  if (frequency === "MONTHLY") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  if (frequency === "QUARTERLY") {
    next.setUTCMonth(next.getUTCMonth() + 3);
  }
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isRunWithinSchedule(runAt: Date, endDate: Date | null) {
  if (!endDate) return true;
  return runAt.getTime() <= endDate.getTime();
}

function buildGeneratedInvoicePaymentLink(invoiceId: number) {
  const paymentReference = buildInvoicePaymentReference(invoiceId);
  return {
    paymentReference,
    paymentUrl: buildInvoicePaymentUrl(getAppUrl(), paymentReference),
  };
}

async function createInvoiceFromRecurring(
  tx: Prisma.TransactionClient,
  recurringInvoice: HydratedRecurringInvoiceDetail | HydratedRecurringInvoiceList,
  issueDate: Date,
  templateItems: StoredRecurringTemplateItem[]
) {
  const { subtotal, taxAmount, totalAmount } = summarizeTemplateItems(templateItems);
  const shouldPreparePaymentLink =
    recurringInvoice.paymentEnabled && recurringInvoice.invoiceStatus !== "DRAFT";

  let lastCreateError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await tx.invoice.create({
        data: {
          workspaceId: recurringInvoice.workspaceId,
          clientId: recurringInvoice.clientId,
          recurringInvoiceId: recurringInvoice.id,
          invoiceNumber: buildInvoiceNumber(issueDate),
          status: recurringInvoice.invoiceStatus,
          issueDate,
          dueDate: addDays(issueDate, recurringInvoice.dueInDays),
          subtotal,
          taxAmount,
          totalAmount,
          vatTreatment: recurringInvoice.vatTreatment,
          whtTreatment: recurringInvoice.whtTreatment,
          taxCategory: recurringInvoice.taxCategory,
          notes: recurringInvoice.notes?.trim() || null,
          items: {
            create: templateItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              lineTotal: item.lineTotal,
            })),
          },
        },
        select: recurringGeneratedInvoiceSelect,
      });

      if (!shouldPreparePaymentLink) {
        return created;
      }

      return await tx.invoice.update({
        where: { id: created.id },
        data: buildGeneratedInvoicePaymentLink(created.id),
        select: recurringGeneratedInvoiceSelect,
      });
    } catch (error) {
      lastCreateError = error;
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!isDuplicate) {
        throw error;
      }
    }
  }

  throw lastCreateError ?? new Error("Unable to create recurring invoice instance");
}

async function ensureInvoiceGeneratedForRun(
  tx: Prisma.TransactionClient,
  recurringInvoice: HydratedRecurringInvoiceDetail | HydratedRecurringInvoiceList,
  runAt: Date,
  templateItems: StoredRecurringTemplateItem[]
) {
  const existing = await tx.invoice.findFirst({
    where: {
      recurringInvoiceId: recurringInvoice.id,
      issueDate: runAt,
    },
    select: recurringGeneratedInvoiceSelect,
  });

  if (existing) {
    if (
      recurringInvoice.paymentEnabled &&
      existing.status !== "DRAFT" &&
      !existing.paymentReference
    ) {
      const paymentLink = buildGeneratedInvoicePaymentLink(existing.id);
      const updated = await tx.invoice.update({
        where: { id: existing.id },
        data: paymentLink,
        select: recurringGeneratedInvoiceSelect,
      });
      return { invoice: updated, created: false } as const;
    }

    return { invoice: existing, created: false } as const;
  }

  const invoice = await createInvoiceFromRecurring(tx, recurringInvoice, runAt, templateItems);
  return { invoice, created: true } as const;
}

async function dispatchGeneratedInvoiceReminder(input: {
  workspaceId: number;
  invoiceId: number;
  actorUserId: number | null;
  status: InvoiceStatus;
}) {
  if (input.status !== "SENT") return;

  try {
    await sendInvoiceSentReminder({
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      initiatedByUserId: input.actorUserId,
    });
  } catch (error) {
    logError("recurring-invoices", "invoice sent reminder failed", error, {
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
    });
  }
}

export function parseRecurringInvoicePayload(body: {
  clientId?: unknown;
  frequency?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  nextRunAt?: unknown;
  dueInDays?: unknown;
  invoiceStatus?: unknown;
  paymentEnabled?: unknown;
  currency?: unknown;
  vatTreatment?: unknown;
  whtTreatment?: unknown;
  taxCategory?: unknown;
  active?: unknown;
  notes?: unknown;
  items?: InvoiceItemInput[];
}): { data: NormalizedRecurringInvoicePayload } | { error: string } {
  const clientId = Number(body.clientId);
  if (!Number.isFinite(clientId) || !Number.isInteger(clientId) || clientId <= 0) {
    return { error: "clientId is required" };
  }

  const frequency = String(body.frequency ?? "").toUpperCase();
  if (!isRecurringFrequency(frequency)) {
    return { error: "frequency must be WEEKLY, MONTHLY, or QUARTERLY" };
  }

  const parsedStartDate =
    parseDate(typeof body.startDate === "string" ? body.startDate : undefined) ??
    parseDate(typeof body.nextRunAt === "string" ? body.nextRunAt : undefined);
  if (!parsedStartDate) {
    return { error: "startDate is required" };
  }

  const nextRunAt =
    parseDate(typeof body.nextRunAt === "string" ? body.nextRunAt : undefined) ??
    parsedStartDate;
  if (!nextRunAt) {
    return { error: "nextRunAt is required" };
  }

  const endDate =
    typeof body.endDate === "string" && body.endDate.trim()
      ? parseDate(body.endDate)
      : null;
  if (typeof body.endDate === "string" && body.endDate.trim() && !endDate) {
    return { error: "endDate must be a valid date" };
  }

  if (nextRunAt.getTime() < parsedStartDate.getTime()) {
    return { error: "nextRunAt cannot be before startDate" };
  }

  if (endDate && endDate.getTime() < parsedStartDate.getTime()) {
    return { error: "endDate cannot be before startDate" };
  }

  if (endDate && nextRunAt.getTime() > endDate.getTime()) {
    return { error: "nextRunAt cannot be after endDate" };
  }

  const dueInDays = parseDueInDays(body.dueInDays);
  if (dueInDays === null) {
    return { error: "dueInDays must be a whole number between 0 and 365" };
  }

  const invoiceStatus = String(body.invoiceStatus ?? "DRAFT").toUpperCase();
  if (!isTemplateInvoiceStatus(invoiceStatus)) {
    return { error: "invoiceStatus must be DRAFT or SENT" };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { error: "At least one line item is required" };
  }

  const computed = computeInvoiceTotals(body.items);
  if ("error" in computed) {
    return { error: computed.error };
  }

  const currency = normalizeCurrency(body.currency);
  if (!currency) {
    return { error: "currency must be a valid ISO code" };
  }

  const requestedVatTreatment = normalizeVatTreatment(body.vatTreatment);
  const requestedWhtTreatment = normalizeWhtTreatment(body.whtTreatment);
  const requestedTaxCategory = normalizeTaxCategory(body.taxCategory);
  const effectiveVatTreatment =
    computed.taxAmount > 0
      ? requestedVatTreatment === "NONE"
        ? "OUTPUT"
        : requestedVatTreatment
      : requestedVatTreatment === "EXEMPT"
        ? "EXEMPT"
        : "NONE";
  const effectiveWhtTreatment = requestedWhtTreatment;
  const effectiveTaxCategory =
    requestedTaxCategory ??
    (effectiveWhtTreatment === "RECEIVABLE" ? "SALES_SERVICES" : null);

  return {
    data: {
      clientId,
      frequency,
      startDate: parsedStartDate,
      endDate,
      nextRunAt,
      dueInDays,
      invoiceStatus,
      paymentEnabled: parseBoolean(body.paymentEnabled, true),
      currency,
      vatTreatment: effectiveVatTreatment,
      whtTreatment: effectiveWhtTreatment,
      taxCategory: effectiveTaxCategory,
      active: parseBoolean(body.active, true),
      notes: normalizeText(body.notes),
      itemsJson: JSON.stringify(computed.items),
    },
  };
}

export async function listWorkspaceRecurringInvoices(workspaceId: number) {
  const recurringInvoices = await prisma.recurringInvoice.findMany({
    where: { workspaceId },
    include: recurringInvoiceListInclude,
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
  });

  return recurringInvoices.map((entry) => mapRecurringInvoice(entry));
}

export async function getWorkspaceRecurringInvoice(
  workspaceId: number,
  recurringInvoiceId: number
) {
  const recurringInvoice = await prisma.recurringInvoice.findFirst({
    where: { id: recurringInvoiceId, workspaceId },
    include: recurringInvoiceDetailInclude,
  });

  if (!recurringInvoice) return null;
  return mapRecurringInvoiceDetail(recurringInvoice);
}

export async function processDueRecurringInvoices(
  workspaceId: number,
  actorUserId: number | null
) {
  const now = new Date();
  const dueDefinitions = await prisma.recurringInvoice.findMany({
    where: {
      workspaceId,
      active: true,
      nextRunAt: { lte: now },
    },
    include: recurringInvoiceDetailInclude,
    orderBy: { nextRunAt: "asc" },
  });

  const generatedInvoices: GeneratedInvoiceSummary[] = [];

  for (const definition of dueDefinitions) {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.recurringInvoice.findFirst({
        where: {
          id: definition.id,
          workspaceId,
          active: true,
        },
        include: recurringInvoiceDetailInclude,
      });

      if (!current || current.nextRunAt > now) {
        return { generated: [] as GeneratedInvoiceSummary[] };
      }

      const templateItems = parseStoredTemplateItems(current.itemsJson);
      if (templateItems.length === 0) {
        return { generated: [] as GeneratedInvoiceSummary[] };
      }

      if (!isRunWithinSchedule(current.nextRunAt, current.endDate)) {
        await tx.recurringInvoice.update({
          where: { id: current.id },
          data: { active: false },
        });
        return { generated: [] as GeneratedInvoiceSummary[] };
      }

      const generated: GeneratedInvoiceSummary[] = [];
      let runAt = current.nextRunAt;
      let safetyCounter = 0;

      while (
        runAt <= now &&
        safetyCounter < 12 &&
        isRunWithinSchedule(runAt, current.endDate)
      ) {
        const ensured = await ensureInvoiceGeneratedForRun(tx, current, runAt, templateItems);
        generated.push({
          invoiceId: ensured.invoice.id,
          invoiceNumber: ensured.invoice.invoiceNumber,
          recurringInvoiceId: current.id,
          status: ensured.invoice.status,
        });
        runAt = advanceRecurringRunAt(runAt, current.frequency);
        safetyCounter += 1;
      }

      const shouldDeactivate = Boolean(current.endDate && runAt > current.endDate);
      if (generated.length > 0 || shouldDeactivate) {
        await tx.recurringInvoice.update({
          where: { id: current.id },
          data: {
            nextRunAt: runAt,
            ...(shouldDeactivate ? { active: false } : {}),
          },
        });
      }

      return { generated };
    });

    if (result.generated.length === 0) {
      const templateItems = parseStoredTemplateItems(definition.itemsJson);
      if (templateItems.length === 0) {
        logError(
          "recurring-invoices",
          "skipped invalid recurring invoice template",
          new Error("Template items are missing"),
          {
            workspaceId,
            recurringInvoiceId: definition.id,
          }
        );
      }
    }

    generatedInvoices.push(...result.generated);
  }

  await Promise.all(
    generatedInvoices.map(async (entry) => {
      await logAudit({
        workspaceId,
        actorUserId,
        action: "RECURRING_INVOICE_GENERATED",
        metadata: {
          recurringInvoiceId: entry.recurringInvoiceId,
          invoiceId: entry.invoiceId,
          invoiceNumber: entry.invoiceNumber,
          automatic: true,
        },
      });

      await dispatchGeneratedInvoiceReminder({
        workspaceId,
        invoiceId: entry.invoiceId,
        actorUserId,
        status: entry.status,
      });
    })
  );

  return {
    generatedCount: generatedInvoices.length,
    invoices: generatedInvoices,
  };
}

export async function generateRecurringInvoiceNow(input: {
  workspaceId: number;
  recurringInvoiceId: number;
  actorUserId: number | null;
}) {
  const { workspaceId, recurringInvoiceId, actorUserId } = input;

  const result = await prisma.$transaction(async (tx) => {
    const recurringInvoice = await tx.recurringInvoice.findFirst({
      where: { id: recurringInvoiceId, workspaceId },
      include: recurringInvoiceDetailInclude,
    });

    if (!recurringInvoice) {
      return { error: "Recurring invoice not found" } as const;
    }

    const templateItems = parseStoredTemplateItems(recurringInvoice.itemsJson);
    if (templateItems.length === 0) {
      return { error: "Recurring invoice template is invalid" } as const;
    }

    const issueDate = new Date();
    if (recurringInvoice.endDate && issueDate.getTime() > recurringInvoice.endDate.getTime()) {
      return { error: "Recurring invoice schedule has ended" } as const;
    }

    const invoice = await createInvoiceFromRecurring(
      tx,
      recurringInvoice,
      issueDate,
      templateItems
    );
    const nextBase =
      recurringInvoice.nextRunAt > issueDate ? recurringInvoice.nextRunAt : issueDate;
    const nextRunAt = advanceRecurringRunAt(nextBase, recurringInvoice.frequency);
    const shouldDeactivate = Boolean(
      recurringInvoice.endDate && nextRunAt.getTime() > recurringInvoice.endDate.getTime()
    );
    const updatedRecurringInvoice = await tx.recurringInvoice.update({
      where: { id: recurringInvoice.id },
      data: {
        nextRunAt,
        ...(shouldDeactivate ? { active: false } : {}),
      },
      include: recurringInvoiceDetailInclude,
    });

    return {
      invoice,
      recurringInvoice: updatedRecurringInvoice,
    } as const;
  });

  if ("error" in result) {
    return result;
  }

  await logAudit({
    workspaceId,
    actorUserId,
    action: "RECURRING_INVOICE_GENERATED",
    metadata: {
      recurringInvoiceId,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      automatic: false,
    },
  });

  await dispatchGeneratedInvoiceReminder({
    workspaceId,
    invoiceId: result.invoice.id,
    actorUserId,
    status: result.invoice.status,
  });

  return {
    invoice: result.invoice,
    recurringInvoice: mapRecurringInvoiceDetail(result.recurringInvoice),
  };
}
