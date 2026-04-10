import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  EXPENSE_LEAK_FINDING_STATUSES,
  type ExpenseLeakFindingStatus,
} from "@/lib/expense-leak-types";
import { updateExpenseLeakFindingStatus } from "@/lib/expense-leaks";
import { isOfflineSyncConflictError } from "@/lib/offline-sync-server";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseStatus(raw: unknown): ExpenseLeakFindingStatus | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  return EXPENSE_LEAK_FINDING_STATUSES.includes(normalized as ExpenseLeakFindingStatus)
    ? (normalized as ExpenseLeakFindingStatus)
    : null;
}

function parseLastKnownChangeAt(raw: unknown) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const findingId = parseId(id);
  if (!findingId) {
    return NextResponse.json({ error: "Invalid finding id." }, { status: 400 });
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const status = parseStatus(body.status);
    if (!status) {
      return NextResponse.json({ error: "Invalid finding status." }, { status: 400 });
    }

    const finding = await updateExpenseLeakFindingStatus({
      workspaceId: ctx.workspaceId,
      findingId,
      actorUserId: ctx.userId,
      status,
      lastKnownChangeAt: parseLastKnownChangeAt(body.lastKnownChangeAt),
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "EXPENSE_LEAK_FINDING_STATUS_UPDATED",
      metadata: {
        findingId,
        status,
        type: finding.type,
        estimatedSavingsMinor: finding.estimatedSavingsMinor,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        finding,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (isOfflineSyncConflictError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: "OFFLINE_SYNC_CONFLICT",
          current: error.current,
        },
        { status: 409 }
      );
    }

    logRouteError("expense leak finding status update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      findingId,
    });

    const message =
      error instanceof Error ? error.message : "Failed to update expense leak finding.";
    const status = /not found/i.test(message) ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
