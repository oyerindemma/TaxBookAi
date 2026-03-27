import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { listWorkspaceClients } from "@/lib/clients";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import RecurringInvoiceCreateClient from "../_components/RecurringInvoiceCreateClient";

export const runtime = "nodejs";

export default async function NewRecurringInvoicePage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">New recurring invoice</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to create recurring billing templates.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(
    membership.workspaceId,
    "RECURRING_INVOICES"
  );
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">New recurring invoice</h1>
          <p className="text-muted-foreground">
            Growth unlocks invoice management and recurring billing workflows.
          </p>
        </div>
        <FeatureGateCard
          feature="RECURRING_INVOICES"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const clients = await listWorkspaceClients(membership.workspaceId);

  return (
    <RecurringInvoiceCreateClient
      role={membership.role}
      clients={clients.map((client) => ({
        id: client.id,
        displayName: client.displayName,
        email: client.email,
      }))}
    />
  );
}
