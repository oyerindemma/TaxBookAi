import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  deleteWorkspaceBankTransaction,
  updateWorkspaceBankTransactionReview,
} from "@/lib/bank-transaction-review";
import { validateBankTransactionReviewUpdatePayload } from "@/lib/bank-transaction-review-validation";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
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

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const transactionId = parseId(id);
  if (!transactionId) {
    return NextResponse.json({ error: "Invalid transaction id." }, { status: 400 });
  }

  const access = await requireBankingReviewAccess();
  if (!access.ok) {
    return access.response;
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const validation = validateBankTransactionReviewUpdatePayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.error,
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await updateWorkspaceBankTransactionReview({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      transactionId,
      ...validation.data,
    });

    return NextResponse.json(
      {
        ok: true,
        updated: result.updated,
        transaction: result.transaction,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logRouteError("bank transaction review update failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
      transactionId,
    });

    const message =
      error instanceof Error ? error.message : "Failed to update transaction review.";
    const status = /not found/i.test(message)
      ? 404
      : /category|description|reference|date|workspace/i.test(message)
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const transactionId = parseId(id);
  if (!transactionId) {
    return NextResponse.json({ error: "Invalid transaction id." }, { status: 400 });
  }

  const access = await requireBankingReviewAccess();
  if (!access.ok) {
    return access.response;
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteWorkspaceBankTransaction({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      transactionId,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("bank transaction delete failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
      transactionId,
    });

    const message = error instanceof Error ? error.message : "Failed to delete transaction.";
    const status = /not found/i.test(message)
      ? 404
      : /cannot be deleted|reverse the downstream links/i.test(message)
        ? 409
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
