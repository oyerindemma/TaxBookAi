import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { serializeTaxRecordAiMetadata } from "@/lib/tax-record-ai";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id?: string }> };

function parseRecordId(idRaw?: string) {
  if (!idRaw) return null;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseTaxRate(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return parsed;
}

function computeTax(amountKobo: number, taxRate: number) {
  const computedTax = Math.round(amountKobo * (taxRate / 100));
  const netAmount = Math.round(amountKobo - computedTax);
  return { computedTax, netAmount };
}

function parseCategoryId(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(
  _req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const recordId = parseRecordId(id);
  if (!recordId) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const record = await prisma.taxRecord.findFirst({
    where: { id: recordId, workspaceId: ctx.workspaceId },
    include: { category: true },
  });

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ record });
}

export async function PUT(
  req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const recordId = parseRecordId(id);
  if (!recordId) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const {
      kind,
      amountKobo,
      currency,
      occurredOn,
      description,
      taxRate,
      categoryId,
      vendorName,
      recurring,
      aiMetadata,
    } = body as {
      kind?: string;
      amountKobo?: number;
      currency?: string;
      occurredOn?: string;
      description?: string;
      taxRate?: number | string;
      categoryId?: number | string;
      vendorName?: string;
      recurring?: boolean;
      aiMetadata?: unknown;
    };

    if (!kind || amountKobo === undefined || amountKobo === null || !occurredOn) {
      return NextResponse.json(
        { error: "kind, amountKobo, and occurredOn are required" },
        { status: 400 }
      );
    }

    const normalizedKind = kind.trim().toUpperCase();
    if (!normalizedKind) {
      return NextResponse.json({ error: "kind is required" }, { status: 400 });
    }

    const parsedAmount = Number(amountKobo);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "amountKobo must be greater than 0" },
        { status: 400 }
      );
    }

    const parsedDate = new Date(occurredOn);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid occurredOn date" }, { status: 400 });
    }

    const existing = await prisma.taxRecord.findFirst({
      where: { id: recordId, workspaceId: ctx.workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const parsedRate =
      taxRate === undefined || taxRate === null
        ? existing.taxRate
        : parseTaxRate(taxRate);
    if (parsedRate === null) {
      return NextResponse.json(
        { error: "taxRate must be between 0 and 100" },
        { status: 400 }
      );
    }

    const parsedCategoryId =
      categoryId === undefined
        ? existing.categoryId
        : categoryId === null || categoryId === ""
          ? null
          : parseCategoryId(categoryId);
    if (
      categoryId !== undefined &&
      categoryId !== null &&
      categoryId !== "" &&
      parsedCategoryId === null
    ) {
      return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }
    if (parsedCategoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: parsedCategoryId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const amountKoboRounded = Math.max(0, Math.round(parsedAmount));
    const computed = computeTax(amountKoboRounded, parsedRate);
    let normalizedAiMetadata = existing.aiMetadata;
    let source = existing.source;

    try {
      const serializedAi = serializeTaxRecordAiMetadata(aiMetadata, ctx.userId);
      if (serializedAi.serialized !== undefined) {
        normalizedAiMetadata = serializedAi.serialized;
      }
      if (serializedAi.source !== undefined && serializedAi.source !== null) {
        source = serializedAi.source;
      }
      if (serializedAi.serialized === null && source?.startsWith("ai_")) {
        source = null;
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid aiMetadata payload",
        },
        { status: 400 }
      );
    }

    const record = await prisma.taxRecord.update({
      where: { id: recordId },
      data: {
        kind: normalizedKind,
        amountKobo: amountKoboRounded,
        taxRate: parsedRate,
        computedTax: computed.computedTax,
        netAmount: computed.netAmount,
        currency: currency?.trim().toUpperCase() || existing.currency,
        occurredOn: parsedDate,
        description: description?.trim() || null,
        source,
        aiMetadata: normalizedAiMetadata,
        categoryId: parsedCategoryId,
        vendorName:
          vendorName !== undefined ? vendorName?.trim() || null : existing.vendorName,
        recurring: recurring !== undefined ? Boolean(recurring) : existing.recurring,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_RECORD_UPDATED",
      metadata: {
        recordId: record.id,
        categoryId: record.categoryId,
        vendorName: record.vendorName,
        recurring: record.recurring,
        source: record.source,
        hasAiMetadata: Boolean(record.aiMetadata),
      },
    });

    return NextResponse.json({ record });
  } catch (error) {
    logRouteError("tax record detail update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recordId,
    });
    return NextResponse.json(
      { error: "Server error updating tax record" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const recordId = parseRecordId(id);
  if (!recordId) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  try {
    const deleted = await prisma.taxRecord.deleteMany({
      where: { id: recordId, workspaceId: ctx.workspaceId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_RECORD_DELETED",
      metadata: { recordId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("tax record detail delete failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recordId,
    });
    return NextResponse.json(
      { error: "Server error deleting tax record" },
      { status: 500 }
    );
  }
}
