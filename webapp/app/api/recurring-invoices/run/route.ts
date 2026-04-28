import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getRecurringInvoiceRuntimeConfig } from "@/lib/env";
import { logRouteError } from "@/lib/logger";
import { processDueRecurringInvoices } from "@/lib/recurring-invoices";

export const runtime = "nodejs";

function parseWorkspaceId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: unknown };
  const headerSecret = req.headers.get("x-recurring-invoice-secret")?.trim() ?? null;
  const cronSecret = getRecurringInvoiceRuntimeConfig().cronSecret;
  const requestedWorkspaceId = parseWorkspaceId(body.workspaceId);

  try {
    if (cronSecret && headerSecret && headerSecret === cronSecret) {
      if (!requestedWorkspaceId) {
        return NextResponse.json(
          { error: "workspaceId is required for cron mode." },
          { status: 400 }
        );
      }

      const featureAccess = await getWorkspaceFeatureAccess(
        requestedWorkspaceId,
        "RECURRING_INVOICES"
      );
      if (!featureAccess.ok) {
        return NextResponse.json(
          {
            error: featureAccess.error,
            currentPlan: featureAccess.plan,
            requiredPlan: featureAccess.requiredPlan,
          },
          { status: 402 }
        );
      }

      const result = await processDueRecurringInvoices(requestedWorkspaceId, null);

      return NextResponse.json({
        ok: true,
        mode: "cron",
        workspaceId: requestedWorkspaceId,
        ...result,
      });
    }

    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "RECURRING_INVOICES"
    );
    if (!featureAccess.ok) {
      return NextResponse.json(
        {
          error: featureAccess.error,
          currentPlan: featureAccess.plan,
          requiredPlan: featureAccess.requiredPlan,
        },
        { status: 402 }
      );
    }

    const result = await processDueRecurringInvoices(ctx.workspaceId, ctx.userId);

    return NextResponse.json({
      ok: true,
      mode: "workspace",
      workspaceId: ctx.workspaceId,
      ...result,
    });
  } catch (error) {
    logRouteError("recurring invoice run failed", error, {
      workspaceId: requestedWorkspaceId,
    });
    return NextResponse.json(
      { error: "Unable to run recurring invoices right now." },
      { status: 500 }
    );
  }
}
