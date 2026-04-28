import "server-only";

import type {
  AccountingAccountClass,
  LedgerCategoryType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { ensureDefaultChartOfAccountsForWorkspace } from "@/lib/chart-of-accounts";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

export type PostingChartAccount = {
  id: number;
  code: string | null;
  name: string;
  accountClass: AccountingAccountClass;
};

export type PostingCategoryAccount = {
  id: number;
  name: string;
  type: LedgerCategoryType;
  code?: string | null;
};

export type BankTransactionAccountMappingResult =
  | {
      ok: true;
      bankAccount: PostingChartAccount;
      categoryAccount: PostingChartAccount;
      vatPayableAccount: PostingChartAccount | null;
      whtPayableAccount: PostingChartAccount | null;
      taxPayableAccount: PostingChartAccount | null;
    }
  | {
      ok: false;
      code:
        | "CATEGORY_REQUIRED"
        | "UNSUPPORTED_CATEGORY_TYPE"
        | "BANK_ACCOUNT_MISSING"
        | "CATEGORY_ACCOUNT_MISSING"
        | "TAX_ACCOUNT_MISSING";
      reason: string;
    };

const CATEGORY_TYPE_TO_ACCOUNT_CLASS: Partial<Record<LedgerCategoryType, AccountingAccountClass>> = {
  INCOME: "REVENUE",
  EXPENSE: "EXPENSE",
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
};

function normalizeString(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function findExactAccount(
  accounts: PostingChartAccount[],
  accountClass: AccountingAccountClass | null,
  name: string
) {
  const normalizedTarget = normalizeString(name);
  return (
    accounts.find(
      (account) =>
        (!accountClass || account.accountClass === accountClass) &&
        normalizeString(account.name) === normalizedTarget
    ) ?? null
  );
}

function findCodeAccount(
  accounts: PostingChartAccount[],
  accountClass: AccountingAccountClass | null,
  code: string | null | undefined
) {
  const normalizedCode = code?.trim().toUpperCase() ?? "";
  if (!normalizedCode) return null;

  return (
    accounts.find(
      (account) =>
        (!accountClass || account.accountClass === accountClass) &&
        (account.code?.trim().toUpperCase() ?? "") === normalizedCode
    ) ?? null
  );
}

function findNameContainsAccount(
  accounts: PostingChartAccount[],
  accountClass: AccountingAccountClass | null,
  patterns: string[]
) {
  const normalizedPatterns = patterns.map((pattern) => normalizeString(pattern)).filter(Boolean);
  if (normalizedPatterns.length === 0) return null;

  return (
    accounts.find(
      (account) =>
        (!accountClass || account.accountClass === accountClass) &&
        normalizedPatterns.some((pattern) => normalizeString(account.name).includes(pattern))
    ) ?? null
  );
}

function findFallbackAccount(
  accounts: PostingChartAccount[],
  accountClass: AccountingAccountClass
) {
  return accounts.find((account) => account.accountClass === accountClass) ?? null;
}

export async function getWorkspacePostingChartAccounts(
  db: PrismaExecutor,
  workspaceId: number
) {
  await ensureDefaultChartOfAccountsForWorkspace(db, workspaceId);

  return db.chartOfAccount.findMany({
    where: {
      workspaceId,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      accountClass: true,
    },
    orderBy: [{ accountClass: "asc" }, { name: "asc" }],
  });
}

function resolveCategoryAccount(
  accounts: PostingChartAccount[],
  category: PostingCategoryAccount
) {
  const accountClass = CATEGORY_TYPE_TO_ACCOUNT_CLASS[category.type];
  if (!accountClass) {
    return {
      ok: false as const,
      code: "UNSUPPORTED_CATEGORY_TYPE" as const,
      reason: `Category "${category.name}" uses the ${category.type} type, which is not ready for automatic posting.`,
    };
  }

  const normalizedName = normalizeString(category.name);
  const exactCodeMatch = findCodeAccount(accounts, accountClass, category.code);
  if (exactCodeMatch) {
    return {
      ok: true as const,
      account: exactCodeMatch,
    };
  }

  const exactNameMatch = findExactAccount(accounts, accountClass, category.name);
  if (exactNameMatch) {
    return {
      ok: true as const,
      account: exactNameMatch,
    };
  }

  if (accountClass === "REVENUE") {
    const revenueAccount =
      findExactAccount(accounts, "REVENUE", "Sales Revenue") ??
      findNameContainsAccount(accounts, "REVENUE", ["revenue", "sales", normalizedName]) ??
      findFallbackAccount(accounts, "REVENUE");

    if (revenueAccount) {
      return {
        ok: true as const,
        account: revenueAccount,
      };
    }
  }

  if (accountClass === "EXPENSE") {
    const expenseAccount =
      findCodeAccount(accounts, "EXPENSE", category.code) ??
      (/(rent|lease|occupancy)/.test(normalizedName)
        ? findExactAccount(accounts, "EXPENSE", "Rent Expense")
        : null) ??
      (/(utility|electric|power|water|internet|diesel)/.test(normalizedName)
        ? findExactAccount(accounts, "EXPENSE", "Utilities Expense")
        : null) ??
      findNameContainsAccount(accounts, "EXPENSE", [normalizedName]) ??
      findExactAccount(accounts, "EXPENSE", "Office Expense") ??
      findFallbackAccount(accounts, "EXPENSE");

    if (expenseAccount) {
      return {
        ok: true as const,
        account: expenseAccount,
      };
    }
  }

  const heuristicAccount =
    findNameContainsAccount(accounts, accountClass, [normalizedName]) ??
    findFallbackAccount(accounts, accountClass);

  if (heuristicAccount) {
    return {
      ok: true as const,
      account: heuristicAccount,
    };
  }

  return {
    ok: false as const,
    code: "CATEGORY_ACCOUNT_MISSING" as const,
    reason: `No active ${accountClass.toLowerCase()} account is mapped for category "${category.name}".`,
  };
}

export function resolveWorkspaceBankTransactionPostingAccountsFromChartAccounts(
  accounts: PostingChartAccount[],
  input: {
    category: PostingCategoryAccount | null;
    needsVatPayableAccount?: boolean;
    needsWhtPayableAccount?: boolean;
  }
): BankTransactionAccountMappingResult {
  if (!input.category) {
    return {
      ok: false,
      code: "CATEGORY_REQUIRED",
      reason: "Assign a reviewed category before posting this transaction.",
    };
  }

  const bankAccount =
    findExactAccount(accounts, "ASSET", "Bank") ??
    findCodeAccount(accounts, "ASSET", "1010") ??
    findCodeAccount(accounts, "ASSET", "1000") ??
    findNameContainsAccount(accounts, "ASSET", ["bank", "cash"]) ??
    findFallbackAccount(accounts, "ASSET");

  if (!bankAccount) {
    return {
      ok: false,
      code: "BANK_ACCOUNT_MISSING",
      reason: "No active bank or cash asset account is available for posting.",
    };
  }

  const categoryAccount = resolveCategoryAccount(accounts, input.category);
  if (!categoryAccount.ok) {
    return categoryAccount;
  }

  const taxPayableAccount =
    findExactAccount(accounts, "LIABILITY", "Tax Payable") ??
    findCodeAccount(accounts, "LIABILITY", "2100") ??
    findNameContainsAccount(accounts, "LIABILITY", ["tax payable", "tax"]) ??
    findFallbackAccount(accounts, "LIABILITY");
  const vatPayableAccount =
    findExactAccount(accounts, "LIABILITY", "VAT Payable") ??
    findCodeAccount(accounts, "LIABILITY", "2110") ??
    taxPayableAccount;
  const whtPayableAccount =
    findExactAccount(accounts, "LIABILITY", "WHT Payable") ??
    findCodeAccount(accounts, "LIABILITY", "2120") ??
    taxPayableAccount;

  if (input.needsVatPayableAccount && !vatPayableAccount) {
    return {
      ok: false,
      code: "TAX_ACCOUNT_MISSING",
      reason: "VAT metadata exists, but no liability account is available for VAT payable.",
    };
  }

  if (input.needsWhtPayableAccount && !whtPayableAccount) {
    return {
      ok: false,
      code: "TAX_ACCOUNT_MISSING",
      reason: "WHT metadata exists, but no liability account is available for WHT payable.",
    };
  }

  return {
    ok: true,
    bankAccount,
    categoryAccount: categoryAccount.account,
    taxPayableAccount,
    vatPayableAccount,
    whtPayableAccount,
  };
}

export async function resolveWorkspaceBankTransactionPostingAccounts(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    category: PostingCategoryAccount | null;
    needsVatPayableAccount?: boolean;
    needsWhtPayableAccount?: boolean;
    chartAccounts?: PostingChartAccount[];
  }
): Promise<BankTransactionAccountMappingResult> {
  const accounts = input.chartAccounts ?? (await getWorkspacePostingChartAccounts(db, input.workspaceId));

  return resolveWorkspaceBankTransactionPostingAccountsFromChartAccounts(accounts, {
    category: input.category,
    needsVatPayableAccount: input.needsVatPayableAccount,
    needsWhtPayableAccount: input.needsWhtPayableAccount,
  });
}
