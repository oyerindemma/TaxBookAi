import { Badge } from "@/components/ui/badge";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { buildFinanceAssistantHomeState } from "@/lib/finance-assistant";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import AssistantClient from "./_components/AssistantClient";

export default async function AssistantPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">AI finance assistant</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to ask accounting questions about its live data.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(membership.workspaceId, "AI_ASSISTANT");
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">AI finance assistant</h1>
          <p className="text-muted-foreground">
            Growth unlocks AI receipt scanning, bookkeeping automation, and assistant workflows.
          </p>
        </div>
        <FeatureGateCard
          feature="AI_ASSISTANT"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const homeState = await buildFinanceAssistantHomeState({
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">AI finance assistant</h1>
          <p className="text-muted-foreground">
            Ask grounded questions about VAT, receivables, filings, anomalies, and reconciliation.
          </p>
          <p className="text-sm text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">
              {membership.workspace.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Workspace scoped</Badge>
          <Badge variant={homeState.aiEnabled ? "outline" : "secondary"}>
            {homeState.aiEnabled ? "Generative mode" : "Rules-only mode"}
          </Badge>
        </div>
      </div>

      <AssistantClient
        workspaceName={membership.workspace.name}
        aiEnabled={homeState.aiEnabled}
        quickInsights={homeState.quickInsights}
        suggestedPrompts={homeState.suggestedPrompts}
      />
    </section>
  );
}
