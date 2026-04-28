import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createIncomeEntryFromInvoice } from "@/lib/ledger";
import { logInfo, logRouteError, logWarn } from "@/lib/logger";
import { ensureInvoiceIncomeTaxRecord } from "@/lib/invoice-payments";
import { getWorkspaceInvoiceDetail } from "@/lib/invoice-records";
import { sendInvoiceSentReminder } from "@/lib/invoice-reminders";
import {
  buildInvoiceNumber,
  computeInvoiceTotals,
  type ComputedInvoiceTotals,
  isInvoiceStatus,
  parseDate,
  resolveInvoiceClientBusinessId,
  type InvoiceItemInput,
  startOfToday,
} from "@/lib/invoices";

export const runtime = "nodejs";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
type VatTreatment = "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
type WhtTreatment = "NONE" | "PAYABLE" | "RECEIVABLE";
type TaxCategory =
  | "SALES_GOODS"
  | "SALES_SERVICES"
  | "PURCHASE_GOODS"
  | "PURCHASE_SERVICES"
  | "OPERATING_EXPENSE"
  | "PROFESSIONAL_SERVICE"
  | "RENT"
  | "PAYROLL"
  | "ASSET_PURCHASE"
  | "TAX_PAYMENT"
  | "OTHER";
type InvoiceCurrency = "NGN";
type CreateInvoiceItemInput = InvoiceItemInput & {
  amountMinor?: number | string;
};
type CreateInvoiceBody = {
  clientId?: number | string;
  clientBusinessId?: number | string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  items?: CreateInvoiceItemInput[];
  invoiceNumber?: string;
  status?: string;
  vatTreatment?: string;
  whtTreatment?: string;
  taxCategory?: string | null;
  amountMinor?: number | string;
  currency?: string;
  description?: string;
};

const TAX_CATEGORIES = new Set<TaxCategory>([
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
]);
const SUPPORTED_INVOICE_CURRENCIES = new Set<InvoiceCurrency>(["NGN"]);

function parseAmountMinor(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { provided: false as const, value: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return { provided: true as const, value: null };
  }

  return { provided: true as const, value: parsed };
}

function parseCurrency(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: "NGN" as InvoiceCurrency };
  }

  const normalized = String(value).trim().toUpperCase();
  if (SUPPORTED_INVOICE_CURRENCIES.has(normalized as InvoiceCurrency)) {
    return { ok: true as const, value: normalized as InvoiceCurrency };
  }

  return {
    ok: false as const,
    error: `currency must be one of: ${Array.from(SUPPORTED_INVOICE_CURRENCIES).join(", ")}`,
  };
}

function parseVatTreatment(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: "NONE" as VatTreatment, provided: false as const };
  }

  const normalized = String(value).trim().toUpperCase();
  if (
    normalized === "NONE" ||
    normalized === "INPUT" ||
    normalized === "OUTPUT" ||
    normalized === "EXEMPT"
  ) {
    return { ok: true as const, value: normalized as VatTreatment, provided: true as const };
  }

  return {
    ok: false as const,
    error: "vatTreatment must be one of: NONE, INPUT, OUTPUT, EXEMPT",
  };
}

function parseWhtTreatment(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: "NONE" as WhtTreatment, provided: false as const };
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "NONE" || normalized === "PAYABLE" || normalized === "RECEIVABLE") {
    return { ok: true as const, value: normalized as WhtTreatment, provided: true as const };
  }

  return {
    ok: false as const,
    error: "whtTreatment must be one of: NONE, PAYABLE, RECEIVABLE",
  };
}

function parseTaxCategoryInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: null };
  }

  const normalized = String(value).trim().toUpperCase() as TaxCategory;
  if (TAX_CATEGORIES.has(normalized)) {
    return { ok: true as const, value: normalized };
  }

  return {
    ok: false as const,
    error: `taxCategory must be one of: ${Array.from(TAX_CATEGORIES).join(", ")}`,
  };
}

function buildSingleLineInvoiceTotals(input: {
  amountMinor: number;
  description?: string;
}): ComputedInvoiceTotals {
  const description = input.description?.trim() || "Invoice amount";

  return {
    subtotal: input.amountMinor,
    taxAmount: 0,
    totalAmount: input.amountMinor,
    items: [
      {
        description,
        quantity: 1,
        unitPrice: input.amountMinor,
        taxRate: 0,
        lineTotal: input.amountMinor,
      },
    ],
  };
}

function buildTotalsFromItemsPayload(items: CreateInvoiceItemInput[]) {
  const normalized: ComputedInvoiceTotals["items"] = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const [index, item] of items.entries()) {
    const description = item.description?.trim();
    if (!description) {
      return {
        error: `Item ${index + 1} requires a description.`,
      } as const;
    }

    const parsedItemAmountMinor = parseAmountMinor(item.amountMinor);
    if (parsedItemAmountMinor.provided) {
      if (parsedItemAmountMinor.value === null) {
        return {
          error: `Item ${index + 1} requires a positive integer amountMinor value.`,
        } as const;
      }

      subtotal += parsedItemAmountMinor.value;
      normalized.push({
        description,
        quantity: 1,
        unitPrice: parsedItemAmountMinor.value,
        taxRate: 0,
        lineTotal: parsedItemAmountMinor.value,
      });
      continue;
    }

    const singleItemComputed = computeInvoiceTotals([item]);
    if ("error" in singleItemComputed) {
      return {
        error: `Item ${index + 1}: ${singleItemComputed.error}`,
      } as const;
    }

    subtotal += singleItemComputed.subtotal;
    taxAmount += singleItemComputed.taxAmount;
    normalized.push(...singleItemComputed.items);
  }

  return {
    subtotal,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    items: normalized,
  } satisfies ComputedInvoiceTotals;
}

function resolveEffectiveVatTreatment(input: {
  requestedVatTreatment: VatTreatment;
  wasProvided: boolean;
  taxAmount: number;
}) {
  if (input.wasProvided) {
    if (input.requestedVatTreatment === "NONE") {
      return input.taxAmount > 0 ? "OUTPUT" : "NONE";
    }

    return input.requestedVatTreatment;
  }

  return input.taxAmount > 0 ? "OUTPUT" : "NONE";
}

function summarizeInvoiceCreatePayload(body: CreateInvoiceBody) {
  return {
    clientId: body.clientId ?? null,
    clientBusinessId: body.clientBusinessId ?? null,
    issueDate: body.issueDate ?? null,
    dueDate: body.dueDate ?? null,
    invoiceNumber: body.invoiceNumber ?? null,
    status: body.status ?? null,
    amountMinor: body.amountMinor ?? null,
    currency: body.currency ?? null,
    vatTreatment: body.vatTreatment ?? null,
    whtTreatment: body.whtTreatment ?? null,
    taxCategory: body.taxCategory ?? null,
    itemsCount: Array.isArray(body.items) ? body.items.length : null,
    itemsPreview: Array.isArray(body.items)
      ? body.items.slice(0, 5).map((item) => ({
          description: item.description ?? null,
          amountMinor: item.amountMinor ?? null,
          quantity: item.quantity ?? null,
          unitPrice: item.unitPrice ?? null,
          taxRate: item.taxRate ?? null,
        }))
      : null,
  };
}

function buildInvoiceValidationResponse(input: {
  message: string;
  fieldErrors: Record<string, string>;
  workspaceId: number;
  userId: number;
  body: CreateInvoiceBody;
}) {
  const fieldErrors = Object.fromEntries(
    Object.entries(input.fieldErrors).filter(([, value]) => Boolean(value))
  );

  logWarn("invoice", "Invoice creation validation failed", {
    workspaceId: input.workspaceId,
    userId: input.userId,
    message: input.message,
    fieldErrors,
    payload: summarizeInvoiceCreatePayload(input.body),
  });

  return NextResponse.json(
    {
      error: input.message,
      fieldErrors,
    },
    { status: 400 }
  );
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const today = startOfToday();
    await prisma.invoice.updateMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: "SENT",
        dueDate: { lt: today },
      },
      data: { status: "OVERDUE" },
    });

    const invoices = await prisma.invoice.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        items: true,
      },
    });

    return Response.json({ invoices: invoices ?? [] });
  } catch (error) {
    logRouteError("invoices list failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return Response.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let requestSummary: ReturnType<typeof summarizeInvoiceCreatePayload> | null = null;

  try {
    const body = (await req.json()) as CreateInvoiceBody;
    requestSummary = summarizeInvoiceCreatePayload(body);
    logInfo("invoice", "Invoice create payload received", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      payload: requestSummary,
    });
    const { clientId, clientBusinessId, issueDate, dueDate, notes, items, invoiceNumber, status } =
      body;

    const parsedClientId = Number(clientId);
    if (!Number.isFinite(parsedClientId) || !Number.isInteger(parsedClientId)) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          clientId: "clientId is required and must be a valid integer.",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    let parsedClientBusinessId: number | undefined;
    if (clientBusinessId !== undefined) {
      const candidate = Number(clientBusinessId);
      if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate <= 0) {
        return buildInvoiceValidationResponse({
          message: "Invoice validation failed.",
          fieldErrors: {
            clientBusinessId: "clientBusinessId must be a positive integer when provided.",
          },
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          body,
        });
      }
      const business = await prisma.clientBusiness.findFirst({
        where: {
          id: candidate,
          workspaceId: ctx.workspaceId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!business) {
        return NextResponse.json({ error: "Client business not found" }, { status: 404 });
      }
      parsedClientBusinessId = business.id;
    }

    const client = await prisma.client.findFirst({
      where: { id: parsedClientId, workspaceId: ctx.workspaceId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const parsedIssueDate = parseDate(issueDate);
    const parsedDueDate = parseDate(dueDate);
    if (!parsedIssueDate || !parsedDueDate) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          issueDate: !parsedIssueDate ? "issueDate is required and must be a valid date." : "",
          dueDate: !parsedDueDate ? "dueDate is required and must be a valid date." : "",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    if (parsedDueDate < parsedIssueDate) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          dueDate: "dueDate must be after issueDate.",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const parsedCurrency = parseCurrency(body.currency);
    if (!parsedCurrency.ok) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          currency: parsedCurrency.error,
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const parsedAmountMinor = parseAmountMinor(body.amountMinor);
    if (parsedAmountMinor.provided && parsedAmountMinor.value === null) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          amountMinor: "amountMinor must be a positive integer amount in minor units.",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const parsedVatTreatment = parseVatTreatment(body.vatTreatment);
    if (!parsedVatTreatment.ok) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          vatTreatment: parsedVatTreatment.error,
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const parsedWhtTreatment = parseWhtTreatment(body.whtTreatment);
    if (!parsedWhtTreatment.ok) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          whtTreatment: parsedWhtTreatment.error,
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const parsedTaxCategory = parseTaxCategoryInput(body.taxCategory);
    if (!parsedTaxCategory.ok) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          taxCategory: parsedTaxCategory.error,
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    let computed: ComputedInvoiceTotals | { error: string };
    if (Array.isArray(items) && items.length > 0) {
      computed = buildTotalsFromItemsPayload(items);
    } else if (parsedAmountMinor.value !== null) {
      computed = buildSingleLineInvoiceTotals({
        amountMinor: parsedAmountMinor.value,
        description: body.description ?? notes,
      });
    } else {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          items: "Provide at least one invoice item or a positive amountMinor value.",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    if ("error" in computed) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          items: computed.error,
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    if (
      parsedAmountMinor.value !== null &&
      Array.isArray(items) &&
      items.length > 0 &&
      parsedAmountMinor.value !== computed.totalAmount
    ) {
      return buildInvoiceValidationResponse({
        message: "Invoice validation failed.",
        fieldErrors: {
          amountMinor: "amountMinor must match the computed total amount from invoice items.",
        },
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        body,
      });
    }

    const requestedVatTreatment = parsedVatTreatment.value;
    const requestedWhtTreatment = parsedWhtTreatment.value;
    const requestedTaxCategory = parsedTaxCategory.value;
    const effectiveVatTreatment =
      resolveEffectiveVatTreatment({
        requestedVatTreatment,
        wasProvided: parsedVatTreatment.provided,
        taxAmount: computed.taxAmount,
      });
    const effectiveWhtTreatment = requestedWhtTreatment;
    const effectiveTaxCategory =
      requestedTaxCategory ??
      (effectiveWhtTreatment === "RECEIVABLE" ? "SALES_SERVICES" : null);

    let nextStatus: InvoiceStatus = "SENT";
    if (status !== undefined) {
      const normalized = String(status).toUpperCase();
      if (!isInvoiceStatus(normalized)) {
        return buildInvoiceValidationResponse({
          message: "Invoice validation failed.",
          fieldErrors: {
            status: "status must be one of: DRAFT, SENT, PAID, OVERDUE.",
          },
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          body,
        });
      }
      nextStatus = normalized;
    }

    const requestedInvoiceNumber = invoiceNumber?.trim() || null;

    let invoice = null;
    let lastCreateError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        invoice = await prisma.$transaction(async (tx) => {
          const resolvedClientBusinessId = await resolveInvoiceClientBusinessId(tx, {
            workspaceId: ctx.workspaceId,
            requestedClientBusinessId: parsedClientBusinessId ?? null,
          });

          const created = await tx.invoice.create({
            data: {
              workspaceId: ctx.workspaceId,
              clientId: client.id,
              clientBusinessId: resolvedClientBusinessId,
              invoiceNumber: requestedInvoiceNumber ?? buildInvoiceNumber(),
              status: nextStatus,
              paidAt: nextStatus === "PAID" ? new Date() : null,
              issueDate: parsedIssueDate,
              dueDate: parsedDueDate,
              subtotal: computed.subtotal,
              taxAmount: computed.taxAmount,
              totalAmount: computed.totalAmount,
              vatTreatment: effectiveVatTreatment,
              whtTreatment: effectiveWhtTreatment,
              taxCategory: effectiveTaxCategory,
              notes: notes?.trim() || null,
              items: {
                create: computed.items,
              },
            },
            include: {
              client: true,
              items: true,
            },
          });

          if (created.status === "PAID") {
            await ensureInvoiceIncomeTaxRecord(tx, {
              invoice: created,
              actorUserId: ctx.userId,
              occurredOn: created.paidAt ?? new Date(),
            });
            await createIncomeEntryFromInvoice(tx, {
              invoiceId: created.id,
              actorUserId: ctx.userId,
              occurredOn: created.paidAt ?? new Date(),
              clientBusinessId: resolvedClientBusinessId ?? undefined,
            });
          }

          return created;
        }, {
          maxWait: 10_000,
          timeout: 30_000,
        });
        break;
      } catch (error) {
        lastCreateError = error;
        const isDuplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";

        if (!isDuplicateNumber) {
          throw error;
        }

        if (requestedInvoiceNumber) {
          return NextResponse.json(
            { error: "Invoice number already exists for this workspace" },
            { status: 409 }
          );
        }
      }
    }

    if (!invoice) {
      throw lastCreateError ?? new Error("Unable to create invoice");
    }

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "INVOICE_CREATED",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      },
    });

    const detail = await getWorkspaceInvoiceDetail(ctx.workspaceId, invoice.id);

    if (invoice.status === "SENT") {
      try {
        await sendInvoiceSentReminder({
          workspaceId: ctx.workspaceId,
          invoiceId: invoice.id,
          initiatedByUserId: ctx.userId,
        });
      } catch (reminderError) {
        logRouteError("invoice sent reminder after create failed", reminderError, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          invoiceId: invoice.id,
        });
      }
    }

    return NextResponse.json({ invoice: detail ?? invoice }, { status: 201 });
  } catch (error) {
    logRouteError("invoice create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      payload: requestSummary,
    });
    return NextResponse.json({ error: "Server error creating invoice" }, { status: 500 });
  }
}
