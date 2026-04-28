import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DashboardFilingReadinessSnapshot,
  FilingReadinessSeverity,
  FilingReadinessStatus,
} from "@/lib/filing-readiness";

function getStatusLabel(status: FilingReadinessStatus) {
  if (status === "READY") return "Ready";
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "NEEDS_ATTENTION") return "Needs attention";
  return "Not started";
}

function getStatusBadgeClass(status: FilingReadinessStatus) {
  if (status === "READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "IN_PROGRESS") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  if (status === "NEEDS_ATTENTION") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function getSeverityBadgeClass(severity: FilingReadinessSeverity) {
  if (severity === "CRITICAL") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (severity === "HIGH") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (severity === "MEDIUM") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function renderStatusIcon(status: FilingReadinessStatus, className: string) {
  if (status === "READY") return <CheckCircle2 className={className} />;
  if (status === "IN_PROGRESS") return <ClipboardCheck className={className} />;
  if (status === "NEEDS_ATTENTION") return <ShieldAlert className={className} />;
  return <AlertTriangle className={className} />;
}

export default function FilingReadinessWidget({
  snapshot,
}: {
  snapshot: DashboardFilingReadinessSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Filing readiness</CardTitle>
          <CardDescription>
            Workspace filing readiness is temporarily unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/tax-center">Open tax center</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold">Filing readiness</CardTitle>
            <CardDescription>{snapshot.dateLabel}</CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {renderStatusIcon(snapshot.status, "size-5")}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold text-slate-950">{snapshot.score}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Readiness score</div>
          </div>
          <Badge variant="outline" className={getStatusBadgeClass(snapshot.status)}>
            {getStatusLabel(snapshot.status)}
          </Badge>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{snapshot.narrative}</p>

        {snapshot.topBlockers.length > 0 ? (
          <div className="space-y-2">
            {snapshot.topBlockers.map((blocker) => (
              <div
                key={blocker.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-cyan/10 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-950">{blocker.title}</div>
                  <div className="text-xs text-slate-500">{blocker.count} blocker item(s)</div>
                </div>
                <Badge variant="outline" className={getSeverityBadgeClass(blocker.severity)}>
                  {blocker.severity}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            No active blockers were detected in the current filing window.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/filing-readiness">
              Open readiness center
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {snapshot.primaryRecommendation ? (
            <Button asChild variant="outline">
              <Link href={snapshot.primaryRecommendation.href}>
                {snapshot.primaryRecommendation.actionLabel}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
