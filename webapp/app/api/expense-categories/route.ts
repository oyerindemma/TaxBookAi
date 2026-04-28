import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

async function ensureDefaultCategories(workspaceId: number) {
  await seedDefaultExpenseCategories(prisma, workspaceId);
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
    await ensureDefaultCategories(ctx.workspaceId);
    const categories = await prisma.expenseCategory.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ categories: categories ?? [] });
  } catch (error) {
    logRouteError("expense categories load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
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
    const body = await req.json();
    const { name } = body as { name?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const category = await prisma.expenseCategory.create({
      data: { workspaceId: ctx.workspaceId, name: name.trim() },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "EXPENSE_CATEGORY_CREATED",
      metadata: { categoryId: category.id, name: category.name },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 409 }
      );
    }

    logRouteError("expense category create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
