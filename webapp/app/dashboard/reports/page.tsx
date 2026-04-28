import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AccountingAccountClass,
  CashflowActivityType,
} from "@prisma/client";
import type {
  AccountingReportLine,
  BalanceSheetReport,
  CashflowReport,
  CashflowSection,
  ProfitLossReport,
  TrialBalanceReport,
  WorkspaceAccountingReportsSnapshot,
} from "@/lib/accounting-report-types";
import { requireUser } from "@/lib/auth";
import { getWorkspaceAccountingReportsSnapshot } from "@/lib/accounting-reports";
import { formatDashboardCurrency } from "@/lib/dashboard-formatting";
import type { ResolvedAccountingReportPeriod } from "@/lib/report-period";
import { resolveAccountingReportPeriod } from "@/lib/report-period";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReportExportActions from "./_components/ReportExportActions";
import {
  type ReportsTabId,
  getTabMeta,
  PeriodFilterCard,
  ReportDataTable,
  ReportPrintableNote,
  ReportsHeader,
  ReportsTabNav,
  SummaryCards,
} from "./_components/ReportsUI";

type SearchParams = {
  statement?: string | string[];
  period?: string | string[];
  month?: string | string[];
  quarter?: string | string[];
  year?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

type TableSummaryItem = {
  label: string;
  value: ReactNode;
};

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveActiveTab(value: string | undefined): ReportsTabId {
  if (value === "balance-sheet") return "balance-sheet";
  if (value === "trial-balance") return "trial-balance";
  if (value === "cashflow") return "cashflow";
  return "profit-loss";
}

function buildReportHref(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/dashboard/reports?${query}` : "/dashboard/reports";
}

function setQueryParam(params: URLSearchParams, key: string, value?: string) {
  if (value?.trim()) {
    params.set(key, value);
  }
}

function buildPeriodQueryParams(
  activeTab: ReportsTabId,
  mode: ResolvedAccountingReportPeriod["mode"],
  period: ResolvedAccountingReportPeriod
) {
  const params = new URLSearchParams();
  params.set("statement", activeTab);

  if (mode !== "all") {
    params.set("period", mode);
  }

  if (mode === "month") {
    setQueryParam(params, "month", period.monthInput);
  }

  if (mode === "quarter") {
    setQueryParam(params, "quarter", period.quarterInput);
    setQueryParam(params, "year", period.yearInput);
  }

  if (mode === "year") {
    setQueryParam(params, "year", period.yearInput);
  }

  if (mode === "custom") {
    setQueryParam(params, "from", period.fromInput);
    setQueryParam(params, "to", period.toInput);
  }

  return params;
}

function formatAccountLabel(code: string | null, name: string) {
  return code ? `${code} ${name}` : name;
}

function formatCashflowActivityLabel(activity: CashflowActivityType) {
  if (activity === "OPERATING") return "Operating";
  if (activity === "INVESTING") return "Investing";
  return "Financing";
}

function formatClassificationSource(source: CashflowReport["unclassified"]["lines"][number]["classificationSource"]) {
  if (source === "BANK_TRANSACTION_CATEGORY") return "Bank category";
  if (source === "COUNTERPART_ACCOUNT") return "Ledger account";
  return "Unclassified";
}

function badgeVariantForAccountClass(accountClass: AccountingAccountClass | "DERIVED_EQUITY") {
  if (accountClass === "ASSET" || accountClass === "REVENUE") return "secondary" as const;
  if (accountClass === "LIABILITY" || accountClass === "EXPENSE") return "outline" as const;
  if (accountClass === "DERIVED_EQUITY") return "ghost" as const;
  return "default" as const;
}

function badgeVariantForCashflowActivity(activity: CashflowActivityType) {
  if (activity === "OPERATING") return "secondary" as const;
  if (activity === "INVESTING") return "outline" as const;
  return "default" as const;
}

function AmountCell({
  amountMinor,
  currency,
  className,
}: {
  amountMinor: number;
  currency: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        amountMinor === 0 ? "text-slate-400" : "text-slate-900",
        className
      )}
    >
      {formatDashboardCurrency(amountMinor, currency)}
    </span>
  );
}

function AccountCell({
  line,
  includeLineCount = false,
}: {
  line: Pick<AccountingReportLine, "code" | "name" | "derived" | "lineCount">;
  includeLineCount?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="font-medium text-slate-950">{formatAccountLabel(line.code, line.name)}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {line.derived ? <Badge variant="outline">Derived</Badge> : null}
        {includeLineCount ? <span>{line.lineCount} line{line.lineCount === 1 ? "" : "s"}</span> : null}
      </div>
    </div>
  );
}

function TableSummary({ items }: { items: TableSummaryItem[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[18px] border border-slate-200/80 bg-slate-50/80 px-4 py-3"
        >
          <dt className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-950">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function buildProfitLossRows(
  lines: ProfitLossReport["revenueAccounts"],
  currency: string
) {
  return lines.map((line) => ({
    key: `${line.accountId}-${line.code ?? "uncoded"}-${line.name}`,
    cells: {
      account: <AccountCell line={line} includeLineCount />,
      debits: <AmountCell amountMinor={line.debitTotal} currency={currency} />,
      credits: <AmountCell amountMinor={line.creditTotal} currency={currency} />,
      balance: <AmountCell amountMinor={line.balance} currency={currency} />,
      lines: <span className="tabular-nums text-slate-600">{line.lineCount}</span>,
    },
  }));
}

function buildBalanceSheetRows(
  lines: BalanceSheetReport["assets"],
  currency: string
) {
  return lines.map((line) => ({
    key: `${line.accountId ?? "derived"}-${line.code ?? "uncoded"}-${line.name}`,
    cells: {
      account: <AccountCell line={line} includeLineCount />,
      debits: <AmountCell amountMinor={line.debitTotal} currency={currency} />,
      credits: <AmountCell amountMinor={line.creditTotal} currency={currency} />,
      balance: <AmountCell amountMinor={line.balance} currency={currency} />,
      source: line.derived ? <Badge variant="outline">Derived</Badge> : <span className="text-slate-500">Ledger</span>,
    },
  }));
}

function buildTrialBalanceRows(report: TrialBalanceReport, currency: string) {
  if (report.empty) {
    return [];
  }

  return report.accounts.map((line) => ({
    key: `${line.accountId}-${line.code ?? "uncoded"}-${line.name}`,
    cells: {
      account: <AccountCell line={line} />,
      class: <Badge variant={badgeVariantForAccountClass(line.accountClass)}>{line.accountClass}</Badge>,
      periodDebits: <AmountCell amountMinor={line.debitTotal} currency={currency} />,
      periodCredits: <AmountCell amountMinor={line.creditTotal} currency={currency} />,
      endingDebit: <AmountCell amountMinor={line.endingDebitBalance} currency={currency} />,
      endingCredit: <AmountCell amountMinor={line.endingCreditBalance} currency={currency} />,
    },
  }));
}

function buildCashflowRows(section: CashflowSection | CashflowReport["unclassified"], currency: string) {
  return section.lines.map((line) => ({
    key: line.key,
    cells: {
      line: (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-slate-950">{formatAccountLabel(line.code, line.name)}</div>
          <div className="text-xs text-slate-500">
            {line.journalEntryCount} entr{line.journalEntryCount === 1 ? "y" : "ies"}
          </div>
        </div>
      ),
      source: (
        <div className="space-y-1">
          <Badge variant="outline">{formatClassificationSource(line.classificationSource)}</Badge>
          {line.accountClass ? (
            <div className="text-xs text-slate-500">{line.accountClass}</div>
          ) : null}
        </div>
      ),
      cashIn: <AmountCell amountMinor={line.totalCashIn} currency={currency} />,
      cashOut: <AmountCell amountMinor={line.totalCashOut} currency={currency} />,
      net: <AmountCell amountMinor={line.netCashflow} currency={currency} />,
      entries: <span className="tabular-nums text-slate-600">{line.journalEntryCount}</span>,
    },
  }));
}

function renderProfitLossContent(report: ProfitLossReport, currency: string) {
  const columns = [
    { key: "account", label: "Account" },
    { key: "debits", label: "Money Out", align: "right" as const },
    { key: "credits", label: "Money In", align: "right" as const },
    { key: "balance", label: "Running Balance", align: "right" as const },
    { key: "lines", label: "Lines", align: "right" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ReportDataTable
          title="Revenue"
          description="Posted income accounts for the selected reporting window."
          columns={columns}
          rows={buildProfitLossRows(report.revenueAccounts, currency)}
          emptyMessage="No income posted for this period. Review and post transactions to build this report."
          footer={
            <TableSummary
              items={[
                {
                  label: "Total revenue",
                  value: <AmountCell amountMinor={report.totalRevenue} currency={currency} />,
                },
              ]}
            />
          }
        />
        <ReportDataTable
          title="Expenses"
          description="Posted expense accounts captured in journal lines."
          columns={columns}
          rows={buildProfitLossRows(report.expenseAccounts, currency)}
          emptyMessage="No expenses posted for this period. Review and post transactions to build this report."
          footer={
            <TableSummary
              items={[
                {
                  label: "Total expenses",
                  value: <AmountCell amountMinor={report.totalExpenses} currency={currency} />,
                },
              ]}
            />
          }
        />
      </div>

      <div className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Net profit</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {formatDashboardCurrency(report.netProfit, currency)}
            </p>
          </div>
          <Badge variant={report.netProfit >= 0 ? "secondary" : "outline"}>Posted ledger</Badge>
        </div>
      </div>
    </div>
  );
}

function renderBalanceSheetSection(
  title: string,
  description: string,
  lines: BalanceSheetReport["assets"],
  totalAmountMinor: number,
  currency: string
) {
  return (
    <ReportDataTable
      title={title}
      description={description}
      columns={[
        { key: "account", label: "Account" },
        { key: "debits", label: "Money Out", align: "right" as const },
        { key: "credits", label: "Money In", align: "right" as const },
        { key: "balance", label: "Running Balance", align: "right" as const },
        { key: "source", label: "Source", align: "right" as const },
      ]}
      rows={buildBalanceSheetRows(lines, currency)}
      emptyMessage={`No ${title.toLowerCase()} balances yet. Post reviewed bank transactions to build this report.`}
      footer={
        <TableSummary
          items={[
            {
              label: `Total ${title.toLowerCase()}`,
              value: <AmountCell amountMinor={totalAmountMinor} currency={currency} />,
            },
          ]}
        />
      }
    />
  );
}

function renderBalanceSheetContent(report: BalanceSheetReport, currency: string) {
  const validationBadge = report.validation.isBalanced ? (
    <Badge variant="secondary">Balanced</Badge>
  ) : (
    <Badge variant="destructive">
      Off by {formatDashboardCurrency(Math.abs(report.validation.difference), currency)}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        {renderBalanceSheetSection(
          "Assets",
          "Resources controlled by the workspace as of the report date.",
          report.assets,
          report.totalAssets,
          currency
        )}
        {renderBalanceSheetSection(
          "Liabilities",
          "Outstanding obligations recognized in the posted ledger.",
          report.liabilities,
          report.totalLiabilities,
          currency
        )}
        {renderBalanceSheetSection(
          "Equity",
          "Owner capital plus retained and current earnings.",
          report.equity,
          report.totalEquity,
          currency
        )}
      </div>

      <div className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">Accounting equation</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {formatDashboardCurrency(report.totalAssets, currency)} ={" "}
                {formatDashboardCurrency(report.totalLiabilitiesAndEquity, currency)}
              </p>
            </div>
            <TableSummary
              items={[
                {
                  label: "Current earnings",
                  value: <AmountCell amountMinor={report.currentEarnings} currency={currency} />,
                },
                {
                  label: "Total liabilities",
                  value: <AmountCell amountMinor={report.totalLiabilities} currency={currency} />,
                },
                {
                  label: "Total equity",
                  value: <AmountCell amountMinor={report.totalEquity} currency={currency} />,
                },
              ]}
            />
          </div>
          {validationBadge}
        </div>
      </div>
    </div>
  );
}

function renderTrialBalanceContent(report: TrialBalanceReport, currency: string) {
  const validationBadge = report.validation.isBalanced ? (
    <Badge variant="secondary">Balanced</Badge>
  ) : (
    <Badge variant="destructive">
      Difference {formatDashboardCurrency(Math.abs(report.validation.difference), currency)}
    </Badge>
  );

  return (
    <ReportDataTable
      title="Trial Balance"
      description="Money in, money out, and running totals for every ledger account."
      columns={[
        { key: "account", label: "Account" },
        { key: "class", label: "Class" },
        { key: "periodDebits", label: "Period Money Out", align: "right" as const },
        { key: "periodCredits", label: "Period Money In", align: "right" as const },
        { key: "endingDebit", label: "Ending Money Out", align: "right" as const },
        { key: "endingCredit", label: "Ending Money In", align: "right" as const },
      ]}
      rows={buildTrialBalanceRows(report, currency)}
      emptyMessage="No posted ledger activity yet. Review and post transactions to build this report."
      badge={validationBadge}
      footer={
        <TableSummary
          items={[
            {
              label: "Total debits",
              value: <AmountCell amountMinor={report.totalDebits} currency={currency} />,
            },
            {
              label: "Total credits",
              value: <AmountCell amountMinor={report.totalCredits} currency={currency} />,
            },
            {
              label: "Status",
              value: report.validation.isBalanced ? "Money in and out align" : "Needs review",
            },
          ]}
        />
      }
    />
  );
}

function renderCashflowSectionCard(
  section: CashflowSection | CashflowReport["unclassified"],
  currency: string,
  badge?: ReactNode
) {
  return (
    <ReportDataTable
      title={section.label}
      description="Direct-method cash movements grouped from posted cash journal entries."
      columns={[
        { key: "line", label: "Line" },
        { key: "source", label: "Source" },
        { key: "cashIn", label: "Cash in", align: "right" as const },
        { key: "cashOut", label: "Cash out", align: "right" as const },
        { key: "net", label: "Net", align: "right" as const },
        { key: "entries", label: "Entries", align: "right" as const },
      ]}
      rows={buildCashflowRows(section, currency)}
      emptyMessage="No cash movement in this section for the selected period."
      badge={badge}
      footer={
        <TableSummary
          items={[
            {
              label: "Total cash in",
              value: <AmountCell amountMinor={section.totalCashIn} currency={currency} />,
            },
            {
              label: "Total cash out",
              value: <AmountCell amountMinor={section.totalCashOut} currency={currency} />,
            },
            {
              label: "Net cashflow",
              value: <AmountCell amountMinor={section.netCashflow} currency={currency} />,
            },
          ]}
        />
      }
    />
  );
}

function renderCashflowContent(report: CashflowReport, currency: string) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        {report.sections.map((section) => (
          <div key={section.activity}>
            {renderCashflowSectionCard(
              section,
              currency,
              <Badge variant={badgeVariantForCashflowActivity(section.activity)}>
                {formatCashflowActivityLabel(section.activity)}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {report.unclassified.lines.length > 0 ? (
        renderCashflowSectionCard(
          report.unclassified,
          currency,
          <Badge variant="outline">Needs review</Badge>
        )
      ) : null}

      <div className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">Net cashflow</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {formatDashboardCurrency(report.netCashflow, currency)}
              </p>
            </div>
            <TableSummary
              items={[
                {
                  label: "Total cash in",
                  value: <AmountCell amountMinor={report.totalCashIn} currency={currency} />,
                },
                {
                  label: "Total cash out",
                  value: <AmountCell amountMinor={report.totalCashOut} currency={currency} />,
                },
                {
                  label: "Excluded transfers",
                  value: `${report.excludedTransfers.entryCount} entr${
                    report.excludedTransfers.entryCount === 1 ? "y" : "ies"
                  }`,
                },
              ]}
            />
          </div>
          <Badge variant="secondary">{report.method} method</Badge>
        </div>
      </div>
    </div>
  );
}

function buildExportPayload(
  snapshot: WorkspaceAccountingReportsSnapshot,
  workspaceName: string,
  activeTab: ReportsTabId
) {
  const basePayload = {
    workspaceName,
    currency: snapshot.currency,
    generatedAt: snapshot.generatedAt,
    periodLabel: snapshot.period.label,
  };

  if (activeTab === "balance-sheet") {
    return {
      ...basePayload,
      reportKind: "balance-sheet" as const,
      report: snapshot.balanceSheet,
    };
  }

  if (activeTab === "trial-balance") {
    return {
      ...basePayload,
      reportKind: "trial-balance" as const,
      report: snapshot.trialBalance,
    };
  }

  if (activeTab === "cashflow") {
    return {
      ...basePayload,
      reportKind: "cashflow" as const,
      report: snapshot.cashflow,
    };
  }

  return {
    ...basePayload,
    reportKind: "profit-loss" as const,
    report: snapshot.profitLoss,
  };
}

function renderActiveReportContent(
  snapshot: WorkspaceAccountingReportsSnapshot,
  activeTab: ReportsTabId
) {
  if (activeTab === "balance-sheet") {
    return renderBalanceSheetContent(snapshot.balanceSheet, snapshot.currency);
  }

  if (activeTab === "trial-balance") {
    return renderTrialBalanceContent(snapshot.trialBalance, snapshot.currency);
  }

  if (activeTab === "cashflow") {
    return renderCashflowContent(snapshot.cashflow, snapshot.currency);
  }

  return renderProfitLossContent(snapshot.profitLoss, snapshot.currency);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const activeTab = resolveActiveTab(firstString(resolvedSearchParams.statement));
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-6">
        <ReportsHeader
          workspaceName="Unavailable"
          periodLabel="All time"
          generatedAt={new Date().toISOString()}
          activeTab={activeTab}
        />
        <DashboardEmptyState
          title="No workspace selected"
          message="Switch into an active workspace to view ledger-backed financial reports."
          action={
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          }
          className="rounded-[28px]"
        />
      </section>
    );
  }

  const requestedPeriod = resolveAccountingReportPeriod({
    period: firstString(resolvedSearchParams.period),
    month: firstString(resolvedSearchParams.month),
    quarter: firstString(resolvedSearchParams.quarter),
    year: firstString(resolvedSearchParams.year),
    from: firstString(resolvedSearchParams.from),
    to: firstString(resolvedSearchParams.to),
  });
  const effectivePeriod = requestedPeriod.errorMsg
    ? resolveAccountingReportPeriod({ period: "all" })
    : requestedPeriod;
  const snapshot = await getWorkspaceAccountingReportsSnapshot(
    membership.workspaceId,
    effectivePeriod
  );
  const workspaceName =
    membership.workspace.businessProfile?.businessName?.trim() || membership.workspace.name;
  const allReportsEmpty =
    snapshot.profitLoss.empty &&
    snapshot.balanceSheet.empty &&
    snapshot.trialBalance.empty &&
    snapshot.cashflow.empty;
  const filterErrorMessage = requestedPeriod.errorMsg
    ? `${requestedPeriod.errorMsg} Showing ${snapshot.period.label.toLowerCase()} data instead.`
    : null;

  function hrefForTab(tab: ReportsTabId) {
    return buildReportHref(buildPeriodQueryParams(tab, requestedPeriod.mode, requestedPeriod));
  }

  function hrefForMode(mode: "month" | "quarter" | "year" | "custom") {
    return buildReportHref(buildPeriodQueryParams(activeTab, mode, requestedPeriod));
  }

  return (
    <section className="space-y-6">
      <ReportPrintableNote
        title={getTabMeta(activeTab).label}
        periodLabel={snapshot.period.label}
        workspaceName={workspaceName}
        generatedAt={snapshot.generatedAt}
      />

      <ReportsHeader
        workspaceName={workspaceName}
        periodLabel={snapshot.period.label}
        generatedAt={snapshot.generatedAt}
        activeTab={activeTab}
        actions={
          <ReportExportActions
            payload={buildExportPayload(snapshot, workspaceName, activeTab)}
          />
        }
      />

      <ReportsTabNav activeTab={activeTab} hrefForTab={hrefForTab} />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SummaryCards
            currency={snapshot.currency}
            profitLoss={snapshot.profitLoss}
            balanceSheet={snapshot.balanceSheet}
            cashflow={snapshot.cashflow}
          />

          {allReportsEmpty ? (
            <DashboardEmptyState
              title="No posted data yet"
              message="Review and post bank transactions to create accountant-ready reports for this workspace."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/dashboard/banking/review">Review banking</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/dashboard/bookkeeping/review">Review bookkeeping</Link>
                  </Button>
                </div>
              }
              className="rounded-[28px]"
            />
          ) : (
            renderActiveReportContent(snapshot, activeTab)
          )}
        </div>

        <div className="space-y-6">
          <PeriodFilterCard
            activeTab={activeTab}
            mode={requestedPeriod.mode}
            monthInput={requestedPeriod.monthInput}
            quarterInput={requestedPeriod.quarterInput}
            yearInput={requestedPeriod.yearInput}
            fromInput={requestedPeriod.fromInput}
            toInput={requestedPeriod.toInput}
            modeHref={hrefForMode}
            clearHref={buildReportHref(new URLSearchParams({ statement: activeTab }))}
            errorMessage={filterErrorMessage}
          />

          <div className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] print:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Report source</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  These statements are generated from posted journal lines inside the workspace
                  ledger, with workspace scoping preserved across every report.
                </p>
              </div>
              <Badge variant="outline">{snapshot.source}</Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
