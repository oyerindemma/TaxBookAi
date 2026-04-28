import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountingReportCsv,
  buildAccountingReportExportFilename,
  buildAccountingReportJson,
  parseAccountingStatementExportKind,
} from "./accounting-report-export";
import type { WorkspaceAccountingReportsSnapshot } from "./accounting-report-types";

const snapshot: WorkspaceAccountingReportsSnapshot = {
  workspaceId: 42,
  currency: "NGN",
  source: "POSTED_JOURNAL_LINES",
  generatedAt: "2026-04-28T10:00:00.000Z",
  period: {
    mode: "month",
    label: "April 2026",
    from: "2026-04-01",
    to: "2026-04-30",
    asOf: "2026-04-30",
  },
  profitLoss: {
    revenueAccounts: [
      {
        accountId: 1,
        code: "4000",
        name: "Sales Revenue",
        accountClass: "REVENUE",
        isActive: true,
        derived: false,
        lineCount: 2,
        debitTotal: 0,
        creditTotal: 1_500_000,
        balance: 1_500_000,
      },
    ],
    expenseAccounts: [],
    totalRevenue: 1_500_000,
    totalExpenses: 0,
    netProfit: 1_500_000,
    empty: false,
  },
  trialBalance: {
    accounts: [],
    totalDebits: 1_500_000,
    totalCredits: 1_500_000,
    validation: {
      isBalanced: true,
      difference: 0,
    },
    empty: false,
  },
  balanceSheet: {
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 1_500_000,
    totalLiabilities: 0,
    totalEquity: 1_500_000,
    totalLiabilitiesAndEquity: 1_500_000,
    currentEarnings: 1_500_000,
    validation: {
      isBalanced: true,
      difference: 0,
    },
    empty: false,
  },
  cashflow: {
    method: "DIRECT",
    totalCashIn: 1_500_000,
    totalCashOut: 0,
    netCashflow: 1_500_000,
    sections: [],
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
    empty: false,
  },
};

test("financial statement export aliases resolve to canonical statements", () => {
  assert.equal(parseAccountingStatementExportKind("pl"), "profit-loss");
  assert.equal(parseAccountingStatementExportKind("cash-flow"), "cashflow");
  assert.equal(parseAccountingStatementExportKind("trial-balance"), "trial-balance");
  assert.equal(parseAccountingStatementExportKind("unknown"), null);
});

test("financial statement CSV includes audit metadata and statement totals", () => {
  const csv = buildAccountingReportCsv({
    snapshot,
    workspaceName: "Demo Workspace",
    statement: "profit-loss",
  });

  assert.match(csv, /Workspace,Demo Workspace/);
  assert.match(csv, /Source,POSTED_JOURNAL_LINES/);
  assert.match(csv, /Basis,Posted journal lines only/);
  assert.match(csv, /Sales Revenue/);
  assert.match(csv, /Net profit,,,,,15000.00,/);
});

test("financial statement JSON exposes audit basis and selected report", () => {
  const json = JSON.parse(
    buildAccountingReportJson({
      snapshot,
      workspaceName: "Demo Workspace",
      statement: "balance-sheet",
    })
  ) as Record<string, unknown>;

  assert.equal(json.statement, "balance-sheet");
  assert.equal(json.auditBasis, "Posted journal lines only");
  assert.equal((json.report as { validation: { isBalanced: boolean } }).validation.isBalanced, true);
});

test("financial statement filenames are stable and safe", () => {
  assert.equal(
    buildAccountingReportExportFilename({
      workspaceName: "Ada & Sons Ltd.",
      statement: "trial-balance",
      periodLabel: "April 2026",
      extension: "csv",
    }),
    "taxbook-ada-sons-ltd-trial-balance-april-2026.csv"
  );
});
