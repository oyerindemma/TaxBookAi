import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatTimestamp(value: Date) {
  return new Date(value).toLocaleString();
}

export default async function AuditPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to view audit history.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(membership.workspaceId, "AUDIT_LOG");
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-muted-foreground">
            Audit history is available from Professional upward.
          </p>
        </div>
        <FeatureGateCard
          feature="AUDIT_LOG"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: true,
      target: true,
    },
  });

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground">
          Workspace: <span className="font-medium text-foreground">{membership.workspace.name}</span>
        </p>
        <p className="text-muted-foreground">
          Recent actions across this workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Last 50 actions in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit activity yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">Actor</th>
                  <th className="pb-3 font-medium">Target</th>
                  <th className="pb-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="py-3 text-xs text-muted-foreground">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-3 font-medium">{log.action}</td>
                    <td className="py-3">
                      {log.actor?.fullName ?? "System"}
                    </td>
                    <td className="py-3">
                      {log.target?.fullName ?? "-"}
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {log.metadata ? log.metadata : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
