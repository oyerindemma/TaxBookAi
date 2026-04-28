import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { enforceRecordLimit } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type ImportRow = {
  date?: string | number;
  kind?: string | number;
  amount?: string | number;
  taxRate?: string | number;
  currency?: string | number;
  description?: string | number;
};

type RowError = {
  row: number;
  field: string;
  message: string;
};

function parseAmount(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function parseTaxRate(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.replace(/%/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function parseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeTax(amountKobo: number, taxRate: number) {
  const computedTax = Math.round(amountKobo * (taxRate / 100));
  const netAmount = Math.round(amountKobo - computedTax);
  return { computedTax, netAmount };
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
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "rows are required" }, { status: 400 });
    }

    if (rows.length > 1000) {
      return NextResponse.json(
        { error: "Too many rows (max 1000)" },
        { status: 400 }
      );
    }

    const errors: RowError[] = [];
    const data: {
      userId: number;
      workspaceId: number;
      kind: string;
      amountKobo: number;
      taxRate: number;
      computedTax: number;
      netAmount: number;
      currency: string;
      occurredOn: Date;
      description: string | null;
    }[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const rawDate = String(row.date ?? "").trim();
      const rawKind = String(row.kind ?? "").trim();
      const rawAmount = String(row.amount ?? "").trim();
      const rawTaxRate = row.taxRate !== undefined ? String(row.taxRate) : "";
      const rawCurrency = String(row.currency ?? "").trim();
      const rawDescription = String(row.description ?? "").trim();

      if (!rawDate && !rawKind && !rawAmount && !rawTaxRate && !rawCurrency && !rawDescription) {
        return;
      }

      if (!rawDate) {
        errors.push({ row: rowNumber, field: "date", message: "date is required" });
      }
      if (!rawKind) {
        errors.push({ row: rowNumber, field: "kind", message: "kind is required" });
      }
      if (!rawAmount) {
        errors.push({ row: rowNumber, field: "amount", message: "amount is required" });
      }

      const occurredOn = rawDate ? parseDate(rawDate) : null;
      if (rawDate && !occurredOn) {
        errors.push({ row: rowNumber, field: "date", message: "invalid date" });
      }

      const amountKobo = rawAmount ? parseAmount(rawAmount) : null;
      if (rawAmount && amountKobo === null) {
        errors.push({ row: rowNumber, field: "amount", message: "invalid amount" });
      }

      const parsedRate = parseTaxRate(rawTaxRate);
      if (parsedRate === null) {
        errors.push({ row: rowNumber, field: "taxRate", message: "invalid taxRate" });
      }

      if (!rawKind || !occurredOn || amountKobo === null || parsedRate === null) {
        return;
      }

      const normalizedKind = rawKind.toUpperCase();
      const currency = rawCurrency ? rawCurrency.toUpperCase() : "NGN";
      const computed = computeTax(amountKobo, parsedRate);

      data.push({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        kind: normalizedKind,
        amountKobo,
        taxRate: parsedRate,
        computedTax: computed.computedTax,
        netAmount: computed.netAmount,
        currency,
        occurredOn,
        description: rawDescription || null,
      });
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", errors },
        { status: 400 }
      );
    }

    if (data.length === 0) {
      return NextResponse.json(
        { error: "No valid rows to import" },
        { status: 400 }
      );
    }

    const limitCheck = await enforceRecordLimit(ctx.workspaceId, data.length);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 402 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.taxRecord.createMany({ data });
      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: "TAX_IMPORT",
          metadata: JSON.stringify({ count: data.length }),
        },
      });
    });

    return NextResponse.json({ ok: true, inserted: data.length });
  } catch (error) {
    logRouteError("tax record import failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error importing records" },
      { status: 500 }
    );
  }
}
