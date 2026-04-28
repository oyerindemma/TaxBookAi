import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import CategorySettingsClient from "./_components/CategorySettingsClient";

export default async function CategorySettingsPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Expense categories</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>Switch to a workspace to manage categories.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return <CategorySettingsClient role={membership.role} />;
}
