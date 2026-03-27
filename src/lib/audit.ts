import "server-only";

import { prisma } from "@/lib/prisma";

type AuditMetadata = Record<string, unknown> | string | null | undefined;

type AuditInput = {
  workspaceId: number;
  actorUserId?: number | null;
  targetUserId?: number | null;
  action: string;
  metadata?: AuditMetadata;
};

export async function logAudit({
  workspaceId,
  actorUserId,
  targetUserId,
  action,
  metadata,
}: AuditInput) {
  const payload =
    metadata && typeof metadata === "object" ? JSON.stringify(metadata) : metadata ?? null;

  await prisma.auditLog.create({
    data: {
      workspaceId,
      actorUserId: actorUserId ?? null,
      targetUserId: targetUserId ?? null,
      action,
      metadata: payload,
    },
  });
}
