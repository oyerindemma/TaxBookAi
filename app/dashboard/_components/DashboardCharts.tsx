"use client";

import Link from "next/link";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DashboardExpenseCategoryRow,
  DashboardMonthlyTrendRow,
} from "@/lib/tax-reporting";

type DashboardChartsProps = {
  currency: string;
  monthlyTrendRows: DashboardMonthlyTrendRow[];
  expenseCategoryRows: DashboardExpenseCategoryRow[];
};

const CATEGORY_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "color-mix(in oklab, var(--color-chart-1) 50%, white)",
];

function formatAmount(amountKobo: number, currency: string) {
  const amount = (amountKobo / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "MIXED" ? amount : `${currency} ${amount}`;
}

function formatCompactAmount(amountKobo: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountKobo / 100);
}

function normalizeTooltipValue(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function EmptyChartState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="flex h-[260px] flex-col items-start justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-6 text-sm">
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href={href}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

export default function DashboardCharts({
  currency,
  monthlyTrendRows,
  expenseCategoryRows,
}: DashboardChartsProps) {
  const revenueGradientId = useId().replace(/:/g, "");
  const expenseGradientId = useId().replace(/:/g, "");
  const hasRevenueData = monthlyTrendRows.some((row) => row.revenue > 0);
  const hasExpenseData = monthlyTrendRows.some((row) => row.expenses > 0);
  const hasTaxLiabilityData = monthlyTrendRows.some(
    (row) => row.taxLiability !== 0
  );
  const hasCategoryData = expenseCategoryRows.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Revenue trend</CardTitle>
          <CardDescription>
            Income records by month for the current workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasRevenueData ? (
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendRows}>
                  <defs>
                    <linearGradient id={revenueGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatCompactAmount}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatAmount(normalizeTooltipValue(value), currency),
                      "Revenue",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-card)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-chart-2)"
                    fill={`url(#${revenueGradientId})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState
              title="No revenue trend yet"
              description="Paid invoices and income records will populate this chart."
              href="/dashboard/tax-records"
              actionLabel="Add income"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expense trend</CardTitle>
          <CardDescription>
            Expense records by month for the current workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasExpenseData ? (
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendRows}>
                  <defs>
                    <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatCompactAmount}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatAmount(normalizeTooltipValue(value), currency),
                      "Expenses",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-card)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="var(--color-chart-1)"
                    fill={`url(#${expenseGradientId})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState
              title="No expense trend yet"
              description="Expense records will appear here once the workspace starts tracking spend."
              href="/dashboard/tax-records"
              actionLabel="Add expense"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax liability trend</CardTitle>
          <CardDescription>
            Monthly VAT payable plus WHT using the current filing logic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasTaxLiabilityData ? (
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrendRows}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatCompactAmount}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatAmount(normalizeTooltipValue(value), currency),
                      "Tax liability",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-card)",
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--color-border)" />
                  <Bar
                    dataKey="taxLiability"
                    fill="var(--color-chart-3)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState
              title="No tax liability trend yet"
              description="Tax rates on income, expenses, and WHT records will unlock this view."
              href="/dashboard/tax-filing"
              actionLabel="Review tax filing"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expense categories</CardTitle>
          <CardDescription>
            Category mix across categorized expense records in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasCategoryData ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-center">
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategoryRows}
                      dataKey="amount"
                      nameKey="label"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                    >
                      {expenseCategoryRows.map((row, index) => (
                        <Cell
                          key={row.label}
                          fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [
                        formatAmount(normalizeTooltipValue(value), currency),
                        "Expense total",
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-card)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                {expenseCategoryRows.map((row, index) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 rounded-full"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">{row.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.count} expense record{row.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatAmount(row.amount, currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(row.share * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChartState
              title="No categorized expenses yet"
              description="Assign categories to expense records to unlock the breakdown."
              href="/dashboard/settings/categories"
              actionLabel="Manage categories"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
