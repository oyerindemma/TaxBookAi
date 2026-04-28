import type { AccountingAccountClass, CashflowActivityType } from "@prisma/client";

export type CashflowClassifiableAccount = {
  code: string | null;
  name: string;
  accountClass: AccountingAccountClass;
};

export type CounterpartyCashflowClassification = {
  activity: CashflowActivityType | "UNCLASSIFIED";
  source: "COUNTERPART_ACCOUNT" | "UNCLASSIFIED";
};

const CASH_CODE_PREFIXES = ["100", "101", "102"];
const OPERATING_ASSET_PATTERNS = [
  "receivable",
  "inventory",
  "stock",
  "prepaid",
  "deposit",
  "advance",
  "vat receivable",
  "wht receivable",
  "withholding",
  "tax receivable",
];
const INVESTING_ASSET_PATTERNS = [
  "equipment",
  "property",
  "plant",
  "vehicle",
  "furniture",
  "computer",
  "machine",
  "intangible",
  "investment",
  "land",
  "building",
  "leasehold",
  "fixed asset",
];
const FINANCING_LIABILITY_PATTERNS = [
  "loan",
  "borrowing",
  "overdraft",
  "debt",
  "lease liability",
  "note payable",
  "facility",
];
const OPERATING_LIABILITY_PATTERNS = [
  "accounts payable",
  "payable",
  "tax",
  "vat",
  "wht",
  "accrued",
  "payroll",
  "salary",
  "pension",
  "benefit",
];

function normalizeValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function matchesAnyPattern(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

export function isCashChartOfAccount(account: CashflowClassifiableAccount) {
  if (account.accountClass !== "ASSET") {
    return false;
  }

  const normalizedName = normalizeValue(account.name);
  const normalizedCode = account.code?.trim().toUpperCase() ?? "";

  if (
    normalizedName.includes("cash") ||
    normalizedName.includes("bank") ||
    normalizedName.includes("petty cash") ||
    normalizedName.includes("cash equivalent") ||
    normalizedName.includes("checking") ||
    normalizedName.includes("savings")
  ) {
    return true;
  }

  return CASH_CODE_PREFIXES.some((prefix) => normalizedCode.startsWith(prefix));
}

export function classifyCounterpartyAccountCashflow(
  account: CashflowClassifiableAccount
): CounterpartyCashflowClassification {
  const normalizedName = normalizeValue(account.name);

  if (isCashChartOfAccount(account)) {
    return {
      activity: "UNCLASSIFIED",
      source: "UNCLASSIFIED",
    };
  }

  if (account.accountClass === "REVENUE" || account.accountClass === "EXPENSE") {
    return {
      activity: "OPERATING",
      source: "COUNTERPART_ACCOUNT",
    };
  }

  if (account.accountClass === "EQUITY") {
    return {
      activity: "FINANCING",
      source: "COUNTERPART_ACCOUNT",
    };
  }

  if (account.accountClass === "ASSET") {
    if (matchesAnyPattern(normalizedName, OPERATING_ASSET_PATTERNS)) {
      return {
        activity: "OPERATING",
        source: "COUNTERPART_ACCOUNT",
      };
    }

    if (matchesAnyPattern(normalizedName, INVESTING_ASSET_PATTERNS)) {
      return {
        activity: "INVESTING",
        source: "COUNTERPART_ACCOUNT",
      };
    }

    return {
      activity: "UNCLASSIFIED",
      source: "UNCLASSIFIED",
    };
  }

  if (account.accountClass === "LIABILITY") {
    if (matchesAnyPattern(normalizedName, FINANCING_LIABILITY_PATTERNS)) {
      return {
        activity: "FINANCING",
        source: "COUNTERPART_ACCOUNT",
      };
    }

    if (matchesAnyPattern(normalizedName, OPERATING_LIABILITY_PATTERNS)) {
      return {
        activity: "OPERATING",
        source: "COUNTERPART_ACCOUNT",
      };
    }

    return {
      activity: "UNCLASSIFIED",
      source: "UNCLASSIFIED",
    };
  }

  return {
    activity: "UNCLASSIFIED",
    source: "UNCLASSIFIED",
  };
}
