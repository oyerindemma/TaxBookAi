import { requireUser } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import TaxRecordsImportClient from "./_components/TaxRecordsImportClient";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TaxRecordsImportPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Import tax records</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Choose a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to import tax records.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return <TaxRecordsImportClient role={membership.role} />;
}
