import { BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { getWorkspaceAlertCenterData } from "@/lib/workspace-alerts";
import NotificationCenterClient from "./_components/NotificationCenterClient";

export default async function NotificationCenterPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Notification center</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to monitor duplicate transactions, tax deadlines, and filing blockers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const initialData = await getWorkspaceAlertCenterData({
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
                Smart alerts
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                Workspace scoped
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Notification Center</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Track live operational risks across bookkeeping, tax, and filing readiness with
                exact record traceability back to the workspace source items.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan">
                <BellRing className="size-6" />
              </div>
              <div>
                <div className="text-4xl font-semibold">{initialData.summary.openCount}</div>
                <div className="text-sm text-white/70">Open alerts</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                {initialData.summary.criticalOpenCount} critical
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                {initialData.summary.snoozedCount} snoozed
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <NotificationCenterClient
        role={membership.role}
        workspaceId={membership.workspaceId}
        initialData={initialData}
      />
    </section>
  );
}
