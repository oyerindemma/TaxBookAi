import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  DollarSign,
  FilePlus2,
  type LucideIcon,
  PieChart,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { getUserFromSession } from "@/lib/auth";
import {
  getDashboardData,
  type DashboardExpenseCategoryRow,
  type DashboardKpiData,
  type DashboardMonthlyTrendRow,
} from "@/lib/dashboard-data";
import {
  formatCompactCurrencyNGN,
  formatCurrencyNGN,
} from "@/lib/dashboard-formatting";
import {
  buildFinancialHealthFallbackSnapshot,
  getFinancialHealthSnapshot,
} from "@/lib/financial-health";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { logError } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import StatCard from "@/app/dashboard/_components/StatCard";
import FinancialHealthCard from "@/app/dashboard/_components/FinancialHealthCard";
import TransactionsTable from "@/app/dashboard/_components/TransactionsTable";

export const runtime = "nodejs";

type QuickAction = {
  href: string;
  label: string;
  description: string;
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

  return `${Math.max(8, Math.min(100, percentage))}%`;
}

function PanelEmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-cyan/20 bg-white/5 px-4 py-12 text-center text-sm text-slate-300"
    >
      {message}
    </div>
  );
}

function RevenuePanel({
  rows,
}: {
  rows: DashboardMonthlyTrendRow[];
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
    <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-glow">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-white">
            Revenue overview
          </CardTitle>
          <CardDescription className="text-slate-300">
            A clean monthly snapshot of revenue, expense, and tax intensity.
          </CardDescription>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-white/5 text-cyan">
          <BarChart3 className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <PanelEmptyState message="Your chart placeholders will populate as soon as new records land in the workspace." />
        ) : (
          <div className="grid gap-4">
            {!hasActivity ? (
              <PanelEmptyState message="No recorded activity in the last 6 months yet. The chart is ready and will update automatically." />
            ) : null}
            {rows.map((row) => (
              <div
                key={row.key}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{row.label}</div>
                    <div className="text-xs text-slate-300">
                      Revenue {formatCompactCurrencyNGN(row.revenue)} and expenses{" "}
                      {formatCompactCurrencyNGN(row.expenses)}
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                    Tax {formatCompactCurrencyNGN(Math.abs(row.taxLiability))}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-[72px_1fr_84px] items-center gap-3 sm:grid-cols-[88px_1fr_92px]">
                    <span className="text-xs text-cyan">Revenue</span>
                    <div className="h-2.5 rounded-full bg-white/10">
                      <div
                        className="h-2.5 rounded-full bg-gradient-primary"
                        style={{ width: clampWidth((row.revenue / maxValue) * 100) }}
                      />
                    </div>
                    <span className="text-right text-xs font-medium text-white">
                      {formatCompactCurrencyNGN(row.revenue)}
                    </span>
                  </div>

                  <div className="grid grid-cols-[72px_1fr_84px] items-center gap-3 sm:grid-cols-[88px_1fr_92px]">
                    <span className="text-xs text-blue">Expenses</span>
                    <div className="h-2.5 rounded-full bg-white/10">
                      <div
                        className="h-2.5 rounded-full bg-blue"
                        style={{ width: clampWidth((row.expenses / maxValue) * 100) }}
                      />
                    </div>
                    <span className="text-right text-xs font-medium text-white">
                      {formatCompactCurrencyNGN(row.expenses)}
                    </span>
                  </div>

                  <div className="grid grid-cols-[72px_1fr_84px] items-center gap-3 sm:grid-cols-[88px_1fr_92px]">
                    <span className="text-xs text-cyan">Tax load</span>
                    <div className="h-2.5 rounded-full bg-white/10">
                      <div
                        className="h-2.5 rounded-full bg-cyan"
                        style={{
                          width: clampWidth((Math.abs(row.taxLiability) / maxValue) * 100),
                        }}
                      />
                    </div>
                    <span className="text-right text-xs font-medium text-white">
                      {formatCompactCurrencyNGN(Math.abs(row.taxLiability))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpensePanel({
  rows,
}: {
  rows: DashboardExpenseCategoryRow[];
}) {
  return (
    <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/20">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-white">
            Expense categories
          </CardTitle>
          <CardDescription className="text-slate-300">
            Track which categories are shaping your month the most.
          </CardDescription>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-white/5 text-blue">
          <PieChart className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <PanelEmptyState message="No expense data yet. Categorized spending will appear here after expense records are tagged." />
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{row.label}</div>
                    <div className="text-xs text-slate-300">
                      {row.count} transaction{row.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {formatCompactCurrencyNGN(row.amount)}
                    </div>
                    <div className="text-xs text-cyan">
                      {formatPercent(row.share)}
                    </div>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-white/10">
                  <div
                    className="h-2.5 rounded-full bg-gradient-primary"
                    style={{ width: clampWidth(row.share * 100) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-glow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">
          Quick actions
        </CardTitle>
        <CardDescription className="text-slate-300">
          Fast paths into the parts of the product your finance team uses most.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => (
          <div
            key={action.href}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="text-sm font-medium text-white">{action.label}</div>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {action.description}
            </p>
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
      </CardContent>
    </Card>
  );
}

function buildTaxDueDescription(kpis: DashboardKpiData) {
  if (kpis.taxDueUsesFallback) {
    return "No explicit unpaid balance model exists yet, so this safely falls back to 0 until open tax computations are available.";
  }

  return "Estimated from open VAT and WHT tax computations for the active workspace.";
}

type KpiCardConfig = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accentClassName?: string;
};

export default async function DashboardPage() {
  const user = await getUserFromSession();
  if (!user) {
    redirect("/login");
  }

  const displayName = getSafeDisplayName(user.fullName);
  const membership = await getActiveWorkspaceMembership(user.id);
  const dashboardData = await getDashboardData({
    userId: user.id,
    workspaceId: membership?.workspaceId,
  });

  const workspaceName = membership?.workspace.name ?? "Personal records";
  const workspaceRole = membership?.role ?? "USER";
  const canRunIntegrityScan =
    membership?.role === "OWNER" || membership?.role === "ADMIN";
  const financialHealth = await getFinancialHealthSnapshot({
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
  });
  const kpiCards: KpiCardConfig[] = [
    {
      label: "Total Revenue",
      value: formatCurrencyNGN(dashboardData.kpis.totalRevenueMinor),
      description: "Sum of income transactions in your active workspace.",
      icon: Wallet,
      accentClassName: "bg-gradient-primary text-white shadow-glow",
    },
    {
      label: "Total Expenses",
      value: formatCurrencyNGN(dashboardData.kpis.totalExpensesMinor),
      description: "Sum of expense transactions scoped to your active workspace.",
      icon: Sparkles,
      accentClassName: "bg-blue/10 text-blue",
    },
    {
      label: "Net Profit",
      value: formatCurrencyNGN(dashboardData.kpis.netProfitMinor),
      description: "Revenue minus expenses across your stored dashboard records.",
      icon: ShieldCheck,
      accentClassName: "bg-cyan/10 text-cyan",
    },
    {
      label: "Tax Due",
      value: formatCurrencyNGN(dashboardData.kpis.taxDueMinor),
      description: buildTaxDueDescription(dashboardData.kpis),
      icon: DollarSign,
      accentClassName: "bg-white/10 text-cyan",
    },
  ];

  if (!membership && dashboardData.recordCount === 0) {
    return (
      <section className="space-y-6" aria-labelledby="dashboard-empty-state-heading">
        <div className="rounded-2xl border border-cyan/20 bg-primary p-8 text-white shadow-glow">
          <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
            No active workspace
          </Badge>
          <h1
            id="dashboard-empty-state-heading"
            className="mt-4 text-3xl font-semibold tracking-tight text-white"
          >
            Connect a workspace to unlock your dashboard.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            The dashboard is ready, but it needs a workspace before it can surface
            tax records, charts, transactions, and collaboration data.
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
            <Button
              asChild
              variant="outline"
              aria-label="Invite teammate"
              className="rounded-xl border-cyan/30 bg-white/5 text-cyan hover:bg-white/10 hover:text-cyan"
            >
              <Link href="/dashboard/team">Invite teammate</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="dashboard-heading">
      <div className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary p-6 text-white shadow-glow sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                Dashboard
              </Badge>
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-blue">
                {workspaceRole}
              </Badge>
              {!membership ? (
                <Badge variant="outline" className="rounded-full border-white/10 bg-white/5 text-slate-300">
                  User scope
                </Badge>
              ) : null}
            </div>

            <div className="space-y-3">
              <h1
                id="dashboard-heading"
                className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              >
                Run {workspaceName} with a calmer finance cockpit.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Welcome back, <span className="font-medium text-cyan">{displayName}</span>. This overview keeps
                revenue, tax exposure, and the latest transactions in one clean,
                component-based workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                aria-label="Add transaction"
                className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90 hover:text-white"
              >
                <Link href="/dashboard/tax-records/new">
                  Add transaction
                  <FilePlus2 className="ml-2 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                aria-label="Open reports"
                className="rounded-xl border-cyan/30 bg-white/5 text-cyan transition hover:bg-white/10 hover:text-cyan"
              >
                <Link href="/dashboard/reports">
                  Open reports
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <FinancialHealthCard
            snapshot={financialHealth}
            canRunIntegrityScan={canRunIntegrityScan}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="min-w-0 space-y-6">
          <RevenuePanel rows={dashboardData.chart} />
          <TransactionsTable records={dashboardData.recentActivity} />
        </div>

        <div className="min-w-0 space-y-6">
          <ExpensePanel rows={dashboardData.expenseBreakdown} />
          <QuickActions actions={QUICK_ACTIONS} />

          <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/20">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white">
                Finance operations
              </CardTitle>
              <CardDescription className="text-slate-300">
                A compact pulse check powered by your existing session-backed dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium text-cyan">
                  Workspace
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {workspaceName} is active and ready for reporting, review,
                  and collaboration{membership ? "." : " with user-scoped fallback data."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium text-blue">
                  Transaction flow
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {dashboardData.recentActivity.length === 0
                    ? "Start by adding your first transaction to light up the dashboard."
                    : `${dashboardData.recentActivity.length} recent transactions are visible in the activity table below.`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
