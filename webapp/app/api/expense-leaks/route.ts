import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  EXPENSE_LEAK_FINDING_SEVERITIES,
  EXPENSE_LEAK_FINDING_STATUSES,
  EXPENSE_LEAK_FINDING_TYPES,
  type ExpenseLeakFindingSeverity,
  type ExpenseLeakFindingStatus,
  type ExpenseLeakFindingType,
} from "@/lib/expense-leak-types";
import { getExpenseLeakCenterData } from "@/lib/expense-leaks";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseStatus(raw: string | null): ExpenseLeakFindingStatus | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return EXPENSE_LEAK_FINDING_STATUSES.includes(normalized as ExpenseLeakFindingStatus)
    ? (normalized as ExpenseLeakFindingStatus)
    : null;
}

function parseSeverity(raw: string | null): ExpenseLeakFindingSeverity | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return EXPENSE_LEAK_FINDING_SEVERITIES.includes(
    normalized as ExpenseLeakFindingSeverity
  )
    ? (normalized as ExpenseLeakFindingSeverity)
    : null;
}

function parseType(raw: string | null): ExpenseLeakFindingType | "ALL" | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ALL") return "ALL";
  return EXPENSE_LEAK_FINDING_TYPES.includes(normalized as ExpenseLeakFindingType)
    ? (normalized as ExpenseLeakFindingType)
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

async function requireExpenseLeakAccess() {
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
  const access = await requireExpenseLeakAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const url = new URL(req.url);
    const payload = await getExpenseLeakCenterData({
      workspaceId: access.ctx.workspaceId,
      query: url.searchParams.get("query"),
      status: parseStatus(url.searchParams.get("status")),
      severity: parseSeverity(url.searchParams.get("severity")),
      type: parseType(url.searchParams.get("type")),
      limit: parseLimit(url.searchParams.get("limit")),
      sync: ["1", "true", "yes"].includes(
        url.searchParams.get("sync")?.trim().toLowerCase() ?? ""
      ),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logRouteError("expense leak findings load failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to load expense leak findings." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const access = await requireExpenseLeakAccess();
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

    const payload = await getExpenseLeakCenterData({
      workspaceId: access.ctx.workspaceId,
      query: typeof body.query === "string" ? body.query : null,
      status: typeof body.status === "string" ? parseStatus(body.status) : null,
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
    logRouteError("expense leak findings refresh failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to refresh expense leak findings." },
      { status: 500 }
    );
  }
}
