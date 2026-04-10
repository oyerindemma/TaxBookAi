import "server-only";

import { Prisma, type SubscriptionPlan } from "@prisma/client";
import { cookies } from "next/headers";
import { resolveAccountantWorkspaceKind } from "@/lib/accountant-workspace-types";
import { getOptionalSessionCookieDomain } from "@/lib/env";
import { formatSubscriptionStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { isPrismaSchemaCompatibilityError } from "@/lib/prisma-schema-compat";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-constants";
import {
  buildWorkspaceOnboardingDashboardConfig,
  buildWorkspaceOnboardingSnapshot,
} from "@/lib/workspace-onboarding";

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
        onboardingProfile: true;
        subscription: true;
        clientBusinesses: {
          select: {
            archivedAt: true;
          };
        };
        _count: {
          select: {
            members: true;
            invoices: true;
            taxRecords: true;
            bankTransactions: true;
          };
        };
      };
    };
  };
}>;

type WorkspaceMembershipWithDetailsWithoutOnboarding =
  Prisma.WorkspaceMemberGetPayload<{
    include: {
      workspace: {
        include: {
          businessProfile: true;
          subscription: true;
          clientBusinesses: {
            select: {
              archivedAt: true;
            };
          };
          _count: {
            select: {
              members: true;
              invoices: true;
              taxRecords: true;
              bankTransactions: true;
            };
          };
        };
      };
    };
  }>;

type ActiveWorkspaceMembership = Prisma.WorkspaceMemberGetPayload<{
  include: {
    workspace: {
      include: {
        businessProfile: true;
        onboardingProfile: true;
      };
    };
  };
}>;

type ActiveWorkspaceMembershipWithoutOnboarding =
  Prisma.WorkspaceMemberGetPayload<{
    include: {
      workspace: {
        include: {
          businessProfile: true;
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
  clientBusinessCount: number;
  workspaceKind: "STANDARD" | "ACCOUNTANT";
  transactionCount: number;
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
  | "clientBusinessCount"
  | "workspaceKind"
  | "transactionCount"
  | "plan"
  | "subscriptionLabel"
  | "onboardingComplete"
>;

function isMissingWorkspaceOnboardingTableError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: ["WorkspaceOnboarding"],
  });
}

function withNullOnboardingProfile(
  membership: WorkspaceMembershipWithDetailsWithoutOnboarding
): WorkspaceMembershipWithDetails {
  return {
    ...membership,
    workspace: {
      ...membership.workspace,
      onboardingProfile: null,
    },
  };
}

function withNullActiveWorkspaceOnboardingProfile(
  membership: ActiveWorkspaceMembershipWithoutOnboarding
): ActiveWorkspaceMembership {
  return {
    ...membership,
    workspace: {
      ...membership.workspace,
      onboardingProfile: null,
    },
  };
}

function mapWorkspaceSummary(membership: WorkspaceMembershipWithDetails): UserWorkspaceSummary {
  const clientBusinessCount = membership.workspace.clientBusinesses.filter(
    (clientBusiness) => !clientBusiness.archivedAt
  ).length;
  const onboardingComplete = Boolean(
    membership.workspace.onboardingProfile?.completedAt ||
      membership.workspace.businessProfile?.onboardingCompletedAt
  );

  return {
    id: membership.workspaceId,
    name: membership.workspace.name,
    role: membership.role,
    archivedAt: membership.workspace.archivedAt,
    createdAt: membership.workspace.createdAt,
    businessName: membership.workspace.businessProfile?.businessName ?? null,
    onboardingComplete,
    membersCount: membership.workspace._count.members,
    invoicesCount: membership.workspace._count.invoices,
    taxRecordsCount: membership.workspace._count.taxRecords,
    clientBusinessCount,
    workspaceKind: resolveAccountantWorkspaceKind(clientBusinessCount),
    transactionCount: membership.workspace._count.bankTransactions,
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
  let memberships: WorkspaceMembershipWithDetails[];

  try {
    memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            businessProfile: true,
            onboardingProfile: true,
            subscription: true,
            clientBusinesses: {
              select: {
                archivedAt: true,
              },
            },
            _count: {
              select: {
                members: true,
                invoices: true,
                taxRecords: true,
                bankTransactions: true,
              },
            },
          },
        },
      },
      orderBy: { workspace: { name: "asc" } },
    });
  } catch (error) {
    if (!isMissingWorkspaceOnboardingTableError(error)) {
      throw error;
    }

    const fallbackMemberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            businessProfile: true,
            subscription: true,
            clientBusinesses: {
              select: {
                archivedAt: true,
              },
            },
            _count: {
              select: {
                members: true,
                invoices: true,
                taxRecords: true,
                bankTransactions: true,
              },
            },
          },
        },
      },
      orderBy: { workspace: { name: "asc" } },
    });

    memberships = fallbackMemberships.map(withNullOnboardingProfile);
  }

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
  let membership: WorkspaceMembershipWithDetails | null;

  try {
    membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      include: {
        workspace: {
          include: {
            businessProfile: true,
            onboardingProfile: true,
            subscription: true,
            clientBusinesses: {
              select: {
                archivedAt: true,
              },
            },
            _count: {
              select: {
                members: true,
                invoices: true,
                taxRecords: true,
                bankTransactions: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingWorkspaceOnboardingTableError(error)) {
      throw error;
    }

    const fallbackMembership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      include: {
        workspace: {
          include: {
            businessProfile: true,
            subscription: true,
            clientBusinesses: {
              select: {
                archivedAt: true,
              },
            },
            _count: {
              select: {
                members: true,
                invoices: true,
                taxRecords: true,
                bankTransactions: true,
              },
            },
          },
        },
      },
    });

    membership = fallbackMembership
      ? withNullOnboardingProfile(fallbackMembership)
      : null;
  }

  if (!membership) return null;
  return mapWorkspaceSummary(membership);
}

export async function getWorkspaceShellState(userId: number) {
  const [activeMembershipResult, workspaceSummariesResult] = await Promise.allSettled([
    getActiveWorkspaceMembership(userId),
    listUserWorkspaceSummaries(userId),
  ]);

  if (activeMembershipResult.status === "rejected") {
    console.error(
      "[TaxBook:workspaces] Failed to load active workspace membership",
      activeMembershipResult.reason
    );
  }

  if (workspaceSummariesResult.status === "rejected") {
    console.error(
      "[TaxBook:workspaces] Failed to load user workspace summaries",
      workspaceSummariesResult.reason
    );
  }

  const activeMembership =
    activeMembershipResult.status === "fulfilled" ? activeMembershipResult.value : null;
  const workspaceSummaries =
    workspaceSummariesResult.status === "fulfilled" ? workspaceSummariesResult.value : [];

  const workspaces = workspaceSummaries
    .filter((workspace) => !workspace.archivedAt)
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      membersCount: workspace.membersCount,
      invoicesCount: workspace.invoicesCount,
      taxRecordsCount: workspace.taxRecordsCount,
      clientBusinessCount: workspace.clientBusinessCount,
      workspaceKind: workspace.workspaceKind,
      transactionCount: workspace.transactionCount,
      plan: workspace.plan,
      subscriptionLabel: workspace.subscriptionLabel,
      onboardingComplete: workspace.onboardingComplete,
    })) satisfies WorkspaceShellSummary[];
  const activeOnboardingConfig =
    activeMembership?.workspace
      ? buildWorkspaceOnboardingDashboardConfig({
          workspaceName: activeMembership.workspace.name,
          values: buildWorkspaceOnboardingSnapshot({
            workspaceName: activeMembership.workspace.name,
            onboarding: activeMembership.workspace.onboardingProfile,
            businessProfile: activeMembership.workspace.businessProfile,
          }).values,
        })
      : null;

  return {
    activeMembership,
    activeWorkspaceId: activeMembership?.workspaceId ?? null,
    workspaces,
    activeOnboardingConfig,
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
    let membership: ActiveWorkspaceMembership | null;

    try {
      membership = await prisma.workspaceMember.findFirst({
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
              onboardingProfile: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingWorkspaceOnboardingTableError(error)) {
        throw error;
      }

      const fallbackMembership = await prisma.workspaceMember.findFirst({
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

      membership = fallbackMembership
        ? withNullActiveWorkspaceOnboardingProfile(fallbackMembership)
        : null;
    }

    if (membership) return membership;
  }

  try {
    return await prisma.workspaceMember.findFirst({
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
            onboardingProfile: true,
          },
        },
      },
      orderBy: { workspace: { name: "asc" } },
    });
  } catch (error) {
    if (!isMissingWorkspaceOnboardingTableError(error)) {
      throw error;
    }

    const membership = await prisma.workspaceMember.findFirst({
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

    return membership
      ? withNullActiveWorkspaceOnboardingProfile(membership)
      : null;
  }
}

export function isWorkspaceOnboardingComplete(
  membership: Awaited<ReturnType<typeof getActiveWorkspaceMembership>>
) {
  return Boolean(
    membership?.workspace.onboardingProfile?.completedAt ||
      membership?.workspace.businessProfile?.onboardingCompletedAt
  );
}

export async function getAuthenticatedWorkspaceRedirectPath(userId: number) {
  const membership = await getActiveWorkspaceMembership(userId);

  if (!membership) {
    return "/dashboard/workspaces";
  }

  return isWorkspaceOnboardingComplete(membership) ? "/dashboard" : "/onboarding";
}
