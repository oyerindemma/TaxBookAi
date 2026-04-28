import "server-only";

import type { AccountingAccountClass, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ChartOfAccountsClient = PrismaClient | Prisma.TransactionClient;

export type DefaultChartOfAccountDefinition = {
  code: string;
  name: string;
  accountClass: AccountingAccountClass;
  description: string;
};

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultChartOfAccountDefinition[] = [
  {
    code: "1000",
    name: "Cash",
    accountClass: "ASSET",
    description: "Cash on hand and short-term liquid balances.",
  },
  {
    code: "1010",
    name: "Bank",
    accountClass: "ASSET",
    description: "Operating bank balances.",
  },
  {
    code: "1100",
    name: "Accounts Receivable",
    accountClass: "ASSET",
    description: "Amounts billed but not yet collected from customers.",
  },
  {
    code: "2000",
    name: "Accounts Payable",
    accountClass: "LIABILITY",
    description: "Amounts owed to suppliers and vendors.",
  },
  {
    code: "2100",
    name: "Tax Payable",
    accountClass: "LIABILITY",
    description: "Taxes collected or accrued but not yet remitted.",
  },
  {
    code: "2110",
    name: "VAT Payable",
    accountClass: "LIABILITY",
    description: "VAT collected or accrued and awaiting remittance.",
  },
  {
    code: "2120",
    name: "WHT Payable",
    accountClass: "LIABILITY",
    description: "Withholding tax collected or accrued and awaiting remittance.",
  },
  {
    code: "3000",
    name: "Owner Equity",
    accountClass: "EQUITY",
    description: "Owner capital introduced into the business.",
  },
  {
    code: "3100",
    name: "Retained Earnings",
    accountClass: "EQUITY",
    description: "Accumulated profits retained in the business.",
  },
  {
    code: "4000",
    name: "Sales Revenue",
    accountClass: "REVENUE",
    description: "Income earned from normal operating activities.",
  },
  {
    code: "6000",
    name: "Operating Expense",
    accountClass: "EXPENSE",
    description: "General operating expenses for the business.",
  },
  {
    code: "6100",
    name: "Office Expense",
    accountClass: "EXPENSE",
    description: "General office operating costs.",
  },
  {
    code: "6200",
    name: "Rent Expense",
    accountClass: "EXPENSE",
    description: "Rent and occupancy costs.",
  },
  {
    code: "6300",
    name: "Utilities Expense",
    accountClass: "EXPENSE",
    description: "Utilities and similar recurring service costs.",
  },
];

const DEFAULT_ACCOUNT_BY_NAME = new Map(
  DEFAULT_CHART_OF_ACCOUNTS.map((account) => [account.name.toLowerCase(), account] as const)
);

export function normalizeChartOfAccountName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeChartOfAccountCode(code: string | null | undefined) {
  return code?.trim().toUpperCase() || null;
}

export function getDefaultChartOfAccountDefinition(name: string) {
  return DEFAULT_ACCOUNT_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export function getDefaultChartOfAccountNamesByClass(accountClass: AccountingAccountClass) {
  return DEFAULT_CHART_OF_ACCOUNTS.filter((account) => account.accountClass === accountClass).map(
    (account) => account.name
  );
}

export async function seedDefaultChartOfAccounts(
  db: ChartOfAccountsClient,
  workspaceId: number
) {
  try {
    const existing = await db.chartOfAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        code: true,
        name: true,
        accountClass: true,
        description: true,
        isSystemDefault: true,
      },
    });

    const existingByName = new Map(
      existing.map((account) => [account.name.trim().toLowerCase(), account] as const)
    );
    const updates = DEFAULT_CHART_OF_ACCOUNTS.flatMap((account) => {
      const current = existingByName.get(account.name.toLowerCase());
      if (!current) return [];

      const normalizedCode = normalizeChartOfAccountCode(current.code);
      if (
        normalizedCode === account.code &&
        current.accountClass === account.accountClass &&
        current.description === account.description &&
        current.isSystemDefault
      ) {
        return [];
      }

      return [
        db.chartOfAccount.update({
          where: { id: current.id },
          data: {
            code: account.code,
            accountClass: account.accountClass,
            description: account.description,
            isSystemDefault: true,
            isActive: true,
          },
        }),
      ];
    });

    await Promise.all(updates);

    const missing = DEFAULT_CHART_OF_ACCOUNTS.filter(
      (account) => !existingByName.has(account.name.toLowerCase())
    );

    if (missing.length === 0) return existing;

    await db.chartOfAccount.createMany({
      data: missing.map((account) => ({
        workspaceId,
        code: account.code,
        name: account.name,
        accountClass: account.accountClass,
        description: account.description,
        isSystemDefault: true,
      })),
      skipDuplicates: true,
    });

    return db.chartOfAccount.findMany({
      where: { workspaceId },
      select: { id: true },
    });
  } catch (error) {
    console.error("Chart of accounts seed failed:", error);
    return [];
  }
}

export async function ensureDefaultChartOfAccountsForWorkspace(
  dbOrWorkspaceId: ChartOfAccountsClient | number,
  maybeWorkspaceId?: number
) {
  const db = typeof dbOrWorkspaceId === "number" ? prisma : dbOrWorkspaceId;
  const workspaceId =
    typeof dbOrWorkspaceId === "number" ? dbOrWorkspaceId : maybeWorkspaceId;

  if (!workspaceId || !Number.isInteger(workspaceId) || workspaceId <= 0) {
    return [];
  }

  return seedDefaultChartOfAccounts(db, workspaceId);
}
