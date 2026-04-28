import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  bulkApproveWorkspaceBankTransactionAutoBookkeeping,
  bulkSuggestWorkspaceBankTransactionAutoBookkeeping,
} from "@/lib/bank-transaction-auto-bookkeeping";
import { validateBulkBankTransactionAutoBookkeepingPayload } from "@/lib/bank-transaction-auto-bookkeeping-validation";
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
    const validation = validateBulkBankTransactionAutoBookkeepingPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.error,
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const result =
      validation.data.action === "approve"
        ? await bulkApproveWorkspaceBankTransactionAutoBookkeeping({
            workspaceId: access.ctx.workspaceId,
            actorUserId: access.ctx.userId,
            transactionIds: validation.data.transactionIds,
          })
        : await bulkSuggestWorkspaceBankTransactionAutoBookkeeping({
            workspaceId: access.ctx.workspaceId,
            actorUserId: access.ctx.userId,
            transactionIds:
              validation.data.transactionIds.length > 0
                ? validation.data.transactionIds
                : undefined,
            limit: validation.data.limit,
          });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logRouteError("bulk bank transaction auto-bookkeeping failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    const message =
      error instanceof Error ? error.message : "Failed to process auto-bookkeeping.";
    const status = /not found|workspace|category|bookkeeping/i.test(message) ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
