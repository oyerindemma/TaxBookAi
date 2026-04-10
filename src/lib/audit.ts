import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditMetadata = Record<string, unknown> | string | null | undefined;
type PrismaAuditExecutor = Prisma.TransactionClient | PrismaClient;

export type AuditInput = {
  workspaceId: number;
  actorUserId?: number | null;
  targetUserId?: number | null;
  action: string;
  metadata?: AuditMetadata;
};

export async function writeAuditLog(
  executor: PrismaAuditExecutor,
  {
    workspaceId,
    actorUserId,
    targetUserId,
    action,
    metadata,
  }: AuditInput
) {
  const payload =
    metadata && typeof metadata === "object" ? JSON.stringify(metadata) : metadata ?? null;

  await executor.auditLog.create({
    data: {
      workspaceId,
      actorUserId: actorUserId ?? null,
      targetUserId: targetUserId ?? null,
      action,
      metadata: payload,
    },
  });
}

export async function logAudit({
  workspaceId,
  actorUserId,
  targetUserId,
  action,
  metadata,
}: AuditInput) {
  await writeAuditLog(prisma, {
    workspaceId,
    actorUserId,
    targetUserId,
    action,
    metadata,
  });
}
