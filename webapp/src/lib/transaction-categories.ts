import "server-only";

import type {
  CashflowActivityType,
  LedgerCategoryType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type TransactionCategoryClient = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_TRANSACTION_CATEGORIES: Array<{
  name: string;
  type: LedgerCategoryType;
  code: string;
  cashflowActivity: CashflowActivityType;
}> = [
  { name: "Cash and bank", type: "ASSET", code: "1000", cashflowActivity: "OPERATING" },
  { name: "Accounts receivable", type: "ASSET", code: "1100", cashflowActivity: "OPERATING" },
  { name: "Inventory", type: "ASSET", code: "1200", cashflowActivity: "OPERATING" },
  {
    name: "Equipment and fixed assets",
    type: "ASSET",
    code: "1500",
    cashflowActivity: "INVESTING",
  },
  { name: "Transfers", type: "OTHER", code: "1900", cashflowActivity: "OPERATING" },
  {
    name: "Accounts payable",
    type: "LIABILITY",
    code: "2000",
    cashflowActivity: "OPERATING",
  },
  { name: "Tax payable", type: "LIABILITY", code: "2100", cashflowActivity: "OPERATING" },
  {
    name: "Loans and borrowings",
    type: "LIABILITY",
    code: "2200",
    cashflowActivity: "FINANCING",
  },
  { name: "Owner capital", type: "EQUITY", code: "3000", cashflowActivity: "FINANCING" },
  { name: "Owner drawings", type: "EQUITY", code: "3100", cashflowActivity: "FINANCING" },
  { name: "Revenue", type: "INCOME", code: "4000", cashflowActivity: "OPERATING" },
  { name: "Cost of sales", type: "EXPENSE", code: "5000", cashflowActivity: "OPERATING" },
  { name: "Operations", type: "EXPENSE", code: "6100", cashflowActivity: "OPERATING" },
  { name: "Payroll", type: "EXPENSE", code: "6200", cashflowActivity: "OPERATING" },
  { name: "Rent and utilities", type: "EXPENSE", code: "6300", cashflowActivity: "OPERATING" },
  { name: "Professional fees", type: "EXPENSE", code: "6400", cashflowActivity: "OPERATING" },
  { name: "Tax and compliance", type: "EXPENSE", code: "6500", cashflowActivity: "OPERATING" },
  { name: "Travel and logistics", type: "EXPENSE", code: "6600", cashflowActivity: "OPERATING" },
  { name: "Bank charges", type: "EXPENSE", code: "6700", cashflowActivity: "OPERATING" },
];

const DEFAULT_TRANSACTION_CATEGORY_BY_NAME = new Map(
  DEFAULT_TRANSACTION_CATEGORIES.map((category) => [category.name.toLowerCase(), category] as const)
);

export function normalizeTransactionCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function getDefaultTransactionCategoryDefinition(name: string) {
  return DEFAULT_TRANSACTION_CATEGORY_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export async function ensureDefaultTransactionCategoriesForClientBusiness(
  db: TransactionCategoryClient,
  clientBusinessId: number
) {
  const existing = await db.transactionCategory.findMany({
    where: { clientBusinessId },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      cashflowActivity: true,
    },
  });

  const existingNames = new Set(
    existing.map((category) => category.name.trim().toLowerCase())
  );
  const missing = DEFAULT_TRANSACTION_CATEGORIES.filter(
    (category) => !existingNames.has(category.name.toLowerCase())
  );

  const updates = existing.flatMap((category) => {
    const defaultCategory = getDefaultTransactionCategoryDefinition(category.name);
    if (!defaultCategory) return [];

    if (
      category.code === defaultCategory.code &&
      category.type === defaultCategory.type &&
      category.cashflowActivity === defaultCategory.cashflowActivity
    ) {
      return [];
    }

    return [
      db.transactionCategory.update({
        where: { id: category.id },
        data: {
          code: defaultCategory.code,
          type: defaultCategory.type,
          cashflowActivity: defaultCategory.cashflowActivity,
        },
      }),
    ];
  });

  await Promise.all(updates);

  if (missing.length === 0) return;

  await db.transactionCategory.createMany({
    data: missing.map((category) => ({
      clientBusinessId,
      name: category.name,
      code: category.code,
      type: category.type,
      cashflowActivity: category.cashflowActivity,
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
