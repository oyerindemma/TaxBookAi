import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Layers3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type BankTransactionWorkflowStatus =
  | "empty"
  | "NOT_STARTED"
  | "IN_REVIEW"
  | "READY_TO_POST"
  | "BLOCKED"
  | "REPORTS_READY";

type WorkspaceBankTransactionWorkflowSummary = {
  workspaceId: number;
  total: number;
  byStatus: {
    UNMATCHED: number;
    SUGGESTED: number;
    MATCHED: number;
    IGNORED: number;
    SPLIT: number;
    REVIEW_REQUIRED: number;
  };
  pendingReview: number;
  matched: number;
  unmatched: number;
  suggested: number;
  ignored: number;
  requiresSetup: boolean;
  totalTransactions: number;
  unpostedCount: number;
  readyToPostCount: number;
  postedCount: number;
  blockedByAccountMappingCount: number;
  latestPostedAt: string | null;
  status: BankTransactionWorkflowStatus;
  headline: string;
  detail: string;
};

function getStatusLabel(
  status: BankTransactionWorkflowStatus,
  requiresSetup: boolean
) {
  if (status === "REPORTS_READY") return "Reports ready";
  if (status === "READY_TO_POST") return "Ready to post";
  if (status === "BLOCKED") return "Mapping blocked";
  if (status === "IN_REVIEW") return "In review";
  if (status === "empty" || status === "NOT_STARTED") {
    return requiresSetup ? "Setup needed" : "Empty";
  }
  return "Not started";
}

function getStatusBadgeClass(status: BankTransactionWorkflowStatus) {
  if (status === "REPORTS_READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "READY_TO_POST") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  if (status === "BLOCKED") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "IN_REVIEW") {
    return "border-slate-200 bg-slate-50 text-slate-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function renderStatusIcon(status: BankTransactionWorkflowStatus, className: string) {
  if (status === "REPORTS_READY") return <CheckCircle2 className={className} />;
  if (status === "READY_TO_POST") return <Layers3 className={className} />;
  if (status === "BLOCKED") return <AlertTriangle className={className} />;
  if (status === "IN_REVIEW") return <Clock3 className={className} />;
  return <FileText className={className} />;
}

function formatDateTime(value: string | null) {
  if (!value) return "No posting yet";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type LedgerReportReadinessWidgetProps = {
  summary: WorkspaceBankTransactionWorkflowSummary | null;
};

export default function LedgerReportReadinessWidget({
  summary,
}: LedgerReportReadinessWidgetProps) {
  if (!summary) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Ledger and reports</CardTitle>
          <CardDescription>
            Workflow readiness is temporarily unavailable for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/banking/review">Open review queue</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isEmptyWorkspace = summary.totalTransactions === 0;

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold">Ledger and reports</CardTitle>
            <CardDescription>Workspace-scoped posting readiness</CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {renderStatusIcon(summary.status, "size-5")}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-slate-950">{summary.readyToPostCount}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Ready to post</div>
          </div>
          <Badge variant="outline" className={getStatusBadgeClass(summary.status)}>
            {getStatusLabel(summary.status, summary.requiresSetup)}
          </Badge>
        </div>

        <p className="text-sm font-medium text-slate-950">{summary.headline}</p>
        <p className="text-sm leading-6 text-muted-foreground">{summary.detail}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Unposted</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">{summary.unpostedCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Posted</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">{summary.postedCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Mapping blocked</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {summary.blockedByAccountMappingCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Latest ledger sync</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {formatDateTime(summary.latestPostedAt)}
            </div>
          </div>
        </div>

        {isEmptyWorkspace ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {summary.requiresSetup
              ? "Import a CSV or bank statement to start the review-to-report flow for this workspace."
              : "This workspace is clear right now. New reviewed transactions will appear here when they are ready for posting."}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/banking/review">
              Open review queue
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/reports">Open reports</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
