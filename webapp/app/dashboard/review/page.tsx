import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceBankTransactionReviewDataSafe } from "@/lib/bank-transaction-review";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import TransactionReviewClient from "../banking/review/_components/TransactionReviewClient";

export const runtime = "nodejs";

export default async function ReviewWorkflowPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Review</h1>
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>Select a workspace to review raw transactions.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(membership.workspaceId, "BANKING");
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Review</h1>
          <p className="text-muted-foreground">Review imported and manually added transactions.</p>
        </div>
        <FeatureGateCard
          feature="BANKING"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const initialData = await getWorkspaceBankTransactionReviewDataSafe({
    workspaceId: membership.workspaceId,
  });

  return (
    <TransactionReviewClient
      role={membership.role}
      initialData={initialData}
      developmentBillingBypass={access.bypassed}
      initialSelectedTransactionId={null}
    />
  );
}
