import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { isOfflineSyncConflictError } from "@/lib/offline-sync-server";
import { logRouteError } from "@/lib/logger";
import {
  WORKSPACE_ALERT_STATUSES,
  type WorkspaceAlertStatus,
} from "@/lib/workspace-alert-types";
import { updateWorkspaceAlertStatus } from "@/lib/workspace-alerts";

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

function parseStatus(raw: unknown): WorkspaceAlertStatus | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  return WORKSPACE_ALERT_STATUSES.includes(normalized as WorkspaceAlertStatus)
    ? (normalized as WorkspaceAlertStatus)
    : null;
}

function parseDate(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const alertId = parseId(id);
  if (!alertId) {
    return NextResponse.json({ error: "Invalid alert id." }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid alert status." }, { status: 400 });
    }

    const alert = await updateWorkspaceAlertStatus({
      workspaceId: ctx.workspaceId,
      alertId,
      actorUserId: ctx.userId,
      status,
      snoozedUntil: parseDate(body.snoozedUntil),
      lastKnownChangeAt: parseLastKnownChangeAt(body.lastKnownChangeAt),
    });

    return NextResponse.json(
      {
        ok: true,
        alert,
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

    logRouteError("workspace alert status update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      alertId,
    });

    const message = error instanceof Error ? error.message : "Failed to update alert.";
    const status = /not found/i.test(message) ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
