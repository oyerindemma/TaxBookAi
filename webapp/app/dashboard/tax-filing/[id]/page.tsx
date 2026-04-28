import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getTaxFilingDetail } from "@/lib/tax-filing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { TaxFilingDetailClient } from "./_components/TaxFilingDetailClient";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TaxFilingDetailPage({ params }: RouteParams) {
  const { id } = await params;
  const filingDraftId = Number(id);
  if (!Number.isInteger(filingDraftId) || filingDraftId <= 0) {
    notFound();
  }

  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);
  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Filing draft</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(
    membership.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Filing draft</h1>
          <p className="text-muted-foreground">
            Filing workflows are available from Professional.
          </p>
        </div>
        <FeatureGateCard
          feature="TAX_FILING_ASSISTANT"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const detail = await getTaxFilingDetail({
    workspaceId: membership.workspaceId,
    filingDraftId,
  });

  if (!detail) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{detail.draft.taxType} filing draft</h1>
          <p className="text-muted-foreground">
            Review the pack, export the schedule, and log any manual submission against the draft.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/tax-filing">Back to filing workspace</Link>
        </Button>
      </div>

      <TaxFilingDetailClient role={membership.role} initialDetail={detail} />
    </section>
  );
}
