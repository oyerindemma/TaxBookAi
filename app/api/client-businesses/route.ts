import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  getWorkspaceClientBusiness,
  listWorkspaceClientBusinesses,
  parseClientBusinessPayload,
  seedDefaultClientBusinessCategories,
} from "@/lib/accounting-firm";
import { enforceClientBusinessLimit, getPlanConfig } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientBusinesses = await listWorkspaceClientBusinesses(ctx.workspaceId);
  return NextResponse.json({ clientBusinesses });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const parsed = parseClientBusinessPayload(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const limitCheck = await enforceClientBusinessLimit(ctx.workspaceId, 1);
    if (!limitCheck.ok) {
      return NextResponse.json(
        {
          error: limitCheck.error,
          currentPlan: limitCheck.plan,
          currentPlanName: getPlanConfig(limitCheck.plan).name,
          maxBusinesses: limitCheck.max,
          currentBusinesses: limitCheck.current,
          recommendedPlan: limitCheck.recommendedPlan,
        },
        { status: 402 }
      );
    }

    const clientBusiness = await prisma.$transaction(async (tx) => {
      const created = await tx.clientBusiness.create({
        data: {
          workspaceId: ctx.workspaceId,
          ...parsed.data,
        },
      });

      await seedDefaultClientBusinessCategories(tx, created.id);

      return created;
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "CLIENT_BUSINESS_CREATED",
      metadata: {
        clientBusinessId: clientBusiness.id,
        name: clientBusiness.name,
        taxIdentificationNumber: clientBusiness.taxIdentificationNumber,
        vatRegistrationNumber: clientBusiness.vatRegistrationNumber,
      },
    });

    const hydratedBusiness = await getWorkspaceClientBusiness(
      ctx.workspaceId,
      clientBusiness.id
    );

    return NextResponse.json(
      { clientBusiness: hydratedBusiness ?? clientBusiness },
      { status: 201 }
    );
  } catch (error) {
    logRouteError("client business create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Server error creating client business" },
      { status: 500 }
    );
  }
}
