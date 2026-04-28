import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enforceRecordLimit } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";
import { serializeTaxRecordAiMetadata } from "@/lib/tax-record-ai";

export const runtime = "nodejs";

function parseRecordId(req: Request, body?: { id?: number | string }) {
  const url = new URL(req.url);
  const idRaw = url.searchParams.get("id") ?? body?.id;
  if (idRaw === undefined || idRaw === null) return null;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseTaxRate(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return parsed;
}

function parseCategoryId(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function computeTax(amountKobo: number, taxRate: number) {
  const computedTax = Math.round(amountKobo * (taxRate / 100));
  const netAmount = Math.round(amountKobo - computedTax);
  return { computedTax, netAmount };
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const records = await prisma.taxRecord.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { occurredOn: "desc" },
    take: 50,
    include: { category: true },
  });

  return NextResponse.json({ records });
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

    const parsedRate = parseTaxRate(taxRate);
    if (parsedRate === null) {
      return NextResponse.json(
        { error: "taxRate must be between 0 and 100" },
        { status: 400 }
      );
    }

    const parsedCategoryId = parseCategoryId(categoryId);
    if (categoryId !== undefined && categoryId !== null && !parsedCategoryId) {
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

    const limitCheck = await enforceRecordLimit(ctx.workspaceId, 1);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: limitCheck.error },
        { status: 402 }
      );
    }

    const amountKoboRounded = Math.max(0, Math.round(parsedAmount));
    const computed = computeTax(amountKoboRounded, parsedRate);
    let normalizedAiMetadata: string | null = null;
    let source: string | null = null;

    try {
      const serializedAi = serializeTaxRecordAiMetadata(aiMetadata, ctx.userId);
      normalizedAiMetadata =
        serializedAi.serialized === undefined ? null : serializedAi.serialized;
      source = serializedAi.source === undefined ? null : serializedAi.source;
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

    const record = await prisma.taxRecord.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        kind: normalizedKind,
        amountKobo: amountKoboRounded,
        taxRate: parsedRate,
        computedTax: computed.computedTax,
        netAmount: computed.netAmount,
        currency: currency?.trim().toUpperCase() || "NGN",
        occurredOn: parsedDate,
        description: description?.trim() || null,
        source,
        aiMetadata: normalizedAiMetadata,
        categoryId: parsedCategoryId,
        vendorName: vendorName?.trim() || null,
        recurring: Boolean(recurring),
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_RECORD_CREATED",
      metadata: {
        recordId: record.id,
        kind: record.kind,
        amountKobo: record.amountKobo,
        taxRate: record.taxRate,
        categoryId: record.categoryId,
        vendorName: record.vendorName,
        recurring: record.recurring,
        source: record.source,
        hasAiMetadata: Boolean(record.aiMetadata),
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    logRouteError("tax record create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error creating tax record" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const recordId = parseRecordId(req, body);
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
      id?: number;
      kind?: string;
      amountKobo?: number;
      currency?: string;
      occurredOn?: string;
      description?: string;
      taxRate?: number | string;
      categoryId?: number | string | null;
      vendorName?: string;
      recurring?: boolean;
      aiMetadata?: unknown;
    };

    if (!recordId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

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
      taxRate === undefined ? existing.taxRate : parseTaxRate(taxRate);
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
    logRouteError("tax record update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error updating tax record" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { id?: number | string } | undefined;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }

  const recordId = parseRecordId(req, body);
  if (!recordId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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
    logRouteError("tax record delete failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error deleting tax record" },
      { status: 500 }
    );
  }
}
