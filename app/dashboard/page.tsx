import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  BarChart3,
  Bot,
  ClipboardList,
  DollarSign,
  FilePlus2,
  Landmark,
  type LucideIcon,
  PieChart,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { getWorkspaceClientBusinessPortfolio } from "@/lib/accountant-workspace";
import type { AccountantWorkspacePortfolioResponse } from "@/lib/accountant-workspace-types";
import { requireUser } from "@/lib/auth";
import { getWorkspaceBankTransactionReviewData } from "@/lib/bank-transaction-review";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  loadDashboardPageData,
  type DashboardExpenseCategoryRow,
  type DashboardKpiData,
  type DashboardMonthlyTrendRow,
  type DashboardWorkspaceSummary,
} from "@/lib/dashboard-data";
import { buildExplainMyNumbersHomeState } from "@/lib/explain-my-numbers-assistant";
import {
  formatCompactDashboardCurrency,
  formatDashboardCurrency,
} from "@/lib/dashboard-formatting";
import {
  buildFinancialHealthFallbackSnapshot,
  getFinancialHealthSnapshot,
} from "@/lib/financial-health";
import { getDashboardFilingReadinessSnapshot } from "@/lib/filing-readiness";
import { getDashboardExpenseLeakSnapshot } from "@/lib/expense-leaks";
import { logError } from "@/lib/logger";
import { getDashboardWorkspaceAlertSnapshot } from "@/lib/workspace-alerts";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import {
  buildWorkspaceOnboardingDashboardConfig,
  buildWorkspaceOnboardingSnapshot,
} from "@/lib/workspace-onboarding";
import ExplainMyNumbersAssistantPanel from "@/app/dashboard/_components/ExplainMyNumbersAssistantPanel";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import DashboardPanel from "@/app/dashboard/_components/DashboardPanel";
import DashboardSectionHeader from "@/app/dashboard/_components/DashboardSectionHeader";
import ExpenseLeakWidget from "@/app/dashboard/_components/ExpenseLeakWidget";
import FinancialHealthCard from "@/app/dashboard/_components/FinancialHealthCard";
import FilingReadinessWidget from "@/app/dashboard/_components/FilingReadinessWidget";
import ReviewQueuePreview from "@/app/dashboard/_components/ReviewQueuePreview";
import StatCard from "@/app/dashboard/_components/StatCard";
import TransactionsTable from "@/app/dashboard/_components/TransactionsTable";
import WorkspaceAlertWidget from "@/app/dashboard/_components/WorkspaceAlertWidget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";

type QuickAction = {
  href: string;
  label: string;
  description: string;
};

type KpiCardConfig = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accentClassName?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/dashboard/tax-records/new",
    label: "Create tax record",
    description: "Capture new income, VAT, WHT, or expense activity right away.",
  },
  {
    href: "/dashboard/reports",
    label: "Review reports",
    description: "Turn recent activity into a polished reporting view for month-end.",
  },
  {
    href: "/dashboard/bookkeeping/review",
    label: "Clear review queue",
    description: "Tighten categorization and clean up the records waiting for review.",
  },
];

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getSafeDisplayName(fullName?: string | null) {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

function clampWidth(percentage: number) {
  if (!Number.isFinite(percentage) || percentage <= 0) {
    return "0%";
  }

  return `${Math.max(10, Math.min(100, percentage))}%`;
}

function buildTaxDueDescription(kpis: DashboardKpiData) {
  if (kpis.taxSummaryGeneratedAt) {
    return `${kpis.totalDueExplanation} Updated ${formatActivityDate(kpis.taxSummaryGeneratedAt)}.`;
  }

  return kpis.totalDueExplanation;
}

function buildVatDueDescription(kpis: DashboardKpiData) {
  return kpis.vatDueExplanation;
}

function buildWhtDueDescription(kpis: DashboardKpiData) {
  return kpis.whtDueExplanation;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatActivityDate(value: string | null) {
  if (!value) return "No activity yet";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RevenuePanel({
  rows,
  currency,
}: {
  rows: DashboardMonthlyTrendRow[];
  currency: string;
}) {
  const hasActivity = rows.some(
    (row) => row.revenue > 0 || row.expenses > 0 || Math.abs(row.taxLiability) > 0
  );
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.revenue,
      row.expenses,
      Math.abs(row.taxLiability),
    ])
  );

  return (
    <DashboardPanel
      eyebrow="Operations"
      title="Revenue trend"
      description="A monthly view of revenue, expense pressure, and tax intensity for the active workspace."
      icon={BarChart3}
      headerAction={
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          Last 6 months
        </Badge>
      }
    >
      {rows.length === 0 || !hasActivity ? (
        <DashboardEmptyState
          title="No trend data yet"
          message="As revenue, expenses, and tax activity land in this workspace, the trend view will update automatically."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{row.label}</div>
                  <div className="text-xs text-slate-500">
                    Revenue {formatCompactDashboardCurrency(row.revenue, currency)} and expenses{" "}
                    {formatCompactDashboardCurrency(row.expenses, currency)}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-amber-200 bg-amber-50 text-amber-900"
                >
                  Tax {formatCompactDashboardCurrency(Math.abs(row.taxLiability), currency)}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-[74px_1fr_88px] items-center gap-3 sm:grid-cols-[88px_1fr_98px]">
                  <span className="text-xs font-medium text-slate-500">Revenue</span>
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-gradient-primary"
                      style={{ width: clampWidth((row.revenue / maxValue) * 100) }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium text-slate-950">
                    {formatCompactDashboardCurrency(row.revenue, currency)}
                  </span>
                </div>

                <div className="grid grid-cols-[74px_1fr_88px] items-center gap-3 sm:grid-cols-[88px_1fr_98px]">
                  <span className="text-xs font-medium text-slate-500">Expenses</span>
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-blue"
                      style={{ width: clampWidth((row.expenses / maxValue) * 100) }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium text-slate-950">
                    {formatCompactDashboardCurrency(row.expenses, currency)}
                  </span>
                </div>

                <div className="grid grid-cols-[74px_1fr_88px] items-center gap-3 sm:grid-cols-[88px_1fr_98px]">
                  <span className="text-xs font-medium text-slate-500">Tax load</span>
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-amber-500"
                      style={{
                        width: clampWidth((Math.abs(row.taxLiability) / maxValue) * 100),
                      }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium text-slate-950">
                    {formatCompactDashboardCurrency(Math.abs(row.taxLiability), currency)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function ExpensePanel({
  rows,
  currency,
}: {
  rows: DashboardExpenseCategoryRow[];
  currency: string;
}) {
  return (
    <DashboardPanel
      eyebrow="Operations"
      title="Expense breakdown"
      description="See which categories are driving spend so review and policy work stay focused."
      icon={PieChart}
    >
      {rows.length === 0 ? (
        <DashboardEmptyState
          title="No categorized expenses yet"
          message="Expense categories will appear here once transactions are reviewed and tagged."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-950">{row.label}</div>
                  <div className="text-xs text-slate-500">
                    {row.count} transaction{row.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-950">
                    {formatCompactDashboardCurrency(row.amount, currency)}
                  </div>
                  <div className="text-xs text-slate-500">{formatPercent(row.share)}</div>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200">
                <div
                  className="h-2.5 rounded-full bg-gradient-primary"
                  style={{ width: clampWidth(row.share * 100) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function QuickActions({
  actions,
  title = "Next best actions",
  description = "Fast paths into the parts of the product your finance team is likely to touch next.",
}: {
  actions: QuickAction[];
  title?: string;
  description?: string;
}) {
  return (
    <DashboardPanel
      eyebrow="Controls"
      title={title}
      description={description}
      icon={Sparkles}
    >
      <div className="space-y-3">
        {actions.map((action) => (
          <div
            key={action.href}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
          >
            <div className="text-sm font-semibold text-slate-950">{action.label}</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
            <Button
              asChild
              size="sm"
              aria-label={`Open ${action.label}`}
              className="mt-4 rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90 hover:text-white"
            >
              <Link href={action.href}>
                Open
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

function DashboardErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[28px] border border-rose-200 bg-rose-50/90 p-6 shadow-[0_12px_30px_rgba(225,29,72,0.08)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
            <AlertTriangle className="size-3.5" />
            Dashboard warning
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-rose-950">
            Some dashboard modules could not be refreshed
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-rose-800">{message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="border-rose-300 text-rose-900 hover:bg-rose-100">
            <Link href="/dashboard/workspaces">Check workspace</Link>
          </Button>
          <Button asChild className="bg-rose-900 text-white hover:bg-rose-950">
            <Link href="/dashboard/banking/review">Open review queue</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DashboardWorkspaceSummaryPanel({
  summary,
  scope,
}: {
  summary: DashboardWorkspaceSummary | null;
  scope: "workspace" | "user";
}) {
  return (
    <DashboardPanel
      eyebrow="Controls"
      title="Workspace summary"
      description="Live coverage across the active workspace so you can see where the operating picture is still thin."
      icon={ShieldCheck}
    >
      {!summary ? (
        <DashboardEmptyState
          title="Summary unavailable"
          message={
            scope === "workspace"
              ? "A workspace is active, but the summary snapshot has not populated yet."
              : "Select an active workspace to unlock a deeper operating summary."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workspace
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {summary.workspaceName}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary.clientBusinessCount} client business
              {summary.clientBusinessCount === 1 ? "" : "es"} and {summary.membersCount} team member
              {summary.membersCount === 1 ? "" : "s"} are active.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Coverage
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {summary.trackedTransactionCount} tracked transactions
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary.recentTransactionCount} are visible in the recent feed, with last activity on{" "}
              {formatActivityDate(summary.lastTransactionAt?.toISOString() ?? null)}.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Categorization
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {formatPercent(summary.expenseCategorizationRate)}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary.representedCategoryCount} categories are represented out of{" "}
              {summary.expenseCategoryCount} available expense categories.
            </p>
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

function AccountantPortfolioPanel({
  portfolio,
}: {
  portfolio: AccountantWorkspacePortfolioResponse;
}) {
  return (
    <DashboardPanel
      eyebrow="Portfolio"
      title="Accountant workspace"
      description="A top-level client portfolio view with live review pressure and current-month exposure."
      icon={Wallet}
      headerAction={
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          {portfolio.workspace.taxExposureDateLabel}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Client businesses
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {portfolio.workspace.activeClientBusinessCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {portfolio.workspace.archivedClientBusinessCount} archived
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Review queue
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {portfolio.workspace.reviewQueueCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {portfolio.workspace.transactionCount} tracked transactions
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tax exposure
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatMoney(
              portfolio.workspace.estimatedTaxExposureMinor,
              portfolio.workspace.currency
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Last activity {formatActivityDate(portfolio.workspace.lastActivityAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          asChild
          className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90 hover:text-white"
        >
          <Link href="/dashboard/client-businesses">
            Open client businesses
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/dashboard/banking/review">Clear review queue</Link>
        </Button>
      </div>
    </DashboardPanel>
  );
}

function AccountantExposurePanel({
  portfolio,
}: {
  portfolio: AccountantWorkspacePortfolioResponse;
}) {
  const businesses = portfolio.clientBusinesses.slice(0, 5);

  return (
    <DashboardPanel
      eyebrow="Portfolio"
      title="Client priorities"
      description="Highest exposure and review attention across the active accountant workspace."
      icon={Landmark}
    >
      {businesses.length === 0 ? (
        <DashboardEmptyState
          title="No client businesses yet"
          message="Create a client business to start surfacing exposure and review priorities here."
        />
      ) : (
        <div className="space-y-3">
          {businesses.map((business) => (
            <div
              key={business.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{business.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {business.transactionCount} transactions · {business.reviewQueueCount} need review
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                  {business.status}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Exposure
                  </div>
                  <div className="text-sm font-semibold text-slate-950">
                    {formatMoney(
                      business.taxExposure.estimatedTaxExposureMinor,
                      business.taxExposure.currency
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>
                    VAT net{" "}
                    {formatMoney(
                      business.taxExposure.vatNetMinor,
                      business.taxExposure.currency
                    )}
                  </div>
                  <div>Last activity {formatActivityDate(business.lastActivityAt)}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/banking/review?clientBusinessId=${business.id}`}>
                    Review
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/dashboard/tax-center?clientBusinessId=${business.id}`}>
                    Tax center
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function TaxExposureSummaryPanel({
  kpis,
  recordCount,
  pendingReviewCount,
}: {
  kpis: DashboardKpiData;
  recordCount: number;
  pendingReviewCount: number;
}) {
  const isProvisional = pendingReviewCount > 0;

  return (
    <DashboardPanel
      className="h-full"
      eyebrow="Tax"
      title="Tax exposure summary"
      description="Live VAT and WHT exposure for the current period, kept grounded to reviewed workspace data."
      icon={DollarSign}
      headerAction={
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          {kpis.taxSummaryDateLabel}
        </Badge>
      }
    >
      {recordCount === 0 ? (
        <DashboardEmptyState
          title="No tax-ready activity yet"
          message="Import transactions or post ledger activity to generate a live tax exposure view for this workspace."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold tracking-tight text-slate-950">
                {formatDashboardCurrency(kpis.taxDueMinor, kpis.currency)}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                {buildTaxDueDescription(kpis)}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                isProvisional
                  ? "rounded-full border-amber-200 bg-amber-50 text-amber-900"
                  : "rounded-full border-emerald-200 bg-emerald-50 text-emerald-900"
              }
            >
              {isProvisional
                ? `${pendingReviewCount} pending review`
                : "Review aligned"}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                VAT due
              </div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {formatDashboardCurrency(kpis.vatDueMinor, kpis.currency)}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{buildVatDueDescription(kpis)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                WHT due
              </div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {formatDashboardCurrency(kpis.whtDueMinor, kpis.currency)}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{buildWhtDueDescription(kpis)}</p>
            </div>
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

function TaxCenterShortcutPanel({
  recordCount,
  pendingReviewCount,
}: {
  recordCount: number;
  pendingReviewCount: number;
}) {
  return (
    <DashboardPanel
      className="h-full"
      eyebrow="Tax"
      title="Tax center"
      description="Use Tax Center to confirm treatments, reconcile provisional items, and prep filing output."
      icon={Landmark}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
          <div className="text-sm leading-6 text-slate-600">
            {recordCount === 0
              ? "No transactions have reached the tax workflow yet. Import a statement or add a transaction to get started."
              : "Imported and reviewed transactions are already flowing into the tax workflow for this workspace."}
          </div>
        </div>

        <div className="space-y-2 text-sm leading-6 text-slate-600">
          <p>
            {pendingReviewCount > 0
              ? `${pendingReviewCount} transaction${pendingReviewCount === 1 ? "" : "s"} still need review before tax exposure is fully clean.`
              : "The review queue is under control, so tax summaries are less likely to remain provisional."}
          </p>
          <p>Rows with missing tax treatment stay safe and reviewable until you confirm them.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/tax-center">
              Open tax center
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/banking/review">Review transactions</Link>
          </Button>
        </div>
      </div>
    </DashboardPanel>
  );
}

function AssistantSummaryCard({
  workspaceName,
  panel,
}: {
  workspaceName: string;
  panel:
    | {
        isEnabled: boolean;
        aiEnabled: boolean;
        quickInsights: Awaited<ReturnType<typeof buildExplainMyNumbersHomeState>>["quickInsights"];
        suggestedPrompts: string[];
        lockedMessage: string | null;
        unavailableMessage: string | null;
      }
    | null;
}) {
  if (!panel) {
    return (
      <DashboardPanel
        eyebrow="Intelligence"
        title="Explain my numbers"
        description="Ask grounded questions about the active workspace once AI assistant access is available."
        icon={Bot}
      >
        <DashboardEmptyState
          title="Assistant unavailable"
          message="Select an active workspace to unlock grounded finance answers tied to real TaxBook data."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/assistant">Open assistant</Link>
            </Button>
          }
        />
      </DashboardPanel>
    );
  }

  return (
    <ExplainMyNumbersAssistantPanel
      workspaceName={workspaceName}
      isEnabled={panel.isEnabled}
      aiEnabled={panel.aiEnabled}
      quickInsights={panel.quickInsights}
      suggestedPrompts={panel.suggestedPrompts}
      lockedMessage={panel.lockedMessage}
      unavailableMessage={panel.unavailableMessage}
    />
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const displayName = getSafeDisplayName(user.fullName);
  const membership = await getActiveWorkspaceMembership(user.id);
  const dashboardGeneratedAt = new Date().toISOString();
  const workspaceName = membership?.workspace.name ?? "Personal records";
  const workspaceRole = membership?.role ?? "USER";
  const canRunIntegrityScan =
    membership?.role === "OWNER" || membership?.role === "ADMIN";
  const onboardingExperience = membership
    ? buildWorkspaceOnboardingDashboardConfig({
        workspaceName: membership.workspace.name,
        values: buildWorkspaceOnboardingSnapshot({
          workspaceName: membership.workspace.name,
          onboarding: membership.workspace.onboardingProfile,
          businessProfile: membership.workspace.businessProfile,
        }).values,
      })
    : null;
  const heroPrimaryAction = onboardingExperience
    ? {
        href: onboardingExperience.primaryAction.href,
        label: onboardingExperience.primaryAction.label,
      }
    : {
        href: "/dashboard/tax-records/new",
        label: "Add transaction",
      };
  const heroSecondaryAction = onboardingExperience
    ? {
        href: onboardingExperience.secondaryAction.href,
        label: onboardingExperience.secondaryAction.label,
      }
    : {
        href: "/dashboard/reports",
        label: "Open reports",
      };
  const quickActions = onboardingExperience
    ? onboardingExperience.suggestedNextSteps.map((item) => ({
        href: item.href,
        label: item.label,
        description: item.description,
      }))
    : QUICK_ACTIONS;

  const [
    dashboardPageData,
    accountantPortfolio,
    financialHealth,
    filingReadiness,
    expenseLeaks,
    workspaceAlerts,
    explainMyNumbersPanel,
    reviewQueueData,
  ] = await Promise.all([
    loadDashboardPageData({
      userId: user.id,
      workspaceId: membership?.workspaceId,
    }),
    membership
      ? getWorkspaceClientBusinessPortfolio({
          workspaceId: membership.workspaceId,
          workspaceName: membership.workspace.name,
          role: membership.role,
        }).catch((error) => {
          logError("dashboard", "Accountant portfolio panel failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return null;
        })
      : Promise.resolve(null),
    getFinancialHealthSnapshot({
      accessibleWorkspaceIds: membership?.workspaceId ? [membership.workspaceId] : [],
      selectedWorkspaceId: membership?.workspaceId ?? null,
    }).catch((error) => {
      logError("dashboard", "Financial health card failed to load", error, {
        workspaceId: membership?.workspaceId ?? null,
        userId: user.id,
      });

      return buildFinancialHealthFallbackSnapshot({
        workspaceIds: membership?.workspaceId ? [membership.workspaceId] : [],
        selectedWorkspaceId: membership?.workspaceId ?? null,
        topDeductions: [
          {
            key: "dashboard_health_load_failed",
            label: "Financial health data is temporarily unavailable",
            points: 0,
          },
        ],
      });
    }),
    membership?.workspaceId
      ? getDashboardFilingReadinessSnapshot(membership.workspaceId).catch((error) => {
          logError("dashboard", "Filing readiness widget failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return null;
        })
      : Promise.resolve(null),
    membership?.workspaceId
      ? getDashboardExpenseLeakSnapshot(membership.workspaceId).catch((error) => {
          logError("dashboard", "Expense leak widget failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return null;
        })
      : Promise.resolve(null),
    membership?.workspaceId
      ? getDashboardWorkspaceAlertSnapshot(membership.workspaceId).catch((error) => {
          logError("dashboard", "Smart alerts widget failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return null;
        })
      : Promise.resolve(null),
    membership?.workspaceId
      ? (async () => {
          const access = await getWorkspaceFeatureAccess(
            membership.workspaceId,
            "AI_ASSISTANT"
          );

          if (!access.ok) {
            return {
              isEnabled: false,
              aiEnabled: false,
              quickInsights: [],
              suggestedPrompts: [],
              lockedMessage: access.error,
              unavailableMessage: null,
            };
          }

          const homeState = await buildExplainMyNumbersHomeState({
            workspaceId: membership.workspaceId,
            role: membership.role,
          });

          return {
            isEnabled: true,
            aiEnabled: homeState.aiEnabled,
            quickInsights: homeState.quickInsights,
            suggestedPrompts: homeState.suggestedPrompts,
            lockedMessage: null,
            unavailableMessage: null,
          };
        })().catch((error) => {
          logError("dashboard", "Explain-my-numbers panel failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return {
            isEnabled: false,
            aiEnabled: false,
            quickInsights: [],
            suggestedPrompts: [],
            lockedMessage: null,
            unavailableMessage: "Explain my numbers is temporarily unavailable for this workspace.",
          };
        })
      : Promise.resolve(null),
    membership?.workspaceId
      ? getWorkspaceBankTransactionReviewData({
          workspaceId: membership.workspaceId,
        }).catch((error) => {
          logError("dashboard", "Review queue preview failed to load", error, {
            workspaceId: membership.workspaceId,
            userId: user.id,
          });

          return null;
        })
      : Promise.resolve(null),
  ]);

  const dashboardData = dashboardPageData.dashboard;
  const pendingReviewCount = reviewQueueData?.summary.byReviewStatus.PENDING_REVIEW ?? 0;
  const flaggedReviewCount = reviewQueueData?.summary.byReviewStatus.FLAGGED ?? 0;
  const clientBusinessCount = dashboardPageData.workspaceSummary?.clientBusinessCount ?? 0;
  const hasLiveRecords = dashboardData.recordCount > 0;

  const kpiCards: KpiCardConfig[] = [
    {
      label: "Total Revenue",
      value: formatDashboardCurrency(
        dashboardData.kpis.totalRevenueMinor,
        dashboardData.kpis.currency
      ),
      description: "Recognized income in the current dashboard scope.",
      icon: Wallet,
      accentClassName: "bg-gradient-primary text-white shadow-glow",
    },
    {
      label: "Total Expenses",
      value: formatDashboardCurrency(
        dashboardData.kpis.totalExpensesMinor,
        dashboardData.kpis.currency
      ),
      description: "Tracked spend from posted and categorized workspace activity.",
      icon: Sparkles,
      accentClassName: "bg-blue/10 text-blue",
    },
    {
      label: "Net Profit",
      value: formatDashboardCurrency(
        dashboardData.kpis.netProfitMinor,
        dashboardData.kpis.currency
      ),
      description: "Revenue minus expenses in the current workspace view.",
      icon: ShieldCheck,
      accentClassName: "bg-cyan/10 text-cyan",
    },
    {
      label: "Tax Due",
      value: formatDashboardCurrency(
        dashboardData.kpis.taxDueMinor,
        dashboardData.kpis.currency
      ),
      description: buildTaxDueDescription(dashboardData.kpis),
      icon: DollarSign,
      accentClassName: "bg-amber-50 text-amber-900",
    },
    {
      label: "Pending Review",
      value: String(pendingReviewCount),
      description:
        pendingReviewCount > 0 || flaggedReviewCount > 0
          ? `${pendingReviewCount} pending and ${flaggedReviewCount} flagged transaction${pendingReviewCount + flaggedReviewCount === 1 ? "" : "s"} still need attention.`
          : "The review queue is currently under control.",
      icon: ClipboardList,
      accentClassName:
        pendingReviewCount > 0 || flaggedReviewCount > 0
          ? "bg-rose-50 text-rose-900"
          : "bg-emerald-50 text-emerald-900",
    },
  ];

  if (!membership && dashboardData.recordCount === 0) {
    return (
      <section className="space-y-6" aria-labelledby="dashboard-empty-state-heading">
        <div className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/95 p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <Badge variant="secondary" className="rounded-full bg-cyan/10 text-cyan">
            No active workspace
          </Badge>
          <h1
            id="dashboard-empty-state-heading"
            className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"
          >
            Connect a workspace to unlock the premium finance command center.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            The dashboard is ready, but it needs an active workspace before it can surface
            transactions, tax exposure, alerts, and collaboration data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              aria-label="Open workspaces"
              className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90 hover:text-white"
            >
              <Link href="/dashboard/workspaces">
                Open workspaces
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" aria-label="Invite teammate" className="rounded-xl">
              <Link href="/dashboard/team">Invite teammate</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-10 pb-8" aria-labelledby="dashboard-heading">
      {dashboardPageData.errorMessage ? (
        <DashboardErrorState message={dashboardPageData.errorMessage} />
      ) : null}

      <div className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_52%,rgba(240,249,255,0.98)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-cyan/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-blue/10 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="min-w-0 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-cyan/10 text-cyan">
                Dashboard
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                {workspaceRole}
              </Badge>
              {onboardingExperience ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white text-slate-600"
                >
                  {onboardingExperience.userTypeLabel}
                </Badge>
              ) : null}
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                {dashboardData.kpis.taxSummaryDateLabel}
              </Badge>
            </div>

            <div className="space-y-3">
              <h1
                id="dashboard-heading"
                className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl xl:text-[2.8rem]"
              >
                {onboardingExperience?.welcomeTitle ??
                  `Run ${workspaceName} with a premium finance command center.`}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Welcome back, <span className="font-medium text-slate-950">{displayName}</span>.{" "}
                {onboardingExperience?.welcomeDescription ??
                  "Use this overview to stay ahead of revenue, review pressure, tax exposure, and the operational blockers that matter next."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active scope
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">{workspaceName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {clientBusinessCount} client business{clientBusinessCount === 1 ? "" : "es"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Review pressure
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {pendingReviewCount} pending review
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {flaggedReviewCount} flagged items are waiting behind the scenes
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Data coverage
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {dashboardData.recordCount} tracked records
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {hasLiveRecords
                    ? "Executive panels are running on live workspace activity."
                    : "The workspace is ready for first transactions and imports."}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                aria-label={heroPrimaryAction.label}
                className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90 hover:text-white"
              >
                <Link href={heroPrimaryAction.href}>
                  {heroPrimaryAction.label}
                  <FilePlus2 className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" aria-label={heroSecondaryAction.label} className="rounded-xl">
                <Link href={heroSecondaryAction.href}>
                  {heroSecondaryAction.label}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-xl text-slate-700 hover:text-slate-950">
                <Link href="/dashboard/assistant">
                  Open assistant
                  <Bot className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <FinancialHealthCard
            snapshot={financialHealth}
            canRunIntegrityScan={canRunIntegrityScan}
            referenceTime={dashboardGeneratedAt}
          />
        </div>
      </div>

      <div className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Executive summary"
          title="Key numbers"
          description="A fast read on the five signals most likely to drive finance decisions this week."
          action={
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard/reports">
                Open reports
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpiCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              description={card.description}
              icon={card.icon}
              accentClassName={card.accentClassName}
            />
          ))}
        </div>
      </div>

      {membership && !hasLiveRecords && !dashboardPageData.errorMessage ? (
        <DashboardEmptyState
          title="No live transactions yet"
          message="This workspace is ready for data. Import a bank statement or add a transaction to populate review, categorization, tax, and assistant insights."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/dashboard/banking/reconcile">Import bank statement</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/tax-records/new">Add transaction</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      <div className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Intelligence"
          title="What needs attention"
          description="Assistant context, active alerts, and filing readiness in one row so the next decision is obvious."
        />
        <div className="grid gap-6 xl:grid-cols-3">
          <AssistantSummaryCard
            workspaceName={workspaceName}
            panel={explainMyNumbersPanel}
          />
          <WorkspaceAlertWidget snapshot={workspaceAlerts} />
          <FilingReadinessWidget snapshot={filingReadiness} />
        </div>
      </div>

      <div className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Operations"
          title="Daily finance flow"
          description="Move from top-line signals into the operational data that explains them."
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <RevenuePanel rows={dashboardData.chart} currency={dashboardData.kpis.currency} />
          <ExpensePanel
            rows={dashboardData.expenseBreakdown}
            currency={dashboardData.kpis.currency}
          />
          <TransactionsTable records={dashboardData.recentActivity} />
          <ReviewQueuePreview data={reviewQueueData} />
        </div>
      </div>

      <div className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Tax"
          title="Tax center readiness"
          description="Keep VAT and WHT exposure clear, provisional assumptions visible, and the next tax workflow close at hand."
        />
        <div className="grid gap-4 xl:grid-cols-4">
          <StatCard
            label="VAT Due"
            value={formatDashboardCurrency(
              dashboardData.kpis.vatDueMinor,
              dashboardData.kpis.currency
            )}
            description={buildVatDueDescription(dashboardData.kpis)}
            icon={BadgePercent}
            accentClassName="bg-amber-50 text-amber-900"
          />
          <StatCard
            label="WHT Due"
            value={formatDashboardCurrency(
              dashboardData.kpis.whtDueMinor,
              dashboardData.kpis.currency
            )}
            description={buildWhtDueDescription(dashboardData.kpis)}
            icon={Landmark}
            accentClassName="bg-emerald-50 text-emerald-900"
          />
          <TaxExposureSummaryPanel
            kpis={dashboardData.kpis}
            recordCount={dashboardData.recordCount}
            pendingReviewCount={pendingReviewCount}
          />
          <TaxCenterShortcutPanel
            recordCount={dashboardData.recordCount}
            pendingReviewCount={pendingReviewCount}
          />
        </div>
      </div>

      {accountantPortfolio && accountantPortfolio.workspace.clientBusinessCount > 0 ? (
        <div className="space-y-5">
          <DashboardSectionHeader
            eyebrow="Portfolio"
            title="Accountant overview"
            description="Multi-client visibility stays visible without leaving the main dashboard."
          />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <AccountantPortfolioPanel portfolio={accountantPortfolio} />
            <AccountantExposurePanel portfolio={accountantPortfolio} />
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        <DashboardSectionHeader
          eyebrow="Controls"
          title="Operational controls"
          description="The supporting modules that keep the workspace clean, efficient, and ready for month-end."
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <QuickActions
            actions={quickActions}
            title={onboardingExperience ? "Suggested next steps" : "Next best actions"}
            description={
              onboardingExperience
                ? "These actions reflect the way this workspace was configured during onboarding."
                : "Fast paths into the areas your finance team is likely to open next."
            }
          />
          <ExpenseLeakWidget snapshot={expenseLeaks} />
          <div className="xl:col-span-2">
            <DashboardWorkspaceSummaryPanel
              summary={dashboardPageData.workspaceSummary}
              scope={dashboardData.scope}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
