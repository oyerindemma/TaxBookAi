"use client";

import { useMemo, useState } from "react";
import { Download, FileJson, Printer } from "lucide-react";
import type {
  BalanceSheetReport,
  CashflowReport,
  ProfitLossReport,
  TrialBalanceReport,
} from "@/lib/accounting-report-types";
import { Button } from "@/components/ui/button";

type ExportPayloadBase = {
  workspaceName: string;
  currency: string;
  generatedAt: string;
  periodLabel: string;
};

type ExportPayload =
  | (ExportPayloadBase & {
      reportKind: "profit-loss";
      report: ProfitLossReport;
    })
  | (ExportPayloadBase & {
      reportKind: "balance-sheet";
      report: BalanceSheetReport;
    })
  | (ExportPayloadBase & {
      reportKind: "trial-balance";
      report: TrialBalanceReport;
    })
  | (ExportPayloadBase & {
      reportKind: "cashflow";
      report: CashflowReport;
    });

type ReportExportActionsProps = {
  payload: ExportPayload;
  disabled?: boolean;
};

type CsvRow = Array<string | number>;

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function formatAmount(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function csvEscapeCell(value: string | number) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadFile(content: BlobPart, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pushTotalRow(rows: CsvRow[], label: string, values: Array<string | number>) {
  rows.push([label, ...values]);
}

function buildProfitLossCsvRows(report: ProfitLossReport) {
  const rows: CsvRow[] = [
    ["Section", "Code", "Account", "Money Out Total", "Money In Total", "Running Balance", "Line Count"],
  ];

  for (const line of report.revenueAccounts ?? []) {
    rows.push([
      "Revenue",
      line.code ?? "",
      line.name,
      formatAmount(line.debitTotal ?? 0),
      formatAmount(line.creditTotal ?? 0),
      formatAmount(line.balance ?? 0),
      line.lineCount ?? 0,
    ]);
  }

  pushTotalRow(rows, "Total revenue", ["", "", formatAmount(report.totalRevenue ?? 0), ""]);
  rows.push([]);

  for (const line of report.expenseAccounts ?? []) {
    rows.push([
      "Expense",
      line.code ?? "",
      line.name,
      formatAmount(line.debitTotal ?? 0),
      formatAmount(line.creditTotal ?? 0),
      formatAmount(line.balance ?? 0),
      line.lineCount ?? 0,
    ]);
  }

  pushTotalRow(rows, "Total expenses", ["", "", formatAmount(report.totalExpenses ?? 0), ""]);
  pushTotalRow(rows, "Net profit", ["", "", formatAmount(report.netProfit ?? 0), ""]);
  return rows;
}

function buildBalanceSheetCsvRows(report: BalanceSheetReport) {
  const rows: CsvRow[] = [
    ["Section", "Code", "Account", "Money Out Total", "Money In Total", "Running Balance", "Derived"],
  ];

  for (const [sectionLabel, sectionRows] of [
    ["Assets", report.assets ?? []],
    ["Liabilities", report.liabilities ?? []],
    ["Equity", report.equity ?? []],
  ] as const) {
    for (const line of sectionRows) {
      rows.push([
        sectionLabel,
        line.code ?? "",
        line.name,
        formatAmount(line.debitTotal ?? 0),
        formatAmount(line.creditTotal ?? 0),
        formatAmount(line.balance ?? 0),
        line.derived ? "Yes" : "No",
      ]);
    }
  }

  pushTotalRow(rows, "Total assets", ["", "", formatAmount(report.totalAssets ?? 0), ""]);
  pushTotalRow(rows, "Total liabilities", ["", "", formatAmount(report.totalLiabilities ?? 0), ""]);
  pushTotalRow(rows, "Total equity", ["", "", formatAmount(report.totalEquity ?? 0), ""]);
  pushTotalRow(rows, "Liabilities and equity", [
    "",
    "",
    formatAmount(report.totalLiabilitiesAndEquity ?? 0),
    "",
  ]);
  return rows;
}

function buildTrialBalanceCsvRows(report: TrialBalanceReport) {
  const rows: CsvRow[] = [
    [
      "Code",
      "Account",
      "Class",
      "Period Debits",
      "Period Credits",
      "Ending Debit Balance",
      "Ending Credit Balance",
    ],
  ];

  for (const line of report.accounts ?? []) {
    rows.push([
      line.code ?? "",
      line.name,
      line.accountClass,
      formatAmount(line.debitTotal ?? 0),
      formatAmount(line.creditTotal ?? 0),
      formatAmount(line.endingDebitBalance ?? 0),
      formatAmount(line.endingCreditBalance ?? 0),
    ]);
  }

  pushTotalRow(rows, "Totals", [
    "",
    "",
    formatAmount(report.totalDebits ?? 0),
    formatAmount(report.totalCredits ?? 0),
    "",
    "",
  ]);
  return rows;
}

function buildCashflowCsvRows(report: CashflowReport) {
  const rows: CsvRow[] = [
    [
      "Section",
      "Code",
      "Line",
      "Classification",
      "Cash In",
      "Cash Out",
      "Net Cashflow",
      "Journal Entries",
    ],
  ];

  for (const section of report.sections ?? []) {
    for (const line of section.lines ?? []) {
      rows.push([
        section.label,
        line.code ?? "",
        line.name,
        line.classificationSource,
        formatAmount(line.totalCashIn ?? 0),
        formatAmount(line.totalCashOut ?? 0),
        formatAmount(line.netCashflow ?? 0),
        line.journalEntryCount ?? 0,
      ]);
    }
  }

  for (const line of report.unclassified?.lines ?? []) {
    rows.push([
      report.unclassified?.label ?? "Unclassified",
      line.code ?? "",
      line.name,
      line.classificationSource,
      formatAmount(line.totalCashIn ?? 0),
      formatAmount(line.totalCashOut ?? 0),
      formatAmount(line.netCashflow ?? 0),
      line.journalEntryCount ?? 0,
    ]);
  }

  pushTotalRow(rows, "Total cash in", ["", "", "", formatAmount(report.totalCashIn ?? 0), "", ""]);
  pushTotalRow(rows, "Total cash out", ["", "", "", "", formatAmount(report.totalCashOut ?? 0), ""]);
  pushTotalRow(rows, "Net cashflow", ["", "", "", "", "", formatAmount(report.netCashflow ?? 0)]);
  return rows;
}

function buildCsv(payload: ExportPayload) {
  const metaRows: CsvRow[] = [
    ["Workspace", payload.workspaceName],
    ["Report", payload.reportKind],
    ["Currency", payload.currency],
    ["Period", payload.periodLabel],
    ["Generated At", payload.generatedAt],
    [],
  ];

  const bodyRows =
    payload.reportKind === "profit-loss"
      ? buildProfitLossCsvRows(payload.report)
      : payload.reportKind === "balance-sheet"
        ? buildBalanceSheetCsvRows(payload.report)
        : payload.reportKind === "trial-balance"
          ? buildTrialBalanceCsvRows(payload.report)
          : buildCashflowCsvRows(payload.report);

  return [...metaRows, ...bodyRows]
    .map((row) => row.map(csvEscapeCell).join(","))
    .join("\n");
}

export default function ReportExportActions({
  payload,
  disabled = false,
}: ReportExportActionsProps) {
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const fileStem = useMemo(() => {
    return [
      "taxbook",
      sanitizeFilePart(payload.workspaceName),
      sanitizeFilePart(payload.reportKind),
      sanitizeFilePart(payload.periodLabel),
    ].join("-");
  }, [payload.periodLabel, payload.reportKind, payload.workspaceName]);

  function handleJsonExport() {
    setExportingJson(true);
    try {
      downloadFile(JSON.stringify(payload, null, 2), `${fileStem}.json`, "application/json");
    } finally {
      setExportingJson(false);
    }
  }

  function handleCsvExport() {
    setExportingCsv(true);
    try {
      downloadFile(buildCsv(payload), `${fileStem}.csv`, "text/csv;charset=utf-8");
    } finally {
      setExportingCsv(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" onClick={handleCsvExport} disabled={disabled || exportingCsv}>
        <Download className="size-4" />
        {exportingCsv ? "Exporting..." : "CSV"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={handleJsonExport}
        disabled={disabled || exportingJson}
      >
        <FileJson className="size-4" />
        {exportingJson ? "Exporting..." : "JSON"}
      </Button>
      <Button type="button" variant="outline" onClick={handlePrint} disabled={disabled}>
        <Printer className="size-4" />
        Print
      </Button>
    </div>
  );
}
