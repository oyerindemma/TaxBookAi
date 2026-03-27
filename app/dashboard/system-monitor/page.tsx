import { requireUser } from "@/lib/auth";
import { getSystemMonitorSnapshot } from "@/lib/system-monitor";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemMonitorClient } from "@/app/dashboard/system-monitor/_components/SystemMonitorClient";

export default async function SystemMonitorPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">System Monitor</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Switch to a workspace to monitor payment posting, ledger integrity, and tax sync.
          </CardContent>
        </Card>
      </section>
    );
  }

  const snapshot = await getSystemMonitorSnapshot({
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspace.name,
  });

  return <SystemMonitorClient initialSnapshot={snapshot} />;
}
