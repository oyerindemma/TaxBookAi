import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import type { SerializedReviewQueuePreview } from "@/lib/bank-transaction-review";
import { formatCompactDashboardCurrency, formatDashboardDate } from "@/lib/dashboard-formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import DashboardPanel from "@/app/dashboard/_components/DashboardPanel";

type ReviewQueuePreviewProps = {
  data: SerializedReviewQueuePreview;
};

function getStatusTone(status: string | null) {
  switch (status) {
    case "FLAGGED":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "PENDING_REVIEW":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "POSTED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "REVIEWED":
      return "border-sky-200 bg-sky-50 text-sky-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

export default function ReviewQueuePreview({ data }: ReviewQueuePreviewProps) {
  const items = data.items;
  const pendingCount = data.pendingCount;
  const flaggedCount = data.flaggedCount ?? 0;
  const readyToPostCount = data.readyToPostCount ?? 0;

  return (
    <DashboardPanel
      eyebrow="Operations"
      title="Review queue preview"
      description="A fast look at the transactions that still need attention before posting."
      icon={ClipboardList}
      headerAction={
        <Button asChild variant="ghost" size="sm" className="-mr-2 text-slate-600 hover:text-slate-950">
          <Link href="/dashboard/banking/review">
            Open queue
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4">
          <div className="text-2xl font-semibold tracking-tight text-slate-950">
            {pendingCount}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Pending review
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4">
          <div className="text-2xl font-semibold tracking-tight text-slate-950">
            {flaggedCount}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Flagged
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4">
          <div className="text-2xl font-semibold tracking-tight text-slate-950">
            {readyToPostCount}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Ready to post
          </div>
        </div>
      </div>

      {data.status === "empty" ? (
        <DashboardEmptyState
          className="mt-5"
          title={data.requiresSetup ? "Review queue needs setup" : "Review queue is clear"}
          message={
            data.requiresSetup
              ? "Import a bank statement or add a manual transaction to seed the review queue."
              : "There are no open review items in this workspace right now."
          }
          action={
            <Button asChild variant={data.requiresSetup ? "default" : "outline"}>
              <Link href={data.requiresSetup ? "/dashboard/banking/reconcile" : "/dashboard/banking/review"}>
                {data.requiresSetup ? "Import bank statement" : "Open review queue"}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((transaction) => (
            <div
              key={transaction.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-medium text-slate-950">
                    {transaction.description}
                  </div>
                  <Badge variant="outline" className={getStatusTone(transaction.reviewStatus)}>
                    {(transaction.reviewStatus ?? "UNKNOWN").replaceAll("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  {formatDashboardDate(new Date(transaction.transactionDate))}
                  {transaction.clientBusinessName ? ` · ${transaction.clientBusinessName}` : ""}
                  {transaction.suggestedCategoryName
                    ? ` · Suggestion: ${transaction.suggestedCategoryName}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-950">
                  {formatCompactDashboardCurrency(transaction.amountMinor, transaction.currency)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {(transaction.postingReadiness ?? "NOT_READY").replaceAll("_", " ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
