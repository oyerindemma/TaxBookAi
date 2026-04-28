import { requireUser } from "@/lib/auth";
import { listWorkspaceInvoices } from "@/lib/invoice-records";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import InvoicesClient from "./_components/InvoicesClient";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";

export default async function InvoicesPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to view invoices.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const invoices = await listWorkspaceInvoices(membership.workspaceId);

  return <InvoicesClient role={membership.role} initialInvoices={invoices} />;
}
