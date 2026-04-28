import prismaScriptClient from "./create-prisma-client.cjs";

const { createScriptPrismaClient } = prismaScriptClient;
const { prisma, disconnect } = createScriptPrismaClient();

const DEFAULT_EXPENSE_CATEGORIES = [
  "Office",
  "Software",
  "Utilities",
  "Marketing",
  "Transport",
  "Rent",
  "Miscellaneous",
];

const DEFAULT_CHART_OF_ACCOUNTS = [
  ["1000", "Bank", "ASSET", "Operating bank and cash balances."],
  ["1100", "Accounts Receivable", "ASSET", "Amounts billed but not yet collected from customers."],
  ["2000", "Accounts Payable", "LIABILITY", "Amounts owed to suppliers and vendors."],
  ["2100", "Tax Payable", "LIABILITY", "Taxes collected or accrued but not yet remitted."],
  ["2110", "VAT Payable", "LIABILITY", "VAT collected or accrued and awaiting remittance."],
  ["2120", "WHT Payable", "LIABILITY", "Withholding tax collected or accrued and awaiting remittance."],
  ["3000", "Owner Equity", "EQUITY", "Owner capital introduced into the business."],
  ["3100", "Retained Earnings", "EQUITY", "Accumulated profits retained in the business."],
  ["4000", "Sales Revenue", "REVENUE", "Income earned from normal operating activities."],
  ["6100", "Office Expense", "EXPENSE", "General office operating costs."],
  ["6200", "Rent Expense", "EXPENSE", "Rent and occupancy costs."],
  ["6300", "Utilities Expense", "EXPENSE", "Utilities and similar recurring service costs."],
];

async function seedDefaultExpenseCategories(workspaceId) {
  const existing = await prisma.expenseCategory.findMany({
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

  await prisma.expenseCategory.createMany({
    data: missing.map((name) => ({ workspaceId, name })),
  });
}

async function seedDefaultChartOfAccounts(workspaceId) {
  const existing = await prisma.chartOfAccount.findMany({
    where: { workspaceId },
    select: { name: true },
  });

  const existingNames = new Set(
    existing.map((account) => account.name.trim().toLowerCase())
  );
  const missing = DEFAULT_CHART_OF_ACCOUNTS.filter(
    ([, name]) => !existingNames.has(name.toLowerCase())
  );

  if (missing.length === 0) return;

  await prisma.chartOfAccount.createMany({
    data: missing.map(([code, name, accountClass, description]) => ({
      workspaceId,
      code,
      name,
      accountClass,
      description,
      isSystemDefault: true,
    })),
  });
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true },
  });

  for (const user of users) {
    let membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { id: "asc" },
    });

    if (!membership) {
      const workspace = await prisma.workspace.create({
        data: {
          name: `${user.fullName}'s Workspace`,
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
          subscription: {
            create: {
              plan: "STARTER",
              status: "free",
            },
          },
        },
      });
      membership = { workspaceId: workspace.id };
    }

    await prisma.workspaceSubscription.upsert({
      where: { workspaceId: membership.workspaceId },
      update: {},
      create: {
        workspaceId: membership.workspaceId,
        plan: "STARTER",
        status: "free",
      },
    });

    await seedDefaultExpenseCategories(membership.workspaceId);
    await seedDefaultChartOfAccounts(membership.workspaceId);

    await prisma.taxRecord.updateMany({
      where: { userId: user.id, workspaceId: null },
      data: { workspaceId: membership.workspaceId },
    });
  }
}

main()
  .catch((err) => {
    console.error("Workspace backfill failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnect();
  });
