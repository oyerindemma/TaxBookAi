import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess, shouldBypassFeatureGate } from "@/lib/billing";
import { getWorkspaceReceiptReviewPageData } from "@/lib/receipt-review";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import BookkeepingReviewClient from "@/app/dashboard/bookkeeping/review/_components/BookkeepingReviewClient";

export const runtime = "nodejs";

type SearchParams = {
  upload?: string | string[];
};

function parseSelectedUploadId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Receipt AI</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to upload and review receipt drafts.
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
          <h1 className="text-2xl font-semibold">Receipt AI</h1>
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

  const resolvedSearchParams = await searchParams;
  const initialSelectedUploadId = parseSelectedUploadId(resolvedSearchParams.upload);
  const { uploads, metrics, clientBusinesses } = await getWorkspaceReceiptReviewPageData(
    membership.workspaceId
  );

  return (
    <BookkeepingReviewClient
      workspaceName={membership.workspace.name}
      role={membership.role}
      initialUploads={uploads}
      metrics={metrics}
      clientBusinesses={clientBusinesses}
      aiDevelopmentBypass={shouldBypassFeatureGate("AI_ASSISTANT")}
      title="Receipt AI"
      description="Upload receipts, supplier invoices, and supporting documents. Review the extracted fields, fix anything uncertain, then approve a clean bookkeeping draft without posting it to the ledger yet."
      badgeLabel="Receipt AI queue"
      headerActions={[
        { href: "/dashboard/receipts/upload", label: "Upload receipt", variant: "default" },
        {
          href: "/dashboard/bookkeeping/review",
          label: "Bookkeeping review",
          variant: "outline",
        },
      ]}
      uploadTitle="Upload a receipt or supporting document"
      uploadDescription="Supports JPG, PNG, WEBP, HEIC, HEIF, and PDF files. TaxBook AI stores the upload, extracts vendor/date/amount/tax data, suggests a category, and creates a bookkeeping draft for review."
      uploadSuccessMessage="Receipt uploaded. Extraction finished and the draft is ready for review."
      queueTitle="Receipt review queue"
      queueDescription="Latest receipt and document uploads across this workspace. Select one to inspect the source file, extraction notes, and editable bookkeeping draft."
      emptyQueueMessage="No receipts yet. Upload your first document to start the extraction and draft review flow."
      emptySelectionTitle="Select a receipt"
      emptySelectionDescription="Choose an uploaded receipt or supporting document from the queue to review the extracted bookkeeping draft."
      draftEndpointBase="/api/receipts/drafts"
      saveDraftEnabled
      saveButtonLabel="Save draft"
      saveSuccessMessage="Draft changes saved."
      approveButtonLabel="Approve draft"
      approveSuccessMessage="Draft approved and kept in the bookkeeping workflow."
      rejectSuccessMessage="Draft rejected. No ledger entry was posted."
      initialSelectedUploadId={initialSelectedUploadId}
    />
  );
}
