import Link from "next/link";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getWorkspaceCitWorkflowPageData } from "@/lib/cit-workflow";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import CITWorkflowClient from "./_components/CITWorkflowClient";

type SearchParams = {
  year?: string | string[];
  clientBusinessId?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseYear(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 2000 || parsed > 9999) {
    return null;
  }
  return parsed;
}

function parseOptionalId(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export default async function CITPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">CIT workflow</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to prepare company income tax schedules and export packs.
            </CardDescription>
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
          <h1 className="text-2xl font-semibold">CIT workflow</h1>
          <p className="text-muted-foreground">
            Company income tax preparation workflows are available from Professional.
          </p>
        </div>
        <FeatureGateCard
          feature="TAX_FILING_ASSISTANT"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
          note="TaxBook AI can prepare CIT packs, track blockers, and export support schedules while keeping final submission manual."
        />
      </section>
    );
  }

  const year = parseYear(firstValue(resolvedSearchParams.year)) ?? new Date().getUTCFullYear();
  const clientBusinessId = parseOptionalId(firstValue(resolvedSearchParams.clientBusinessId));
  const pageData = await getWorkspaceCitWorkflowPageData({
    workspaceId: membership.workspaceId,
    clientBusinessId,
    year,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">CIT workflow</h1>
          <p className="text-muted-foreground">
            Prepare taxable-profit support schedules, track blockers, and export a manual company
            income tax pack from live workspace data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/tax-summary">Tax summary</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/tax-filing">Filing workspace</Link>
          </Button>
        </div>
      </div>

      <CITWorkflowClient role={membership.role} initialData={pageData} />
    </section>
  );
}
