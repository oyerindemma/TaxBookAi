import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { createWorkspaceBankAccount } from "@/lib/banking";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
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

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const accountName =
      typeof body.accountName === "string"
        ? body.accountName.trim()
        : typeof body.name === "string"
          ? body.name.trim()
          : "";
    const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
    const accountNumber =
      typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
    const clientBusinessId = parseOptionalId(body.clientBusinessId);

    if (!accountName || !bankName || !accountNumber || !clientBusinessId) {
      return NextResponse.json(
        {
          error:
            "accountName, bankName, accountNumber, and clientBusinessId are required",
        },
        { status: 400 }
      );
    }

    const account = await createWorkspaceBankAccount({
      workspaceId: ctx.workspaceId,
      clientBusinessId,
      accountName,
      bankName,
      accountNumber,
      currency: typeof body.currency === "string" ? body.currency : null,
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
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
      workspaceId: ctx.workspaceId,
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
