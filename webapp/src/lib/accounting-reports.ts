import "server-only";

import type { AccountingAccountClass, CashflowActivityType, Prisma } from "@prisma/client";
import type {
  AccountingReportEnvelope,
  AccountingReportLine,
  AccountingStatementSource,
  BalanceSheetLine,
  BalanceSheetReport,
  CashflowClassificationSource,
  CashflowReport,
  CashflowSectionLine,
  ProfitLossLine,
  ProfitLossReport,
  TrialBalanceReport,
  TrialBalanceRow,
  WorkspaceAccountingReportsSnapshot,
} from "@/lib/accounting-report-types";
import {
  classifyCounterpartyAccountCashflow,
  isCashChartOfAccount,
} from "@/lib/cashflow-classification";
import { ensureDefaultChartOfAccountsForWorkspace } from "@/lib/chart-of-accounts";
import { logError } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import type { ResolvedAccountingReportPeriod } from "@/lib/report-period";
import { toAccountingReportPeriodSummary } from "@/lib/report-period";

const ACCOUNTING_REPORT_SOURCE = "POSTED_JOURNAL_LINES" satisfies AccountingStatementSource;

const reportAccountSelect = {
  id: true,
  code: true,
  name: true,
  accountClass: true,
  isActive: true,
} satisfies Prisma.ChartOfAccountSelect;

type ReportAccountRecord = Prisma.ChartOfAccountGetPayload<{
  select: typeof reportAccountSelect;
}>;

const cashflowJournalEntrySelect = {
  id: true,
  entryDate: true,
  sourceBankTransactionId: true,
  reference: true,
  memo: true,
  sourceBankTransaction: {
    select: {
      id: true,
      description: true,
      reference: true,
      transactionDate: true,
      category: {
        select: {
          id: true,
          name: true,
          code: true,
          cashflowActivity: true,
        },
      },
    },
  },
  lines: {
    orderBy: {
      lineNumber: "asc" as const,
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      account: {
        select: reportAccountSelect,
      },
    },
  },
} satisfies Prisma.JournalEntrySelect;

type CashflowJournalEntryRecord = Prisma.JournalEntryGetPayload<{
  select: typeof cashflowJournalEntrySelect;
}>;

type GroupedJournalLineRow = {
  accountId: number;
  debitTotal: number;
  creditTotal: number;
  lineCount: number;
};

type AccountReportSnapshot = {
  accountId: number;
  code: string | null;
  name: string;
  accountClass: AccountingAccountClass;
  isActive: boolean;
  periodDebitTotal: number;
  periodCreditTotal: number;
  periodLineCount: number;
  asOfDebitTotal: number;
  asOfCreditTotal: number;
  asOfLineCount: number;
};

type CashflowLineAccumulator = CashflowSectionLine;

type SortableReportLine = {
  code: string | null;
  name: string;
  accountId?: number | null;
};

function sortByCodeAndName(
  left: SortableReportLine,
  right: SortableReportLine
) {
  const leftCode = left.code ?? "";
  const rightCode = right.code ?? "";

  if (leftCode !== rightCode) {
    if (!leftCode) return 1;
    if (!rightCode) return -1;
    return leftCode.localeCompare(rightCode);
  }

  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) return nameCompare;

  return (left.accountId ?? Number.MAX_SAFE_INTEGER) - (right.accountId ?? Number.MAX_SAFE_INTEGER);
}

function isAccountClass<TAccountClass extends AccountingAccountClass>(accountClass: TAccountClass) {
  return (
    snapshot: AccountReportSnapshot
  ): snapshot is AccountReportSnapshot & { accountClass: TAccountClass } =>
    snapshot.accountClass === accountClass;
}

function buildEntryDateFilter(
  fromDate: Date | null,
  toDate: Date | null
): Prisma.DateTimeFilter | undefined {
  if (!fromDate && !toDate) return undefined;

  return {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate ? { lte: toDate } : {}),
  };
}

function buildPostedJournalLineWhere(
  workspaceId: number,
  entryDateFilter?: Prisma.DateTimeFilter
): Prisma.JournalLineWhereInput {
  return {
    workspaceId,
    journalEntry: {
      workspaceId,
      status: "POSTED",
      ...(entryDateFilter ? { entryDate: entryDateFilter } : {}),
    },
  };
}

function getNormalBalance(
  accountClass: AccountingAccountClass,
  debitTotal: number,
  creditTotal: number
) {
  if (accountClass === "ASSET" || accountClass === "EXPENSE") {
    return debitTotal - creditTotal;
  }

  return creditTotal - debitTotal;
}

function toEndingBalanceColumns(
  accountClass: AccountingAccountClass,
  balance: number
) {
  if (balance === 0) {
    return {
      endingDebitBalance: 0,
      endingCreditBalance: 0,
    };
  }

  if (accountClass === "ASSET" || accountClass === "EXPENSE") {
    return balance > 0
      ? {
          endingDebitBalance: balance,
          endingCreditBalance: 0,
        }
      : {
          endingDebitBalance: 0,
          endingCreditBalance: Math.abs(balance),
        };
  }

  return balance > 0
    ? {
        endingDebitBalance: 0,
        endingCreditBalance: balance,
      }
    : {
        endingDebitBalance: Math.abs(balance),
        endingCreditBalance: 0,
      };
}

function shouldKeepLine(line: Pick<AccountingReportLine, "debitTotal" | "creditTotal" | "balance">) {
  return line.debitTotal !== 0 || line.creditTotal !== 0 || line.balance !== 0;
}

function createAccountReportLine<TAccountClass extends AccountingAccountClass>(
  snapshot: AccountReportSnapshot & { accountClass: TAccountClass },
  input: {
    debitTotal: number;
    creditTotal: number;
    balance: number;
    lineCount: number;
  }
): {
  accountId: number;
  code: string | null;
  name: string;
  accountClass: TAccountClass;
  isActive: boolean;
  derived: false;
  lineCount: number;
  debitTotal: number;
  creditTotal: number;
  balance: number;
} {
  return {
    accountId: snapshot.accountId,
    code: snapshot.code,
    name: snapshot.name,
    accountClass: snapshot.accountClass,
    isActive: snapshot.isActive,
    derived: false,
    lineCount: input.lineCount,
    debitTotal: input.debitTotal,
    creditTotal: input.creditTotal,
    balance: input.balance,
  };
}

function buildProfitLossReport(accountSnapshots: AccountReportSnapshot[]): ProfitLossReport {
  const revenueAccounts = accountSnapshots
    .filter(isAccountClass("REVENUE"))
    .map((snapshot) => {
      const line = createAccountReportLine(snapshot, {
        debitTotal: snapshot.periodDebitTotal,
        creditTotal: snapshot.periodCreditTotal,
        lineCount: snapshot.periodLineCount,
        balance: getNormalBalance(
          snapshot.accountClass,
          snapshot.periodDebitTotal,
          snapshot.periodCreditTotal
        ),
      });

      return line satisfies ProfitLossLine;
    })
    .filter(shouldKeepLine)
    .sort(sortByCodeAndName);

  const expenseAccounts = accountSnapshots
    .filter(isAccountClass("EXPENSE"))
    .map((snapshot) => {
      const line = createAccountReportLine(snapshot, {
        debitTotal: snapshot.periodDebitTotal,
        creditTotal: snapshot.periodCreditTotal,
        lineCount: snapshot.periodLineCount,
        balance: getNormalBalance(
          snapshot.accountClass,
          snapshot.periodDebitTotal,
          snapshot.periodCreditTotal
        ),
      });

      return line satisfies ProfitLossLine;
    })
    .filter(shouldKeepLine)
    .sort(sortByCodeAndName);

  const totalRevenue = revenueAccounts.reduce((sum, line) => sum + line.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, line) => sum + line.balance, 0);

  return {
    revenueAccounts,
    expenseAccounts,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    empty: revenueAccounts.length === 0 && expenseAccounts.length === 0,
  };
}

function buildTrialBalanceReport(accountSnapshots: AccountReportSnapshot[]): TrialBalanceReport {
  const accounts = accountSnapshots
    .map((snapshot) => {
      const balance = getNormalBalance(
        snapshot.accountClass,
        snapshot.asOfDebitTotal,
        snapshot.asOfCreditTotal
      );
      const endingColumns = toEndingBalanceColumns(snapshot.accountClass, balance);

      return {
        ...createAccountReportLine(snapshot, {
          debitTotal: snapshot.periodDebitTotal,
          creditTotal: snapshot.periodCreditTotal,
          lineCount: snapshot.periodLineCount,
          balance,
        }),
        ...endingColumns,
      } satisfies TrialBalanceRow;
    })
    .sort(sortByCodeAndName);

  const totalDebits = accounts.reduce((sum, row) => sum + row.debitTotal, 0);
  const totalCredits = accounts.reduce((sum, row) => sum + row.creditTotal, 0);
  const difference = totalDebits - totalCredits;

  return {
    accounts,
    totalDebits,
    totalCredits,
    validation: {
      isBalanced: difference === 0,
      difference,
    },
    empty: accounts.every(
      (row) =>
        row.debitTotal === 0 &&
        row.creditTotal === 0 &&
        row.endingDebitBalance === 0 &&
        row.endingCreditBalance === 0
    ),
  };
}

function buildBalanceSheetReport(accountSnapshots: AccountReportSnapshot[]): BalanceSheetReport {
  const assets: BalanceSheetLine[] = accountSnapshots
    .filter(isAccountClass("ASSET"))
    .map((snapshot) =>
      createAccountReportLine(snapshot, {
        debitTotal: snapshot.asOfDebitTotal,
        creditTotal: snapshot.asOfCreditTotal,
        lineCount: snapshot.asOfLineCount,
        balance: getNormalBalance(
          snapshot.accountClass,
          snapshot.asOfDebitTotal,
          snapshot.asOfCreditTotal
        ),
      }) satisfies BalanceSheetLine
    )
    .filter(shouldKeepLine)
    .sort(sortByCodeAndName);

  const liabilities: BalanceSheetLine[] = accountSnapshots
    .filter(isAccountClass("LIABILITY"))
    .map((snapshot) =>
      createAccountReportLine(snapshot, {
        debitTotal: snapshot.asOfDebitTotal,
        creditTotal: snapshot.asOfCreditTotal,
        lineCount: snapshot.asOfLineCount,
        balance: getNormalBalance(
          snapshot.accountClass,
          snapshot.asOfDebitTotal,
          snapshot.asOfCreditTotal
        ),
      }) satisfies BalanceSheetLine
    )
    .filter(shouldKeepLine)
    .sort(sortByCodeAndName);

  const equity: BalanceSheetLine[] = accountSnapshots
    .filter(isAccountClass("EQUITY"))
    .map((snapshot) =>
      createAccountReportLine(snapshot, {
        debitTotal: snapshot.asOfDebitTotal,
        creditTotal: snapshot.asOfCreditTotal,
        lineCount: snapshot.asOfLineCount,
        balance: getNormalBalance(
          snapshot.accountClass,
          snapshot.asOfDebitTotal,
          snapshot.asOfCreditTotal
        ),
      }) satisfies BalanceSheetLine
    )
    .filter(shouldKeepLine);

  const totalRevenueToDate = accountSnapshots
    .filter(isAccountClass("REVENUE"))
    .reduce(
      (sum, snapshot) =>
        sum +
        getNormalBalance(snapshot.accountClass, snapshot.asOfDebitTotal, snapshot.asOfCreditTotal),
      0
    );

  const totalExpensesToDate = accountSnapshots
    .filter(isAccountClass("EXPENSE"))
    .reduce(
      (sum, snapshot) =>
        sum +
        getNormalBalance(snapshot.accountClass, snapshot.asOfDebitTotal, snapshot.asOfCreditTotal),
      0
    );

  const currentEarnings = totalRevenueToDate - totalExpensesToDate;

  if (currentEarnings !== 0) {
    equity.push({
      accountId: null,
      code: null,
      name: "Current earnings",
      accountClass: "DERIVED_EQUITY",
      isActive: true,
      derived: true,
      lineCount: accountSnapshots
        .filter(
          (snapshot) =>
            snapshot.accountClass === "REVENUE" || snapshot.accountClass === "EXPENSE"
        )
        .reduce((sum, snapshot) => sum + snapshot.asOfLineCount, 0),
      debitTotal: currentEarnings < 0 ? Math.abs(currentEarnings) : 0,
      creditTotal: currentEarnings > 0 ? currentEarnings : 0,
      balance: currentEarnings,
    });
  }

  equity.sort(sortByCodeAndName);

  const totalAssets = assets.reduce((sum, line) => sum + line.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, line) => sum + line.balance, 0);
  const totalEquity = equity.reduce((sum, line) => sum + line.balance, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    currentEarnings,
    validation: {
      isBalanced: difference === 0,
      difference,
    },
    empty: assets.length === 0 && liabilities.length === 0 && equity.length === 0,
  };
}

function resolveCashflowLineLabel(input: {
  code: string | null;
  name: string;
  fallbackLabel?: string | null;
}) {
  const accountLabel = [input.code, input.name].filter(Boolean).join(" ").trim();
  if (accountLabel) return accountLabel;

  const fallbackLabel = input.fallbackLabel?.trim();
  return fallbackLabel || "Unclassified cash movement";
}

function createCashflowLineKey(input: {
  accountId: number | null;
  code: string | null;
  name: string;
  classificationSource: CashflowClassificationSource;
}) {
  if (input.accountId) {
    return `${input.classificationSource}:account:${input.accountId}`;
  }

  return [
    input.classificationSource,
    input.code ?? "no-code",
    input.name.trim().toLowerCase(),
  ].join(":");
}

function createCashflowSectionMaps() {
  return {
    OPERATING: new Map<string, CashflowLineAccumulator>(),
    INVESTING: new Map<string, CashflowLineAccumulator>(),
    FINANCING: new Map<string, CashflowLineAccumulator>(),
  } satisfies Record<CashflowActivityType, Map<string, CashflowLineAccumulator>>;
}

function upsertCashflowLine(
  map: Map<string, CashflowLineAccumulator>,
  input: {
    accountId: number | null;
    code: string | null;
    name: string;
    accountClass: AccountingAccountClass | null;
    classificationSource: CashflowClassificationSource;
    amountMinor: number;
  }
) {
  if (input.amountMinor === 0) return;

  const key = createCashflowLineKey(input);
  const existing = map.get(key);

  if (existing) {
    existing.totalCashIn += input.amountMinor > 0 ? input.amountMinor : 0;
    existing.totalCashOut += input.amountMinor < 0 ? Math.abs(input.amountMinor) : 0;
    existing.netCashflow += input.amountMinor;
    existing.journalEntryCount += 1;
    return;
  }

  map.set(key, {
    key,
    accountId: input.accountId,
    code: input.code,
    name: input.name,
    accountClass: input.accountClass,
    classificationSource: input.classificationSource,
    totalCashIn: input.amountMinor > 0 ? input.amountMinor : 0,
    totalCashOut: input.amountMinor < 0 ? Math.abs(input.amountMinor) : 0,
    netCashflow: input.amountMinor,
    journalEntryCount: 1,
  });
}

function sortCashflowLines(lines: CashflowLineAccumulator[]) {
  return [...lines].sort(sortByCodeAndName);
}

function allocateAmounts(totalAmount: number, weights: number[]) {
  if (totalAmount <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) {
    return weights.map((_, index) => (index === weights.length - 1 ? totalAmount : 0));
  }

  let remaining = totalAmount;

  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return remaining;
    }

    const allocated = Math.floor((totalAmount * Math.max(0, weight)) / totalWeight);
    remaining -= allocated;
    return allocated;
  });
}

function buildCashflowSection(
  activity: CashflowActivityType,
  label: string,
  map: Map<string, CashflowLineAccumulator>
) {
  const lines = sortCashflowLines(Array.from(map.values()).filter((line) => line.netCashflow !== 0));

  return {
    activity,
    label,
    totalCashIn: lines.reduce((sum, line) => sum + line.totalCashIn, 0),
    totalCashOut: lines.reduce((sum, line) => sum + line.totalCashOut, 0),
    netCashflow: lines.reduce((sum, line) => sum + line.netCashflow, 0),
    lines,
  };
}

function buildCashflowReport(entries: CashflowJournalEntryRecord[]): CashflowReport {
  const sectionMaps = createCashflowSectionMaps();
  const unclassifiedMap = new Map<string, CashflowLineAccumulator>();
  let excludedTransferCount = 0;
  let excludedTransferCashIn = 0;
  let excludedTransferCashOut = 0;

  for (const entry of entries) {
    const cashLines = entry.lines.filter((line) => isCashChartOfAccount(line.account));
    if (cashLines.length === 0) continue;

    const netCashflow = cashLines.reduce((sum, line) => sum + line.debit - line.credit, 0);
    const grossCashIn = cashLines.reduce((sum, line) => sum + line.debit, 0);
    const grossCashOut = cashLines.reduce((sum, line) => sum + line.credit, 0);

    if (netCashflow === 0) {
      excludedTransferCount += 1;
      excludedTransferCashIn += grossCashIn;
      excludedTransferCashOut += grossCashOut;
      continue;
    }

    const category = entry.sourceBankTransaction?.category ?? null;
    const absoluteCashflow = Math.abs(netCashflow);

    if (category) {
      upsertCashflowLine(sectionMaps[category.cashflowActivity], {
        accountId: null,
        code: category.code,
        name: resolveCashflowLineLabel({
          code: category.code,
          name: category.name,
          fallbackLabel: entry.memo ?? entry.reference ?? entry.sourceBankTransaction?.description ?? null,
        }),
        accountClass: null,
        classificationSource: "BANK_TRANSACTION_CATEGORY",
        amountMinor: netCashflow,
      });
      continue;
    }

    const nonCashLines = entry.lines.filter((line) => !isCashChartOfAccount(line.account));
    if (nonCashLines.length === 0) {
      upsertCashflowLine(unclassifiedMap, {
        accountId: null,
        code: null,
        name: entry.memo?.trim() || entry.reference?.trim() || "Unclassified cash movement",
        accountClass: null,
        classificationSource: "UNCLASSIFIED",
        amountMinor: netCashflow,
      });
      continue;
    }

    const relevantLines =
      netCashflow > 0
        ? nonCashLines.filter((line) => line.credit > 0)
        : nonCashLines.filter((line) => line.debit > 0);
    const candidateLines =
      relevantLines.length > 0
        ? relevantLines
        : nonCashLines.filter((line) => Math.max(line.debit, line.credit) > 0);

    if (candidateLines.length === 0) {
      upsertCashflowLine(unclassifiedMap, {
        accountId: null,
        code: null,
        name: entry.memo?.trim() || entry.reference?.trim() || "Unclassified cash movement",
        accountClass: null,
        classificationSource: "UNCLASSIFIED",
        amountMinor: netCashflow,
      });
      continue;
    }

    const weights = candidateLines.map((line) =>
      netCashflow > 0
        ? line.credit > 0
          ? line.credit
          : Math.max(line.debit, line.credit)
        : line.debit > 0
          ? line.debit
          : Math.max(line.debit, line.credit)
    );
    const allocations = allocateAmounts(absoluteCashflow, weights);

    candidateLines.forEach((line, index) => {
      const allocatedAmount = allocations[index] ?? 0;
      if (allocatedAmount <= 0) return;

      const classification = classifyCounterpartyAccountCashflow(line.account);
      const signedAmount = netCashflow > 0 ? allocatedAmount : allocatedAmount * -1;
      const targetMap =
        classification.activity === "UNCLASSIFIED"
          ? unclassifiedMap
          : sectionMaps[classification.activity];

      upsertCashflowLine(targetMap, {
        accountId: line.account.id,
        code: line.account.code,
        name: resolveCashflowLineLabel({
          code: line.account.code,
          name: line.account.name,
          fallbackLabel: entry.memo ?? entry.reference ?? null,
        }),
        accountClass: line.account.accountClass,
        classificationSource: classification.source,
        amountMinor: signedAmount,
      });
    });
  }

  const sections = [
    buildCashflowSection("OPERATING", "Operating activities", sectionMaps.OPERATING),
    buildCashflowSection("INVESTING", "Investing activities", sectionMaps.INVESTING),
    buildCashflowSection("FINANCING", "Financing activities", sectionMaps.FINANCING),
  ];

  const unclassifiedLines = sortCashflowLines(
    Array.from(unclassifiedMap.values()).filter((line) => line.netCashflow !== 0)
  );
  const unclassified = {
    label: "Unclassified cash movements",
    totalCashIn: unclassifiedLines.reduce((sum, line) => sum + line.totalCashIn, 0),
    totalCashOut: unclassifiedLines.reduce((sum, line) => sum + line.totalCashOut, 0),
    netCashflow: unclassifiedLines.reduce((sum, line) => sum + line.netCashflow, 0),
    lines: unclassifiedLines,
  };

  const totalCashIn =
    sections.reduce((sum, section) => sum + section.totalCashIn, 0) + unclassified.totalCashIn;
  const totalCashOut =
    sections.reduce((sum, section) => sum + section.totalCashOut, 0) + unclassified.totalCashOut;

  return {
    method: "DIRECT",
    totalCashIn,
    totalCashOut,
    netCashflow: totalCashIn - totalCashOut,
    sections,
    unclassified,
    excludedTransfers: {
      entryCount: excludedTransferCount,
      totalCashIn: excludedTransferCashIn,
      totalCashOut: excludedTransferCashOut,
      netCashflow: excludedTransferCashIn - excludedTransferCashOut,
    },
    empty:
      totalCashIn === 0 &&
      totalCashOut === 0 &&
      unclassified.lines.length === 0 &&
      sections.every((section) => section.lines.length === 0),
  };
}

async function resolveWorkspaceCurrency(workspaceId: number) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      businessProfile: {
        select: {
          defaultCurrency: true,
        },
      },
      clientBusinesses: {
        where: {
          archivedAt: null,
        },
        select: {
          defaultCurrency: true,
        },
      },
    },
  });

  const businessProfileCurrency = workspace?.businessProfile?.defaultCurrency?.trim().toUpperCase();
  if (businessProfileCurrency) {
    return businessProfileCurrency;
  }

  const currencies = new Set(
    (workspace?.clientBusinesses ?? [])
      .map((business) => business.defaultCurrency?.trim().toUpperCase())
      .filter((currency): currency is string => Boolean(currency))
  );

  if (currencies.size === 0) return "NGN";
  if (currencies.size === 1) {
    return Array.from(currencies)[0];
  }

  return "MIXED";
}

async function groupJournalLines(
  workspaceId: number,
  entryDateFilter?: Prisma.DateTimeFilter
) {
  const rows = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: buildPostedJournalLineWhere(workspaceId, entryDateFilter),
    _sum: {
      debit: true,
      credit: true,
    },
    _count: {
      _all: true,
    },
  });

  return rows.map((row) => ({
    accountId: row.accountId,
    debitTotal: row._sum.debit ?? 0,
    creditTotal: row._sum.credit ?? 0,
    lineCount: row._count._all,
  })) satisfies GroupedJournalLineRow[];
}

function buildAccountSnapshots(input: {
  accounts: ReportAccountRecord[];
  periodRows: GroupedJournalLineRow[];
  asOfRows: GroupedJournalLineRow[];
}) {
  const periodMap = new Map(input.periodRows.map((row) => [row.accountId, row] as const));
  const asOfMap = new Map(input.asOfRows.map((row) => [row.accountId, row] as const));

  return input.accounts.map((account) => {
    const periodRow = periodMap.get(account.id);
    const asOfRow = asOfMap.get(account.id);

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountClass: account.accountClass,
      isActive: account.isActive,
      periodDebitTotal: periodRow?.debitTotal ?? 0,
      periodCreditTotal: periodRow?.creditTotal ?? 0,
      periodLineCount: periodRow?.lineCount ?? 0,
      asOfDebitTotal: asOfRow?.debitTotal ?? 0,
      asOfCreditTotal: asOfRow?.creditTotal ?? 0,
      asOfLineCount: asOfRow?.lineCount ?? 0,
    } satisfies AccountReportSnapshot;
  });
}

function buildAccountingReportEnvelope<TReport>(
  snapshot: WorkspaceAccountingReportsSnapshot,
  report: TReport
): AccountingReportEnvelope<TReport> {
  return {
    workspaceId: snapshot.workspaceId,
    currency: snapshot.currency,
    source: snapshot.source,
    generatedAt: snapshot.generatedAt,
    period: snapshot.period,
    report,
  };
}

function buildEmptyProfitLossReport(): ProfitLossReport {
  return {
    revenueAccounts: [],
    expenseAccounts: [],
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    empty: true,
  };
}

function buildEmptyCashflowReport(): CashflowReport {
  return {
    method: "DIRECT",
    totalCashIn: 0,
    totalCashOut: 0,
    netCashflow: 0,
    sections: [
      {
        activity: "OPERATING",
        label: "Operating activities",
        totalCashIn: 0,
        totalCashOut: 0,
        netCashflow: 0,
        lines: [],
      },
      {
        activity: "INVESTING",
        label: "Investing activities",
        totalCashIn: 0,
        totalCashOut: 0,
        netCashflow: 0,
        lines: [],
      },
      {
        activity: "FINANCING",
        label: "Financing activities",
        totalCashIn: 0,
        totalCashOut: 0,
        netCashflow: 0,
        lines: [],
      },
    ],
    unclassified: {
      label: "Unclassified cash movements",
      totalCashIn: 0,
      totalCashOut: 0,
      netCashflow: 0,
      lines: [],
    },
    excludedTransfers: {
      entryCount: 0,
      totalCashIn: 0,
      totalCashOut: 0,
      netCashflow: 0,
    },
    empty: true,
  };
}

function buildEmptyTrialBalanceReport(): TrialBalanceReport {
  return {
    accounts: [],
    totalDebits: 0,
    totalCredits: 0,
    validation: {
      isBalanced: true,
      difference: 0,
    },
    empty: true,
  };
}

function buildEmptyBalanceSheetReport(): BalanceSheetReport {
  return {
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalLiabilitiesAndEquity: 0,
    currentEarnings: 0,
    validation: {
      isBalanced: true,
      difference: 0,
    },
    empty: true,
  };
}

export function buildEmptyWorkspaceAccountingReportsSnapshot(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod,
  currency = "NGN"
): WorkspaceAccountingReportsSnapshot {
  return {
    workspaceId,
    currency,
    source: ACCOUNTING_REPORT_SOURCE,
    generatedAt: new Date().toISOString(),
    period: toAccountingReportPeriodSummary(period),
    profitLoss: buildEmptyProfitLossReport(),
    cashflow: buildEmptyCashflowReport(),
    trialBalance: buildEmptyTrialBalanceReport(),
    balanceSheet: buildEmptyBalanceSheetReport(),
  };
}

export async function getWorkspaceAccountingReportsSnapshot(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod
): Promise<WorkspaceAccountingReportsSnapshot> {
  try {
    await ensureDefaultChartOfAccountsForWorkspace(prisma, workspaceId);

    const periodEntryDateFilter = buildEntryDateFilter(period.fromDate, period.toDate);
    const asOfEntryDateFilter = buildEntryDateFilter(null, period.asOfDate);
    const generatedAt = new Date().toISOString();

    const [currency, accounts, periodRows, asOfRows, cashflowEntries] = await withPrismaRetry(
      () =>
        Promise.all([
          resolveWorkspaceCurrency(workspaceId),
          prisma.chartOfAccount.findMany({
            where: {
              workspaceId,
            },
            select: reportAccountSelect,
            orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }],
          }),
          groupJournalLines(workspaceId, periodEntryDateFilter),
          groupJournalLines(workspaceId, asOfEntryDateFilter),
          prisma.journalEntry.findMany({
            where: {
              workspaceId,
              status: "POSTED",
              ...(periodEntryDateFilter ? { entryDate: periodEntryDateFilter } : {}),
            },
            select: cashflowJournalEntrySelect,
            orderBy: [{ entryDate: "asc" }, { id: "asc" }],
          }),
        ]),
      {
        label: "workspace_accounting_reports_snapshot",
      }
    );

    const accountSnapshots = buildAccountSnapshots({
      accounts,
      periodRows,
      asOfRows,
    });

    return {
      workspaceId,
      currency,
      source: ACCOUNTING_REPORT_SOURCE,
      generatedAt,
      period: toAccountingReportPeriodSummary(period),
      profitLoss: buildProfitLossReport(accountSnapshots),
      cashflow: buildCashflowReport(cashflowEntries),
      trialBalance: buildTrialBalanceReport(accountSnapshots),
      balanceSheet: buildBalanceSheetReport(accountSnapshots),
    };
  } catch (error) {
    logError(
      "accounting-reports",
      "Accounting reports loader failed; returning an empty report snapshot.",
      error,
      {
        workspaceId,
      }
    );

    return buildEmptyWorkspaceAccountingReportsSnapshot(workspaceId, period);
  }
}

export async function getWorkspaceProfitLossReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod
) {
  const snapshot = await getWorkspaceAccountingReportsSnapshot(workspaceId, period);
  return buildAccountingReportEnvelope(snapshot, snapshot.profitLoss);
}

export async function getWorkspaceCashflowReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod
) {
  const snapshot = await getWorkspaceAccountingReportsSnapshot(workspaceId, period);
  return buildAccountingReportEnvelope(snapshot, snapshot.cashflow);
}

export async function getWorkspaceTrialBalanceReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod
) {
  const snapshot = await getWorkspaceAccountingReportsSnapshot(workspaceId, period);
  return buildAccountingReportEnvelope(snapshot, snapshot.trialBalance);
}

export async function getWorkspaceBalanceSheetReport(
  workspaceId: number,
  period: ResolvedAccountingReportPeriod
) {
  const snapshot = await getWorkspaceAccountingReportsSnapshot(workspaceId, period);
  return buildAccountingReportEnvelope(snapshot, snapshot.balanceSheet);
}
