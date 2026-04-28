import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createIncomeEntryFromInvoice,
  deleteIncomeEntryFromInvoice,
} from "@/lib/ledger";
import { logRouteError } from "@/lib/logger";
import type { InvoiceStatus } from "@prisma/client";
import { ensureInvoiceIncomeTaxRecord } from "@/lib/invoice-payments";
import { getWorkspaceInvoiceDetail } from "@/lib/invoice-records";
import { sendInvoiceSentReminder } from "@/lib/invoice-reminders";
import {
  computeInvoiceTotals,
  isInvoiceStatus,
  parseDate,
  resolveInvoiceClientBusinessId,
  type ComputedInvoiceTotals,
  type InvoiceItemInput,
  startOfToday,
} from "@/lib/invoices";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id?: string }> };
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

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeVatTreatment(value: unknown): VatTreatment {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (
    normalized === "NONE" ||
    normalized === "INPUT" ||
    normalized === "OUTPUT" ||
    normalized === "EXEMPT"
  ) {
    return normalized;
  }
  return "NONE";
}

function normalizeWhtTreatment(value: unknown): WhtTreatment {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "PAYABLE" || normalized === "RECEIVABLE") {
    return normalized;
  }
  return "NONE";
}

function normalizeTaxCategory(value: unknown): TaxCategory | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase() as TaxCategory;
  return TAX_CATEGORIES.has(normalized) ? normalized : null;
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const invoiceId = parseId(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const invoice = await getWorkspaceInvoiceDetail(ctx.workspaceId, invoiceId);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const invoiceId = parseId(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const {
      status,
      issueDate,
      dueDate,
      notes,
      items,
      clientId,
      clientBusinessId,
    } = body as {
      status?: string;
      issueDate?: string;
      dueDate?: string;
      notes?: string;
      items?: InvoiceItemInput[];
      clientId?: number | string;
      clientBusinessId?: number | string;
      vatTreatment?: string;
      whtTreatment?: string;
      taxCategory?: string;
    };

    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    let parsedClientId: number | undefined = undefined;
    if (clientId !== undefined) {
      const candidate = Number(clientId);
      if (!Number.isFinite(candidate) || !Number.isInteger(candidate)) {
        return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
      }
      const client = await prisma.client.findFirst({
        where: { id: candidate, workspaceId: ctx.workspaceId },
      });
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      parsedClientId = client.id;
    }

    let parsedClientBusinessId: number | undefined = undefined;
    if (clientBusinessId !== undefined) {
      const candidate = Number(clientBusinessId);
      if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate <= 0) {
        return NextResponse.json({ error: "Invalid clientBusinessId" }, { status: 400 });
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

    const parsedIssueDate = issueDate ? parseDate(issueDate) : null;
    const parsedDueDate = dueDate ? parseDate(dueDate) : null;
    if (issueDate && !parsedIssueDate) {
      return NextResponse.json({ error: "Invalid issueDate" }, { status: 400 });
    }
    if (dueDate && !parsedDueDate) {
      return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
    }
    const effectiveIssueDate = parsedIssueDate ?? existing.issueDate;
    const effectiveDueDate = parsedDueDate ?? existing.dueDate;
    if (effectiveDueDate < effectiveIssueDate) {
      return NextResponse.json(
        { error: "dueDate must be after issueDate" },
        { status: 400 }
      );
    }

    let nextStatus: InvoiceStatus | undefined;
    if (status !== undefined) {
      const normalized = String(status).toUpperCase();
      if (!isInvoiceStatus(normalized)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      nextStatus = normalized;
    }

    let computedTotals: ComputedInvoiceTotals | null = null;
    if (items) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "items are required" }, { status: 400 });
      }
      const computed = computeInvoiceTotals(items);
      if ("error" in computed) {
        return NextResponse.json({ error: computed.error }, { status: 400 });
      }
      computedTotals = computed;
    }

    const requestedVatTreatment =
      body.vatTreatment !== undefined
        ? normalizeVatTreatment(body.vatTreatment)
        : undefined;
    const requestedWhtTreatment =
      body.whtTreatment !== undefined
        ? normalizeWhtTreatment(body.whtTreatment)
        : undefined;
    const requestedTaxCategory =
      body.taxCategory !== undefined ? normalizeTaxCategory(body.taxCategory) : undefined;
    const effectiveVatTreatment =
      requestedVatTreatment === undefined
        ? undefined
        : computedTotals
          ? computedTotals.taxAmount > 0
            ? requestedVatTreatment === "NONE"
              ? "OUTPUT"
              : requestedVatTreatment
            : requestedVatTreatment === "EXEMPT"
              ? "EXEMPT"
              : "NONE"
          : existing.taxAmount > 0
            ? requestedVatTreatment === "NONE"
              ? "OUTPUT"
              : requestedVatTreatment
            : requestedVatTreatment === "EXEMPT"
              ? "EXEMPT"
              : "NONE";
    const effectiveWhtTreatment =
      requestedWhtTreatment !== undefined ? requestedWhtTreatment : undefined;
    const effectiveTaxCategory =
      requestedTaxCategory !== undefined
        ? requestedTaxCategory
        : effectiveWhtTreatment === "RECEIVABLE"
          ? "SALES_SERVICES"
          : undefined;

    const nextInvoiceStatus = nextStatus ?? existing.status;
    const shouldCreateTaxRecord =
      nextInvoiceStatus === "PAID" && existing.status !== "PAID";
    const shouldSyncLedgerIncome = nextInvoiceStatus === "PAID";
    const shouldDeleteLedgerIncome =
      existing.status === "PAID" && nextStatus !== undefined && nextStatus !== "PAID";

    const result = await prisma.$transaction(async (tx) => {
      const resolvedClientBusinessId = await resolveInvoiceClientBusinessId(tx, {
        workspaceId: ctx.workspaceId,
        requestedClientBusinessId: parsedClientBusinessId ?? null,
        existingClientBusinessId: existing.clientBusinessId ?? null,
      });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: nextStatus ?? undefined,
          paidAt:
            nextStatus === "PAID"
              ? existing.paidAt ?? new Date()
              : nextStatus !== undefined && existing.status === "PAID"
                ? null
                : undefined,
          issueDate: parsedIssueDate ?? undefined,
          dueDate: parsedDueDate ?? undefined,
          notes: notes !== undefined ? notes?.trim() || null : undefined,
          clientId: parsedClientId ?? undefined,
          clientBusinessId:
            parsedClientBusinessId !== undefined ||
            existing.clientBusinessId === null ||
            resolvedClientBusinessId !== null
              ? resolvedClientBusinessId
              : undefined,
          subtotal: computedTotals ? computedTotals.subtotal : undefined,
          taxAmount: computedTotals ? computedTotals.taxAmount : undefined,
          totalAmount: computedTotals ? computedTotals.totalAmount : undefined,
          vatTreatment: effectiveVatTreatment,
          whtTreatment: effectiveWhtTreatment,
          taxCategory: effectiveTaxCategory,
        },
      });

      if (computedTotals) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId } });
        await tx.invoiceItem.createMany({
          data: computedTotals.items.map((item) => ({
            invoiceId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            lineTotal: item.lineTotal,
          })),
        });
      }

      let taxRecordId: number | null = null;
      let ledgerEntryId: number | null = null;
      if (shouldCreateTaxRecord) {
        taxRecordId = await ensureInvoiceIncomeTaxRecord(tx, {
          invoice: updated,
          actorUserId: ctx.userId,
          occurredOn: updated.paidAt ?? new Date(),
        });
      }

      if (shouldSyncLedgerIncome) {
        const ledgerResult = await createIncomeEntryFromInvoice(tx, {
          invoiceId: updated.id,
          actorUserId: ctx.userId,
          occurredOn: updated.paidAt ?? new Date(),
          clientBusinessId: resolvedClientBusinessId ?? undefined,
        });
        ledgerEntryId = ledgerResult.entryId;
      } else if (shouldDeleteLedgerIncome) {
        await deleteIncomeEntryFromInvoice(tx, {
          invoiceId: updated.id,
        });
      }

      return { invoice: updated, taxRecordId, ledgerEntryId };
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    });

    const { taxRecordId, ledgerEntryId } = result;
    const invoice = await getWorkspaceInvoiceDetail(ctx.workspaceId, invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const statusChanged = nextStatus !== undefined && nextStatus !== existing.status;

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: statusChanged ? "INVOICE_STATUS_CHANGED" : "INVOICE_UPDATED",
      metadata: {
        invoiceId: invoice.id,
        status: nextStatus ?? invoice.status,
      },
    });

    if (taxRecordId) {
      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "Income created from invoice payment",
        metadata: {
          invoiceId: invoice.id,
          taxRecordId,
          ledgerEntryId,
          amountKobo: invoice.totalAmount,
        },
      });
    }

    if (existing.status === "DRAFT" && invoice.status === "SENT") {
      try {
        await sendInvoiceSentReminder({
          workspaceId: ctx.workspaceId,
          invoiceId: invoice.id,
          initiatedByUserId: ctx.userId,
        });
      } catch (reminderError) {
        logRouteError("invoice sent reminder after update failed", reminderError, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          invoiceId: invoice.id,
        });
      }
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    logRouteError("invoice update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json({ error: "Server error updating invoice" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const invoiceId = parseId(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  try {
    const deleted = await prisma.invoice.deleteMany({
      where: { id: invoiceId, workspaceId: ctx.workspaceId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "INVOICE_DELETED",
      metadata: { invoiceId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("invoice delete failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json({ error: "Server error deleting invoice" }, { status: 500 });
  }
}
