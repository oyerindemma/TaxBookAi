import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { initializeWorkspaceIfEmpty } from "@/lib/dev/initializeWorkspace";
import {
  resolveClientBusinessIdOrDefault,
  resolveWorkspaceIdOrDefault,
} from "@/lib/workspace-fallback";

export const runtime = "nodejs";

function parseOptionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
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

  try {
    await initializeWorkspaceIfEmpty(ctx.workspaceId);

    const accounts = await prisma.bankAccount.findMany({
      where: {
        workspaceId: ctx.workspaceId,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        clientBusiness: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountName: account.name,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        currency: account.currency,
        clientBusinessId: account.clientBusinessId ?? null,
        clientBusinessName: account.clientBusiness?.name ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    logRouteError("bank accounts load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      {
        status: "ok",
        accounts: [],
        error: null,
      },
      { status: 200 }
    );
  }
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

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
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

  let workspaceId = ctx.workspaceId;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : typeof body.accountName === "string"
          ? body.accountName.trim()
          : "";
    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase()
        : "NGN";
    if (!name) {
      return NextResponse.json(
        { error: "Missing required fields", debug: body },
        { status: 400 }
      );
    }

    workspaceId = await resolveWorkspaceIdOrDefault({
      workspaceId: parseOptionalId(body.workspaceId) ?? ctx.workspaceId,
    });

    if (workspaceId !== ctx.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId does not match the active workspace", debug: body },
        { status: 403 }
      );
    }

    const businessId = await resolveClientBusinessIdOrDefault({
      workspaceId,
      clientBusinessId: parseOptionalId(body.businessId ?? body.clientBusinessId),
    });
    const bankName =
      typeof body.bankName === "string" && body.bankName.trim()
        ? body.bankName.trim()
        : name;
    const accountNumber =
      typeof body.accountNumber === "string" && body.accountNumber.trim()
        ? body.accountNumber.trim()
        : "N/A";

    const account = await prisma.bankAccount.create({
      data: {
        name,
        currency: currency || "NGN",
        workspaceId,
        clientBusinessId: businessId,
        bankName,
        accountNumber,
      },
      include: {
        clientBusiness: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAudit({
      workspaceId,
      actorUserId: ctx.userId,
      action: "BANK_ACCOUNT_CREATED",
      metadata: {
        accountId: account.id,
        clientBusinessId: account.clientBusinessId ?? null,
        name: account.name,
      },
    });

    return NextResponse.json(
      {
        account: {
          id: account.id,
          name: account.name,
          accountName: account.name,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          currency: account.currency,
          clientBusinessId: account.clientBusinessId ?? null,
          clientBusinessName: account.clientBusiness?.name ?? null,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logRouteError("bank account create failed", error, {
      workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create account",
      },
      { status: 500 }
    );
  }
}
