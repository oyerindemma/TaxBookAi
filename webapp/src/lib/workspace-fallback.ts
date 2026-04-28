import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTransactionCategoriesForClientBusiness } from "@/lib/transaction-categories";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

const DEFAULT_CLIENT_BUSINESS_NAME = "Default Client Business";

function isPositiveInteger(value: number | null | undefined) {
  return Number.isInteger(value) && Number.isFinite(value) && Number(value) > 0;
}

export async function resolveWorkspaceIdOrDefault(input: {
  db?: PrismaExecutor;
  workspaceId?: number | null;
}) {
  if (isPositiveInteger(input.workspaceId)) {
    return Number(input.workspaceId);
  }

  console.warn("[TaxBook] Missing workspaceId, falling back to default workspace");

  const db = input.db ?? prisma;
  const defaultWorkspace = await db.workspace.findFirst({
    where: {
      archivedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });

  if (!defaultWorkspace) {
    throw new Error("No workspace available");
  }

  return defaultWorkspace.id;
}

export async function resolveClientBusinessIdOrDefault(input: {
  db?: PrismaExecutor;
  workspaceId: number;
  clientBusinessId?: number | null;
}) {
  const db = input.db ?? prisma;

  if (isPositiveInteger(input.clientBusinessId)) {
    const business = await db.clientBusiness.findFirst({
      where: {
        id: Number(input.clientBusinessId),
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!business) {
      throw new Error("Client business not found");
    }

    return business.id;
  }

  console.warn("[TaxBook] Missing clientBusinessId, falling back to default client business", {
    workspaceId: input.workspaceId,
  });

  const existingActiveBusiness = await db.clientBusiness.findFirst({
    where: {
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });

  if (existingActiveBusiness) {
    return existingActiveBusiness.id;
  }

  const existingDefaultBusiness = await db.clientBusiness.findFirst({
    where: {
      workspaceId: input.workspaceId,
      name: DEFAULT_CLIENT_BUSINESS_NAME,
    },
    select: {
      id: true,
    },
  });

  if (existingDefaultBusiness) {
    const restoredBusiness = await db.clientBusiness.update({
      where: {
        id: existingDefaultBusiness.id,
      },
      data: {
        status: "ACTIVE",
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    await ensureDefaultTransactionCategoriesForClientBusiness(db, restoredBusiness.id);
    return restoredBusiness.id;
  }

  const createdBusiness = await db.clientBusiness.create({
    data: {
      workspaceId: input.workspaceId,
      name: DEFAULT_CLIENT_BUSINESS_NAME,
      legalName: DEFAULT_CLIENT_BUSINESS_NAME,
      country: "Nigeria",
      defaultCurrency: "NGN",
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  await ensureDefaultTransactionCategoriesForClientBusiness(db, createdBusiness.id);
  return createdBusiness.id;
}
