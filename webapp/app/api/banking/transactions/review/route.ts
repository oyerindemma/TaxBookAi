import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  buildEmptyBankTransactionReviewDashboard,
  type BankTransactionCategorizationState,
  type BankTransactionReviewConfidenceBand,
  getWorkspaceBankTransactionReviewDataSafe,
} from "@/lib/bank-transaction-review";
import { parseBankTransactionReviewStatus } from "@/lib/bank-transaction-review-validation";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseOptionalId(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCategorizationState(
  raw: string | null
): BankTransactionCategorizationState | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized === "UNCATEGORIZED" ||
    normalized === "NEEDS_SUGGESTION" ||
    normalized === "SUGGESTED" ||
    normalized === "CATEGORIZED"
    ? normalized
    : null;
}

function parseConfidenceBand(raw: string | null): BankTransactionReviewConfidenceBand | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH"
    ? normalized
    : null;
}

function parsePostingReadiness(raw: string | null) {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized === "NOT_READY" ||
    normalized === "REVIEW_REQUIRED" ||
    normalized === "READY_TO_POST"
    ? normalized
    : null;
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

async function requireBankingReviewAccess() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
  if (!featureAccess.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: featureAccess.error,
          currentPlan: featureAccess.plan,
          requiredPlan: featureAccess.requiredPlan,
        },
        { status: 402 }
      ),
    };
  }

  return {
    ok: true as const,
    ctx,
  };
}

export async function GET(req: Request) {
  const access = await requireBankingReviewAccess();
  if (!access.ok) {
    return access.response;
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const data = await getWorkspaceBankTransactionReviewDataSafe({
      workspaceId: access.ctx.workspaceId,
      query: url.searchParams.get("query"),
      reviewStatus: parseBankTransactionReviewStatus(url.searchParams.get("reviewStatus")),
      categorizationState: parseCategorizationState(url.searchParams.get("categorizationState")),
      confidenceBand: parseConfidenceBand(url.searchParams.get("confidenceBand")),
      postingReadiness: parsePostingReadiness(url.searchParams.get("postingReadiness")),
      bankAccountId: parseOptionalId(url.searchParams.get("bankAccountId")),
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      categoryId: parseOptionalId(url.searchParams.get("categoryId")),
      dateFrom: parseDateParam(url.searchParams.get("dateFrom")),
      dateTo: parseDateParam(url.searchParams.get("dateTo"), true),
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("bank transaction review load failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });
    return NextResponse.json(buildEmptyBankTransactionReviewDashboard(access.ctx.workspaceId), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
