import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import {
  WORKSPACE_ALERT_SEVERITIES,
  WORKSPACE_ALERT_STATUSES,
  WORKSPACE_ALERT_TYPES,
  type WorkspaceAlertSeverity,
  type WorkspaceAlertStatus,
  type WorkspaceAlertType,
} from "@/lib/workspace-alert-types";
import { getWorkspaceAlertCenterData } from "@/lib/workspace-alerts";

export const runtime = "nodejs";

function parseStatus(raw: string | null): WorkspaceAlertStatus | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return WORKSPACE_ALERT_STATUSES.includes(normalized as WorkspaceAlertStatus)
    ? (normalized as WorkspaceAlertStatus)
    : null;
}

function parseSeverity(raw: string | null): WorkspaceAlertSeverity | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return WORKSPACE_ALERT_SEVERITIES.includes(normalized as WorkspaceAlertSeverity)
    ? (normalized as WorkspaceAlertSeverity)
    : null;
}

function parseType(raw: string | null): WorkspaceAlertType | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return WORKSPACE_ALERT_TYPES.includes(normalized as WorkspaceAlertType)
    ? (normalized as WorkspaceAlertType)
    : null;
}

function parseLimit(raw: string | null) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, 200);
}

function parseSync(raw: string | null) {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function requireAlertAccess() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }

  return {
    ok: true as const,
    ctx,
  };
}

export async function GET(req: Request) {
  const access = await requireAlertAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const url = new URL(req.url);
    const payload = await getWorkspaceAlertCenterData({
      workspaceId: access.ctx.workspaceId,
      query: url.searchParams.get("query"),
      status: parseStatus(url.searchParams.get("status")),
      severity: parseSeverity(url.searchParams.get("severity")),
      type: parseType(url.searchParams.get("type")),
      limit: parseLimit(url.searchParams.get("limit")),
      sync: parseSync(url.searchParams.get("sync")),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("workspace alerts load failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to load workspace alerts." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const access = await requireAlertAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = ((await req.json()) as Record<string, unknown>) ?? {};
    } catch {
      body = {};
    }

    const payload = await getWorkspaceAlertCenterData({
      workspaceId: access.ctx.workspaceId,
      query: typeof body.query === "string" ? body.query : null,
      status:
        typeof body.status === "string" ? parseStatus(body.status) : null,
      severity:
        typeof body.severity === "string" ? parseSeverity(body.severity) : null,
      type: typeof body.type === "string" ? parseType(body.type) : null,
      limit: typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 200) : null,
      sync: true,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("workspace alerts refresh failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to refresh workspace alerts." },
      { status: 500 }
    );
  }
}
