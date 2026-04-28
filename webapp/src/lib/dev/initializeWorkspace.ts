import "server-only";

import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { logInfo } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { hasPrismaDatabaseSupport } from "@/lib/prisma-schema-compat";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type SampleTransactionSeed = {
  amount: number;
  type: "CREDIT" | "DEBIT";
  description: string;
  reference: string;
  suggestedType: "INCOME" | "EXPENSE";
  suggestedCategoryName: string;
  dayOffset: number;
};

type InitializeWorkspaceResult = {
  seeded: boolean;
  workspaceId: number;
  bankAccountId: number | null;
  bankAccountCreated: boolean;
  transactionsCreated: number;
};

type SampleTransactionSeedSupport = {
  supportsReference: boolean;
  supportsDebitAmount: boolean;
  supportsCreditAmount: boolean;
  supportsSource: boolean;
  supportsReviewStatus: boolean;
  supportsCurrency: boolean;
  supportsSuggestedType: boolean;
  supportsSuggestedCategoryName: boolean;
  supportsPostingReadiness: boolean;
  supportsAccountingPostingStatus: boolean;
  supportsFingerprintHash: boolean;
};

const DEFAULT_BANK_ACCOUNT_NAME = "Main Business Account";
const DEFAULT_BANK_NAME = "TaxBook Demo Bank";
const globalForWorkspaceInitialization = globalThis as typeof globalThis & {
  initializeWorkspacePromises?: Map<number, Promise<InitializeWorkspaceResult>>;
  sampleTransactionSeedSupportPromise?: Promise<SampleTransactionSeedSupport>;
};

const SAMPLE_TRANSACTIONS: SampleTransactionSeed[] = [
  {
    amount: 250_000,
    type: "CREDIT",
    description: "Client payment",
    reference: "TB-DEMO-001",
    suggestedType: "INCOME",
    suggestedCategoryName: "Client Revenue",
    dayOffset: 8,
  },
  {
    amount: 50_000,
    type: "DEBIT",
    description: "Office expenses",
    reference: "TB-DEMO-002",
    suggestedType: "EXPENSE",
    suggestedCategoryName: "Office Expenses",
    dayOffset: 6,
  },
  {
    amount: 120_000,
    type: "CREDIT",
    description: "Consulting revenue",
    reference: "TB-DEMO-003",
    suggestedType: "INCOME",
    suggestedCategoryName: "Consulting Revenue",
    dayOffset: 4,
  },
  {
    amount: 30_000,
    type: "DEBIT",
    description: "Transport",
    reference: "TB-DEMO-004",
    suggestedType: "EXPENSE",
    suggestedCategoryName: "Transport",
    dayOffset: 3,
  },
  {
    amount: 10_000,
    type: "DEBIT",
    description: "Utilities",
    reference: "TB-DEMO-005",
    suggestedType: "EXPENSE",
    suggestedCategoryName: "Utilities",
    dayOffset: 1,
  },
];

function isDevWorkspaceInitializationEnabled() {
  return process.env.NODE_ENV !== "production";
}

function buildSkippedInitializeWorkspaceResult(
  workspaceId: number
): InitializeWorkspaceResult {
  return {
    seeded: false,
    workspaceId,
    bankAccountId: null,
    bankAccountCreated: false,
    transactionsCreated: 0,
  };
}

function getWorkspaceInitializationPromises() {
  if (!globalForWorkspaceInitialization.initializeWorkspacePromises) {
    globalForWorkspaceInitialization.initializeWorkspacePromises = new Map();
  }

  return globalForWorkspaceInitialization.initializeWorkspacePromises;
}

async function loadSampleTransactionSeedSupport(): Promise<SampleTransactionSeedSupport> {
  const [
    supportsReference,
    supportsDebitAmount,
    supportsCreditAmount,
    supportsSource,
    supportsReviewStatus,
    supportsCurrency,
    supportsSuggestedType,
    supportsSuggestedCategoryName,
    supportsPostingReadiness,
    supportsAccountingPostingStatus,
    supportsFingerprintHash,
  ] = await Promise.all([
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.reference"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.debitAmountMinor"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.creditAmountMinor"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.source"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.reviewStatus"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.currency"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.suggestedType"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.suggestedCategoryName"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.postingReadiness"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.accountingPostingStatus"] }),
    hasPrismaDatabaseSupport({ columns: ["BankTransaction.fingerprintHash"] }),
  ]);

  return {
    supportsReference,
    supportsDebitAmount,
    supportsCreditAmount,
    supportsSource,
    supportsReviewStatus,
    supportsCurrency,
    supportsSuggestedType,
    supportsSuggestedCategoryName,
    supportsPostingReadiness,
    supportsAccountingPostingStatus,
    supportsFingerprintHash,
  };
}

function getSampleTransactionSeedSupport() {
  if (!globalForWorkspaceInitialization.sampleTransactionSeedSupportPromise) {
    globalForWorkspaceInitialization.sampleTransactionSeedSupportPromise =
      loadSampleTransactionSeedSupport().catch((error) => {
        globalForWorkspaceInitialization.sampleTransactionSeedSupportPromise = undefined;
        throw error;
      });
  }

  return globalForWorkspaceInitialization.sampleTransactionSeedSupportPromise;
}

function buildDemoAccountNumber(workspaceId: number) {
  return `TB-DEMO-${workspaceId}`;
}

function buildTransactionDate(dayOffset: number) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - dayOffset);
  return value;
}

function buildFingerprintHash(input: {
  workspaceId: number;
  bankAccountId: number;
  transactionDate: Date;
  amount: number;
  type: "CREDIT" | "DEBIT";
  description: string;
  reference: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.workspaceId,
        input.bankAccountId,
        input.transactionDate.toISOString().slice(0, 10),
        input.amount,
        input.type,
        input.description.trim().toLowerCase(),
        input.reference.trim().toLowerCase(),
      ].join("|")
    )
    .digest("hex");
}

async function findDefaultBankAccount(
  db: PrismaExecutor,
  workspaceId: number
) {
  const account = await db.bankAccount.findFirst({
    where: {
      workspaceId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      currency: true,
    },
  });

  return account
    ? {
        accountId: account.id,
        currency: account.currency || "NGN",
      }
    : null;
}

async function createDefaultBankAccount(
  db: PrismaExecutor,
  workspaceId: number
) {
  const clientBusiness = await db.clientBusiness.findFirst({
    where: {
      workspaceId,
      archivedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      defaultCurrency: true,
    },
  });

  const account = await db.bankAccount.create({
    data: {
      name: DEFAULT_BANK_ACCOUNT_NAME,
      workspaceId,
      clientBusinessId: clientBusiness?.id ?? null,
      bankName: DEFAULT_BANK_NAME,
      accountNumber: buildDemoAccountNumber(workspaceId),
      currency: clientBusiness?.defaultCurrency ?? "NGN",
    },
    select: {
      id: true,
      currency: true,
    },
  });

  return {
    accountId: account.id,
    currency: account.currency || "NGN",
  };
}

async function seedSampleTransactions(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    bankAccountId: number;
    currency: string;
  },
  support: SampleTransactionSeedSupport
) {
  const {
    supportsReference,
    supportsDebitAmount,
    supportsCreditAmount,
    supportsSource,
    supportsReviewStatus,
    supportsCurrency,
    supportsSuggestedType,
    supportsSuggestedCategoryName,
    supportsPostingReadiness,
    supportsAccountingPostingStatus,
    supportsFingerprintHash,
  } = support;

  const columns = [
    "workspaceId",
    "bankAccountId",
    "transactionDate",
    "description",
    "amount",
    "type",
    "status",
    "createdAt",
    "updatedAt",
  ];

  if (supportsReference) columns.push("reference");
  if (supportsDebitAmount) columns.push("debitAmountMinor");
  if (supportsCreditAmount) columns.push("creditAmountMinor");
  if (supportsSource) columns.push("source");
  if (supportsReviewStatus) columns.push("reviewStatus");
  if (supportsCurrency) columns.push("currency");
  if (supportsSuggestedType) columns.push("suggestedType");
  if (supportsSuggestedCategoryName) columns.push("suggestedCategoryName");
  if (supportsPostingReadiness) columns.push("postingReadiness");
  if (supportsAccountingPostingStatus) columns.push("accountingPostingStatus");
  if (supportsFingerprintHash) columns.push("fingerprintHash");

  const rows = SAMPLE_TRANSACTIONS.map((transaction) => {
    const transactionDate = buildTransactionDate(transaction.dayOffset);
    const values: unknown[] = [
      input.workspaceId,
      input.bankAccountId,
      transactionDate,
      transaction.description,
      transaction.amount,
      transaction.type,
      "UNMATCHED",
      transactionDate,
      transactionDate,
    ];

    if (supportsReference) values.push(transaction.reference);
    if (supportsDebitAmount) {
      values.push(transaction.type === "DEBIT" ? transaction.amount : null);
    }
    if (supportsCreditAmount) {
      values.push(transaction.type === "CREDIT" ? transaction.amount : null);
    }
    if (supportsSource) values.push("MANUAL");
    if (supportsReviewStatus) values.push("PENDING_REVIEW");
    if (supportsCurrency) values.push(input.currency);
    if (supportsSuggestedType) values.push(transaction.suggestedType);
    if (supportsSuggestedCategoryName) values.push(transaction.suggestedCategoryName);
    if (supportsPostingReadiness) values.push("NOT_READY");
    if (supportsAccountingPostingStatus) values.push("UNPOSTED");
    if (supportsFingerprintHash) {
      values.push(
        buildFingerprintHash({
          workspaceId: input.workspaceId,
          bankAccountId: input.bankAccountId,
          transactionDate,
          amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          reference: transaction.reference,
        })
      );
    }

    return values;
  });

  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const placeholders = rows
    .map((row, rowIndex) => {
      const baseIndex = rowIndex * columns.length;
      return `(${row.map((_, columnIndex) => `$${baseIndex + columnIndex + 1}`).join(", ")})`;
    })
    .join(", ");
  const flattenedValues = rows.flat();
  const sql = `insert into "BankTransaction" (${quotedColumns}) values ${placeholders} on conflict do nothing`;
  const result = await db.$executeRawUnsafe(sql, ...flattenedValues);

  return Number(result);
}

async function initializeWorkspaceIfEmptyInternal(
  workspaceId: number
): Promise<InitializeWorkspaceResult> {
  const [existingAccount, existingTransactionCount] = await withPrismaRetry(
    () =>
      Promise.all([
        findDefaultBankAccount(prisma, workspaceId),
        prisma.bankTransaction.count({
          where: {
            workspaceId,
          },
        }),
      ]),
    {
      label: `initialize_workspace_precheck_${workspaceId}`,
      attempts: 2,
      baseDelayMs: 250,
    }
  );

  if (existingAccount && existingTransactionCount > 0) {
    return {
      seeded: false,
      workspaceId,
      bankAccountId: existingAccount.accountId,
      bankAccountCreated: false,
      transactionsCreated: 0,
    };
  }

  const sampleTransactionSeedSupport =
    existingTransactionCount === 0 ? await getSampleTransactionSeedSupport() : null;

  const currentCounts = await withPrismaRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const [existingAccountInTransaction, transactionCount] = await Promise.all([
          findDefaultBankAccount(tx, workspaceId),
          tx.bankTransaction.count({
            where: {
              workspaceId,
            },
          }),
        ]);

        if (existingAccountInTransaction && transactionCount > 0) {
          return {
            seeded: false,
            bankAccountId: existingAccountInTransaction.accountId,
            bankAccountCreated: false,
            transactionsCreated: 0,
          };
        }

        const account = existingAccountInTransaction ?? (await createDefaultBankAccount(tx, workspaceId));
        const transactionsCreated =
          transactionCount === 0 && sampleTransactionSeedSupport
            ? await seedSampleTransactions(
                tx,
                {
                  workspaceId,
                  bankAccountId: account.accountId,
                  currency: account.currency,
                },
                sampleTransactionSeedSupport
              )
            : 0;

        return {
          seeded: !existingAccountInTransaction || transactionsCreated > 0,
          bankAccountId: account.accountId,
          bankAccountCreated: !existingAccountInTransaction,
          transactionsCreated,
        };
      }),
    {
      label: `initialize_workspace_transaction_${workspaceId}`,
      attempts: 2,
      baseDelayMs: 300,
    }
  );

  if (currentCounts.seeded) {
    logInfo("dev-initialize-workspace", "Initialized empty workspace with demo banking data.", {
      workspaceId,
      bankAccountId: currentCounts.bankAccountId,
      bankAccountCreated: currentCounts.bankAccountCreated,
      transactionsCreated: currentCounts.transactionsCreated,
    });
  }

  return {
    seeded: currentCounts.seeded,
    workspaceId,
    bankAccountId: currentCounts.bankAccountId,
    bankAccountCreated: currentCounts.bankAccountCreated,
    transactionsCreated: currentCounts.transactionsCreated,
  };
}

export async function initializeWorkspaceIfEmpty(
  workspaceId: number
): Promise<InitializeWorkspaceResult> {
  if (!isDevWorkspaceInitializationEnabled()) {
    return buildSkippedInitializeWorkspaceResult(workspaceId);
  }

  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return buildSkippedInitializeWorkspaceResult(workspaceId);
  }

  const inflightPromises = getWorkspaceInitializationPromises();
  const existingPromise = inflightPromises.get(workspaceId);

  if (existingPromise) {
    return existingPromise;
  }

  const promise = initializeWorkspaceIfEmptyInternal(workspaceId).finally(() => {
    if (inflightPromises.get(workspaceId) === promise) {
      inflightPromises.delete(workspaceId);
    }
  });

  inflightPromises.set(workspaceId, promise);

  return promise;
}
