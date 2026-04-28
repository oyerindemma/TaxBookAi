import { requireUser } from "@/lib/auth";
import { listInvoiceFormClients } from "@/lib/invoice-records";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import InvoiceFormClient from "./_components/InvoiceFormClient";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";

export default async function NewInvoicePage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">New invoice</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to create invoices.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const clients = await listInvoiceFormClients(membership.workspaceId);

  return <InvoiceFormClient role={membership.role} initialClients={clients} />;
}
