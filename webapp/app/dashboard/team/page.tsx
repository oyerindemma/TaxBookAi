import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import TeamClient from "./TeamClient";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">
            Please select a workspace to view members.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>
              Switch to a workspace to manage team members.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, name: true },
  });

  if (!workspace) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">Workspace not found.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Workspace missing</CardTitle>
            <CardDescription>
              The selected workspace could not be found.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(workspace.id, "TEAM_COLLABORATION");
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">
            Team invites and role management are available from Professional upward.
          </p>
        </div>
        <FeatureGateCard
          feature="TEAM_COLLABORATION"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  return (
    <TeamClient
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      role={ctx.role}
      currentUserId={ctx.userId}
    />
  );
}
