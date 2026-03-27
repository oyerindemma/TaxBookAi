import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_EXPENSE_CATEGORIES = [
  "Office",
  "Software",
  "Utilities",
  "Marketing",
  "Transport",
  "Rent",
  "Miscellaneous",
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
    await prisma.$disconnect();
  });
