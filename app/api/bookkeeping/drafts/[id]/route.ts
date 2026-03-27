import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { deriveLedgerDirection, toMinorUnits } from "@/lib/bookkeeping-extract";
import { buildReceiptLearningFeedback } from "@/lib/bookkeeping-receipts";
import {
  findWorkspaceBookkeepingDraft,
  recalculateBookkeepingUploadStatus,
  resolveCategoryForDraft,
  resolveVendorForDraft,
} from "@/lib/bookkeeping-review";
import { createExpenseEntryFromReceipt } from "@/lib/ledger";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDateInput(value: unknown) {
  const raw = normalizeString(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSuggestedType(value: unknown) {
  return normalizeString(value).toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
}

function normalizeVatTreatment(value: unknown) {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "INPUT" || raw === "OUTPUT" || raw === "EXEMPT") return raw;
  return "NONE";
}

function normalizeWhtTreatment(value: unknown) {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "PAYABLE" || raw === "RECEIVABLE") return raw;
  return "NONE";
}

export async function PATCH(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "AI_ASSISTANT");
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }

  const params = await context.params;
  const draftId = Number(params.id);
  if (!Number.isInteger(draftId)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = normalizeString(body.action).toLowerCase();
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const draft = await findWorkspaceBookkeepingDraft(ctx.workspaceId, draftId);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (action === "approve" && draft.ledgerTransaction?.id) {
      return NextResponse.json(
        { error: "Draft has already been approved" },
        { status: 409 }
      );
    }

    const description = normalizeString(body.description) || draft.description || "";
    const reference = normalizeString(body.reference) || draft.reference || draft.upload.fileName;
    const documentNumber =
      normalizeString(body.documentNumber) || draft.documentNumber || null;
    const vendorName = normalizeString(body.vendorName) || draft.vendorName || null;
    const suggestedCategoryName =
      normalizeString(body.suggestedCategoryName) || draft.suggestedCategoryName || null;
    const paymentMethod =
      normalizeString(body.paymentMethod) || draft.paymentMethod || null;
    const currency = (normalizeString(body.currency) || draft.currency || "NGN").toUpperCase();
    const suggestedType = normalizeSuggestedType(body.suggestedType);
    const direction = deriveLedgerDirection(suggestedType);
    const vatTreatment = normalizeVatTreatment(body.vatTreatment || draft.vatTreatment);
    const whtTreatment = normalizeWhtTreatment(body.whtTreatment || draft.whtTreatment);
    const proposedDate =
      normalizeDateInput(body.transactionDate) ??
      draft.proposedDate ??
      new Date();
    const subtotal = normalizeNumber(body.subtotal);
    const amount = normalizeNumber(body.amount);
    const taxAmount = normalizeNumber(body.taxAmount);
    const vatAmount = normalizeNumber(body.vatAmount);
    const whtAmount = normalizeNumber(body.whtAmount);
    const taxRate = Math.max(0, normalizeNumber(body.taxRate) ?? draft.taxRate ?? 0);
    const reviewerNote = normalizeString(body.reviewerNote) || null;
    const deductibilityHint =
      normalizeString(body.deductibilityHint) || draft.deductibilityHint || null;
    const categoryId =
      typeof body.categoryId === "number"
        ? body.categoryId
        : typeof body.categoryId === "string" && body.categoryId.trim()
          ? Number(body.categoryId)
          : null;

    if (action === "approve") {
      if (!description) {
        return NextResponse.json({ error: "Description is required." }, { status: 400 });
      }
      if (amount === null || amount <= 0) {
        return NextResponse.json({ error: "Amount is required." }, { status: 400 });
      }
      if (!proposedDate) {
        return NextResponse.json({ error: "Transaction date is required." }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const resolvedVendorId = await resolveVendorForDraft(
        tx,
        draft.upload.clientBusinessId,
        vendorName
      );
      const resolvedCategoryId = await resolveCategoryForDraft(tx, {
        clientBusinessId: draft.upload.clientBusinessId,
        categoryId: Number.isInteger(categoryId) ? categoryId : null,
        suggestedCategoryName,
        direction,
      });
      const resolvedCategory = resolvedCategoryId
        ? await tx.transactionCategory.findUnique({
            where: { id: resolvedCategoryId },
            select: { id: true, name: true },
          })
        : null;
      const updatedLearningPayload =
        action === "approve"
          ? buildReceiptLearningFeedback({
              rawPayload: draft.aiPayload,
              action: "approve",
              vendorName,
              finalCategoryId: resolvedCategory?.id ?? null,
              finalCategoryName:
                resolvedCategory?.name ?? suggestedCategoryName ?? draft.suggestedCategoryName,
            })
          : draft.aiPayload;

      const amountMinor = amount !== null ? toMinorUnits(amount) : draft.amountMinor;
      const subtotalMinor =
        subtotal !== null ? toMinorUnits(subtotal) : draft.subtotalMinor;
      const totalAmountMinor =
        amount !== null
          ? toMinorUnits(amount)
          : draft.totalAmountMinor ?? draft.amountMinor;
      const taxAmountMinor = taxAmount !== null ? toMinorUnits(taxAmount) : draft.taxAmountMinor;
      const vatAmountMinor =
        vatAmount !== null
          ? toMinorUnits(vatAmount) ?? 0
          : vatTreatment !== "NONE" && whtTreatment === "NONE"
            ? taxAmountMinor ?? 0
            : draft.vatAmountMinor;
      const whtAmountMinor =
        whtAmount !== null
          ? toMinorUnits(whtAmount) ?? 0
          : whtTreatment !== "NONE" && vatTreatment === "NONE"
            ? taxAmountMinor ?? 0
            : draft.whtAmountMinor;

      const reviewTimestamp = new Date();
      let transactionId: number | null = null;

      if (action === "approve") {
        const transaction = await createExpenseEntryFromReceipt(tx, {
          draftId: draft.id,
          clientBusinessId: draft.upload.clientBusinessId,
          actorUserId: ctx.userId,
          vendorId: resolvedVendorId,
          categoryId: resolvedCategoryId,
          transactionDate: proposedDate,
          description,
          reference: reference || null,
          sourceDocumentNumber: documentNumber,
          direction,
          amountMinor: totalAmountMinor ?? amountMinor ?? 0,
          currency,
          vatAmountMinor: vatAmountMinor ?? 0,
          whtAmountMinor: whtAmountMinor ?? 0,
          vatTreatment,
          whtTreatment,
          taxCategory: draft.taxCategory,
          taxEvidenceStatus: draft.taxEvidenceStatus,
          filingPeriodKey: draft.filingPeriodKey,
          notes: reviewerNote,
        });
        transactionId = transaction.entryId;
      }

      await tx.bookkeepingDraft.update({
        where: { id: draft.id },
        data: {
          vendorId: resolvedVendorId,
          categoryId: resolvedCategoryId,
          reviewedByUserId: ctx.userId,
          proposedDate,
          description,
          reference: reference || null,
          documentNumber,
          vendorName,
          suggestedCategoryName,
          paymentMethod,
          direction,
          subtotalMinor,
          amountMinor,
          totalAmountMinor,
          taxAmountMinor,
          taxRate,
          currency,
          vatAmountMinor: vatAmountMinor ?? 0,
          whtAmountMinor: whtAmountMinor ?? 0,
          vatTreatment,
          whtTreatment,
          reviewStatus: action === "approve" ? "APPROVED" : "REJECTED",
          deductibilityHint,
          reviewerNote,
          aiPayload: updatedLearningPayload,
          reviewedAt: reviewTimestamp,
          approvedAt: action === "approve" ? reviewTimestamp : null,
          rejectedAt: action === "reject" ? reviewTimestamp : null,
        },
      });

      await recalculateBookkeepingUploadStatus(tx, draft.uploadId);

      return {
        transactionId,
        uploadId: draft.uploadId,
      };
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: action === "approve" ? "BOOKKEEPING_DRAFT_APPROVED" : "BOOKKEEPING_DRAFT_REJECTED",
      metadata: {
        draftId,
        uploadId: result.uploadId,
        ledgerTransactionId: result.transactionId,
        clientBusinessId: draft.upload.clientBusinessId,
      },
    });

    return NextResponse.json({
      ok: true,
      action,
      uploadId: result.uploadId,
      ledgerTransactionId: result.transactionId,
    });
  } catch (error) {
    logRouteError("bookkeeping draft review failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      draftId,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to review bookkeeping draft",
      },
      { status: 500 }
    );
  }
}
