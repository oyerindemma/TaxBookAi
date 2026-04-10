import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  ensureDefaultTransactionCategoriesForWorkspace,
  normalizeTransactionCategoryName,
} from "@/lib/transaction-categories";

export const runtime = "nodejs";

function parseLedgerCategoryType(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "INCOME" ||
    normalized === "EXPENSE" ||
    normalized === "ASSET" ||
    normalized === "LIABILITY" ||
    normalized === "EQUITY" ||
    normalized === "OTHER"
    ? normalized
    : null;
}

function parsePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
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

  try {
    await ensureDefaultTransactionCategoriesForWorkspace(prisma, ctx.workspaceId);

    const clientBusinesses = await prisma.clientBusiness.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        archivedAt: null,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
        categories: {
          orderBy: [{ type: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      clientBusinesses,
    });
  } catch (error) {
    logRouteError("transaction categories load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to load transaction categories." }, { status: 500 });
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

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const clientBusinessId = parsePositiveInt(body.clientBusinessId);
    const type = parseLedgerCategoryType(body.type) ?? "EXPENSE";
    const name = normalizeTransactionCategoryName(
      typeof body.name === "string" ? body.name : ""
    );

    if (!clientBusinessId) {
      return NextResponse.json({ error: "clientBusinessId is required." }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    const business = await prisma.clientBusiness.findFirst({
      where: {
        id: clientBusinessId,
        workspaceId: ctx.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: "The selected client business does not belong to this workspace." },
        { status: 400 }
      );
    }

    const category = await prisma.transactionCategory.create({
      data: {
        clientBusinessId: business.id,
        name,
        type,
      },
      select: {
        id: true,
        clientBusinessId: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TRANSACTION_CATEGORY_CREATED",
      metadata: {
        categoryId: category.id,
        clientBusinessId: category.clientBusinessId,
        name: category.name,
        type: category.type,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That category already exists for the selected business." },
        { status: 409 }
      );
    }

    logRouteError("transaction category create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Failed to create the transaction category." },
      { status: 500 }
    );
  }
}
