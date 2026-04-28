import { BadgeAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getExpenseLeakCenterData } from "@/lib/expense-leaks";
import { formatDashboardCurrency } from "@/lib/dashboard-formatting";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ExpenseLeakAnalysisClient from "./_components/ExpenseLeakAnalysisClient";

export default async function ExpenseLeakAnalysisPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Expense leaks</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to scan for recurring spend, duplicate vendor charges, and unusual expense spikes.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const initialData = await getExpenseLeakCenterData({
    workspaceId: membership.workspaceId,
    sync: true,
  });

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-primary p-6 text-white shadow-glow">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                Expense leak detection
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                Workspace scoped
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Expense Leak Analysis</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Surface wasteful or suspicious spend patterns from live workspace transactions, rank them by possible savings impact, and review the linked source evidence before taking action.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan">
                <BadgeAlert className="size-6" />
              </div>
              <div>
                <div className="text-4xl font-semibold">{initialData.summary.openCount}</div>
                <div className="text-sm text-white/70">Open findings</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                {initialData.summary.criticalOpenCount} critical
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                {formatDashboardCurrency(initialData.summary.openEstimatedSavingsMinor, "NGN")} potential
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <ExpenseLeakAnalysisClient
        role={membership.role}
        workspaceId={membership.workspaceId}
        initialData={initialData}
      />
    </section>
  );
}
