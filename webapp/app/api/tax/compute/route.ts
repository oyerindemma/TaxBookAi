import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { processRecalcQueue } from "@/lib/tax-snapshot-service";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type ComputeTaxPayload = {
  userId?: number | string;
  period?: string;
};

function parseRequestedUserId(raw: ComputeTaxPayload["userId"]) {
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function POST(req: Request) {
  let userId: number | null = null;
  let workspaceId: number | null = null;

  try {
    const user = await requireUser();
    userId = user.id;

    const payload = (await req.json().catch(() => ({}))) as ComputeTaxPayload;
    const requestedUserId = parseRequestedUserId(payload.userId);
    if (requestedUserId && requestedUserId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json(
        {
          error: "You can only recalculate tax for your own account.",
          code: "TAX_COMPUTE_FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const membership = await getActiveWorkspaceMembership(user.id);
    if (!membership) {
      return NextResponse.json(
        {
          error: "Select a workspace before recalculating tax.",
          code: "ACTIVE_WORKSPACE_REQUIRED",
        },
        { status: 400 }
      );
    }

    workspaceId = membership.workspaceId;
    const result = await processRecalcQueue({
      userId: requestedUserId ?? user.id,
      workspaceId,
    });

    return NextResponse.json({
      ...result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Tax calculation already in progress") {
      return NextResponse.json(
        {
          error: error.message,
          code: "TAX_COMPUTE_ALREADY_IN_PROGRESS",
        },
        { status: 409 }
      );
    }

    logRouteError("tax snapshot compute failed", error, {
      userId,
      workspaceId,
    });
    return NextResponse.json(
      {
        error: "We could not recalculate tax right now.",
        code: "TAX_COMPUTE_FAILED",
      },
      { status: 500 }
    );
  }
}
