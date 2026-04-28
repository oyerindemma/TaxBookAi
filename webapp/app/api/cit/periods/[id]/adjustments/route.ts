import type { CITAdjustmentCategory, TaxAdjustmentDirection } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { createCitAdjustment } from "@/lib/cit-workflow";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const CIT_ADJUSTMENT_CATEGORIES = new Set<CITAdjustmentCategory>([
  "NON_DEDUCTIBLE_EXPENSE",
  "PERSONAL_EXPENSE",
  "DONATION",
  "DEPRECIATION_ADD_BACK",
  "CAPITAL_ALLOWANCE",
  "TAX_EXEMPT_INCOME",
  "PRIOR_YEAR_LOSS",
  "INCENTIVE_DEDUCTION",
  "FX_REVALUATION",
  "OTHER",
]);

const CIT_DIRECTIONS = new Set<TaxAdjustmentDirection>([
  "ADD_BACK",
  "DEDUCTION",
  "NEUTRAL",
]);

function parseId(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCategory(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) return null;
  return CIT_ADJUSTMENT_CATEGORIES.has(normalized as CITAdjustmentCategory)
    ? (normalized as CITAdjustmentCategory)
    : null;
}

function parseDirection(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CIT_DIRECTIONS.has(normalized as TaxAdjustmentDirection)
    ? (normalized as TaxAdjustmentDirection)
    : null;
}

function parseAmountMinor(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return null;
    if (/^-?\d+$/.test(normalized)) {
      return Number(normalized);
    }
    const asFloat = Number(normalized);
    if (Number.isFinite(asFloat)) {
      return Math.round(asFloat * 100);
    }
  }

  return null;
}

export async function POST(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "TAX_FILING_ASSISTANT"
    );
    if (!featureAccess.ok) {
      return NextResponse.json({ error: featureAccess.error }, { status: 402 });
    }

    const { id } = await context.params;
    const citPeriodId = parseId(id);
    if (!citPeriodId) {
      return NextResponse.json({ error: "Invalid CIT period id." }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const direction = parseDirection(body.direction);
    if (!direction) {
      return NextResponse.json({ error: "Adjustment direction is required." }, { status: 400 });
    }

    const amountMinor = parseAmountMinor(body.amountMinor);
    if (amountMinor === null) {
      return NextResponse.json({ error: "Adjustment amount is required." }, { status: 400 });
    }

    const detail = await createCitAdjustment({
      workspaceId: ctx.workspaceId,
      citPeriodId,
      actorUserId: ctx.userId,
      category: parseCategory(body.category),
      direction,
      label: typeof body.label === "string" ? body.label : "",
      amountMinor,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      sourceReference:
        typeof body.sourceReference === "string" ? body.sourceReference : undefined,
    });

    return NextResponse.json({ detail });
  } catch (error) {
    logRouteError("cit adjustment create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create the CIT adjustment." },
      { status: 400 }
    );
  }
}
