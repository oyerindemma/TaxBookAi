import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { parseBankTransactionReviewStatus } from "@/lib/bank-transaction-review-validation";
import { logRouteError } from "@/lib/logger";
import {
  getDefaultTransactionTaxDateRange,
  getTransactionTaxPeriodPresetRange,
  getWorkspaceTransactionTaxSummary,
  type TransactionTaxPeriodPreset,
} from "@/lib/transaction-tax";

export const runtime = "nodejs";

function parseOptionalId(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseDateParam(raw: string | null, endOfDay = false) {
  if (!raw) return null;

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!exactDate) {
    return null;
  }

  const parsed = new Date(
    Date.UTC(
      Number(exactDate[1]),
      Number(exactDate[2]) - 1,
      Number(exactDate[3]),
      endOfDay ? 23 : 12,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    )
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePeriodPreset(raw: string | null): TransactionTaxPeriodPreset | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized === "CURRENT_MONTH" ||
    normalized === "PREVIOUS_MONTH" ||
    normalized === "LAST_30_DAYS" ||
    normalized === "CURRENT_QUARTER" ||
    normalized === "YEAR_TO_DATE" ||
    normalized === "CUSTOM"
    ? normalized
    : null;
}

function parseOptionalLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 500);
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const periodPreset = parsePeriodPreset(url.searchParams.get("periodPreset"));
    const rawDateFrom = parseDateParam(url.searchParams.get("dateFrom"));
    const rawDateTo = parseDateParam(url.searchParams.get("dateTo"), true);
    const useDefaultDateWindow = !rawDateFrom && !rawDateTo && !periodPreset;
    const presetRange =
      periodPreset && periodPreset !== "CUSTOM"
        ? getTransactionTaxPeriodPresetRange(periodPreset)
        : null;
    const defaultDateWindow = getDefaultTransactionTaxDateRange();

    const summary = await getWorkspaceTransactionTaxSummary({
      workspaceId: ctx.workspaceId,
      query: url.searchParams.get("query"),
      reviewStatus: parseBankTransactionReviewStatus(url.searchParams.get("reviewStatus")),
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      bankAccountId: parseOptionalId(url.searchParams.get("bankAccountId")),
      categoryId: parseOptionalId(url.searchParams.get("categoryId")),
      dateFrom:
        rawDateFrom ??
        presetRange?.dateFrom ??
        (useDefaultDateWindow ? defaultDateWindow.dateFrom : null),
      dateTo:
        rawDateTo ??
        presetRange?.dateTo ??
        (useDefaultDateWindow ? defaultDateWindow.dateTo : null),
      periodPreset: periodPreset ?? (useDefaultDateWindow ? "CURRENT_MONTH" : "CUSTOM"),
      defaultDateWindowApplied: useDefaultDateWindow,
      drilldownLimit: parseOptionalLimit(url.searchParams.get("drilldownLimit")) ?? undefined,
    });

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("transaction tax summary load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to load the transaction tax summary." },
      { status: 500 }
    );
  }
}
