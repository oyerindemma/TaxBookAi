import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";
import { BANK_TRANSACTION_STATUSES, getWorkspaceBankingDashboard } from "@/lib/banking";

export const runtime = "nodejs";

function parseOptionalId(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseStatus(raw: string | null) {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return BANK_TRANSACTION_STATUSES.includes(
    normalized as (typeof BANK_TRANSACTION_STATUSES)[number]
  )
    ? (normalized as (typeof BANK_TRANSACTION_STATUSES)[number])
    : null;
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

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
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

  try {
    const url = new URL(req.url);
    const dashboard = await getWorkspaceBankingDashboard({
      workspaceId: ctx.workspaceId,
      status: parseStatus(url.searchParams.get("status")),
      bankAccountId: parseOptionalId(url.searchParams.get("bankAccountId")),
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      importId: parseOptionalId(url.searchParams.get("importId")),
      query: url.searchParams.get("query"),
    });

    return NextResponse.json({
      transactions: dashboard.transactions,
      summary: dashboard.summary,
    });
  } catch (error) {
    logRouteError("bank transactions load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}
