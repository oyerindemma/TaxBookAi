import "server-only";

import type { CashflowActivityType, Prisma } from "@prisma/client";
import { getWorkspaceAccountingReportsSnapshot } from "@/lib/accounting-reports";
import type {
  BalanceSheetLine as AccountingBalanceSheetLine,
  BalanceSheetReport as AccountingBalanceSheetReport,
  CashflowReport as AccountingCashflowReport,
  CashflowSection as AccountingCashflowSection,
  CashflowSectionLine as AccountingCashflowSectionLine,
  ProfitLossLine as AccountingProfitLossLine,
  ProfitLossReport as AccountingProfitLossReport,
} from "@/lib/accounting-report-types";
import { prisma } from "@/lib/prisma";
import { resolveAccountingReportPeriod } from "@/lib/report-period";
import { resolveDateRange } from "@/lib/tax-reporting";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";

const INVOICE_REFERENCE_PREFIX = "INVOICE:";

const financialReportLedgerSelect = {
  id: true,
  clientBusinessId: true,
  transactionDate: true,
  description: true,
  reference: true,
  direction: true,
  amountMinor: true,
  currency: true,
  bankTransactionId: true,
  category: {
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      cashflowActivity: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

const financialReportAccountSelect = {
  id: true,
  clientBusinessId: true,
  name: true,
  code: true,
  type: true,
  cashflowActivity: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
} satisfies Prisma.TransactionCategorySelect;

type FinancialReportLedgerRecord = Prisma.LedgerTransactionGetPayload<{
  select: typeof financialReportLedgerSelect;
}>;

type FinancialReportAccountRecord = Prisma.TransactionCategoryGetPayload<{
  select: typeof financialReportAccountSelect;
}>;

type ReportAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | "OTHER";
type SourceAccountType =
  | FinancialReportAccountRecord["type"]
  | NonNullable<FinancialReportLedgerRecord["category"]>["type"];

type StatementLine = {
  key: string;
  accountId: number | null;
  accountName: string;
  code: string | null;
  type: ReportAccountType;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  cashflowActivity: CashflowActivityType | null;
  amountMinor: number;
  transactionCount: number;
  inferred: boolean;
};

type StatementLineMap = Map<string, StatementLine>;

type FinancialReportDateInput = {
  fromParam?: string | null;
  toParam?: string | null;
};

export type ChartOfAccountSummary = {
  id: number;
  clientBusinessId: number;
  clientBusinessName: string;
  name: string;
  code: string | null;
  type: ReportAccountType;
  cashflowActivity: CashflowActivityType;
  periodTransactionCount: number;
  periodNetAmountMinor: number;
  balanceAsOfMinor: number;
};

export type ProfitAndLossStatement = {
  revenue: StatementLine[];
  expenses: StatementLine[];
  totals: {
    revenueMinor: number;
    expenseMinor: number;
    netProfitMinor: number;
  };
  transactionCount: number;
  unmappedTransactionCount: number;
  empty: boolean;
};

export type CashflowSection = {
  activity: CashflowActivityType;
  label: string;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  lines: StatementLine[];
};

export type CashflowStatement = {
  sections: CashflowSection[];
  unclassified: {
    inflowMinor: number;
    outflowMinor: number;
    netMinor: number;
    lines: StatementLine[];
  };
  totals: {
    inflowMinor: number;
    outflowMinor: number;
    netMinor: number;
  };
  excludedTransferCount: number;
  excludedTransferNetMinor: number;
  empty: boolean;
};

export type BalanceSheetStatement = {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totals: {
    assetsMinor: number;
    liabilitiesMinor: number;
    equityMinor: number;
    liabilitiesAndEquityMinor: number;
  };
  retainedEarningsMinor: number;
  balancingDifferenceMinor: number;
  empty: boolean;
};

export type FinancialReportsSnapshot = {
  workspaceId: number;
  currency: string;
  fromParam?: string;
  toParam?: string;
  fromDate: Date | null;
  toDate: Date | null;
  asOfDate: Date;
  generatedAt: string;
  errorMsg: string | null;
  chartOfAccounts: {
    countsByType: Record<ReportAccountType, number>;
    accounts: ChartOfAccountSummary[];
  };
  profitAndLoss: ProfitAndLossStatement;
  cashflow: CashflowStatement;
  balanceSheet: BalanceSheetStatement;
  isEmpty: boolean;
};

type AccountDescriptor = {
  accountId: number | null;
  accountName: string;
  code: string | null;
  type: ReportAccountType;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  cashflowActivity: CashflowActivityType | null;
  inferred?: boolean;
};

function normalizeSearchParam(raw: string | string[] | undefined) {
  return typeof raw === "string" ? raw : undefined;
}

export function normalizeFinancialReportSearchParam(raw: string | string[] | undefined) {
  return normalizeSearchParam(raw);
}

function resolveAccountType(type: SourceAccountType) {
  if (type === "INCOME") return "REVENUE" satisfies ReportAccountType;
  if (type === "EXPENSE") return "EXPENSE" satisfies ReportAccountType;
  if (type === "ASSET") return "ASSET" satisfies ReportAccountType;
  if (type === "LIABILITY") return "LIABILITY" satisfies ReportAccountType;
  if (type === "EQUITY") return "EQUITY" satisfies ReportAccountType;
  return "OTHER" satisfies ReportAccountType;
}

function getCashSign(direction: FinancialReportLedgerRecord["direction"]) {
  if (direction === "MONEY_IN") return 1;
  if (direction === "MONEY_OUT") return -1;
  return 0;
}

function isMoneyMovement(record: FinancialReportLedgerRecord) {
  return getCashSign(record.direction) !== 0;
}

function isInvoiceRevenueRecord(record: FinancialReportLedgerRecord) {
  return Boolean(record.reference?.startsWith(INVOICE_REFERENCE_PREFIX));
}

function isCashLikeAccountName(name: string | null | undefined) {
  const normalized = name?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  return normalized.includes("cash") || normalized.includes("bank");
}

function isTransferLikeRecord(record: FinancialReportLedgerRecord) {
  const normalizedName = record.category?.name?.trim().toLowerCase() ?? "";
  const normalizedDescription = `${record.description} ${record.reference ?? ""}`.toLowerCase();
  return normalizedName.includes("transfer") || /\btransfer\b|\bsweep\b/.test(normalizedDescription);
}

function createLineKey(descriptor: AccountDescriptor) {
  if (descriptor.accountId) {
    return `account:${descriptor.accountId}`;
  }

  return [
    descriptor.type,
    descriptor.clientBusinessId ?? "workspace",
    descriptor.code ?? "no-code",
    descriptor.accountName.toLowerCase(),
  ].join(":");
}

function upsertStatementLine(map: StatementLineMap, descriptor: AccountDescriptor, amountMinor: number) {
  if (amountMinor === 0) return;

  const key = createLineKey(descriptor);
  const existing = map.get(key);
  if (existing) {
    existing.amountMinor += amountMinor;
    existing.transactionCount += 1;
    existing.inferred = existing.inferred && Boolean(descriptor.inferred);
    return;
  }

  map.set(key, {
    key,
    accountId: descriptor.accountId,
    accountName: descriptor.accountName,
    code: descriptor.code,
    type: descriptor.type,
    clientBusinessId: descriptor.clientBusinessId,
    clientBusinessName: descriptor.clientBusinessName,
    cashflowActivity: descriptor.cashflowActivity,
    amountMinor,
    transactionCount: 1,
    inferred: Boolean(descriptor.inferred),
  });
}

function sortStatementLines(lines: StatementLine[]) {
  return [...lines].sort((left, right) => {
    const leftCode = left.code ?? "";
    const rightCode = right.code ?? "";
    if (leftCode && rightCode && leftCode !== rightCode) {
      return leftCode.localeCompare(rightCode);
    }

    if (left.clientBusinessName !== right.clientBusinessName) {
      return (left.clientBusinessName ?? "").localeCompare(right.clientBusinessName ?? "");
    }

    const amountDelta = Math.abs(right.amountMinor) - Math.abs(left.amountMinor);
    if (amountDelta !== 0) return amountDelta;

    return left.accountName.localeCompare(right.accountName);
  });
}

function toStatementLines(map: StatementLineMap) {
  return sortStatementLines(Array.from(map.values()).filter((line) => line.amountMinor !== 0));
}

function buildRevenueFallbackDescriptor(record: FinancialReportLedgerRecord): AccountDescriptor {
  return {
    accountId: null,
    accountName: "Revenue",
    code: "4000",
    type: "REVENUE",
    clientBusinessId: record.clientBusiness.id,
    clientBusinessName: record.clientBusiness.name,
    cashflowActivity: "OPERATING",
    inferred: true,
  };
}

function resolveProfitAndLossDescriptor(record: FinancialReportLedgerRecord) {
  const category = record.category;
  if (!category) {
    return isInvoiceRevenueRecord(record) ? buildRevenueFallbackDescriptor(record) : null;
  }

  const type = resolveAccountType(category.type);
  if (type !== "REVENUE" && type !== "EXPENSE") {
    return isInvoiceRevenueRecord(record) ? buildRevenueFallbackDescriptor(record) : null;
  }

  return {
    accountId: category.id,
    accountName: category.name,
    code: category.code,
    type,
    clientBusinessId: record.clientBusiness.id,
    clientBusinessName: record.clientBusiness.name,
    cashflowActivity: category.cashflowActivity,
    inferred: false,
  } satisfies AccountDescriptor;
}

function resolveCashflowDescriptor(record: FinancialReportLedgerRecord) {
  if (isTransferLikeRecord(record)) {
    return null;
  }

  const category = record.category;
  if (!category) {
    if (isInvoiceRevenueRecord(record)) {
      return buildRevenueFallbackDescriptor(record);
    }

    return {
      accountId: null,
      accountName: "Unmapped cash movement",
      code: null,
      type: "OTHER",
      clientBusinessId: record.clientBusiness.id,
      clientBusinessName: record.clientBusiness.name,
      cashflowActivity: "OPERATING",
      inferred: true,
    } satisfies AccountDescriptor;
  }

  return {
    accountId: category.id,
    accountName: category.name,
    code: category.code,
    type: resolveAccountType(category.type),
    clientBusinessId: record.clientBusiness.id,
    clientBusinessName: record.clientBusiness.name,
    cashflowActivity: category.cashflowActivity,
    inferred: false,
  } satisfies AccountDescriptor;
}

function resolveCashflowActivity(descriptor: AccountDescriptor) {
  if (descriptor.cashflowActivity) return descriptor.cashflowActivity;
  if (descriptor.type === "ASSET") return "INVESTING" satisfies CashflowActivityType;
  if (descriptor.type === "LIABILITY" || descriptor.type === "EQUITY") {
    return "FINANCING" satisfies CashflowActivityType;
  }
  return "OPERATING" satisfies CashflowActivityType;
}

function resolveCurrency(
  records: FinancialReportLedgerRecord[],
  accounts: FinancialReportAccountRecord[]
) {
  const currencies = new Set<string>();

  for (const record of records) {
    if (record.currency) {
      currencies.add(record.currency.trim().toUpperCase());
    }
  }

  if (currencies.size === 0) {
    for (const account of accounts) {
      if (account.clientBusiness.defaultCurrency) {
        currencies.add(account.clientBusiness.defaultCurrency.trim().toUpperCase());
      }
    }
  }

  if (currencies.size === 0) return "NGN";
  return currencies.size === 1 ? Array.from(currencies)[0] : "MIXED";
}

function createStatementSections() {
  return {
    OPERATING: new Map<string, StatementLine>(),
    INVESTING: new Map<string, StatementLine>(),
    FINANCING: new Map<string, StatementLine>(),
  } satisfies Record<CashflowActivityType, StatementLineMap>;
}

function buildProfitAndLoss(records: FinancialReportLedgerRecord[]): ProfitAndLossStatement {
  const revenueMap = new Map<string, StatementLine>();
  const expenseMap = new Map<string, StatementLine>();
  let transactionCount = 0;
  let unmappedTransactionCount = 0;

  for (const record of records) {
    if (!isMoneyMovement(record)) continue;

    const descriptor = resolveProfitAndLossDescriptor(record);
    if (!descriptor) {
      if (!record.category) {
        unmappedTransactionCount += 1;
      }
      continue;
    }

    const signedAmount = record.amountMinor * getCashSign(record.direction);
    if (descriptor.type === "REVENUE") {
      upsertStatementLine(revenueMap, descriptor, signedAmount);
    } else {
      upsertStatementLine(expenseMap, descriptor, signedAmount * -1);
    }

    transactionCount += 1;
  }

  const revenue = toStatementLines(revenueMap);
  const expenses = toStatementLines(expenseMap);
  const revenueMinor = revenue.reduce((sum, line) => sum + line.amountMinor, 0);
  const expenseMinor = expenses.reduce((sum, line) => sum + line.amountMinor, 0);

  return {
    revenue,
    expenses,
    totals: {
      revenueMinor,
      expenseMinor,
      netProfitMinor: revenueMinor - expenseMinor,
    },
    transactionCount,
    unmappedTransactionCount,
    empty: revenue.length === 0 && expenses.length === 0,
  };
}

function buildCashflow(records: FinancialReportLedgerRecord[]): CashflowStatement {
  const sectionMaps = createStatementSections();
  let excludedTransferCount = 0;
  let excludedTransferNetMinor = 0;

  for (const record of records) {
    if (!isMoneyMovement(record)) continue;

    if (isTransferLikeRecord(record)) {
      excludedTransferCount += 1;
      excludedTransferNetMinor += record.amountMinor * getCashSign(record.direction);
      continue;
    }

    const descriptor = resolveCashflowDescriptor(record);
    if (!descriptor) continue;

    const activity = resolveCashflowActivity(descriptor);
    const signedAmount = record.amountMinor * getCashSign(record.direction);
    upsertStatementLine(sectionMaps[activity], descriptor, signedAmount);
  }

  const sections: CashflowSection[] = ([
    ["OPERATING", "Operating activities"],
    ["INVESTING", "Investing activities"],
    ["FINANCING", "Financing activities"],
  ] as const).map(([activity, label]) => {
    const lines = toStatementLines(sectionMaps[activity]);
    return {
      activity,
      label,
      inflowMinor: lines.reduce(
        (sum, line) => sum + (line.amountMinor > 0 ? line.amountMinor : 0),
        0
      ),
      outflowMinor: lines.reduce(
        (sum, line) => sum + (line.amountMinor < 0 ? Math.abs(line.amountMinor) : 0),
        0
      ),
      netMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
      lines,
    };
  });

  return {
    sections,
    unclassified: {
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
      lines: [],
    },
    totals: {
      inflowMinor: sections.reduce((sum, section) => sum + section.inflowMinor, 0),
      outflowMinor: sections.reduce((sum, section) => sum + section.outflowMinor, 0),
      netMinor: sections.reduce((sum, section) => sum + section.netMinor, 0),
    },
    excludedTransferCount,
    excludedTransferNetMinor,
    empty: sections.every((section) => section.lines.length === 0),
  };
}

function buildBalanceSheet(
  records: FinancialReportLedgerRecord[],
  retainedEarningsMinor: number
): BalanceSheetStatement {
  const assetMap = new Map<string, StatementLine>();
  const liabilityMap = new Map<string, StatementLine>();
  const equityMap = new Map<string, StatementLine>();
  let cashBalanceMinor = 0;

  for (const record of records) {
    const cashSign = getCashSign(record.direction);
    if (cashSign !== 0) {
      cashBalanceMinor += record.amountMinor * cashSign;
    }

    const category = record.category;
    if (!category || cashSign === 0) continue;

    const descriptor = {
      accountId: category.id,
      accountName: category.name,
      code: category.code,
      type: resolveAccountType(category.type),
      clientBusinessId: record.clientBusiness.id,
      clientBusinessName: record.clientBusiness.name,
      cashflowActivity: category.cashflowActivity,
      inferred: false,
    } satisfies AccountDescriptor;

    if (descriptor.type === "ASSET") {
      if (isCashLikeAccountName(descriptor.accountName)) continue;
      upsertStatementLine(assetMap, descriptor, record.amountMinor * cashSign * -1);
      continue;
    }

    if (descriptor.type === "LIABILITY" || descriptor.type === "EQUITY") {
      const targetMap = descriptor.type === "LIABILITY" ? liabilityMap : equityMap;
      upsertStatementLine(targetMap, descriptor, record.amountMinor * cashSign);
    }
  }

  const assets = toStatementLines(assetMap);
  if (cashBalanceMinor !== 0 || records.length > 0) {
    assets.unshift({
      key: "cash-and-cash-equivalents",
      accountId: null,
      accountName: "Cash and cash equivalents",
      code: "1000",
      type: "ASSET",
      clientBusinessId: null,
      clientBusinessName: null,
      cashflowActivity: "OPERATING",
      amountMinor: cashBalanceMinor,
      transactionCount: records.filter(isMoneyMovement).length,
      inferred: true,
    });
  }

  const liabilities = toStatementLines(liabilityMap);
  const equity = toStatementLines(equityMap);

  if (retainedEarningsMinor !== 0 || records.length > 0) {
    equity.push({
      key: "retained-earnings",
      accountId: null,
      accountName: "Retained earnings",
      code: "3200",
      type: "EQUITY",
      clientBusinessId: null,
      clientBusinessName: null,
      cashflowActivity: "OPERATING",
      amountMinor: retainedEarningsMinor,
      transactionCount: 0,
      inferred: true,
    });
  }

  let assetsMinor = assets.reduce((sum, line) => sum + line.amountMinor, 0);
  const liabilitiesMinor = liabilities.reduce((sum, line) => sum + line.amountMinor, 0);
  let equityMinor = equity.reduce((sum, line) => sum + line.amountMinor, 0);
  let balancingDifferenceMinor = assetsMinor - (liabilitiesMinor + equityMinor);

  if (balancingDifferenceMinor !== 0) {
    equity.push({
      key: "unclassified-balance",
      accountId: null,
      accountName: "Unclassified balance",
      code: null,
      type: "EQUITY",
      clientBusinessId: null,
      clientBusinessName: null,
      cashflowActivity: "OPERATING",
      amountMinor: balancingDifferenceMinor,
      transactionCount: 0,
      inferred: true,
    });
    equityMinor += balancingDifferenceMinor;
    balancingDifferenceMinor = assetsMinor - (liabilitiesMinor + equityMinor);
  }

  assetsMinor = assets.reduce((sum, line) => sum + line.amountMinor, 0);

  return {
    assets,
    liabilities,
    equity: sortStatementLines(equity),
    totals: {
      assetsMinor,
      liabilitiesMinor,
      equityMinor,
      liabilitiesAndEquityMinor: liabilitiesMinor + equityMinor,
    },
    retainedEarningsMinor,
    balancingDifferenceMinor,
    empty: assets.length === 0 && liabilities.length === 0 && equity.length === 0,
  };
}

function buildChartOfAccounts(input: {
  accounts: FinancialReportAccountRecord[];
  periodRecords: FinancialReportLedgerRecord[];
  asOfRecords: FinancialReportLedgerRecord[];
}) {
  const countsByType: Record<ReportAccountType, number> = {
    ASSET: 0,
    LIABILITY: 0,
    EQUITY: 0,
    REVENUE: 0,
    EXPENSE: 0,
    OTHER: 0,
  };
  const periodTotals = new Map<number, { count: number; amountMinor: number }>();
  const asOfBalances = new Map<number, number>();

  for (const record of input.periodRecords) {
    if (!record.category) continue;

    const type = resolveAccountType(record.category.type);
    const current = periodTotals.get(record.category.id) ?? { count: 0, amountMinor: 0 };
    const cashSign = getCashSign(record.direction);
    const signedAmount =
      type === "EXPENSE"
        ? record.amountMinor * cashSign * -1
        : type === "ASSET"
          ? record.amountMinor * cashSign * -1
          : record.amountMinor * cashSign;

    current.count += 1;
    current.amountMinor += signedAmount;
    periodTotals.set(record.category.id, current);
  }

  for (const record of input.asOfRecords) {
    if (!record.category) continue;

    const type = resolveAccountType(record.category.type);
    const cashSign = getCashSign(record.direction);
    if (cashSign === 0) continue;

    const current = asOfBalances.get(record.category.id) ?? 0;

    if (type === "ASSET") {
      asOfBalances.set(record.category.id, current + record.amountMinor * cashSign * -1);
      continue;
    }

    if (type === "LIABILITY" || type === "EQUITY") {
      asOfBalances.set(record.category.id, current + record.amountMinor * cashSign);
    }
  }

  const accounts = input.accounts
    .map((account) => {
      const type = resolveAccountType(account.type);
      countsByType[type] += 1;

      return {
        id: account.id,
        clientBusinessId: account.clientBusinessId,
        clientBusinessName: account.clientBusiness.name,
        name: account.name,
        code: account.code,
        type,
        cashflowActivity: account.cashflowActivity,
        periodTransactionCount: periodTotals.get(account.id)?.count ?? 0,
        periodNetAmountMinor: periodTotals.get(account.id)?.amountMinor ?? 0,
        balanceAsOfMinor: asOfBalances.get(account.id) ?? 0,
      } satisfies ChartOfAccountSummary;
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      if ((left.code ?? "") !== (right.code ?? "")) {
        return (left.code ?? "").localeCompare(right.code ?? "");
      }
      if (left.clientBusinessName !== right.clientBusinessName) {
        return left.clientBusinessName.localeCompare(right.clientBusinessName);
      }
      return left.name.localeCompare(right.name);
    });

  return {
    countsByType,
    accounts,
  };
}

function resolveStatementLineType(
  accountClass:
    | AccountingProfitLossLine["accountClass"]
    | AccountingBalanceSheetLine["accountClass"]
    | Exclude<AccountingCashflowSectionLine["accountClass"], null>
) {
  if (accountClass === "DERIVED_EQUITY") return "EQUITY" satisfies ReportAccountType;
  return accountClass satisfies ReportAccountType;
}

function toLegacyStatementLine(
  line: AccountingProfitLossLine | AccountingBalanceSheetLine
): StatementLine {
  return {
    key: line.accountId ? `account:${line.accountId}` : `${line.name.toLowerCase()}:${line.code ?? "derived"}`,
    accountId: line.accountId,
    accountName: line.name,
    code: line.code,
    type: resolveStatementLineType(line.accountClass),
    clientBusinessId: null,
    clientBusinessName: null,
    cashflowActivity: null,
    amountMinor: line.balance,
    transactionCount: line.lineCount,
    inferred: line.derived,
  };
}

function buildEmptyProfitAndLossStatement(): ProfitAndLossStatement {
  return {
    revenue: [],
    expenses: [],
    totals: {
      revenueMinor: 0,
      expenseMinor: 0,
      netProfitMinor: 0,
    },
    transactionCount: 0,
    unmappedTransactionCount: 0,
    empty: true,
  };
}

function buildEmptyCashflowStatement(): CashflowStatement {
  return {
    sections: [
      {
        activity: "OPERATING",
        label: "Operating activities",
        inflowMinor: 0,
        outflowMinor: 0,
        netMinor: 0,
        lines: [],
      },
      {
        activity: "INVESTING",
        label: "Investing activities",
        inflowMinor: 0,
        outflowMinor: 0,
        netMinor: 0,
        lines: [],
      },
      {
        activity: "FINANCING",
        label: "Financing activities",
        inflowMinor: 0,
        outflowMinor: 0,
        netMinor: 0,
        lines: [],
      },
    ],
    unclassified: {
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
      lines: [],
    },
    totals: {
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
    },
    excludedTransferCount: 0,
    excludedTransferNetMinor: 0,
    empty: true,
  };
}

function buildEmptyBalanceSheetStatement(): BalanceSheetStatement {
  return {
    assets: [],
    liabilities: [],
    equity: [],
    totals: {
      assetsMinor: 0,
      liabilitiesMinor: 0,
      equityMinor: 0,
      liabilitiesAndEquityMinor: 0,
    },
    retainedEarningsMinor: 0,
    balancingDifferenceMinor: 0,
    empty: true,
  };
}

function toLegacyCashflowStatementLine(
  line: AccountingCashflowSectionLine,
  activity: CashflowActivityType | null
): StatementLine {
  return {
    key: line.key,
    accountId: line.accountId,
    accountName: line.name,
    code: line.code,
    type:
      line.accountClass === null
        ? "OTHER"
        : resolveStatementLineType(line.accountClass),
    clientBusinessId: null,
    clientBusinessName: null,
    cashflowActivity: activity,
    amountMinor: line.netCashflow,
    transactionCount: line.journalEntryCount,
    inferred: line.classificationSource !== "BANK_TRANSACTION_CATEGORY",
  };
}

function translateCashflowSection(section: AccountingCashflowSection): CashflowSection {
  return {
    activity: section.activity,
    label: section.label,
    inflowMinor: section.totalCashIn,
    outflowMinor: section.totalCashOut,
    netMinor: section.netCashflow,
    lines: section.lines.map((line) => toLegacyCashflowStatementLine(line, section.activity)),
  };
}

function translateCashflowStatement(report: AccountingCashflowReport): CashflowStatement {
  return {
    sections: report.sections.map(translateCashflowSection),
    unclassified: {
      inflowMinor: report.unclassified.totalCashIn,
      outflowMinor: report.unclassified.totalCashOut,
      netMinor: report.unclassified.netCashflow,
      lines: report.unclassified.lines.map((line) =>
        toLegacyCashflowStatementLine(line, null)
      ),
    },
    totals: {
      inflowMinor: report.totalCashIn,
      outflowMinor: report.totalCashOut,
      netMinor: report.netCashflow,
    },
    excludedTransferCount: report.excludedTransfers.entryCount,
    excludedTransferNetMinor: report.excludedTransfers.netCashflow,
    empty: report.empty,
  };
}

function translateProfitAndLossStatement(
  report: AccountingProfitLossReport
): ProfitAndLossStatement {
  return {
    revenue: report.revenueAccounts.map(toLegacyStatementLine),
    expenses: report.expenseAccounts.map(toLegacyStatementLine),
    totals: {
      revenueMinor: report.totalRevenue,
      expenseMinor: report.totalExpenses,
      netProfitMinor: report.netProfit,
    },
    transactionCount:
      report.revenueAccounts.reduce((sum, line) => sum + line.lineCount, 0) +
      report.expenseAccounts.reduce((sum, line) => sum + line.lineCount, 0),
    unmappedTransactionCount: 0,
    empty: report.empty,
  };
}

function translateBalanceSheetStatement(
  report: AccountingBalanceSheetReport
): BalanceSheetStatement {
  return {
    assets: report.assets.map(toLegacyStatementLine),
    liabilities: report.liabilities.map(toLegacyStatementLine),
    equity: report.equity.map(toLegacyStatementLine),
    totals: {
      assetsMinor: report.totalAssets,
      liabilitiesMinor: report.totalLiabilities,
      equityMinor: report.totalEquity,
      liabilitiesAndEquityMinor: report.totalLiabilitiesAndEquity,
    },
    retainedEarningsMinor: report.currentEarnings,
    balancingDifferenceMinor: report.validation.difference,
    empty: report.empty,
  };
}

export async function getWorkspaceFinancialReports(
  workspaceId: number,
  input: FinancialReportDateInput = {}
): Promise<FinancialReportsSnapshot> {
  await ensureDefaultTransactionCategoriesForWorkspace(prisma, workspaceId);

  const dateRange = resolveDateRange(input.fromParam, input.toParam);
  const legacyAsOfDate = dateRange.toDate ?? new Date();
  const generatedAt = new Date().toISOString();
  const accountingPeriod = resolveAccountingReportPeriod({
    ...(input.fromParam || input.toParam ? { period: "custom" } : {}),
    from: input.fromParam ?? undefined,
    to: input.toParam ?? undefined,
  });

  const ledgerWhere: Prisma.LedgerTransactionWhereInput = {
    reviewStatus: "POSTED",
    clientBusiness: {
      workspaceId,
      archivedAt: null,
    },
  };

  const periodWhere: Prisma.LedgerTransactionWhereInput =
    !dateRange.errorMsg && (dateRange.fromDate || dateRange.toDate)
      ? {
          ...ledgerWhere,
          transactionDate: {
            ...(dateRange.fromDate ? { gte: dateRange.fromDate } : {}),
            ...(dateRange.toDate ? { lte: dateRange.toDate } : {}),
          },
        }
      : ledgerWhere;

  const asOfWhere: Prisma.LedgerTransactionWhereInput = {
    ...ledgerWhere,
    transactionDate: {
      lte: legacyAsOfDate,
    },
  };

  const [accounts, periodRecords, asOfRecords, accountingSnapshot] = await Promise.all([
    prisma.transactionCategory.findMany({
      where: {
        clientBusiness: {
          workspaceId,
          archivedAt: null,
        },
      },
      select: financialReportAccountSelect,
      orderBy: [
        { clientBusiness: { name: "asc" } },
        { type: "asc" },
        { code: "asc" },
        { name: "asc" },
      ],
    }),
    dateRange.errorMsg
      ? Promise.resolve([] as FinancialReportLedgerRecord[])
      : prisma.ledgerTransaction.findMany({
          where: periodWhere,
          select: financialReportLedgerSelect,
          orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
        }),
    prisma.ledgerTransaction.findMany({
      where: asOfWhere,
      select: financialReportLedgerSelect,
      orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
    }),
    dateRange.errorMsg || accountingPeriod.errorMsg
      ? Promise.resolve(null)
      : getWorkspaceAccountingReportsSnapshot(workspaceId, accountingPeriod),
  ]);

  const currency =
    accountingSnapshot?.currency ??
    resolveCurrency(periodRecords.length > 0 ? periodRecords : asOfRecords, accounts);
  const profitAndLoss = accountingSnapshot
    ? translateProfitAndLossStatement(accountingSnapshot.profitLoss)
    : buildEmptyProfitAndLossStatement();
  const cashflow = accountingSnapshot
    ? translateCashflowStatement(accountingSnapshot.cashflow)
    : buildEmptyCashflowStatement();
  const balanceSheet = accountingSnapshot
    ? translateBalanceSheetStatement(accountingSnapshot.balanceSheet)
    : buildEmptyBalanceSheetStatement();
  const chartOfAccounts = buildChartOfAccounts({
    accounts,
    periodRecords,
    asOfRecords,
  });
  const asOfDate = accountingSnapshot
    ? new Date(accountingSnapshot.period.asOf)
    : legacyAsOfDate;

  return {
    workspaceId,
    currency,
    fromParam: dateRange.fromParam,
    toParam: dateRange.toParam,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    asOfDate,
    generatedAt: accountingSnapshot?.generatedAt ?? generatedAt,
    errorMsg: dateRange.errorMsg,
    chartOfAccounts,
    profitAndLoss,
    cashflow,
    balanceSheet,
    isEmpty:
      (accountingSnapshot?.trialBalance.empty ?? true) &&
      periodRecords.length === 0 &&
      asOfRecords.length === 0,
  };
}
