import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess, shouldBypassFeatureGate } from "@/lib/billing";
import { getWorkspaceReceiptUploadPageData } from "@/lib/receipt-review";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ReceiptUploadClient from "./_components/ReceiptUploadClient";

export const runtime = "nodejs";

export default async function ReceiptUploadPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Upload receipt</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to upload and extract receipts.
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
          <h1 className="text-2xl font-semibold">Upload receipt</h1>
          <p className="text-muted-foreground">
            Growth unlocks receipt scanning, extraction, and draft review for bookkeeping teams.
          </p>
        </div>
        <FeatureGateCard
          feature="AI_ASSISTANT"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
          note="Receipt extraction, duplicate detection, and review routing stay on Growth and above."
        />
      </section>
    );
  }

  const { clientBusinesses, recentUploads } = await getWorkspaceReceiptUploadPageData(
    membership.workspaceId
  );

  return (
    <ReceiptUploadClient
      workspaceName={membership.workspace.name}
      clientBusinesses={clientBusinesses}
      recentUploads={recentUploads}
      aiDevelopmentBypass={shouldBypassFeatureGate("AI_ASSISTANT")}
    />
  );
}
