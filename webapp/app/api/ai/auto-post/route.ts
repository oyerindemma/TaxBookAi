import { NextResponse } from "next/server";
import { autoPostWorkspaceTransactions } from "@/lib/accounting/autoPost";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type BatchPayload = {
  transactionIds: number[];
  limit: number;
};

function parsePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseTransactionIds(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      rawValues
        .map((item) => parsePositiveInt(item))
        .filter((item): item is number => item !== null)
    )
  );
}

async function parseBatchPayload(req: Request): Promise<BatchPayload> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return {
      transactionIds: parseTransactionIds(body.transactionIds),
      limit: parsePositiveInt(body.limit) ?? 100,
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await req.formData();
    return {
      transactionIds: parseTransactionIds(formData.getAll("transactionIds")),
      limit: parsePositiveInt(formData.get("limit")) ?? 100,
    };
  }

  return {
    transactionIds: [],
    limit: 100,
  };
}

function validateBatchPayload(payload: BatchPayload) {
  if (payload.transactionIds.length > 200) {
    return "Auto-posting is limited to 200 transactions per batch.";
  }

  if (payload.limit > 200) {
    return "Auto-posting is limited to 200 transactions per batch.";
  }

  return null;
}

async function requireAutoBookkeepingAccess() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
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

  try {
    const payload = await parseBatchPayload(req);
    const validationError = validateBatchPayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await autoPostWorkspaceTransactions({
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      transactionIds: payload.transactionIds.length > 0 ? payload.transactionIds : undefined,
      limit: payload.limit,
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
    logRouteError("AI auto-posting failed", error, {
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });

    const message =
      error instanceof Error ? error.message : "Failed to auto-post transactions.";
    const status = /not found|workspace|category|posting/i.test(message) ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
