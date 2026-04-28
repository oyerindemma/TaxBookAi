import "server-only";

import { prisma } from "@/lib/prisma";

type BillingContactFallback = {
  fullName: string;
  email: string;
};

const ROLE_PRIORITY = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
  VIEWER: 3,
} as const;

export async function getWorkspaceBillingOperations(
  workspaceId: number,
  fallbackContact?: BillingContactFallback
) {
  const [memberships, recentWebhookEvents] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        role: {
          in: ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
        },
      },
      select: {
        role: true,
        user: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
    }),
    prisma.billingWebhookEvent.findMany({
      where: { workspaceId },
      orderBy: [{ receivedAt: "desc" }],
      take: 6,
      select: {
        id: true,
        eventType: true,
        status: true,
        reference: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
      },
    }),
  ]);

  const prioritizedMembership = memberships
    .filter((membership) => membership.user.email)
    .sort(
      (left, right) => ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role]
    )[0];

  const billingContact = prioritizedMembership
    ? {
        fullName: prioritizedMembership.user.fullName,
        email: prioritizedMembership.user.email,
        role: prioritizedMembership.role,
      }
    : fallbackContact
      ? {
          fullName: fallbackContact.fullName,
          email: fallbackContact.email,
          role: null,
        }
      : null;

  const failedCount = recentWebhookEvents.filter((event) => event.status === "FAILED").length;
  const processingCount = recentWebhookEvents.filter(
    (event) => event.status === "PROCESSING"
  ).length;
  const processedCount = recentWebhookEvents.filter(
    (event) => event.status === "PROCESSED"
  ).length;

  const health =
    failedCount > 0 ? "attention" : processingCount > 0 ? "processing" : "healthy";

  return {
    billingContact,
    webhookSummary: {
      health,
      failedCount,
      processingCount,
      processedCount,
      lastReceivedAt: recentWebhookEvents[0]?.receivedAt ?? null,
      lastProcessedAt:
        recentWebhookEvents.find((event) => event.processedAt)?.processedAt ?? null,
      recentEvents: recentWebhookEvents,
    },
  };
}
