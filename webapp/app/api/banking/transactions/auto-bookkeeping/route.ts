import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  approveWorkspaceBankTransactionAutoBookkeeping,
  rejectWorkspaceBankTransactionAutoBookkeeping,
  suggestWorkspaceBankTransactionAutoBookkeeping,
} from "@/lib/bank-transaction-auto-bookkeeping";
import { validateBankTransactionAutoBookkeepingActionPayload } from "@/lib/bank-transaction-auto-bookkeeping-validation";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

async function requireAutoBookkeepingAccess() {
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

export async function POST(req: Request) {
  const access = await requireAutoBookkeepingAccess();
  if (!access.ok) {
    return access.response;
  }

  const auth = await requireRoleAtLeast(access.ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const validation = validateBankTransactionAutoBookkeepingActionPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.error,
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const { action, transactionId } = validation.data;

    if (action === "suggest") {
      const result = await suggestWorkspaceBankTransactionAutoBookkeeping({
        workspaceId: access.ctx.workspaceId,
        actorUserId: access.ctx.userId,
        transactionId,
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
    }

    if (action === "approve") {
      const transaction = await approveWorkspaceBankTransactionAutoBookkeeping({
        workspaceId: access.ctx.workspaceId,
        actorUserId: access.ctx.userId,
        transactionId,
      });

      return NextResponse.json(
        {
          ok: true,
          transaction,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const transaction = await rejectWorkspaceBankTransactionAutoBookkeeping({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      transactionId,
    });

    return NextResponse.json(
      {
        ok: true,
        transaction,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logRouteError("bank transaction auto-bookkeeping action failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    const message =
      error instanceof Error ? error.message : "Failed to update auto-bookkeeping.";
    const status =
      /not found/i.test(message)
        ? 404
        : /category|workspace|suggestion|bookkeeping/i.test(message)
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
