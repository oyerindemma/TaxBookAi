import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createTaxEntry } from "@/lib/ledger";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";
import { computeWorkspaceTaxPeriod, parseClientBusinessFilter } from "@/lib/tax-engine";

export const runtime = "nodejs";

function firstString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function redirectToTaxDashboard(req: Request, error?: string) {
  const url = new URL("/dashboard/tax", req.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return redirectToTaxDashboard(req, auth.error);
  }

  try {
    const formData = await req.formData();
    const period = resolveTaxPeriodState({
      period: firstString(formData.get("period")) || undefined,
      month: firstString(formData.get("month")) || undefined,
      quarter: firstString(formData.get("quarter")) || undefined,
      year: firstString(formData.get("year")) || undefined,
      from: firstString(formData.get("from")) || undefined,
      to: firstString(formData.get("to")) || undefined,
    });

    if (period.errorMsg) {
      return redirectToTaxDashboard(req, period.errorMsg);
    }

    const clientBusinessId = parseClientBusinessFilter(firstString(formData.get("clientBusinessId")));
    if (clientBusinessId) {
      const clientBusiness = await prisma.clientBusiness.findFirst({
        where: {
          id: clientBusinessId,
          workspaceId: ctx.workspaceId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!clientBusiness) {
        return redirectToTaxDashboard(req, "Client business not found.");
      }
    }

    const refresh = firstString(formData.get("refresh")) === "1";
    const periodId = await computeWorkspaceTaxPeriod(
      {
        workspaceId: ctx.workspaceId,
        clientBusinessId,
        period,
      },
      { refresh }
    );

    await prisma.$transaction(async (tx) => {
      await createTaxEntry(tx, {
        taxPeriodId: periodId,
        taxType: "VAT",
        actorUserId: ctx.userId,
      });
      await createTaxEntry(tx, {
        taxPeriodId: periodId,
        taxType: "WHT",
        actorUserId: ctx.userId,
      });
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: refresh ? "TAX_PERIOD_REFRESHED" : "TAX_PERIOD_COMPUTED",
      metadata: {
        periodId,
        periodLabel: period.label,
        periodMode: period.mode,
        clientBusinessId,
      },
    });

    return NextResponse.redirect(new URL(`/dashboard/tax/${periodId}`, req.url), {
      status: 303,
    });
  } catch (error) {
    logRouteError("tax period compute failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return redirectToTaxDashboard(req, "Unable to compute tax period right now.");
  }
}
