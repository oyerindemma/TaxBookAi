import Link from "next/link";
import { ArrowRight, BadgeAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCompactDashboardCurrency } from "@/lib/dashboard-formatting";
import type { DashboardExpenseLeakSnapshot } from "@/lib/expense-leak-types";
import {
  ExpenseLeakSeverityBadge,
  ExpenseLeakStatusBadge,
  ExpenseLeakTypeBadge,
} from "@/app/dashboard/_components/ExpenseLeakBadges";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function ExpenseLeakWidget({
  snapshot,
}: {
  snapshot: DashboardExpenseLeakSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Expense leaks</CardTitle>
          <CardDescription>
            Leak detection is temporarily unavailable for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/expense-leaks">Open leak analysis</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currency = snapshot.topFindings[0]?.currency ?? "NGN";

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold">Expense leaks</CardTitle>
            <CardDescription>
              Ranked savings opportunities from recurring spend, duplicates, and spikes.
            </CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BadgeAlert className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">{snapshot.summary.openCount}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Open findings</div>
          </div>
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">
              {formatCompactDashboardCurrency(
                snapshot.summary.openEstimatedSavingsMinor,
                currency
              )}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Estimated savings</div>
          </div>
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">
              {snapshot.summary.recurringCount}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Recurring patterns</div>
          </div>
        </div>

        {snapshot.topFindings.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            No active expense leak findings are open right now.
          </div>
        ) : (
          <div className="space-y-3">
            {snapshot.topFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-xl border border-cyan/10 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="text-sm font-medium text-slate-950">{finding.title}</div>
                    <div className="flex flex-wrap gap-2">
                      <ExpenseLeakSeverityBadge severity={finding.severity} />
                      <ExpenseLeakStatusBadge status={finding.status} />
                      <ExpenseLeakTypeBadge type={finding.type} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-950">
                      {formatCompactDashboardCurrency(
                        finding.estimatedSavingsMinor,
                        finding.currency
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(finding.lastDetectedAt)}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{finding.summary}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/expense-leaks">
              Open leak analysis
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
