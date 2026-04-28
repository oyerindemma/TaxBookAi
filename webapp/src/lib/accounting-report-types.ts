import type { AccountingAccountClass, CashflowActivityType } from "@prisma/client";
import type { AccountingReportPeriodSummary } from "@/lib/report-period";

export type AccountingStatementSource = "POSTED_JOURNAL_LINES";
export type CashflowMethod = "DIRECT";
export type CashflowClassificationSource =
  | "BANK_TRANSACTION_CATEGORY"
  | "COUNTERPART_ACCOUNT"
  | "UNCLASSIFIED";

export type AccountingReportLine = {
  accountId: number | null;
  code: string | null;
  name: string;
  accountClass: AccountingAccountClass | "DERIVED_EQUITY";
  isActive: boolean;
  derived: boolean;
  lineCount: number;
  debitTotal: number;
  creditTotal: number;
  balance: number;
};

export type ProfitLossLine = AccountingReportLine & {
  accountClass: "REVENUE" | "EXPENSE";
};

export type ProfitLossReport = {
  revenueAccounts: ProfitLossLine[];
  expenseAccounts: ProfitLossLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  empty: boolean;
};

export type TrialBalanceRow = AccountingReportLine & {
  accountId: number;
  accountClass: AccountingAccountClass;
  endingDebitBalance: number;
  endingCreditBalance: number;
};

export type TrialBalanceReport = {
  accounts: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  validation: {
    isBalanced: boolean;
    difference: number;
  };
  empty: boolean;
};

export type BalanceSheetLine = AccountingReportLine & {
  accountClass: "ASSET" | "LIABILITY" | "EQUITY" | "DERIVED_EQUITY";
};

export type BalanceSheetReport = {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  currentEarnings: number;
  validation: {
    isBalanced: boolean;
    difference: number;
  };
  empty: boolean;
};

export type CashflowSectionLine = {
  key: string;
  accountId: number | null;
  code: string | null;
  name: string;
  accountClass: AccountingAccountClass | null;
  classificationSource: CashflowClassificationSource;
  totalCashIn: number;
  totalCashOut: number;
  netCashflow: number;
  journalEntryCount: number;
};

export type CashflowSection = {
  activity: CashflowActivityType;
  label: string;
  totalCashIn: number;
  totalCashOut: number;
  netCashflow: number;
  lines: CashflowSectionLine[];
};

export type CashflowUnclassifiedSection = {
  label: string;
  totalCashIn: number;
  totalCashOut: number;
  netCashflow: number;
  lines: CashflowSectionLine[];
};

export type CashflowTransferSummary = {
  entryCount: number;
  totalCashIn: number;
  totalCashOut: number;
  netCashflow: number;
};

export type CashflowReport = {
  method: CashflowMethod;
  totalCashIn: number;
  totalCashOut: number;
  netCashflow: number;
  sections: CashflowSection[];
  unclassified: CashflowUnclassifiedSection;
  excludedTransfers: CashflowTransferSummary;
  empty: boolean;
};

export type AccountingReportEnvelope<TReport> = {
  workspaceId: number;
  currency: string;
  source: AccountingStatementSource;
  generatedAt: string;
  period: AccountingReportPeriodSummary;
  report: TReport;
};

export type WorkspaceAccountingReportsSnapshot = {
  workspaceId: number;
  currency: string;
  source: AccountingStatementSource;
  generatedAt: string;
  period: AccountingReportPeriodSummary;
  profitLoss: ProfitLossReport;
  cashflow: CashflowReport;
  trialBalance: TrialBalanceReport;
  balanceSheet: BalanceSheetReport;
};
