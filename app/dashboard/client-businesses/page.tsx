import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceClientBusinessPortfolio } from "@/lib/accountant-workspace";
import { requireUser } from "@/lib/auth";
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

  const portfolio = await getWorkspaceClientBusinessPortfolio({
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspace.name,
    role: membership.role,
  });

  return (
    <ClientBusinessesClient
      initialPortfolio={portfolio}
      quickLinks={{
        reviewHref: "/dashboard/banking/review",
        taxSummaryHref: "/dashboard/tax-center",
      }}
    />
  );
}
