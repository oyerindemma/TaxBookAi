import crypto from "crypto";
import type {
  BankTransactionTaxTreatmentSource,
  Prisma,
  PrismaClient,
  SubscriptionPlan,
} from "@prisma/client";
import {
  DEV_WORKSPACE_SEED_ENGINE_PREFIX,
  DEV_WORKSPACE_SEED_REFERENCE_PREFIX,
  DEV_WORKSPACE_SEED_SOURCE,
  DEV_WORKSPACE_SEED_TAG,
  buildFixtureDate,
  buildPhase2DevWorkspaceFixture,
  type DevSeedBankAccount,
  type DevSeedClientBusiness,
  type DevSeedTransaction,
} from "./dev-workspace-seed-fixtures";

type SeedDb = PrismaClient | Prisma.TransactionClient;

type BusinessRecord = {
  id: number;
  key: string;
  name: string;
  defaultCurrency: string;
};

type BankAccountRecord = {
  id: number;
  key: string;
  currency: string;
};

type VendorRecord = {
  id: number;
  key: string;
  name: string;
  taxIdentificationNumber: string | null;
};

type TransactionCategoryRecord = {
  id: number;
  key: string;
  name: string;
};

type ExpenseCategoryRecord = {
  id: number;
  name: string;
};

type SeedCounters = {
  clientBusinesses: number;
  bankAccounts: number;
  vendors: number;
  transactionCategories: number;
  expenseCategories: number;
  uploads: number;
  transactions: number;
  ledgerTransactions: number;
  taxRecords: number;
  vatRecords: number;
  whtRecords: number;
};

export type ResolvedDevWorkspaceSeedTarget = {
  workspaceId: number;
  workspaceName: string;
  actorUserId: number;
  actorEmail: string;
  actorRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

export type DevWorkspaceSeedResult = {
  workspaceId: number;
  workspaceName: string;
  actorUserId: number;
  actorEmail: string;
  resetExisting: boolean;
  counters: SeedCounters;
  transactionSummary: {
    total: number;
    posted: number;
    pendingReview: number;
    flagged: number;
    reviewedReadyToPost: number;
  };
  scenarios: string[];
};

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  GROWTH: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

const ROLE_RANK: Record<ResolvedDevWorkspaceSeedTarget["actorRole"], number> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
  VIEWER: 3,
};

function assertDevSeedAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Workspace dev seeding is disabled in production.");
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSeedFingerprintHash(input: {
  bankAccountId: number;
  transactionDate: Date;
  amountMinor: number;
  type: DevSeedTransaction["type"];
  description: string;
  reference: string | null;
}) {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.bankAccountId,
        input.transactionDate.toISOString().slice(0, 10),
        input.amountMinor,
        input.type,
        normalizeText(input.description),
        normalizeText(input.reference),
      ].join("|")
    )
    .digest("hex");
}

function computeInclusiveVatAmountMinor(amountMinor: number, rate: number) {
  if (rate <= 0) return 0;
  return Math.max(0, Math.round((amountMinor * rate) / (1 + rate)));
}

function computeWithholdingAmountMinor(amountMinor: number, rate: number) {
  if (rate <= 0) return 0;
  return Math.max(0, Math.round(amountMinor * rate));
}

function buildPeriodKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildPeriodLabel(date: Date) {
  return date.toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildPeriodRange(date: Date) {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();

  return {
    startDate: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
    year,
    month: monthIndex + 1,
  };
}

function incrementCounter(counters: SeedCounters, key: keyof SeedCounters, created: boolean) {
  if (created) {
    counters[key] += 1;
  }
}

function resolveTargetPlan(existing: SubscriptionPlan | null | undefined) {
  if (!existing) return "PROFESSIONAL" as const;
  return PLAN_RANK[existing] >= PLAN_RANK.PROFESSIONAL ? existing : "PROFESSIONAL";
}

function buildSeedCounters(): SeedCounters {
  return {
    clientBusinesses: 0,
    bankAccounts: 0,
    vendors: 0,
    transactionCategories: 0,
    expenseCategories: 0,
    uploads: 0,
    transactions: 0,
    ledgerTransactions: 0,
    taxRecords: 0,
    vatRecords: 0,
    whtRecords: 0,
  };
}

export async function resolveDevWorkspaceSeedTarget(
  prisma: PrismaClient,
  input: {
    workspaceId?: number | null;
    userId?: number | null;
    email?: string | null;
  }
): Promise<ResolvedDevWorkspaceSeedTarget> {
  assertDevSeedAllowed();

  const normalizedEmail = input.email ? normalizeEmail(input.email) : null;

  if (!input.workspaceId && !input.userId && !normalizedEmail) {
    throw new Error(
      "Provide --workspace-id, --user-id, or --email so the seed can resolve the target workspace safely."
    );
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: input.workspaceId ?? undefined,
      userId: input.userId ?? undefined,
      user: normalizedEmail
        ? {
            email: normalizedEmail,
          }
        : undefined,
      workspace: {
        archivedAt: null,
      },
    },
    select: {
      role: true,
      workspaceId: true,
      userId: true,
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: [{ workspaceId: "asc" }, { userId: "asc" }],
  });

  let selected =
    memberships
      .slice()
      .sort((left, right) => {
        const roleDelta =
          ROLE_RANK[left.role as ResolvedDevWorkspaceSeedTarget["actorRole"]] -
          ROLE_RANK[right.role as ResolvedDevWorkspaceSeedTarget["actorRole"]];
        if (roleDelta !== 0) return roleDelta;
        return left.workspaceId - right.workspaceId;
      })[0] ?? null;

  if (!selected && input.workspaceId) {
    const fallbackMemberships = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: input.workspaceId,
        workspace: {
          archivedAt: null,
        },
      },
      select: {
        role: true,
        workspaceId: true,
        userId: true,
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    selected =
      fallbackMemberships
        .slice()
        .sort(
          (left, right) =>
            ROLE_RANK[left.role as ResolvedDevWorkspaceSeedTarget["actorRole"]] -
            ROLE_RANK[right.role as ResolvedDevWorkspaceSeedTarget["actorRole"]]
        )[0] ?? null;
  }

  if (!selected) {
    throw new Error(
      "Unable to resolve a workspace membership for dev seeding. Provide --workspace-id with a valid local workspace."
    );
  }

  return {
    workspaceId: selected.workspace.id,
    workspaceName: selected.workspace.name,
    actorUserId: selected.user.id,
    actorEmail: selected.user.email,
    actorRole: selected.role as ResolvedDevWorkspaceSeedTarget["actorRole"],
  };
}

async function ensureBusinessProfile(
  db: SeedDb,
  input: {
    workspaceId: number;
    workspaceName: string;
  }
) {
  const existing = await db.businessProfile.findUnique({
    where: {
      workspaceId: input.workspaceId,
    },
  });

  const payload = {
    businessName: existing?.businessName?.trim() || input.workspaceName,
    businessType: existing?.businessType?.trim() || "Professional services",
    industry: existing?.industry?.trim() || "Accounting and finance",
    country: existing?.country?.trim() || "Nigeria",
    state: existing?.state?.trim() || "Lagos",
    taxIdentificationNumber:
      existing?.taxIdentificationNumber?.trim() || "TIN-P2SEED-WORKSPACE",
    defaultCurrency: existing?.defaultCurrency || "NGN",
    fiscalYearStartMonth: existing?.fiscalYearStartMonth || 1,
    onboardingCompletedAt: existing?.onboardingCompletedAt ?? new Date(),
  };

  if (existing) {
    await db.businessProfile.update({
      where: {
        workspaceId: input.workspaceId,
      },
      data: payload,
    });
    return;
  }

  await db.businessProfile.create({
    data: {
      workspaceId: input.workspaceId,
      ...payload,
    },
  });
}

async function ensureWorkspaceOnboarding(
  db: SeedDb,
  input: {
    workspaceId: number;
    workspaceName: string;
  }
) {
  const existing = await db.workspaceOnboarding.findUnique({
    where: {
      workspaceId: input.workspaceId,
    },
  });

  const payload = {
    status: "COMPLETED" as const,
    userType: existing?.userType ?? "ACCOUNTANT",
    businessName: existing?.businessName?.trim() || input.workspaceName,
    businessType: existing?.businessType?.trim() || "Professional services",
    industry: existing?.industry?.trim() || "Accounting and finance",
    country: existing?.country?.trim() || "Nigeria",
    state: existing?.state?.trim() || "Lagos",
    taxIdentificationNumber:
      existing?.taxIdentificationNumber?.trim() || "TIN-P2SEED-WORKSPACE",
    defaultCurrency: existing?.defaultCurrency || "NGN",
    fiscalYearStartMonth: existing?.fiscalYearStartMonth || 1,
    vatApplicability: existing?.vatApplicability ?? "YES",
    whtApplicability: existing?.whtApplicability ?? "YES",
    multiBusinessNeed: existing?.multiBusinessNeed ?? "ACCOUNTANT_PORTFOLIO",
    currentStep: "completed",
    draftSavedAt: existing?.draftSavedAt ?? new Date(),
    completedAt: existing?.completedAt ?? new Date(),
  };

  if (existing) {
    await db.workspaceOnboarding.update({
      where: {
        workspaceId: input.workspaceId,
      },
      data: payload,
    });
    return;
  }

  await db.workspaceOnboarding.create({
    data: {
      workspaceId: input.workspaceId,
      ...payload,
    },
  });
}

async function ensureWorkspaceSubscription(db: SeedDb, workspaceId: number) {
  const existing = await db.workspaceSubscription.findUnique({
    where: {
      workspaceId,
    },
  });
  const plan = resolveTargetPlan(existing?.plan);

  if (existing) {
    await db.workspaceSubscription.update({
      where: {
        workspaceId,
      },
      data: {
        plan,
        status: existing.status ?? "active",
        billingInterval: existing.billingInterval || "MONTHLY",
      },
    });
    return;
  }

  await db.workspaceSubscription.create({
    data: {
      workspaceId,
      plan,
      status: "active",
      billingInterval: "MONTHLY",
    },
  });
}

async function resetSeededTransactionalData(db: SeedDb, workspaceId: number) {
  await db.vATRecord.deleteMany({
    where: {
      workspaceId,
      engineKey: {
        startsWith: DEV_WORKSPACE_SEED_ENGINE_PREFIX,
      },
    },
  });

  await db.wHTRecord.deleteMany({
    where: {
      workspaceId,
      engineKey: {
        startsWith: DEV_WORKSPACE_SEED_ENGINE_PREFIX,
      },
    },
  });

  await db.taxRecord.deleteMany({
    where: {
      workspaceId,
      source: DEV_WORKSPACE_SEED_SOURCE,
    },
  });

  await db.ledgerTransaction.deleteMany({
    where: {
      clientBusiness: {
        workspaceId,
      },
      reference: {
        startsWith: DEV_WORKSPACE_SEED_REFERENCE_PREFIX,
      },
    },
  });

  await db.bankTransaction.deleteMany({
    where: {
      workspaceId,
      reference: {
        startsWith: DEV_WORKSPACE_SEED_REFERENCE_PREFIX,
      },
    },
  });
}

async function findOrCreateClientBusiness(
  db: SeedDb,
  workspaceId: number,
  seed: DevSeedClientBusiness,
  counters: SeedCounters
): Promise<BusinessRecord> {
  const existing = await db.clientBusiness.findFirst({
    where: {
      workspaceId,
      name: seed.name,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
      notes: true,
      taxIdentificationNumber: true,
    },
  });

  if (existing) {
    const existingLooksSeeded =
      existing.notes?.includes(DEV_WORKSPACE_SEED_TAG) ||
      existing.taxIdentificationNumber?.startsWith("TIN-P2SEED-") ||
      existing.taxIdentificationNumber === seed.taxIdentificationNumber;

    if (!existingLooksSeeded) {
      throw new Error(
        `Client business "${seed.name}" already exists in this workspace and is not owned by the Phase 2 dev seed. Use a different workspace or rename/remove the conflicting record first.`
      );
    }

    await db.clientBusiness.update({
      where: {
        id: existing.id,
      },
      data: {
        legalName: seed.legalName,
        industry: seed.industry,
        country: seed.country,
        state: seed.state,
        taxIdentificationNumber: seed.taxIdentificationNumber,
        vatRegistrationNumber: seed.vatRegistrationNumber,
        defaultCurrency: seed.defaultCurrency,
        fiscalYearStartMonth: seed.fiscalYearStartMonth,
        status: "ACTIVE",
        archivedAt: null,
        notes: seed.notes,
      },
    });

    return {
      id: existing.id,
      key: seed.key,
      name: existing.name,
      defaultCurrency: existing.defaultCurrency,
    };
  }

  const created = await db.clientBusiness.create({
    data: {
      workspaceId,
      name: seed.name,
      legalName: seed.legalName,
      industry: seed.industry,
      country: seed.country,
      state: seed.state,
      taxIdentificationNumber: seed.taxIdentificationNumber,
      vatRegistrationNumber: seed.vatRegistrationNumber,
      defaultCurrency: seed.defaultCurrency,
      fiscalYearStartMonth: seed.fiscalYearStartMonth,
      notes: seed.notes,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  });

  incrementCounter(counters, "clientBusinesses", true);

  return {
    id: created.id,
    key: seed.key,
    name: created.name,
    defaultCurrency: created.defaultCurrency,
  };
}

async function findOrCreateBankAccount(
  db: SeedDb,
  workspaceId: number,
  clientBusinessId: number,
  seed: DevSeedBankAccount,
  counters: SeedCounters
): Promise<BankAccountRecord> {
  const existing = await db.bankAccount.findFirst({
    where: {
      workspaceId,
      accountNumber: seed.accountNumber,
    },
    select: {
      id: true,
      currency: true,
    },
  });

  if (existing) {
    await db.bankAccount.update({
      where: {
        id: existing.id,
      },
      data: {
        clientBusinessId,
        name: seed.name,
        bankName: seed.bankName,
        currency: seed.currency,
      },
    });

    return {
      id: existing.id,
      key: seed.key,
      currency: existing.currency,
    };
  }

  const created = await db.bankAccount.create({
    data: {
      workspaceId,
      clientBusinessId,
      name: seed.name,
      bankName: seed.bankName,
      accountNumber: seed.accountNumber,
      currency: seed.currency,
    },
    select: {
      id: true,
      currency: true,
    },
  });

  incrementCounter(counters, "bankAccounts", true);

  return {
    id: created.id,
    key: seed.key,
    currency: created.currency,
  };
}

async function findOrCreateVendor(
  db: SeedDb,
  clientBusinessId: number,
  seed: NonNullable<(ReturnType<typeof buildPhase2DevWorkspaceFixture>)["vendors"][number]>,
  counters: SeedCounters
): Promise<VendorRecord> {
  const existing = await db.vendor.findFirst({
    where: {
      clientBusinessId,
      name: seed.name,
    },
    select: {
      id: true,
      taxIdentificationNumber: true,
    },
  });

  if (existing) {
    await db.vendor.update({
      where: {
        id: existing.id,
      },
      data: {
        email: seed.email ?? null,
        phone: seed.phone ?? null,
        taxIdentificationNumber: seed.taxIdentificationNumber ?? null,
        vatRegistrationNumber: seed.vatRegistrationNumber ?? null,
        notes: seed.notes ?? null,
      },
    });

    return {
      id: existing.id,
      key: seed.key,
      name: seed.name,
      taxIdentificationNumber: existing.taxIdentificationNumber,
    };
  }

  const created = await db.vendor.create({
    data: {
      clientBusinessId,
      name: seed.name,
      email: seed.email ?? null,
      phone: seed.phone ?? null,
      taxIdentificationNumber: seed.taxIdentificationNumber ?? null,
      vatRegistrationNumber: seed.vatRegistrationNumber ?? null,
      notes: seed.notes ?? null,
    },
    select: {
      id: true,
      taxIdentificationNumber: true,
    },
  });

  incrementCounter(counters, "vendors", true);

  return {
    id: created.id,
    key: seed.key,
    name: seed.name,
    taxIdentificationNumber: created.taxIdentificationNumber,
  };
}

async function findOrCreateTransactionCategory(
  db: SeedDb,
  clientBusinessId: number,
  seed: (ReturnType<typeof buildPhase2DevWorkspaceFixture>)["transactionCategories"][number],
  counters: SeedCounters
): Promise<TransactionCategoryRecord> {
  const existing = await db.transactionCategory.findFirst({
    where: {
      clientBusinessId,
      name: seed.name,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existing) {
    await db.transactionCategory.update({
      where: {
        id: existing.id,
      },
      data: {
        type: seed.type,
      },
    });

    return {
      id: existing.id,
      key: `${clientBusinessId}:${seed.name}`,
      name: existing.name,
    };
  }

  const created = await db.transactionCategory.create({
    data: {
      clientBusinessId,
      name: seed.name,
      type: seed.type,
    },
    select: {
      id: true,
      name: true,
    },
  });

  incrementCounter(counters, "transactionCategories", true);

  return {
    id: created.id,
    key: `${clientBusinessId}:${seed.name}`,
    name: created.name,
  };
}

async function findOrCreateExpenseCategory(
  db: SeedDb,
  workspaceId: number,
  name: string,
  counters: SeedCounters
): Promise<ExpenseCategoryRecord> {
  const existing = await db.expenseCategory.findFirst({
    where: {
      workspaceId,
      name,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
    };
  }

  const created = await db.expenseCategory.create({
    data: {
      workspaceId,
      name,
    },
    select: {
      id: true,
      name: true,
    },
  });

  incrementCounter(counters, "expenseCategories", true);

  return {
    id: created.id,
    name: created.name,
  };
}

async function findOrCreateUpload(
  db: SeedDb,
  workspaceId: number,
  clientBusinessId: number,
  uploadedByUserId: number,
  upload: (ReturnType<typeof buildPhase2DevWorkspaceFixture>)["uploads"][number],
  counters: SeedCounters
) {
  const existing = await db.bookkeepingUpload.findFirst({
    where: {
      workspaceId,
      fileName: upload.fileName,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await db.bookkeepingUpload.update({
      where: {
        id: existing.id,
      },
      data: {
        clientBusinessId,
        uploadedByUserId,
        sourceType: upload.sourceType,
        documentType: upload.documentType,
        status: upload.status,
        rawText: upload.rawText ?? null,
        reviewNotes: upload.reviewNotes ?? null,
      },
    });
    return existing.id;
  }

  const created = await db.bookkeepingUpload.create({
    data: {
      workspaceId,
      clientBusinessId,
      uploadedByUserId,
      fileName: upload.fileName,
      sourceType: upload.sourceType,
      documentType: upload.documentType,
      status: upload.status,
      rawText: upload.rawText ?? null,
      reviewNotes: upload.reviewNotes ?? null,
    },
    select: {
      id: true,
    },
  });

  incrementCounter(counters, "uploads", true);
  return created.id;
}

async function findOrCreateTaxPeriod(
  db: SeedDb,
  input: {
    workspaceId: number;
    clientBusinessId: number;
    date: Date;
  }
) {
  const periodKey = buildPeriodKey(input.date);
  const existing = await db.taxPeriod.findFirst({
    where: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      periodKey,
    },
    select: {
      id: true,
    },
  });
  const periodRange = buildPeriodRange(input.date);
  const label = buildPeriodLabel(input.date);

  if (existing) {
    await db.taxPeriod.update({
      where: {
        id: existing.id,
      },
      data: {
        label,
        periodType: "MONTHLY",
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
        year: periodRange.year,
        month: periodRange.month,
        status: "READY",
        notes: DEV_WORKSPACE_SEED_TAG,
      },
    });

    return existing.id;
  }

  const created = await db.taxPeriod.create({
    data: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      periodKey,
      label,
      periodType: "MONTHLY",
      startDate: periodRange.startDate,
      endDate: periodRange.endDate,
      year: periodRange.year,
      month: periodRange.month,
      status: "READY",
      notes: DEV_WORKSPACE_SEED_TAG,
    },
    select: {
      id: true,
    },
  });

  return created.id;
}

function resolveBankTaxTreatmentSource(seed: DevSeedTransaction): BankTransactionTaxTreatmentSource {
  if (seed.reviewStatus === "POSTED") {
    return "MANUAL";
  }

  if (
    seed.reviewStatus === "REVIEWED" &&
    seed.postingReadiness === "READY_TO_POST" &&
    (seed.suggestedVatTreatment || seed.suggestedWhtTreatment)
  ) {
    return "SUGGESTED";
  }

  return "UNSET";
}

function buildStoredTaxValues(seed: DevSeedTransaction) {
  const vatTreatment = seed.vatTreatment ?? "NONE";
  const whtTreatment = seed.whtTreatment ?? "NONE";
  const vatRate = seed.vatRate ?? 0;
  const whtRate = seed.whtRate ?? 0;

  return {
    vatTreatment,
    whtTreatment,
    vatRate,
    whtRate,
    vatAmountMinor:
      vatTreatment === "NONE" || vatTreatment === "EXEMPT"
        ? 0
        : computeInclusiveVatAmountMinor(seed.amountMinor, vatRate),
    whtAmountMinor:
      whtTreatment === "NONE" ? 0 : computeWithholdingAmountMinor(seed.amountMinor, whtRate),
  };
}

function resolveActualCategoryId(input: {
  seed: DevSeedTransaction;
  mappedCategoryId: number | null;
}) {
  if (!input.mappedCategoryId) return null;
  if (input.seed.reviewStatus === "POSTED") return input.mappedCategoryId;
  if (
    input.seed.reviewStatus === "REVIEWED" &&
    input.seed.postingReadiness === "READY_TO_POST"
  ) {
    return input.mappedCategoryId;
  }
  return null;
}

function resolveSuggestedCategoryId(input: {
  seed: DevSeedTransaction;
  mappedCategoryId: number | null;
}) {
  if (!input.mappedCategoryId) return null;
  if (resolveActualCategoryId(input)) return null;
  return input.mappedCategoryId;
}

function resolveSuggestedCategoryName(seed: DevSeedTransaction) {
  return seed.suggestedCategoryName ?? seed.categoryName ?? null;
}

function resolveSuggestedType(seed: DevSeedTransaction) {
  return seed.type === "CREDIT" ? "INCOME" : "EXPENSE";
}

function buildTaxRecordKind(seed: DevSeedTransaction) {
  if (seed.whtTreatment === "PAYABLE") return "WHT_PAYABLE";
  if (seed.whtTreatment === "RECEIVABLE") return "WHT_RECEIVABLE";
  if (seed.vatTreatment === "OUTPUT") return "VAT_OUTPUT";
  if (seed.vatTreatment === "INPUT") return "VAT_INPUT";
  if (seed.type === "CREDIT") return "INCOME";
  return "EXPENSE";
}

function buildSeedScenarios() {
  return [
    "Dashboard cards and monthly trend populated from posted March and current-month ledger activity.",
    "Review queue populated with imported, pending review, reviewed, and flagged transactions.",
    "Tax cards populated from real VAT output, input VAT, and WHT payable transactions.",
    "Smart alerts activate from duplicate transaction, unusual spike, unresolved review, tax-due-soon, and missing-evidence scenarios.",
    "Expense leak detection activates from recurring MTN spend, duplicate Microsoft charges, and Google Ads month-over-month spike.",
    "Explain-my-numbers can ground responses in current-vs-previous month revenue, expense, and tax movements.",
  ];
}

export async function seedPhase2DevWorkspace(
  prisma: PrismaClient,
  input: {
    workspaceId: number;
    actorUserId: number;
    resetExisting?: boolean;
  }
): Promise<DevWorkspaceSeedResult> {
  assertDevSeedAllowed();

  const fixture = buildPhase2DevWorkspaceFixture(new Date());

  return prisma.$transaction(async (db) => {
    const workspace = await db.workspace.findUnique({
      where: {
        id: input.workspaceId,
      },
      select: {
        id: true,
        name: true,
        archivedAt: true,
      },
    });

    if (!workspace || workspace.archivedAt) {
      throw new Error("Workspace not found or archived.");
    }

    if (input.resetExisting) {
      await resetSeededTransactionalData(db, input.workspaceId);
    }

    await ensureBusinessProfile(db, {
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
    });
    await ensureWorkspaceOnboarding(db, {
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
    });
    await ensureWorkspaceSubscription(db, input.workspaceId);

    const counters = buildSeedCounters();
    const businessesByKey = new Map<string, BusinessRecord>();
    const accountsByKey = new Map<string, BankAccountRecord>();
    const vendorsByKey = new Map<string, VendorRecord>();
    const transactionCategoriesByKey = new Map<string, TransactionCategoryRecord>();
    const expenseCategoriesByName = new Map<string, ExpenseCategoryRecord>();
    const bankTransactionsByKey = new Map<string, { id: number; transactionDate: Date }>();
    const taxPeriodsByKey = new Map<string, number>();

    for (const businessSeed of fixture.clientBusinesses) {
      const business = await findOrCreateClientBusiness(
        db,
        input.workspaceId,
        businessSeed,
        counters
      );
      businessesByKey.set(businessSeed.key, business);
    }

    for (const expenseCategorySeed of fixture.expenseCategories) {
      const category = await findOrCreateExpenseCategory(
        db,
        input.workspaceId,
        expenseCategorySeed.name,
        counters
      );
      expenseCategoriesByName.set(expenseCategorySeed.name, category);
    }

    for (const accountSeed of fixture.bankAccounts) {
      const business = businessesByKey.get(accountSeed.businessKey);
      if (!business) {
        throw new Error(`Missing client business for bank account ${accountSeed.key}.`);
      }

      const account = await findOrCreateBankAccount(
        db,
        input.workspaceId,
        business.id,
        accountSeed,
        counters
      );
      accountsByKey.set(accountSeed.key, account);
    }

    for (const vendorSeed of fixture.vendors) {
      const business = businessesByKey.get(vendorSeed.businessKey);
      if (!business) {
        throw new Error(`Missing client business for vendor ${vendorSeed.key}.`);
      }

      const vendor = await findOrCreateVendor(db, business.id, vendorSeed, counters);
      vendorsByKey.set(vendorSeed.key, vendor);
    }

    for (const categorySeed of fixture.transactionCategories) {
      const business = businessesByKey.get(categorySeed.businessKey);
      if (!business) {
        throw new Error(`Missing client business for transaction category ${categorySeed.name}.`);
      }

      const category = await findOrCreateTransactionCategory(
        db,
        business.id,
        categorySeed,
        counters
      );
      transactionCategoriesByKey.set(`${categorySeed.businessKey}:${categorySeed.name}`, category);
    }

    for (const uploadSeed of fixture.uploads) {
      const business = businessesByKey.get(uploadSeed.businessKey);
      if (!business) {
        throw new Error(`Missing client business for upload ${uploadSeed.key}.`);
      }

      await findOrCreateUpload(
        db,
        input.workspaceId,
        business.id,
        input.actorUserId,
        uploadSeed,
        counters
      );
    }

    for (const seed of fixture.transactions) {
      const business = businessesByKey.get(seed.businessKey);
      const bankAccount = accountsByKey.get(seed.accountKey);
      if (!business || !bankAccount) {
        throw new Error(`Missing business or bank account for transaction ${seed.key}.`);
      }

      const vendor = seed.vendorKey ? vendorsByKey.get(seed.vendorKey) ?? null : null;
      const mappedCategory =
        seed.categoryName
          ? transactionCategoriesByKey.get(`${seed.businessKey}:${seed.categoryName}`) ?? null
          : null;
      const expenseCategory =
        seed.expenseCategoryName
          ? expenseCategoriesByName.get(seed.expenseCategoryName) ?? null
          : null;
      const transactionDate = buildFixtureDate({
        monthOffset: seed.monthOffset,
        day: seed.day,
        hour: seed.hour,
      });
      const periodKey = buildPeriodKey(transactionDate);
      const taxPeriodMapKey = `${business.id}:${periodKey}`;
      let taxPeriodId = taxPeriodsByKey.get(taxPeriodMapKey);

      if (!taxPeriodId) {
        taxPeriodId = await findOrCreateTaxPeriod(db, {
          workspaceId: input.workspaceId,
          clientBusinessId: business.id,
          date: transactionDate,
        });
        taxPeriodsByKey.set(taxPeriodMapKey, taxPeriodId);
      }

      const possibleDuplicateOf =
        seed.duplicateOfKey ? bankTransactionsByKey.get(seed.duplicateOfKey) ?? null : null;
      const storedTax = buildStoredTaxValues(seed);
      const taxTreatmentSource = resolveBankTaxTreatmentSource(seed);
      const categoryId = resolveActualCategoryId({
        seed,
        mappedCategoryId: mappedCategory?.id ?? null,
      });
      const suggestedCategoryId = resolveSuggestedCategoryId({
        seed,
        mappedCategoryId: mappedCategory?.id ?? null,
      });
      const reviewedAt =
        seed.reviewStatus === "IMPORTED" || seed.reviewStatus === "PENDING_REVIEW"
          ? null
          : transactionDate;

      const bankTransactionData = {
        workspaceId: input.workspaceId,
        clientBusinessId: business.id,
        bankAccountId: bankAccount.id,
        uploadedByUserId: input.actorUserId,
        categoryId,
        suggestedCategoryId,
        transactionDate,
        description: seed.description,
        reference: seed.reference,
        amount: seed.amountMinor,
        debitAmountMinor: seed.type === "DEBIT" ? seed.amountMinor : null,
        creditAmountMinor: seed.type === "CREDIT" ? seed.amountMinor : null,
        balanceAmountMinor: null,
        type: seed.type,
        source: "CSV_IMPORT" as const,
        status: seed.status,
        reviewStatus: seed.reviewStatus,
        fingerprintHash: buildSeedFingerprintHash({
          bankAccountId: bankAccount.id,
          transactionDate,
          amountMinor: seed.amountMinor,
          type: seed.type,
          description: seed.description,
          reference: seed.reference,
        }),
        sourceRowNumber: null,
        rawRowPayload: JSON.stringify({
          seeded: true,
          seedKey: seed.key,
          tag: DEV_WORKSPACE_SEED_TAG,
        }),
        currency: bankAccount.currency,
        suggestedType: resolveSuggestedType(seed),
        suggestedCounterparty: seed.suggestedCounterparty ?? vendor?.name ?? null,
        suggestedCategoryName: resolveSuggestedCategoryName(seed),
        vatTreatment:
          taxTreatmentSource === "MANUAL" ? storedTax.vatTreatment : ("NONE" as const),
        whtTreatment:
          taxTreatmentSource === "MANUAL" ? storedTax.whtTreatment : ("NONE" as const),
        vatRate: taxTreatmentSource === "MANUAL" ? storedTax.vatRate : 0,
        whtRate: taxTreatmentSource === "MANUAL" ? storedTax.whtRate : 0,
        vatAmountMinor: taxTreatmentSource === "MANUAL" ? storedTax.vatAmountMinor : 0,
        whtAmountMinor: taxTreatmentSource === "MANUAL" ? storedTax.whtAmountMinor : 0,
        taxTreatmentSource,
        suggestedVatTreatment: seed.suggestedVatTreatment ?? seed.vatTreatment ?? "NONE",
        suggestedWhtTreatment: seed.suggestedWhtTreatment ?? seed.whtTreatment ?? "NONE",
        suggestedNarrationMeaning: `${DEV_WORKSPACE_SEED_TAG} ${seed.description}`,
        confidenceScore: seed.confidenceScore ?? null,
        categorizationProvider: "phase2-dev-seed",
        suggestionConfidence: seed.suggestionConfidence ?? null,
        suggestionReason: seed.suggestionReason ?? null,
        normalizedDescription: normalizeText(seed.description),
        normalizedMerchantName: normalizeText(
          seed.normalizedMerchantName ?? seed.suggestedCounterparty ?? seed.description
        ),
        autoBookkeepingConfidence: seed.autoBookkeepingConfidence ?? null,
        autoBookkeepingReason: seed.autoBookkeepingReason ?? null,
        autoBookkeepingProvider:
          seed.autoBookkeepingConfidence || seed.autoBookkeepingReason
            ? "phase2-dev-seed"
            : null,
        autoBookkeepingProcessedAt:
          seed.autoBookkeepingConfidence || seed.autoBookkeepingReason ? transactionDate : null,
        postingReadiness: seed.postingReadiness,
        duplicateConfidence: seed.duplicateConfidence ?? null,
        duplicateReason: seed.duplicateReason ?? null,
        suspiciousPatternScore: seed.suspiciousPatternScore ?? null,
        suspiciousPatternReason: seed.suspiciousPatternReason ?? null,
        reviewNotes: seed.reviewNotes ?? null,
        reviewedAt,
        reviewedByUserId: reviewedAt ? input.actorUserId : null,
        matchedAt: seed.status === "MATCHED" ? transactionDate : null,
        ignoredAt: null,
        possibleDuplicateOfTransactionId: possibleDuplicateOf?.id ?? null,
      } satisfies Prisma.BankTransactionUncheckedCreateInput;

      const existingBankTransaction = await db.bankTransaction.findFirst({
        where: {
          workspaceId: input.workspaceId,
          reference: seed.reference,
        },
        select: {
          id: true,
        },
      });

      const bankTransaction = existingBankTransaction
        ? await db.bankTransaction.update({
            where: {
              id: existingBankTransaction.id,
            },
            data: bankTransactionData,
            select: {
              id: true,
            },
          })
        : await db.bankTransaction.create({
            data: bankTransactionData,
            select: {
              id: true,
            },
          });

      incrementCounter(counters, "transactions", !existingBankTransaction);
      bankTransactionsByKey.set(seed.key, {
        id: bankTransaction.id,
        transactionDate,
      });

      let ledgerTransactionId: number | null = null;

      if (seed.createLedger) {
        const ledgerData = {
          clientBusinessId: business.id,
          vendorId: vendor?.id ?? null,
          categoryId: mappedCategory?.id ?? null,
          bankTransactionId: bankTransaction.id,
          createdByUserId: input.actorUserId,
          transactionDate,
          description: seed.description,
          reference: seed.reference,
          direction:
            seed.ledgerDirection ??
            (seed.type === "CREDIT" ? ("MONEY_IN" as const) : ("MONEY_OUT" as const)),
          amountMinor: seed.amountMinor,
          currency: bankAccount.currency,
          vatAmountMinor: storedTax.vatAmountMinor,
          whtAmountMinor: storedTax.whtAmountMinor,
          vatTreatment: storedTax.vatTreatment,
          whtTreatment: storedTax.whtTreatment,
          taxCategory: seed.taxCategory ?? null,
          taxEvidenceStatus: seed.taxEvidenceStatus ?? "ATTACHED",
          filingPeriodKey: periodKey,
          sourceDocumentNumber: seed.reference,
          origin: "IMPORT" as const,
          reviewStatus: seed.ledgerReviewStatus ?? "POSTED",
          notes: `${DEV_WORKSPACE_SEED_TAG} Seeded from workspace bank activity.`,
        } satisfies Prisma.LedgerTransactionUncheckedCreateInput;

        const existingLedger = await db.ledgerTransaction.findFirst({
          where: {
            clientBusinessId: business.id,
            reference: seed.reference,
          },
          select: {
            id: true,
          },
        });

        const ledgerTransaction = existingLedger
          ? await db.ledgerTransaction.update({
              where: {
                id: existingLedger.id,
              },
              data: ledgerData,
              select: {
                id: true,
              },
            })
          : await db.ledgerTransaction.create({
              data: ledgerData,
              select: {
                id: true,
              },
            });

        incrementCounter(counters, "ledgerTransactions", !existingLedger);
        ledgerTransactionId = ledgerTransaction.id;

        await db.bankTransaction.update({
          where: {
            id: bankTransaction.id,
          },
          data: {
            matchedLedgerTransactionId: ledgerTransaction.id,
            status: "MATCHED",
            reviewStatus: "POSTED",
            matchedAt: transactionDate,
            postingReadiness: "READY_TO_POST",
          },
        });
      }

      let taxRecordId: number | null = null;

      if (seed.createTaxRecord) {
        const existingTaxRecord = await db.taxRecord.findFirst({
          where: {
            workspaceId: input.workspaceId,
            source: DEV_WORKSPACE_SEED_SOURCE,
            sourceDocumentNumber: seed.reference,
          },
          select: {
            id: true,
          },
        });

        const taxRecordData = {
          userId: input.actorUserId,
          workspaceId: input.workspaceId,
          clientBusinessId: business.id,
          bankTransactionId: bankTransaction.id,
          categoryId: expenseCategory?.id ?? null,
          kind: buildTaxRecordKind(seed),
          amountKobo: seed.amountMinor,
          taxRate:
            storedTax.whtAmountMinor > 0
              ? storedTax.whtRate
              : storedTax.vatAmountMinor > 0
                ? storedTax.vatRate
                : 0,
          computedTax: storedTax.vatAmountMinor + storedTax.whtAmountMinor,
          netAmount: seed.amountMinor,
          currency: bankAccount.currency,
          occurredOn: transactionDate,
          description: seed.description,
          source: DEV_WORKSPACE_SEED_SOURCE,
          vendorName: vendor?.name ?? seed.suggestedCounterparty ?? null,
          recurring: seed.recurring ?? false,
          vatTreatment: storedTax.vatTreatment,
          whtTreatment: storedTax.whtTreatment,
          taxCategory: seed.taxCategory ?? null,
          taxEvidenceStatus: seed.taxEvidenceStatus ?? "PENDING",
          filingPeriodKey: periodKey,
          sourceDocumentNumber: seed.reference,
          taxReviewStatus: seed.taxReviewStatus ?? "UNREVIEWED",
          reviewNote: seed.reviewNotes ?? null,
          reviewedAt:
            seed.taxReviewStatus === "REVIEWED" || seed.taxReviewStatus === "OVERRIDDEN"
              ? transactionDate
              : null,
          reviewedByUserId:
            seed.taxReviewStatus === "REVIEWED" || seed.taxReviewStatus === "OVERRIDDEN"
              ? input.actorUserId
              : null,
        } satisfies Prisma.TaxRecordUncheckedCreateInput;

        const taxRecord = existingTaxRecord
          ? await db.taxRecord.update({
              where: {
                id: existingTaxRecord.id,
              },
              data: taxRecordData,
              select: {
                id: true,
              },
            })
          : await db.taxRecord.create({
              data: taxRecordData,
              select: {
                id: true,
              },
            });

        incrementCounter(counters, "taxRecords", !existingTaxRecord);
        taxRecordId = taxRecord.id;
      }

      if (seed.createVatRecord && storedTax.vatAmountMinor > 0) {
        const vatEngineKey = `${DEV_WORKSPACE_SEED_ENGINE_PREFIX}:vat:${input.workspaceId}:${seed.key}`;
        const existingVatRecord = await db.vATRecord.findUnique({
          where: {
            engineKey: vatEngineKey,
          },
          select: {
            id: true,
          },
        });

        const vatRecordData = {
          workspaceId: input.workspaceId,
          clientBusinessId: business.id,
          taxPeriodId,
          engineKey: vatEngineKey,
          sourceType: "BANK_TRANSACTION",
          sourceRecordId: bankTransaction.id,
          ledgerTransactionId,
          taxRecordId,
          bankTransactionId: bankTransaction.id,
          sourceDocumentNumber: seed.reference,
          counterpartyName: seed.suggestedCounterparty ?? null,
          taxCategory: seed.taxCategory ?? null,
          vatTreatment: storedTax.vatTreatment,
          direction: seed.type === "CREDIT" ? "OUTPUT" : "INPUT",
          basisAmountMinor: seed.amountMinor,
          vatAmountMinor: storedTax.vatAmountMinor,
          totalAmountMinor: seed.amountMinor,
          currency: bankAccount.currency,
          confidence: 0.95,
          flagsPayload: JSON.stringify({
            seeded: true,
            tag: DEV_WORKSPACE_SEED_TAG,
          }),
          reviewed: seed.reviewStatus === "POSTED",
          reviewedAt: seed.reviewStatus === "POSTED" ? transactionDate : null,
          reviewedByUserId: seed.reviewStatus === "POSTED" ? input.actorUserId : null,
          reviewNote: seed.reviewNotes ?? null,
        } satisfies Prisma.VATRecordUncheckedCreateInput;

        if (existingVatRecord) {
          await db.vATRecord.update({
            where: {
              id: existingVatRecord.id,
            },
            data: vatRecordData,
          });
        } else {
          await db.vATRecord.create({
            data: vatRecordData,
          });
          incrementCounter(counters, "vatRecords", true);
        }
      }

      if (seed.createWhtRecord && storedTax.whtAmountMinor > 0) {
        const whtEngineKey = `${DEV_WORKSPACE_SEED_ENGINE_PREFIX}:wht:${input.workspaceId}:${seed.key}`;
        const existingWhtRecord = await db.wHTRecord.findUnique({
          where: {
            engineKey: whtEngineKey,
          },
          select: {
            id: true,
          },
        });

        const whtRecordData = {
          workspaceId: input.workspaceId,
          clientBusinessId: business.id,
          taxPeriodId,
          engineKey: whtEngineKey,
          sourceType: "BANK_TRANSACTION",
          sourceRecordId: bankTransaction.id,
          ledgerTransactionId,
          taxRecordId,
          bankTransactionId: bankTransaction.id,
          sourceDocumentNumber: seed.reference,
          counterpartyName: seed.suggestedCounterparty ?? null,
          counterpartyTaxId: vendor?.taxIdentificationNumber ?? null,
          taxCategory: seed.taxCategory ?? null,
          whtTreatment: storedTax.whtTreatment,
          direction: storedTax.whtTreatment === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE",
          basisAmountMinor: seed.amountMinor,
          whtRate: storedTax.whtRate,
          whtAmountMinor: storedTax.whtAmountMinor,
          currency: bankAccount.currency,
          confidence: 0.95,
          flagsPayload: JSON.stringify({
            seeded: true,
            tag: DEV_WORKSPACE_SEED_TAG,
          }),
          reviewed: seed.reviewStatus === "POSTED",
          reviewedAt: seed.reviewStatus === "POSTED" ? transactionDate : null,
          reviewedByUserId: seed.reviewStatus === "POSTED" ? input.actorUserId : null,
          reviewNote: seed.reviewNotes ?? null,
        } satisfies Prisma.WHTRecordUncheckedCreateInput;

        if (existingWhtRecord) {
          await db.wHTRecord.update({
            where: {
              id: existingWhtRecord.id,
            },
            data: whtRecordData,
          });
        } else {
          await db.wHTRecord.create({
            data: whtRecordData,
          });
          incrementCounter(counters, "whtRecords", true);
        }
      }
    }

    const transactionSummary = {
      total: fixture.transactions.length,
      posted: fixture.transactions.filter((transaction) => transaction.reviewStatus === "POSTED")
        .length,
      pendingReview: fixture.transactions.filter(
        (transaction) => transaction.reviewStatus === "PENDING_REVIEW"
      ).length,
      flagged: fixture.transactions.filter((transaction) => transaction.reviewStatus === "FLAGGED")
        .length,
      reviewedReadyToPost: fixture.transactions.filter(
        (transaction) =>
          transaction.reviewStatus === "REVIEWED" &&
          transaction.postingReadiness === "READY_TO_POST"
      ).length,
    };

    return {
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
      actorUserId: input.actorUserId,
      actorEmail:
        (
          await db.user.findUnique({
            where: {
              id: input.actorUserId,
            },
            select: {
              email: true,
            },
          })
        )?.email ?? "unknown@local.dev",
      resetExisting: input.resetExisting ?? false,
      counters,
      transactionSummary,
      scenarios: buildSeedScenarios(),
    } satisfies DevWorkspaceSeedResult;
  });
}
