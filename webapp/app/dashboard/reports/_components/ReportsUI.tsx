import Link from "next/link";
import type { ReactNode } from "react";
import type {
  BalanceSheetReport,
  CashflowReport,
  ProfitLossReport,
} from "@/lib/accounting-report-types";
import {
  formatCompactDashboardCurrency,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import StatCard from "@/app/dashboard/_components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  Landmark,
  PieChart,
  Scale,
  Wallet,
} from "lucide-react";

export type ReportsTabId = "profit-loss" | "balance-sheet" | "trial-balance" | "cashflow";

type ReportsTabOption = {
  id: ReportsTabId;
  label: string;
  description: string;
};

type PeriodModeOption = {
  id: "month" | "quarter" | "year" | "custom";
  label: string;
};

type ReportSummaryInput = {
  currency: string;
  profitLoss: ProfitLossReport;
  balanceSheet: BalanceSheetReport;
  cashflow: CashflowReport;
};

type ReportTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

type ReportTableRow = {
  key: string;
  cells: Record<string, ReactNode>;
};

const REPORT_TABS: ReportsTabOption[] = [
  {
    id: "profit-loss",
    label: "Profit & Loss",
    description: "Revenue, expenses, and bottom-line performance.",
  },
  {
    id: "balance-sheet",
    label: "Balance Sheet",
    description: "Assets, liabilities, and equity at the selected date.",
  },
  {
    id: "trial-balance",
    label: "Trial Balance",
    description: "Money in, money out, and running totals.",
  },
  {
    id: "cashflow",
    label: "Cashflow",
    description: "Direct-method cash movements by activity.",
  },
];

const PERIOD_MODES: PeriodModeOption[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" },
];

type ReportHeaderProps = {
  workspaceName: string;
  periodLabel: string;
  generatedAt: string;
  activeTab: ReportsTabId;
  actions?: ReactNode;
};

export function getReportTabs() {
  return REPORT_TABS;
}

export function getTabMeta(activeTab: ReportsTabId) {
  return REPORT_TABS.find((tab) => tab.id === activeTab) ?? REPORT_TABS[0];
}

export function ReportsHeader({
  workspaceName,
  periodLabel,
  generatedAt,
  activeTab,
  actions,
}: ReportHeaderProps) {
  const tabMeta = getTabMeta(activeTab);

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
              Investor-ready
            </Badge>
            <Badge variant="outline" className="rounded-full">
              Workspace {workspaceName}
            </Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Financial reports
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              {tabMeta.description} Period: {periodLabel}. Generated{" "}
              {formatDashboardDate(new Date(generatedAt))}.
            </p>
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
}

type ReportsTabNavProps = {
  activeTab: ReportsTabId;
  hrefForTab: (tab: ReportsTabId) => string;
};

export function ReportsTabNav({ activeTab, hrefForTab }: ReportsTabNavProps) {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white/95 p-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] print:hidden">
      <div className="grid gap-2 md:grid-cols-4">
        {REPORT_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={hrefForTab(tab.id)}
              className={cn(
                "rounded-[16px] border px-4 py-3 text-left transition-colors",
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm"
                  : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
              )}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{tab.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type PeriodFilterCardProps = {
  activeTab: ReportsTabId;
  mode: "all" | "month" | "quarter" | "year" | "custom";
  monthInput: string;
  quarterInput: string;
  yearInput: string;
  fromInput: string;
  toInput: string;
  modeHref: (mode: PeriodModeOption["id"]) => string;
  clearHref: string;
  errorMessage?: string | null;
};

export function PeriodFilterCard({
  activeTab,
  mode,
  monthInput,
  quarterInput,
  yearInput,
  fromInput,
  toInput,
  modeHref,
  clearHref,
  errorMessage,
}: PeriodFilterCardProps) {
  const resolvedMode = mode === "all" ? null : mode;
  const formMode = resolvedMode ?? "custom";

  return (
    <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.06)] print:hidden">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.92)_100%)]">
        <CardTitle className="text-lg">Reporting period</CardTitle>
        <CardDescription>
          Choose the statement window without leaving the current report view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap gap-2">
          {PERIOD_MODES.map((option) => {
            const active = option.id === formMode && resolvedMode !== null;
            return (
              <Link
                key={option.id}
                href={modeHref(option.id)}
                className={cn(
                  buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                  active ? "bg-slate-950 text-white hover:bg-slate-900" : ""
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        {mode === "all" ? (
          <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Currently showing all posted history for this workspace.
          </div>
        ) : null}

        <form method="GET" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input type="hidden" name="statement" value={activeTab} />
          <input type="hidden" name="period" value={formMode} />

          <div className="grid gap-4 sm:grid-cols-2">
            {formMode === "month" ? (
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Month
                <input
                  type="month"
                  name="month"
                  defaultValue={monthInput}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            ) : null}

            {formMode === "quarter" ? (
              <>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Quarter
                  <select
                    name="quarter"
                    defaultValue={quarterInput}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Year
                  <input
                    type="number"
                    name="year"
                    min={2000}
                    max={2100}
                    defaultValue={yearInput}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                  />
                </label>
              </>
            ) : null}

            {formMode === "year" ? (
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Year
                <input
                  type="number"
                  name="year"
                  min={2000}
                  max={2100}
                  defaultValue={yearInput}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            ) : null}

            {formMode === "custom" ? (
              <>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  From
                  <input
                    type="date"
                    name="from"
                    defaultValue={fromInput}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  To
                  <input
                    type="date"
                    name="to"
                    defaultValue={toInput}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400"
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit">Apply</Button>
            <Button asChild variant="outline">
              <Link href={clearHref}>All time</Link>
            </Button>
          </div>
        </form>

        {errorMessage ? (
          <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ currency, profitLoss, balanceSheet, cashflow }: ReportSummaryInput) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-2">
      <StatCard
        label="Revenue"
        value={formatCompactDashboardCurrency(profitLoss.totalRevenue, currency)}
        description="Recognized income for the selected period."
        icon={ArrowUpCircle}
        accentClassName="bg-emerald-100 text-emerald-700"
      />
      <StatCard
        label="Expenses"
        value={formatCompactDashboardCurrency(profitLoss.totalExpenses, currency)}
        description="Operating costs captured in posted journal entries."
        icon={ArrowDownCircle}
        accentClassName="bg-rose-100 text-rose-700"
      />
      <StatCard
        label="Profit"
        value={formatCompactDashboardCurrency(profitLoss.netProfit, currency)}
        description="Bottom-line result for the current report window."
        icon={CircleDollarSign}
        accentClassName="bg-amber-100 text-amber-700"
      />
      <StatCard
        label="Assets"
        value={formatCompactDashboardCurrency(balanceSheet.totalAssets, currency)}
        description="Cash and other assets on the balance sheet."
        icon={Landmark}
        accentClassName="bg-sky-100 text-sky-700"
      />
      <StatCard
        label="Liabilities"
        value={formatCompactDashboardCurrency(balanceSheet.totalLiabilities, currency)}
        description="Obligations outstanding as of the report date."
        icon={Scale}
        accentClassName="bg-indigo-100 text-indigo-700"
      />
      <StatCard
        label="Equity"
        value={formatCompactDashboardCurrency(balanceSheet.totalEquity, currency)}
        description="Owner value including current earnings."
        icon={PieChart}
        accentClassName="bg-violet-100 text-violet-700"
      />
      <StatCard
        label="Net cashflow"
        value={formatCompactDashboardCurrency(cashflow.netCashflow, currency)}
        description="Cash inflows less outflows for the selected period."
        icon={Wallet}
        accentClassName="bg-cyan-100 text-cyan-700"
      />
    </div>
  );
}

type ReportDataTableProps = {
  title: string;
  description: string;
  columns: ReportTableColumn[];
  rows: ReportTableRow[];
  emptyMessage: string;
  footer?: ReactNode;
  badge?: ReactNode;
};

export function ReportDataTable({
  title,
  description,
  columns,
  rows,
  emptyMessage,
  footer,
  badge,
}: ReportDataTableProps) {
  return (
    <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.92)_100%)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {badge}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {rows.length === 0 ? (
          <DashboardEmptyState message={emptyMessage} className="rounded-[20px]" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "pb-3 font-medium text-slate-500",
                        column.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "py-3 align-top text-slate-700",
                          column.align === "right" ? "text-right" : "text-left"
                        )}
                      >
                        {row.cells[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {footer ? <div className="mt-5 border-t border-slate-200 pt-4">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

type ReportPrintableNoteProps = {
  title: string;
  periodLabel: string;
  workspaceName: string;
  generatedAt: string;
};

export function ReportPrintableNote({
  title,
  periodLabel,
  workspaceName,
  generatedAt,
}: ReportPrintableNoteProps) {
  return (
    <div className="hidden print:block">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {workspaceName} • {periodLabel} • Generated {formatDashboardDate(new Date(generatedAt))}
        </p>
      </div>
    </div>
  );
}
