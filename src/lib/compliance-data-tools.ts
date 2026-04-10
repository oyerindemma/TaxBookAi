import "server-only";

import crypto from "crypto";
import { Role } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  LEGAL_VERSION,
  resolveComplianceAccessTier,
} from "@/lib/config/compliance";
import { prisma } from "@/lib/prisma";
import {
  getUserWorkspaceSummary,
  listUserWorkspaceSummaries,
  type WorkspaceRole,
} from "@/lib/workspaces";

type ExportScope = "workspace" | "account";

function buildDeletedUserEmail(userId: number) {
  return `deleted-user-${userId}-${Date.now()}@deleted.taxbookai.local`;
}

function buildExportWarnings(input: {
  scope: ExportScope;
  hasWorkspace: boolean;
  transactionCount: number;
}) {
  const warnings: string[] = [];

  if (input.scope === "workspace" && !input.hasWorkspace) {
    warnings.push("No active workspace is selected for export.");
  }

  if (input.scope === "workspace" && input.hasWorkspace && input.transactionCount === 0) {
    warnings.push("The active workspace does not have any transactions yet.");
  }

  return warnings;
}

export async function buildComplianceExportSnapshot(input: {
  userId: number;
  scope: ExportScope;
  workspaceId?: number | null;
}) {
  const [user, workspaceSummaries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    }),
    listUserWorkspaceSummaries(input.userId),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  if (input.scope === "account") {
    return {
      generatedAt: new Date().toISOString(),
      scope: "account" as const,
      legalVersion: LEGAL_VERSION,
      user,
      workspaces: workspaceSummaries.map((workspace) => ({
        ...workspace,
        accessTier: resolveComplianceAccessTier(workspace.role),
      })),
      warnings: workspaceSummaries.length === 0 ? ["No workspaces are attached to this account yet."] : [],
    };
  }

  const summary =
    input.workspaceId != null
      ? await getUserWorkspaceSummary(input.userId, input.workspaceId)
      : null;

  if (!summary) {
    return {
      generatedAt: new Date().toISOString(),
      scope: "workspace" as const,
      legalVersion: LEGAL_VERSION,
      user,
      workspace: null,
      members: [],
      clientBusinesses: [],
      bankAccounts: [],
      bankTransactions: [],
      imports: [],
      auditLogs: [],
      warnings: buildExportWarnings({
        scope: "workspace",
        hasWorkspace: false,
        transactionCount: 0,
      }),
    };
  }

  const [members, clientBusinesses, bankAccounts, bankTransactions, imports, auditLogs] =
    await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.clientBusiness.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
          archivedAt: true,
          createdAt: true,
        },
        orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      }),
      prisma.bankAccount.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          name: true,
          bankName: true,
          currency: true,
          accountNumber: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      }),
      prisma.bankTransaction.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          transactionDate: true,
          description: true,
          reference: true,
          amount: true,
          currency: true,
          type: true,
          source: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: 1000,
      }),
      prisma.bankStatementImport.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          fileName: true,
          status: true,
          importedCount: true,
          duplicateCount: true,
          failedCount: true,
          warningCount: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { workspaceId: summary.id },
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          actorUserId: true,
          targetUserId: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
      }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    scope: "workspace" as const,
    legalVersion: LEGAL_VERSION,
    user,
    workspace: {
      ...summary,
      accessTier: resolveComplianceAccessTier(summary.role as WorkspaceRole),
    },
    members,
    clientBusinesses,
    bankAccounts,
    bankTransactions,
    imports,
    auditLogs,
    warnings: buildExportWarnings({
      scope: "workspace",
      hasWorkspace: true,
      transactionCount: bankTransactions.length,
    }),
  };
}

export async function anonymizeUserAccount(input: { userId: number }) {
  const [user, ownedWorkspaces, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    }),
    prisma.workspaceMember.findMany({
      where: {
        userId: input.userId,
        role: "OWNER",
        workspace: {
          archivedAt: null,
        },
      },
      select: {
        workspaceId: true,
        workspace: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.workspaceMember.findMany({
      where: {
        userId: input.userId,
      },
      select: {
        workspaceId: true,
        role: true,
      },
    }),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  if (ownedWorkspaces.length > 0) {
    throw new Error(
      "Archive or transfer any active owned workspaces before deleting this account."
    );
  }

  const anonymizedEmail = buildDeletedUserEmail(user.id);
  const anonymizedPassword = await hashPassword(
    crypto.randomBytes(32).toString("hex")
  );

  await prisma.$transaction(async (tx) => {
    for (const membership of memberships) {
      await writeAuditLog(tx, {
        workspaceId: membership.workspaceId,
        actorUserId: user.id,
        targetUserId: user.id,
        action: "USER_ACCOUNT_DELETED",
        metadata: {
          selfService: true,
          previousWorkspaceRole: membership.role,
          legalVersion: LEGAL_VERSION,
        },
      });
    }

    await tx.session.deleteMany({
      where: { userId: user.id },
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });
    await tx.workspaceMember.deleteMany({
      where: { userId: user.id },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: anonymizedEmail,
        fullName: `Deleted User ${user.id}`,
        password: anonymizedPassword,
        role: Role.USER,
      },
    });
  });

  return {
    anonymizedEmail,
    removedWorkspaceMemberships: memberships.length,
  };
}
