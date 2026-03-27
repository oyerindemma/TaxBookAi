import { redirect } from "next/navigation";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export default async function BankingPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>Switch to a workspace to manage banking.</CardDescription>
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
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-muted-foreground">
            Banking imports and reconciliation are available from Professional upward.
          </p>
        </div>
        <FeatureGateCard
          feature="BANKING"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  redirect("/dashboard/banking/reconcile");
}
