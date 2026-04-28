import { Badge } from "@/components/ui/badge";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { buildAssistantHomeState } from "@/lib/assistant-context";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import AssistantClient from "./_components/AssistantClient";

type AssistantPageProps = {
  searchParams: Promise<{
    prompt?: string | string[];
  }>;
};

function readPrompt(
  value: string | string[] | undefined
) {
  if (typeof value === "string") {
    return value.trim().slice(0, 600);
  }

  if (Array.isArray(value)) {
    return (value[0] ?? "").trim().slice(0, 600);
  }

  return "";
}

export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);
  const resolvedSearchParams = await searchParams;
  const initialQuestion = readPrompt(resolvedSearchParams.prompt);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Assistant</h1>
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
          <h1 className="text-2xl font-semibold">Assistant</h1>
          <p className="text-muted-foreground">
            Growth unlocks grounded workspace Q&amp;A, bookkeeping automation, and assistant workflows.
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

  const homeState = await buildAssistantHomeState(membership.workspaceId);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Assistant</h1>
          <p className="text-muted-foreground">
            Ask grounded questions about transactions, review queue, category suggestions, tax exposure, and workspace blockers.
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
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspace.name}
        aiEnabled={homeState.aiEnabled}
        quickInsights={homeState.quickInsights}
        suggestedPrompts={homeState.suggestedPrompts}
        initialQuestion={initialQuestion}
      />
    </section>
  );
}
