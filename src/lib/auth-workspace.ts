import "server-only";

import {
  Prisma,
  PrismaClient,
  SubscriptionPlan,
  WorkspaceRole,
} from "@prisma/client";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { prisma } from "@/lib/prisma";

export const AUTH_WORKSPACE_BOOTSTRAP_TIMEOUT_MS = 15_000;

type AuthWorkspaceClient = PrismaClient | Prisma.TransactionClient;

function buildStarterWorkspaceName(fullName: string) {
  const normalizedName = fullName.trim() || "TaxBook AI";
  return `${normalizedName}'s Workspace`;
}

export async function provisionStarterWorkspace(
  db: AuthWorkspaceClient,
  input: {
    userId: number;
    fullName: string;
  }
) {
  const workspace = await db.workspace.create({
    data: {
      name: buildStarterWorkspaceName(input.fullName),
    },
    select: { id: true },
  });

  await db.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: input.userId,
      role: WorkspaceRole.OWNER,
    },
  });

  await db.workspaceSubscription.create({
    data: {
      workspaceId: workspace.id,
      plan: SubscriptionPlan.STARTER,
      status: "free",
    },
  });

  await seedDefaultExpenseCategories(db, workspace.id);

  return workspace.id;
}

export async function findActiveWorkspaceIdForUser(userId: number) {
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: {
        archivedAt: null,
      },
    },
    orderBy: {
      workspace: {
        name: "asc",
      },
    },
    select: {
      workspaceId: true,
    },
  });

  return membership?.workspaceId ?? null;
}

export async function ensureActiveWorkspaceForUser(input: {
  userId: number;
  fullName: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const membership = await tx.workspaceMember.findFirst({
        where: {
          userId: input.userId,
          workspace: {
            archivedAt: null,
          },
        },
        orderBy: {
          workspace: {
            name: "asc",
          },
        },
        select: {
          workspaceId: true,
        },
      });

      if (membership) {
        return membership.workspaceId;
      }

      return provisionStarterWorkspace(tx, input);
    },
    { timeout: AUTH_WORKSPACE_BOOTSTRAP_TIMEOUT_MS }
  );
}
