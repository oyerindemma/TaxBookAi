import "server-only";

import type { Prisma, SubscriptionPlan } from "@prisma/client";
import { cookies } from "next/headers";
import { getOptionalSessionCookieDomain } from "@/lib/env";
import { formatSubscriptionStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-constants";

export const WORKSPACE_COOKIE_NAME = "tb_workspace";

export function buildWorkspaceCookieOptions() {
  const domain = getOptionalSessionCookieDomain();

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  };
}

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export function canManageWorkspace(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN";
}

type WorkspaceMembershipWithDetails = Prisma.WorkspaceMemberGetPayload<{
  include: {
    workspace: {
      include: {
        businessProfile: true;
        subscription: true;
        _count: {
          select: {
            members: true;
            invoices: true;
            taxRecords: true;
          };
        };
      };
    };
  };
}>;

export type UserWorkspaceSummary = {
  id: number;
  name: string;
  role: WorkspaceRole;
  archivedAt: Date | null;
  createdAt: Date;
  businessName: string | null;
  onboardingComplete: boolean;
  membersCount: number;
  invoicesCount: number;
  taxRecordsCount: number;
  plan: SubscriptionPlan | null;
  subscriptionLabel: string;
};

export type WorkspaceShellSummary = Pick<
  UserWorkspaceSummary,
  | "id"
  | "name"
  | "role"
  | "membersCount"
  | "invoicesCount"
  | "taxRecordsCount"
  | "plan"
  | "subscriptionLabel"
>;

function mapWorkspaceSummary(membership: WorkspaceMembershipWithDetails): UserWorkspaceSummary {
  return {
    id: membership.workspaceId,
    name: membership.workspace.name,
    role: membership.role,
    archivedAt: membership.workspace.archivedAt,
    createdAt: membership.workspace.createdAt,
    businessName: membership.workspace.businessProfile?.businessName ?? null,
    onboardingComplete: Boolean(
      membership.workspace.businessProfile?.onboardingCompletedAt
    ),
    membersCount: membership.workspace._count.members,
    invoicesCount: membership.workspace._count.invoices,
    taxRecordsCount: membership.workspace._count.taxRecords,
    plan: membership.workspace.subscription?.plan ?? null,
    subscriptionLabel: formatSubscriptionStatus(membership.workspace.subscription),
  };
}

export async function listWorkspaceMemberships(userId: number) {
  return prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: {
        archivedAt: null,
      },
    },
    include: { workspace: true },
    orderBy: { workspace: { name: "asc" } },
  });
}

export async function listUserWorkspaceSummaries(userId: number) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          businessProfile: true,
          subscription: true,
          _count: {
            select: {
              members: true,
              invoices: true,
              taxRecords: true,
            },
          },
        },
      },
    },
    orderBy: { workspace: { name: "asc" } },
  });

  return memberships
    .map((membership) => mapWorkspaceSummary(membership))
    .sort((left, right) => {
      if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) {
        return left.archivedAt ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });
}

export async function getUserWorkspaceSummary(userId: number, workspaceId: number) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
    include: {
      workspace: {
        include: {
          businessProfile: true,
          subscription: true,
          _count: {
            select: {
              members: true,
              invoices: true,
              taxRecords: true,
            },
          },
        },
      },
    },
  });

  if (!membership) return null;
  return mapWorkspaceSummary(membership);
}

export async function getWorkspaceShellState(userId: number) {
  const [activeMembership, workspaceSummaries] = await Promise.all([
    getActiveWorkspaceMembership(userId),
    listUserWorkspaceSummaries(userId),
  ]);

  const workspaces = workspaceSummaries
    .filter((workspace) => !workspace.archivedAt)
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      membersCount: workspace.membersCount,
      invoicesCount: workspace.invoicesCount,
      taxRecordsCount: workspace.taxRecordsCount,
      plan: workspace.plan,
      subscriptionLabel: workspace.subscriptionLabel,
    })) satisfies WorkspaceShellSummary[];

  return {
    activeMembership,
    activeWorkspaceId: activeMembership?.workspaceId ?? null,
    workspaces,
  };
}

export async function findFallbackWorkspaceId(
  userId: number,
  excludedWorkspaceId?: number
) {
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId: excludedWorkspaceId ? { not: excludedWorkspaceId } : undefined,
      workspace: {
        archivedAt: null,
      },
    },
    orderBy: { workspace: { name: "asc" } },
    select: { workspaceId: true },
  });

  return membership?.workspaceId ?? null;
}

export async function getActiveWorkspaceMembership(userId: number) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;
  const workspaceId = raw ? Number(raw) : NaN;

  if (Number.isFinite(workspaceId) && Number.isInteger(workspaceId)) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        workspace: {
          archivedAt: null,
        },
      },
      include: {
        workspace: {
          include: {
            businessProfile: true,
          },
        },
      },
    });
    if (membership) return membership;
  }

  return prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: {
        archivedAt: null,
      },
    },
    include: {
      workspace: {
        include: {
          businessProfile: true,
        },
      },
    },
    orderBy: { workspace: { name: "asc" } },
  });
}

export function isWorkspaceOnboardingComplete(
  membership: Awaited<ReturnType<typeof getActiveWorkspaceMembership>>
) {
  return Boolean(membership?.workspace.businessProfile?.onboardingCompletedAt);
}

export async function getAuthenticatedWorkspaceRedirectPath(userId: number) {
  const membership = await getActiveWorkspaceMembership(userId);

  if (!membership) {
    return "/dashboard/workspaces";
  }

  return isWorkspaceOnboardingComplete(membership) ? "/dashboard" : "/onboarding";
}
