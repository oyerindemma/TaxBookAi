import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { listWorkspaceClients } from "@/lib/clients";
import { getWorkspaceRecurringInvoice } from "@/lib/recurring-invoices";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import RecurringInvoiceDetailClient from "../_components/RecurringInvoiceDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

function serializeRecurringInvoice(entry: NonNullable<Awaited<ReturnType<typeof getWorkspaceRecurringInvoice>>>) {
  return {
    ...entry,
    startDate: entry.startDate.toISOString(),
    endDate: entry.endDate?.toISOString() ?? null,
    nextRunAt: entry.nextRunAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    lastGeneratedInvoice: entry.lastGeneratedInvoice
      ? {
          ...entry.lastGeneratedInvoice,
          issueDate: entry.lastGeneratedInvoice.issueDate.toISOString(),
          dueDate: entry.lastGeneratedInvoice.dueDate.toISOString(),
          createdAt: entry.lastGeneratedInvoice.createdAt.toISOString(),
        }
      : null,
    generatedInvoices: entry.generatedInvoices.map((invoice) => ({
      ...invoice,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
    })),
  };
}

export default async function RecurringInvoiceDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Recurring invoice</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to manage recurring billing templates.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const access = await getWorkspaceFeatureAccess(
    membership.workspaceId,
    "RECURRING_INVOICES"
  );
  if (!access.ok) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Recurring invoice</h1>
          <p className="text-muted-foreground">
            Growth unlocks invoice management and recurring billing workflows.
          </p>
        </div>
        <FeatureGateCard
          feature="RECURRING_INVOICES"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
        />
      </section>
    );
  }

  const { id } = await params;
  const recurringInvoiceId = Number(id);
  if (!Number.isFinite(recurringInvoiceId) || recurringInvoiceId <= 0) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Recurring invoice not found</h1>
          <p className="text-muted-foreground">The recurring invoice id is invalid.</p>
        </div>
      </section>
    );
  }

  const [recurringInvoice, clients] = await Promise.all([
    getWorkspaceRecurringInvoice(membership.workspaceId, recurringInvoiceId),
    listWorkspaceClients(membership.workspaceId),
  ]);

  if (!recurringInvoice) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Recurring invoice not found</h1>
          <p className="text-muted-foreground">
            The template may have been removed or does not belong to this workspace.
          </p>
        </div>
      </section>
    );
  }

  return (
    <RecurringInvoiceDetailClient
      role={membership.role}
      clients={clients.map((client) => ({
        id: client.id,
        displayName: client.displayName,
        email: client.email,
      }))}
      initialRecurringInvoice={serializeRecurringInvoice(recurringInvoice)}
    />
  );
}
