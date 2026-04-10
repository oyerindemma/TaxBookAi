import "server-only";

import type { LedgerCategoryType, Prisma, PrismaClient } from "@prisma/client";

type TransactionCategoryClient = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_TRANSACTION_CATEGORIES: Array<{
  name: string;
  type: LedgerCategoryType;
}> = [
  { name: "Revenue", type: "INCOME" },
  { name: "Cost of sales", type: "EXPENSE" },
  { name: "Operations", type: "EXPENSE" },
  { name: "Payroll", type: "EXPENSE" },
  { name: "Rent and utilities", type: "EXPENSE" },
  { name: "Professional fees", type: "EXPENSE" },
  { name: "Tax and compliance", type: "EXPENSE" },
  { name: "Travel and logistics", type: "EXPENSE" },
  { name: "Bank charges", type: "EXPENSE" },
  { name: "Transfers", type: "OTHER" },
  { name: "Owner drawings", type: "EQUITY" },
];

export function normalizeTransactionCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export async function ensureDefaultTransactionCategoriesForClientBusiness(
  db: TransactionCategoryClient,
  clientBusinessId: number
) {
  const existing = await db.transactionCategory.findMany({
    where: { clientBusinessId },
    select: { name: true },
  });

  const existingNames = new Set(
    existing.map((category) => category.name.trim().toLowerCase())
  );
  const missing = DEFAULT_TRANSACTION_CATEGORIES.filter(
    (category) => !existingNames.has(category.name.toLowerCase())
  );

  if (missing.length === 0) return;

  await db.transactionCategory.createMany({
    data: missing.map((category) => ({
      clientBusinessId,
      name: category.name,
      type: category.type,
    })),
  });
}

export async function ensureDefaultTransactionCategoriesForWorkspace(
  db: TransactionCategoryClient,
  workspaceId: number
) {
  const businesses = await db.clientBusiness.findMany({
    where: {
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
    },
  });

  for (const business of businesses) {
    await ensureDefaultTransactionCategoriesForClientBusiness(db, business.id);
  }
}
