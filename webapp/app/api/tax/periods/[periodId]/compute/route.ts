import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createTaxEntry } from "@/lib/ledger";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recomputeStoredTaxPeriod } from "@/lib/tax-engine";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    periodId: string;
  }>;
};

function redirectToPeriod(req: Request, periodId: number, error?: string) {
  const url = new URL(`/dashboard/tax/${periodId}`, req.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/dashboard/tax", req.url), { status: 303 });
  }

  const params = await context.params;
  const periodId = Number(params.periodId);
  if (!Number.isInteger(periodId)) {
    return NextResponse.redirect(new URL("/dashboard/tax?error=Invalid+period+id", req.url), {
      status: 303,
    });
  }

  try {
    const period = await prisma.taxPeriod.findFirst({
      where: {
        id: periodId,
        workspaceId: ctx.workspaceId,
      },
      select: {
        id: true,
        label: true,
      },
    });

    if (!period) {
      return NextResponse.redirect(new URL("/dashboard/tax?error=Tax+period+not+found", req.url), {
        status: 303,
      });
    }

    const refreshedPeriodId = await recomputeStoredTaxPeriod(period.id);

    await prisma.$transaction(async (tx) => {
      await createTaxEntry(tx, {
        taxPeriodId: refreshedPeriodId,
        taxType: "VAT",
        actorUserId: ctx.userId,
      });
      await createTaxEntry(tx, {
        taxPeriodId: refreshedPeriodId,
        taxType: "WHT",
        actorUserId: ctx.userId,
      });
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_PERIOD_REFRESHED",
      metadata: {
        periodId: refreshedPeriodId,
        periodLabel: period.label,
      },
    });

    return redirectToPeriod(req, refreshedPeriodId);
  } catch (error) {
    logRouteError("tax period refresh failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      periodId,
    });
    return redirectToPeriod(req, periodId, "Unable to refresh this tax period right now.");
  }
}
