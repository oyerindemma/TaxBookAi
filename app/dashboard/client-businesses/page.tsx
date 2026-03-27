import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listWorkspaceClientBusinesses } from "@/lib/accounting-firm";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ClientBusinessesClient from "./_components/ClientBusinessesClient";

export default async function ClientBusinessesPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Client businesses</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to manage client business portfolios.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const businesses = await listWorkspaceClientBusinesses(membership.workspaceId);

  return (
    <ClientBusinessesClient
      role={membership.role}
      workspaceName={membership.workspace.name}
      initialBusinesses={businesses}
      quickLinks={{
        reviewHref: "/dashboard/bookkeeping/review",
        taxSummaryHref: "/dashboard/tax-summary",
      }}
    />
  );
}
