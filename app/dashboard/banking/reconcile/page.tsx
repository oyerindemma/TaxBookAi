import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ReconcileClient from "./_components/ReconcileClient";

export default async function ReconcilePage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Reconcile</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>Switch to a workspace to reconcile.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(membership.workspaceId, "BANKING");
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Reconcile</h1>
          <p className="text-muted-foreground">
            Professional unlocks bank statement AI reconciliation for accountant workflows.
          </p>
        </div>
        <FeatureGateCard
          feature="BANKING"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
          note="CSV import, transaction matching, and reconciliation review stay on Professional and Enterprise."
        />
      </section>
    );
  }

  return (
    <ReconcileClient
      role={membership.role}
      developmentBillingBypass={access.bypassed}
    />
  );
}
