import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspacePaymentIntegrationSettings } from "@/lib/payment-tax-integration";
import { canManageWorkspace, getActiveWorkspaceMembership } from "@/lib/workspaces";
import PaymentIntegrationSettingsClient from "./_components/PaymentIntegrationSettingsClient";

export default async function PaymentIntegrationSettingsPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Payment and tax integration</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace before configuring Paystack payment activity import.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  if (!canManageWorkspace(membership.role)) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Payment and tax integration</h1>
          <p className="text-muted-foreground">
            Admin settings are restricted to workspace owners and admins.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              Ask a workspace admin to configure Paystack imports and settlement sync.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const initialState = await getWorkspacePaymentIntegrationSettings({
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return (
    <PaymentIntegrationSettingsClient
      workspaceName={membership.workspace.name}
      initialState={initialState}
    />
  );
}
