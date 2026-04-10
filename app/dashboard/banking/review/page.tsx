import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceBankTransactionReviewData } from "@/lib/bank-transaction-review";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import TransactionReviewClient from "./_components/TransactionReviewClient";

type SearchParams = {
  transactionId?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOptionalId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function BankingReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);
  const initialSelectedTransactionId = parseOptionalId(
    firstValue(resolvedSearchParams.transactionId)
  );

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Transaction review</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to review imported and manually added transactions.
            </CardDescription>
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
          <h1 className="text-2xl font-semibold">Transaction review</h1>
          <p className="text-muted-foreground">
            Banking review, reconciliation, and transaction imports are available from
            Professional upward.
          </p>
        </div>
        <FeatureGateCard
          feature="BANKING"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const initialData = await getWorkspaceBankTransactionReviewData({
    workspaceId: membership.workspaceId,
  });

  return (
    <TransactionReviewClient
      role={membership.role}
      initialData={initialData}
      developmentBillingBypass={access.bypassed}
      initialSelectedTransactionId={initialSelectedTransactionId}
    />
  );
}
