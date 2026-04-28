import type {
  BalanceSheetReport,
  CashflowReport,
  ProfitLossReport,
  TrialBalanceReport,
  WorkspaceAccountingReportsSnapshot,
} from "@/lib/accounting-report-types";

export type AccountingStatementExportKind =
  | "profit-loss"
  | "balance-sheet"
  | "trial-balance"
  | "cashflow";

type CsvCell = string | number | boolean | null | undefined;
type CsvRow = CsvCell[];

const STATEMENT_LABELS: Record<AccountingStatementExportKind, string> = {
  "profit-loss": "Profit and loss",
  "balance-sheet": "Balance sheet",
  "trial-balance": "Trial balance",
  cashflow: "Cashflow statement",
};

export function parseAccountingStatementExportKind(
  value: string | null | undefined
): AccountingStatementExportKind | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "profit-loss" ||
    normalized === "pl" ||
    normalized === "p-and-l" ||
    normalized === "pnl"
  ) {
    return "profit-loss";
  }
  if (normalized === "balance-sheet" || normalized === "balance") return "balance-sheet";
  if (normalized === "trial-balance" || normalized === "trial") return "trial-balance";
  if (normalized === "cashflow" || normalized === "cash-flow") return "cashflow";
  return null;
}

function csvEscapeCell(value: CsvCell) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsvRows(rows: CsvRow[]) {
  return rows.map((row) => row.map(csvEscapeCell).join(",")).join("\n");
}

function formatAmount(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function sanitizeFilePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report"
  );
}

function buildMetadataRows(input: {
  snapshot: WorkspaceAccountingReportsSnapshot;
  workspaceName: string;
  statement: AccountingStatementExportKind;
}) {
  return [
    ["Workspace", input.workspaceName],
    ["WorkspaceId", input.snapshot.workspaceId],
    ["Statement", STATEMENT_LABELS[input.statement]],
    ["Currency", input.snapshot.currency],
    ["Period", input.snapshot.period.label],
    ["PeriodFrom", input.snapshot.period.from ?? ""],
    ["PeriodTo", input.snapshot.period.to ?? ""],
    ["GeneratedAt", input.snapshot.generatedAt],
    ["Source", input.snapshot.source],
    ["Basis", "Posted journal lines only"],
    [],
  ] satisfies CsvRow[];
}

function buildProfitLossRows(report: ProfitLossReport) {
  const rows: CsvRow[] = [
    ["Section", "Code", "Account", "DebitTotal", "CreditTotal", "Balance", "LineCount"],
  ];

  for (const line of report.revenueAccounts) {
    rows.push([
      "Revenue",
      line.code,
      line.name,
      formatAmount(line.debitTotal),
      formatAmount(line.creditTotal),
      formatAmount(line.balance),
      line.lineCount,
    ]);
  }

  rows.push(["Total revenue", "", "", "", "", formatAmount(report.totalRevenue), ""]);
  rows.push([]);

  for (const line of report.expenseAccounts) {
    rows.push([
      "Expense",
      line.code,
      line.name,
      formatAmount(line.debitTotal),
      formatAmount(line.creditTotal),
      formatAmount(line.balance),
      line.lineCount,
    ]);
  }

  rows.push(["Total expenses", "", "", "", "", formatAmount(report.totalExpenses), ""]);
  rows.push(["Net profit", "", "", "", "", formatAmount(report.netProfit), ""]);
  return rows;
}

function buildBalanceSheetRows(report: BalanceSheetReport) {
  const rows: CsvRow[] = [
    ["Section", "Code", "Account", "DebitTotal", "CreditTotal", "Balance", "Derived", "LineCount"],
  ];

  for (const [section, lines] of [
    ["Assets", report.assets],
    ["Liabilities", report.liabilities],
    ["Equity", report.equity],
  ] as const) {
    for (const line of lines) {
      rows.push([
        section,
        line.code,
        line.name,
        formatAmount(line.debitTotal),
        formatAmount(line.creditTotal),
        formatAmount(line.balance),
        line.derived ? "YES" : "NO",
        line.lineCount,
      ]);
    }
  }

  rows.push(["Total assets", "", "", "", "", formatAmount(report.totalAssets), "", ""]);
  rows.push([
    "Total liabilities",
    "",
    "",
    "",
    "",
    formatAmount(report.totalLiabilities),
    "",
    "",
  ]);
  rows.push(["Total equity", "", "", "", "", formatAmount(report.totalEquity), "", ""]);
  rows.push([
    "Liabilities and equity",
    "",
    "",
    "",
    "",
    formatAmount(report.totalLiabilitiesAndEquity),
    "",
    "",
  ]);
  rows.push(["Current earnings", "", "", "", "", formatAmount(report.currentEarnings), "YES", ""]);
  rows.push(["Validation balanced", "", "", "", "", report.validation.isBalanced ? "YES" : "NO", "", ""]);
  rows.push(["Validation difference", "", "", "", "", formatAmount(report.validation.difference), "", ""]);
  return rows;
}

function buildTrialBalanceRows(report: TrialBalanceReport) {
  const rows: CsvRow[] = [
    [
      "Code",
      "Account",
      "Class",
      "PeriodDebits",
      "PeriodCredits",
      "EndingDebitBalance",
      "EndingCreditBalance",
      "LineCount",
    ],
  ];

  for (const line of report.accounts) {
    rows.push([
      line.code,
      line.name,
      line.accountClass,
      formatAmount(line.debitTotal),
      formatAmount(line.creditTotal),
      formatAmount(line.endingDebitBalance),
      formatAmount(line.endingCreditBalance),
      line.lineCount,
    ]);
  }

  rows.push([
    "Totals",
    "",
    "",
    formatAmount(report.totalDebits),
    formatAmount(report.totalCredits),
    "",
    "",
    "",
  ]);
  rows.push(["Validation balanced", "", "", "", "", report.validation.isBalanced ? "YES" : "NO", "", ""]);
  rows.push(["Validation difference", "", "", "", "", formatAmount(report.validation.difference), "", ""]);
  return rows;
}

function buildCashflowRows(report: CashflowReport) {
  const rows: CsvRow[] = [
    [
      "Section",
      "Code",
      "Line",
      "ClassificationSource",
      "CashIn",
      "CashOut",
      "NetCashflow",
      "JournalEntryCount",
    ],
  ];

  for (const section of report.sections) {
    for (const line of section.lines) {
      rows.push([
        section.label,
        line.code,
        line.name,
        line.classificationSource,
        formatAmount(line.totalCashIn),
        formatAmount(line.totalCashOut),
        formatAmount(line.netCashflow),
        line.journalEntryCount,
      ]);
    }
    rows.push([
      `${section.label} total`,
      "",
      "",
      "",
      formatAmount(section.totalCashIn),
      formatAmount(section.totalCashOut),
      formatAmount(section.netCashflow),
      "",
    ]);
  }

  for (const line of report.unclassified.lines) {
    rows.push([
      report.unclassified.label,
      line.code,
      line.name,
      line.classificationSource,
      formatAmount(line.totalCashIn),
      formatAmount(line.totalCashOut),
      formatAmount(line.netCashflow),
      line.journalEntryCount,
    ]);
  }

  rows.push([
    "Unclassified total",
    "",
    "",
    "",
    formatAmount(report.unclassified.totalCashIn),
    formatAmount(report.unclassified.totalCashOut),
    formatAmount(report.unclassified.netCashflow),
    "",
  ]);
  rows.push([
    "Excluded transfers",
    "",
    "",
    "",
    formatAmount(report.excludedTransfers.totalCashIn),
    formatAmount(report.excludedTransfers.totalCashOut),
    formatAmount(report.excludedTransfers.netCashflow),
    report.excludedTransfers.entryCount,
  ]);
  rows.push([
    "Net cashflow",
    "",
    "",
    "",
    formatAmount(report.totalCashIn),
    formatAmount(report.totalCashOut),
    formatAmount(report.netCashflow),
    "",
  ]);
  return rows;
}

export function buildAccountingReportCsv(input: {
  snapshot: WorkspaceAccountingReportsSnapshot;
  workspaceName: string;
  statement: AccountingStatementExportKind;
}) {
  const bodyRows =
    input.statement === "profit-loss"
      ? buildProfitLossRows(input.snapshot.profitLoss)
      : input.statement === "balance-sheet"
        ? buildBalanceSheetRows(input.snapshot.balanceSheet)
        : input.statement === "trial-balance"
          ? buildTrialBalanceRows(input.snapshot.trialBalance)
          : buildCashflowRows(input.snapshot.cashflow);

  return toCsvRows([
    ...buildMetadataRows(input),
    ...bodyRows,
  ]);
}

export function buildAccountingReportJson(input: {
  snapshot: WorkspaceAccountingReportsSnapshot;
  workspaceName: string;
  statement: AccountingStatementExportKind;
}) {
  const report =
    input.statement === "profit-loss"
      ? input.snapshot.profitLoss
      : input.statement === "balance-sheet"
        ? input.snapshot.balanceSheet
        : input.statement === "trial-balance"
          ? input.snapshot.trialBalance
          : input.snapshot.cashflow;

  return JSON.stringify(
    {
      workspaceId: input.snapshot.workspaceId,
      workspaceName: input.workspaceName,
      statement: input.statement,
      statementLabel: STATEMENT_LABELS[input.statement],
      currency: input.snapshot.currency,
      source: input.snapshot.source,
      period: input.snapshot.period,
      generatedAt: input.snapshot.generatedAt,
      auditBasis: "Posted journal lines only",
      report,
    },
    null,
    2
  );
}

export function buildAccountingReportExportFilename(input: {
  workspaceName: string;
  statement: AccountingStatementExportKind;
  periodLabel: string;
  extension: "csv" | "json";
}) {
  return [
    "taxbook",
    sanitizeFilePart(input.workspaceName),
    sanitizeFilePart(input.statement),
    sanitizeFilePart(input.periodLabel),
  ].join("-") + `.${input.extension}`;
}
