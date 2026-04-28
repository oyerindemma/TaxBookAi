import type {
  Prisma,
  TaxCategory,
  TaxEvidenceStatus,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { queueStoredTaxPeriodRecompute } from "@/lib/tax-engine";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    kind?: string;
    id?: string;
  }>;
};

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
] as const satisfies readonly TaxCategory[];

const VAT_TREATMENTS = ["NONE", "INPUT", "OUTPUT", "EXEMPT"] as const satisfies readonly VatTreatment[];
const WHT_TREATMENTS = ["NONE", "PAYABLE", "RECEIVABLE"] as const satisfies readonly WhtTreatment[];
const TAX_EVIDENCE_STATUSES = [
  "UNKNOWN",
  "PENDING",
  "ATTACHED",
  "VERIFIED",
  "MISSING",
] as const satisfies readonly TaxEvidenceStatus[];

type VatReviewRecord = Prisma.VATRecordGetPayload<{
  include: {
    taxPeriod: {
      select: {
        id: true;
        periodKey: true;
      };
    };
  };
}>;

type WhtReviewRecord = Prisma.WHTRecordGetPayload<{
  include: {
    taxPeriod: {
      select: {
        id: true;
        periodKey: true;
      };
    };
  };
}>;

function parseId(value?: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseKind(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "vat" || normalized === "wht") return normalized;
  return null;
}

function parseEnumValue<T extends readonly string[]>(value: unknown, allowed: T) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return allowed.includes(normalized) ? (normalized as T[number]) : null;
}

async function updateVatSource(input: {
  row: VatReviewRecord;
  vatTreatment: VatTreatment;
  taxCategory: TaxCategory | null;
  taxEvidenceStatus: TaxEvidenceStatus | null;
  note: string | null;
  userId: number;
  action: "REVIEW" | "OVERRIDE" | "REOPEN";
}) {
  const periodKey = input.row.taxPeriod.periodKey;
  if (input.row.invoiceId) {
    await prisma.invoice.update({
      where: { id: input.row.invoiceId },
      data: {
        vatTreatment: input.vatTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
      },
    });
  }
  if (input.row.ledgerTransactionId) {
    await prisma.ledgerTransaction.update({
      where: { id: input.row.ledgerTransactionId },
      data: {
        vatTreatment: input.vatTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
      },
    });
  }
  if (input.row.bookkeepingDraftId) {
    await prisma.bookkeepingDraft.update({
      where: { id: input.row.bookkeepingDraftId },
      data: {
        vatTreatment: input.vatTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
      },
    });
  }
  if (input.row.taxRecordId) {
    await prisma.taxRecord.update({
      where: { id: input.row.taxRecordId },
      data: {
        vatTreatment: input.vatTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
        taxReviewStatus:
          input.action === "REOPEN"
            ? "REOPENED"
            : input.action === "OVERRIDE"
              ? "OVERRIDDEN"
              : "REVIEWED",
        reviewNote: input.note,
        reviewedAt: input.action === "REOPEN" ? null : new Date(),
        reviewedByUserId: input.action === "REOPEN" ? null : input.userId,
      },
    });
  }
}

async function updateWhtSource(input: {
  row: WhtReviewRecord;
  whtTreatment: WhtTreatment;
  taxCategory: TaxCategory | null;
  taxEvidenceStatus: TaxEvidenceStatus | null;
  note: string | null;
  userId: number;
  action: "REVIEW" | "OVERRIDE" | "REOPEN";
}) {
  const periodKey = input.row.taxPeriod.periodKey;
  if (input.row.invoiceId) {
    await prisma.invoice.update({
      where: { id: input.row.invoiceId },
      data: {
        whtTreatment: input.whtTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
      },
    });
  }
  if (input.row.ledgerTransactionId) {
    await prisma.ledgerTransaction.update({
      where: { id: input.row.ledgerTransactionId },
      data: {
        whtTreatment: input.whtTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
      },
    });
  }
  if (input.row.bookkeepingDraftId) {
    await prisma.bookkeepingDraft.update({
      where: { id: input.row.bookkeepingDraftId },
      data: {
        whtTreatment: input.whtTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
      },
    });
  }
  if (input.row.taxRecordId) {
    await prisma.taxRecord.update({
      where: { id: input.row.taxRecordId },
      data: {
        whtTreatment: input.whtTreatment,
        taxCategory: input.taxCategory,
        taxEvidenceStatus: input.taxEvidenceStatus ?? undefined,
        filingPeriodKey: periodKey,
        sourceDocumentNumber: input.row.sourceDocumentNumber ?? undefined,
        taxReviewStatus:
          input.action === "REOPEN"
            ? "REOPENED"
            : input.action === "OVERRIDE"
              ? "OVERRIDDEN"
              : "REVIEWED",
        reviewNote: input.note,
        reviewedAt: input.action === "REOPEN" ? null : new Date(),
        reviewedByUserId: input.action === "REOPEN" ? null : input.userId,
      },
    });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const { kind, id } = await context.params;
  const rowKind = parseKind(kind);
  const rowId = parseId(id);

  if (!rowKind || !rowId) {
    return NextResponse.json({ error: "Invalid tax-engine record" }, { status: 400 });
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as {
      action?: string;
      note?: string;
      taxCategory?: string;
      vatTreatment?: string;
      whtTreatment?: string;
      taxEvidenceStatus?: string;
    };
    const action =
      body.action?.trim().toUpperCase() === "OVERRIDE"
        ? "OVERRIDE"
        : body.action?.trim().toUpperCase() === "REOPEN"
          ? "REOPEN"
          : "REVIEW";
    const taxCategory = parseEnumValue(body.taxCategory, TAX_CATEGORIES);
    const taxEvidenceStatus = parseEnumValue(
      body.taxEvidenceStatus,
      TAX_EVIDENCE_STATUSES
    );
    const note = body.note?.trim() || null;

    if (rowKind === "vat") {
      const row = await prisma.vATRecord.findFirst({
        where: { id: rowId, workspaceId: ctx.workspaceId },
        include: {
          taxPeriod: {
            select: {
              id: true,
              periodKey: true,
            },
          },
        },
      });
      if (!row) {
        return NextResponse.json({ error: "VAT record not found" }, { status: 404 });
      }

      const vatTreatment =
        parseEnumValue(body.vatTreatment, VAT_TREATMENTS) ?? row.vatTreatment;

      await prisma.vATRecord.update({
        where: { id: row.id },
        data: {
          vatTreatment,
          taxCategory: taxCategory ?? row.taxCategory,
          reviewed: action !== "REOPEN",
          reviewedAt: action === "REOPEN" ? null : new Date(),
          reviewedByUserId: action === "REOPEN" ? null : ctx.userId,
          reviewNote: note,
        },
      });

      await updateVatSource({
        row,
        vatTreatment,
        taxCategory: taxCategory ?? row.taxCategory,
        taxEvidenceStatus,
        note,
        userId: ctx.userId,
        action,
      });

      await queueStoredTaxPeriodRecompute(
        row.taxPeriod.id,
        "tax-review-update"
      );

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "TAX_ENGINE_VAT_REVIEW_UPDATED",
        metadata: {
          recordId: row.id,
          action,
          vatTreatment,
          taxCategory: taxCategory ?? row.taxCategory,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const row = await prisma.wHTRecord.findFirst({
      where: { id: rowId, workspaceId: ctx.workspaceId },
      include: {
        taxPeriod: {
          select: {
            id: true,
            periodKey: true,
          },
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "WHT record not found" }, { status: 404 });
    }

    const whtTreatment =
      parseEnumValue(body.whtTreatment, WHT_TREATMENTS) ?? row.whtTreatment;

    await prisma.wHTRecord.update({
      where: { id: row.id },
      data: {
        whtTreatment,
        taxCategory: taxCategory ?? row.taxCategory,
        reviewed: action !== "REOPEN",
        reviewedAt: action === "REOPEN" ? null : new Date(),
        reviewedByUserId: action === "REOPEN" ? null : ctx.userId,
        reviewNote: note,
      },
    });

    await updateWhtSource({
      row,
      whtTreatment,
      taxCategory: taxCategory ?? row.taxCategory,
      taxEvidenceStatus,
      note,
      userId: ctx.userId,
      action,
    });

    await queueStoredTaxPeriodRecompute(
      row.taxPeriod.id,
      "tax-review-update"
    );

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_ENGINE_WHT_REVIEW_UPDATED",
      metadata: {
        recordId: row.id,
        action,
        whtTreatment,
        taxCategory: taxCategory ?? row.taxCategory,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("tax engine record review update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recordId: rowId,
      kind: rowKind,
    });
    return NextResponse.json(
      { error: "Server error updating tax review item" },
      { status: 500 }
    );
  }
}
