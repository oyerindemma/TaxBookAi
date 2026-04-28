import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { createManualBankTransaction } from "@/lib/bank-transaction-engine";
import { validateManualBankTransactionPayload } from "@/lib/bank-transaction-validation";
import {
  BANK_TRANSACTION_STATUSES,
  buildEmptyBankingDashboard,
  getWorkspaceBankingDashboard,
} from "@/lib/banking";
import { logRouteError } from "@/lib/logger";

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

async function requireTransactionFeatureAccess() {
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
  const access = await requireTransactionFeatureAccess();
  if (!access.ok) {
    return access.response;
  }

  if (
    !access.ctx.workspaceId ||
    !Number.isInteger(access.ctx.workspaceId) ||
    access.ctx.workspaceId <= 0
  ) {
    return NextResponse.json(
      buildEmptyBankingDashboard({
        status: "no_workspace",
      })
    );
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const dashboard = await getWorkspaceBankingDashboard({
      workspaceId: access.ctx.workspaceId,
      status: parseStatus(url.searchParams.get("status")),
      bankAccountId: parseOptionalId(url.searchParams.get("bankAccountId")),
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      importId: parseOptionalId(url.searchParams.get("importId")),
      categoryId: parseOptionalId(url.searchParams.get("categoryId")),
      dateFrom: parseDateParam(url.searchParams.get("dateFrom")),
      dateTo: parseDateParam(url.searchParams.get("dateTo"), true),
      query: url.searchParams.get("query"),
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    logRouteError("bank transactions load failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });
    return NextResponse.json(
      buildEmptyBankingDashboard({
        status: "error",
        error: "Failed to load transactions.",
      })
    );
  }
}

export async function POST(req: Request) {
  const access = await requireTransactionFeatureAccess();
  if (!access.ok) {
    return access.response;
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const validation = validateManualBankTransactionPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Please correct the highlighted fields.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const transactionId = await createManualBankTransaction({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      bankAccountId: validation.data.bankAccountId,
      clientBusinessId: validation.data.clientBusinessId,
      categoryId: validation.data.categoryId,
      transactionDate: validation.data.transactionDate,
      description: validation.data.description,
      reference: validation.data.reference,
      amountMinor: validation.data.amountMinor,
      currency: validation.data.currency,
      direction: validation.data.direction,
      status: validation.data.status,
      notes: validation.data.notes,
    });

    await logAudit({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      action: "BANK_TRANSACTION_CREATED",
      metadata: {
        transactionId,
        source: "manual",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        transactionId,
      },
      { status: 201 }
    );
  } catch (error) {
    logRouteError("manual bank transaction create failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    const isExpectedError =
      error instanceof Error &&
      /workspace|account|business|category|transaction|select/i.test(error.message);
    const message = isExpectedError
      ? error.message
      : "Failed to create transaction";

    return NextResponse.json({ error: message }, { status: isExpectedError ? 400 : 500 });
  }
}
