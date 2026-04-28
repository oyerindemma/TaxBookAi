import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Office",
  "Software",
  "Utilities",
  "Marketing",
  "Transport",
  "Rent",
  "Miscellaneous",
] as const;

type ExpenseCategoryClient = PrismaClient | Prisma.TransactionClient;

export async function seedDefaultExpenseCategories(
  db: ExpenseCategoryClient,
  workspaceId: number
) {
  const existing = await db.expenseCategory.findMany({
    where: { workspaceId },
    select: { name: true },
  });

  const existingNames = new Set(
    existing.map((category) => category.name.trim().toLowerCase())
  );
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter(
    (name) => !existingNames.has(name.toLowerCase())
  );

  if (missing.length === 0) return;

  await db.expenseCategory.createMany({
    data: missing.map((name) => ({ workspaceId, name })),
  });
}
