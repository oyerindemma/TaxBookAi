import Link from "next/link";
import { ArrowRight, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkspaceAlertDashboardSnapshot } from "@/lib/workspace-alert-types";
import {
  WorkspaceAlertSeverityBadge,
  WorkspaceAlertStatusBadge,
  WorkspaceAlertTypeBadge,
} from "@/app/dashboard/_components/WorkspaceAlertBadges";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function WorkspaceAlertWidget({
  snapshot,
}: {
  snapshot: WorkspaceAlertDashboardSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Smart alerts</CardTitle>
          <CardDescription>Workspace alerts are temporarily unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/notifications">Open notification center</Link>
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
            <CardTitle className="text-lg font-semibold">Smart alerts</CardTitle>
            <CardDescription>
              {snapshot.summary.openCount} open alerts across the active workspace.
            </CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BellRing className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">{snapshot.summary.openCount}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Open</div>
          </div>
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">
              {snapshot.summary.criticalCount}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Critical</div>
          </div>
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-3 py-3">
            <div className="text-2xl font-semibold text-slate-950">
              {snapshot.summary.snoozedCount}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Snoozed</div>
          </div>
        </div>

        {snapshot.topAlerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            No active workspace alerts are open right now.
          </div>
        ) : (
          <div className="space-y-3">
            {snapshot.topAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-cyan/10 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="text-sm font-medium text-slate-950">{alert.title}</div>
                    <div className="flex flex-wrap gap-2">
                      <WorkspaceAlertSeverityBadge severity={alert.severity} />
                      <WorkspaceAlertStatusBadge status={alert.status} />
                      <WorkspaceAlertTypeBadge type={alert.type} />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(alert.lastDetectedAt)}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{alert.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/notifications">
              Open notification center
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
