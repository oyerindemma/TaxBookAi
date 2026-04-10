import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import type { SerializedBankTransactionReviewDashboard } from "@/lib/bank-transaction-review";
import { formatCompactDashboardCurrency, formatDashboardDate } from "@/lib/dashboard-formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import DashboardPanel from "@/app/dashboard/_components/DashboardPanel";

type ReviewQueuePreviewProps = {
  data: SerializedBankTransactionReviewDashboard | null;
};

function getStatusTone(status: string) {
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
  if (!data) {
    return (
      <DashboardPanel
        eyebrow="Operations"
        title="Review queue preview"
        description="The transaction review queue is temporarily unavailable."
        icon={ClipboardList}
      >
        <DashboardEmptyState
          message="Review queue data could not be loaded right now."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/banking/review">Open review queue</Link>
            </Button>
          }
        />
      </DashboardPanel>
    );
  }

  const items = data.transactions.slice(0, 5);
  const pendingCount = data.summary.byReviewStatus.PENDING_REVIEW;
  const flaggedCount = data.summary.byReviewStatus.FLAGGED;

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
            {data.summary.readyToPostCount}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Ready to post
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <DashboardEmptyState
          className="mt-5"
          title="No transactions in review"
          message="Import a bank statement or add a manual transaction to seed the review queue."
          action={
            <Button asChild>
              <Link href="/dashboard/banking/reconcile">Import bank statement</Link>
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
                    {transaction.reviewStatus.replaceAll("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  {formatDashboardDate(new Date(transaction.transactionDate))}
                  {transaction.clientBusiness?.name ? ` · ${transaction.clientBusiness.name}` : ""}
                  {transaction.suggestedCategory?.name
                    ? ` · Suggestion: ${transaction.suggestedCategory.name}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-950">
                  {formatCompactDashboardCurrency(transaction.amountMinor, transaction.currency)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {transaction.postingReadiness.replaceAll("_", " ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
