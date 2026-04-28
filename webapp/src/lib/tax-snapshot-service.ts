import "server-only";

import { createHash } from "node:crypto";
import type { Prisma, RecalcQueue } from "@prisma/client";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  buildTaxSnapshotCalculation,
  buildTaxSnapshotExplainableSummary,
  resolveManualRecalcPeriodKeys,
  type TaxSnapshotExplainableSummary,
} from "@/lib/tax-snapshot-calculation";

const STALE_PENDING_SNAPSHOT_MS = 5 * 60_000;

export type CreateTaxSnapshotInput = {
  userId: number;
  workspaceId: number;
  period?: string | null;
};

type TaxSnapshotTransactionFingerprintInput = {
  id: number;
  amount: number;
  type: string;
  categoryId: number | null;
  transactionDate: Date;
};

function getCurrentSnapshotPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getPeriodKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parsePeriodKey(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) {
    throw new Error("Use a valid period key like 2026-04.");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("Use a valid period key like 2026-04.");
  }

  const periodStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

function minorToMajor(amountMinor: number) {
  return Math.round(amountMinor) / 100;
}

export type ExplainableTaxSnapshot<T> = T & {
  uncategorizedCount: number;
  isRoughEstimate: boolean;
  warnings: string[];
  assumptions: string[];
  explainability: TaxSnapshotExplainableSummary;
};

export function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function clearBankTransactionSnapshotLockData() {
  return {
    locked: false,
    lockedAt: null,
    snapshotId: null,
  } as const;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function generateTaxTransactionChecksum(
  transactions: TaxSnapshotTransactionFingerprintInput[]
) {
  const base = transactions
    .map((transaction) =>
      [
        transaction.id,
        transaction.amount,
        transaction.type,
        transaction.categoryId ?? "uncategorized",
        transaction.transactionDate.toISOString(),
      ].join("-")
    )
    .sort()
    .join("|");

  return createHash("sha256").update(base).digest("hex");
}

export function decorateTaxSnapshotForResponse<T extends {
  totalIncome: number;
  totalExpense: number;
  taxableProfit: number;
  estimatedTax: number;
  transactionCount: number;
  categorizedCount: number;
}>(snapshot: T): ExplainableTaxSnapshot<T> {
  const explainability = buildTaxSnapshotExplainableSummary(snapshot);

  return {
    ...snapshot,
    uncategorizedCount: explainability.uncategorizedCount,
    isRoughEstimate: explainability.isRoughEstimate,
    warnings: explainability.warnings,
    assumptions: explainability.assumptions,
    explainability,
  };
}

async function createPendingSnapshot(input: {
  userId: number;
  workspaceId: number;
  period: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  txCount: number;
  txChecksum: string;
}) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.taxSnapshot.findFirst({
      where: {
        userId: input.userId,
        workspaceId: input.workspaceId,
      },
      orderBy: {
        version: "desc",
      },
    });

    if (latest?.status === "pending") {
      const pendingAgeMs = Date.now() - latest.createdAt.getTime();
      if (pendingAgeMs < STALE_PENDING_SNAPSHOT_MS) {
        throw new Error("Tax calculation already in progress");
      }

      await tx.taxSnapshot.update({
        where: {
          id: latest.id,
        },
        data: {
          status: "failed",
        },
      });
    }

    const nextVersion = latest ? latest.version + 1 : 1;

    return tx.taxSnapshot.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        period: input.period,
        periodKey: input.periodKey,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        version: nextVersion,
        status: "pending",
        totalIncome: 0,
        totalExpense: 0,
        taxableProfit: 0,
        taxPayable: 0,
        estimatedTax: 0,
        transactionCount: 0,
        categorizedCount: 0,
        txCount: input.txCount,
        txChecksum: input.txChecksum,
      },
    });
  });
}

export async function createTaxSnapshot(input: CreateTaxSnapshotInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error("A valid user is required before tax can be recalculated.");
  }

  if (!Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error("A workspace is required before tax can be recalculated.");
  }

  const period = input.period?.trim() || getCurrentSnapshotPeriod();
  const periodKey = period;
  const { periodStart, periodEnd } = parsePeriodKey(periodKey);

  const workspace = await withPrismaRetry(
    () =>
      prisma.workspace.findUnique({
        where: {
          id: input.workspaceId,
        },
        select: {
          needsRecalculation: true,
        },
      }),
    {
      label: "fetch_workspace_recalculation_state",
    }
  );

  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const transactions = await withPrismaRetry(
    () =>
      prisma.bankTransaction.findMany({
        where: {
          workspaceId: input.workspaceId,
          transactionDate: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
        select: {
          id: true,
          amount: true,
          type: true,
          categoryId: true,
          transactionDate: true,
        },
      }),
    {
      label: "fetch_transactions_for_tax_snapshot_checksum",
    }
  );

  const currentCount = transactions.length;
  const currentChecksum = generateTaxTransactionChecksum(transactions);
  const lastSnapshot = await withPrismaRetry(
    () =>
      prisma.taxSnapshot.findFirst({
        where: {
          userId: input.userId,
          workspaceId: input.workspaceId,
          periodKey,
          status: "completed",
        },
        orderBy: {
          version: "desc",
        },
      }),
    {
      label: "fetch_latest_tax_snapshot_for_checksum",
    }
  );
  const isSame =
    lastSnapshot?.txCount === currentCount && lastSnapshot.txChecksum === currentChecksum;
  const shouldUseCachedSnapshot = Boolean(isSame && !workspace.needsRecalculation);

  console.log({
    reason: shouldUseCachedSnapshot ? "cache_hit" : "data_changed",
    txCount: currentCount,
  });

  if (shouldUseCachedSnapshot && lastSnapshot) {
    return lastSnapshot;
  }

  let snapshot: Awaited<ReturnType<typeof createPendingSnapshot>>;

  try {
    snapshot = await withPrismaRetry(
      () =>
        createPendingSnapshot({
          userId: input.userId,
          workspaceId: input.workspaceId,
          period,
          periodKey,
          periodStart,
          periodEnd,
          txCount: currentCount,
          txChecksum: currentChecksum,
        }),
      {
        label: "create_pending_tax_snapshot",
      }
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Tax calculation already in progress");
    }
    throw error;
  }

  try {
    const calculation = buildTaxSnapshotCalculation(transactions);
    const transactionIds = transactions.map((transaction) => transaction.id);
    const lockedAt = new Date();

    return await prisma.$transaction(async (tx) => {
      const completedSnapshot = await tx.taxSnapshot.update({
        where: {
          id: snapshot.id,
        },
        data: {
          totalIncome: minorToMajor(calculation.incomeMinor),
          totalExpense: minorToMajor(calculation.expenseMinor),
          taxableProfit: minorToMajor(calculation.taxableProfitMinor),
          taxPayable: minorToMajor(calculation.estimatedTaxMinor),
          estimatedTax: minorToMajor(calculation.estimatedTaxMinor),
          transactionCount: calculation.transactionCount,
          categorizedCount: calculation.categorizedCount,
          periodKey,
          periodStart,
          periodEnd,
          txCount: currentCount,
          txChecksum: currentChecksum,
          status: "completed",
        } satisfies Prisma.TaxSnapshotUpdateInput,
      });

      if (transactionIds.length > 0) {
        await tx.bankTransaction.updateMany({
          where: {
            workspaceId: input.workspaceId,
            transactionDate: {
              gte: periodStart,
              lt: periodEnd,
            },
            id: {
              in: transactionIds,
            },
          },
          data: {
            locked: true,
            lockedAt,
            snapshotId: snapshot.id,
          },
        });
      }

      await tx.workspace.update({
        where: {
          id: input.workspaceId,
        },
        data: {
          needsRecalculation: false,
        },
      });

      return completedSnapshot;
    });
  } catch (error) {
    await prisma.taxSnapshot
      .update({
        where: {
          id: snapshot.id,
        },
        data: {
          status: "failed",
        },
      })
      .catch(() => null);

    throw error;
  }
}

export async function markBankTransactionSnapshotDirty(input: {
  transactionId: number;
  workspaceId: number;
  userId?: number | null;
}) {
  await markWorkspaceForRecalculationIfSnapshotLocked(prisma, {
    workspaceId: input.workspaceId,
    transactionIds: [input.transactionId],
    userId: input.userId,
  });

  await prisma.bankTransaction.updateMany({
    where: {
      id: input.transactionId,
      workspaceId: input.workspaceId,
    },
    data: clearBankTransactionSnapshotLockData(),
  });
}

export async function markWorkspaceForRecalculationIfSnapshotLocked(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    workspaceId: number;
    transactionIds: number[];
    userId?: number | null;
  }
) {
  if (input.transactionIds.length === 0) return;

  await enqueueRecalcForTransactions(tx, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    transactionIds: input.transactionIds,
    reason: "transaction_changed",
  });

  const lockedCount = await tx.bankTransaction.count({
    where: {
      workspaceId: input.workspaceId,
      id: {
        in: input.transactionIds,
      },
      OR: [
        {
          locked: true,
        },
        {
          snapshotId: {
            not: null,
          },
        },
      ],
    },
  });

  if (lockedCount === 0) return;

  await tx.workspace.update({
    where: {
      id: input.workspaceId,
    },
    data: {
      needsRecalculation: true,
    },
  });
}

async function resolveRecalcUserId(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: number | null;
    workspaceId: number;
  }
) {
  if (input.userId && Number.isInteger(input.userId) && input.userId > 0) {
    return input.userId;
  }

  const owner = await tx.workspaceMember.findFirst({
    where: {
      workspaceId: input.workspaceId,
      role: "OWNER",
    },
    select: {
      userId: true,
    },
  });

  if (owner) return owner.userId;

  const member = await tx.workspaceMember.findFirst({
    where: {
      workspaceId: input.workspaceId,
    },
    select: {
      userId: true,
    },
  });

  return member?.userId ?? null;
}

export async function enqueueRecalc(input: {
  userId: number;
  workspaceId: number;
  periodKey: string;
  reason: string;
}) {
  return enqueueRecalcInTransaction(prisma, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    periodKey: input.periodKey,
    reason: input.reason,
  });
}

export async function enqueueRecalcInTransaction(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: number | null;
    workspaceId: number;
    periodKey: string;
    reason: string;
  }
) {
  const userId = await resolveRecalcUserId(tx, input);
  if (!userId) return null;

  const { periodStart } = parsePeriodKey(input.periodKey);
  const normalizedPeriodKey = getPeriodKey(periodStart);
  const now = new Date();
  const queueKey = {
    userId,
    workspaceId: input.workspaceId,
    periodKey: normalizedPeriodKey,
  };
  const updateExistingQueueItem = (existing: { id: number; status: string }) =>
    tx.recalcQueue.update({
      where: {
        id: existing.id,
      },
      data:
        existing.status === "processing"
          ? {
              reason: input.reason,
              createdAt: now,
            }
          : {
              reason: input.reason,
              status: "pending",
              createdAt: now,
              processingStartedAt: null,
              completedAt: null,
              failedAt: null,
              errorMessage: null,
            },
    });

  const existing = await tx.recalcQueue.findUnique({
    where: {
      userId_workspaceId_periodKey: queueKey,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing) {
    return updateExistingQueueItem(existing);
  }

  return tx.recalcQueue
    .create({
      data: {
        userId,
        workspaceId: input.workspaceId,
        periodKey: normalizedPeriodKey,
        reason: input.reason,
        status: "pending",
      },
    })
    .catch(async (error) => {
      if (!isUniqueConstraintError(error)) throw error;

      const queueItem = await tx.recalcQueue.findUnique({
        where: {
          userId_workspaceId_periodKey: queueKey,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!queueItem) throw error;
      return updateExistingQueueItem(queueItem);
    });
}

export async function enqueueRecalcForTransactionDates(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: number | null;
    workspaceId: number;
    transactionDates: Date[];
    reason: string;
  }
) {
  const periodKeys = Array.from(
    new Set(input.transactionDates.map((date) => getPeriodKey(date)))
  );

  for (const periodKey of periodKeys) {
    await enqueueRecalcInTransaction(tx, {
      userId: input.userId,
      workspaceId: input.workspaceId,
      periodKey,
      reason: input.reason,
    });
  }
}

export async function enqueueRecalcForTransactions(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: number | null;
    workspaceId: number;
    transactionIds: number[];
    reason: string;
  }
) {
  if (input.transactionIds.length === 0) return;

  const transactions = await tx.bankTransaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: {
        in: input.transactionIds,
      },
    },
    select: {
      transactionDate: true,
    },
  });

  await enqueueRecalcForTransactionDates(tx, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    transactionDates: transactions.map((transaction) => transaction.transactionDate),
    reason: input.reason,
  });
}

export async function hasPendingRecalcQueue(
  userId: number | string,
  workspaceId?: number | null
): Promise<boolean> {
  const state = await getRecalcQueueState(userId, workspaceId);
  return state.status === "updating";
}

export async function getRecalcQueueState(
  userId: number | string,
  workspaceId?: number | null
): Promise<{
  status: "idle" | "updating" | "failed";
  pendingCount: number;
  processingCount: number;
  failedCount: number;
}> {
  const parsedUserId = typeof userId === "number" ? userId : Number(userId);

  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0 || !workspaceId) {
    console.log("RecalcQueue check:", {
      userId,
      workspaceId,
      count: 0,
    });
    return {
      status: "idle",
      pendingCount: 0,
      processingCount: 0,
      failedCount: 0,
    };
  }

  const recalcQueue = prisma.recalcQueue as typeof prisma.recalcQueue | undefined;
  if (!recalcQueue) {
    console.log("RecalcQueue check:", {
      userId: parsedUserId,
      workspaceId,
      count: 0,
    });
    return {
      status: "idle",
      pendingCount: 0,
      processingCount: 0,
      failedCount: 0,
    };
  }

  const pendingCount = safeNumber(await recalcQueue.count({
    where: {
      userId: parsedUserId,
      workspaceId,
      status: {
        in: ["pending", "processing"],
      },
    },
  }));
  const failedCount = safeNumber(await recalcQueue.count({
    where: {
      userId: parsedUserId,
      workspaceId,
      status: "failed",
    },
  }));
  const processingCount = safeNumber(await recalcQueue.count({
    where: {
      userId: parsedUserId,
      workspaceId,
      status: "processing",
    },
  }));

  console.log("RecalcQueue check:", {
    userId: parsedUserId,
    workspaceId,
    count: pendingCount,
  });

  return {
    status: pendingCount > 0 ? "updating" : failedCount > 0 ? "failed" : "idle",
    pendingCount,
    processingCount,
    failedCount,
  };
}

export async function claimPendingRecalcQueueItem(
  userId: number,
  workspaceId: number
): Promise<RecalcQueue | null> {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.recalcQueue.findFirst({
      where: {
        userId,
        workspaceId,
        status: "pending",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (!pending) return null;

    const claimed = await tx.recalcQueue.updateMany({
      where: {
        id: pending.id,
        status: "pending",
      },
      data: {
        status: "processing",
        processingStartedAt: new Date(),
        completedAt: null,
        failedAt: null,
        errorMessage: null,
      },
    });

    if (claimed.count !== 1) return null;

    return tx.recalcQueue.findUnique({
      where: {
        id: pending.id,
      },
    });
  });
}

export async function processSingleRecalcQueueItem(queueItem: RecalcQueue) {
  try {
    const snapshot = await createTaxSnapshot({
      userId: queueItem.userId,
      workspaceId: queueItem.workspaceId ?? 0,
      period: queueItem.periodKey,
    });

    await prisma.recalcQueue.updateMany({
      where: {
        id: queueItem.id,
        status: "processing",
      },
      data: {
        status: "completed",
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    return snapshot;
  } catch (error) {
    await prisma.recalcQueue.update({
      where: {
        id: queueItem.id,
      },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: getErrorMessage(error).slice(0, 1000),
      },
    });
    throw error;
  }
}

export async function processRecalcQueue(input: {
  userId: number;
  workspaceId: number;
}) {
  const snapshots = [];

  while (true) {
    const claimedItem = await claimPendingRecalcQueueItem(input.userId, input.workspaceId);
    if (!claimedItem) break;
    const snapshot = await processSingleRecalcQueueItem(claimedItem);
    snapshots.push(snapshot);
  }

  if (snapshots.length === 0) {
    const transactionDates = await prisma.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      select: {
        transactionDate: true,
      },
    });
    const periodKeys = resolveManualRecalcPeriodKeys(
      transactionDates.map((transaction) => transaction.transactionDate),
      getCurrentSnapshotPeriod()
    );

    for (const periodKey of periodKeys) {
      snapshots.push(
        await createTaxSnapshot({
          userId: input.userId,
          workspaceId: input.workspaceId,
          period: periodKey,
        })
      );
    }

    const recalcQueue = prisma.recalcQueue as typeof prisma.recalcQueue | undefined;
    await recalcQueue?.updateMany({
      where: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        status: "failed",
      },
      data: {
        status: "completed",
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  return {
    processedCount: snapshots.length,
    snapshots: snapshots.map((snapshot) => decorateTaxSnapshotForResponse(snapshot)),
  };
}
