"use client";

import dynamic from "next/dynamic";
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

const DashboardCharts = dynamic(() => import("./DashboardCharts"), {
  ssr: false,
  loading: () => (
    <Card>
      <CardHeader>
        <CardTitle>Financial overview</CardTitle>
        <CardDescription>Loading interactive workspace charts.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]" />
    </Card>
  ),
});

type DashboardChartsPanelProps = {
  currency: string;
  monthlyTrendRows: DashboardMonthlyTrendRow[];
  expenseCategoryRows: DashboardExpenseCategoryRow[];
};

export default function DashboardChartsPanel(props: DashboardChartsPanelProps) {
  return <DashboardCharts {...props} />;
}
