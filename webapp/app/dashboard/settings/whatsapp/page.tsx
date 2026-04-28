import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceWhatsAppReceiptSettings } from "@/lib/whatsapp-receipt-capture";
import { canManageWorkspace, getActiveWorkspaceMembership } from "@/lib/workspaces";
import WhatsAppSettingsClient from "./_components/WhatsAppSettingsClient";

export default async function WhatsAppSettingsPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">WhatsApp receipt capture</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace before configuring WhatsApp receipt capture.
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
          <h1 className="text-2xl font-semibold">WhatsApp receipt capture</h1>
          <p className="text-muted-foreground">
            Admin settings are restricted to workspace owners and admins.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              Ask a workspace admin to configure inbound WhatsApp receipt capture.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const initialState = await getWorkspaceWhatsAppReceiptSettings({
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return (
    <WhatsAppSettingsClient
      workspaceName={membership.workspace.name}
      initialState={initialState}
    />
  );
}
