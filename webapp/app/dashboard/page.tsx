import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileText, Tags, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getDashboardTaxSnapshotSummary } from "@/lib/tax-engine";
import { cn } from "@/lib/utils";
import { getRecalcQueueState } from "@/lib/tax-snapshot-service";
import { getWorkspaceState, type WorkspaceState } from "@/lib/workspace-state";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import DashboardClient from "./_components/DashboardClient";

export const runtime = "nodejs";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

const workflowLinks = [
  {
    id: "import",
    href: "/dashboard/import",
    label: "Import",
    description: "Upload bank statements or add transactions.",
    icon: Upload,
  },
  {
    id: "review",
    href: "/dashboard/review",
    label: "Review",
    description: "Check raw transactions before categorizing.",
    icon: FileText,
  },
  {
    id: "categorize",
    href: "/dashboard/categorize",
    label: "Categorize",
    description: "Assign simple business categories.",
    icon: Tags,
  },
] as const;

function getWorkflowCta(state: WorkspaceState | null, snapshot: unknown | null) {
  if (!state?.hasTransactions) {
    return {
      href: "/dashboard/import",
      label: "Add transactions",
      description: "Add a bank statement or manual transaction first. Then TaxBook can calculate tax and reports.",
    };
  }

  if (!state.hasCategorized) {
    return {
      href: null,
      label: "Calculate first estimate",
      description:
        "You can calculate now. Categorising transactions later will make the estimate more accurate.",
    };
  }

  if (!snapshot) {
    return {
      href: null,
      label: "Calculate tax",
      description: "Your transactions are ready. Save a tax snapshot for this workspace.",
    };
  }

  return null;
}

function WorkflowProgress({ state }: { state: WorkspaceState | null }) {
  const steps = [
    {
      id: "import",
      label: "Import",
      complete: Boolean(state?.hasTransactions),
    },
    {
      id: "review",
      label: "Review",
      complete: Boolean(state?.hasReviewed),
    },
    {
      id: "categorize",
      label: "Categorize",
      complete: Boolean(state?.hasCategorized),
    },
    {
      id: "tax",
      label: "Tax",
      complete: Boolean(state?.hasTaxSnapshot),
    },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-2",
              step.complete
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {step.complete ? <CheckCircle2 className="size-4" /> : null}
            {step.label} {step.complete ? "✓" : ""}
          </span>
          {index < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);
  const workspaceState = membership
    ? await getWorkspaceState({
        userId: user.id,
        workspaceId: membership.workspaceId,
      })
    : null;
  const snapshot = await getDashboardTaxSnapshotSummary({
    userId: user.id,
    workspaceId: membership?.workspaceId ?? null,
  });
  const recalcQueueState = membership
    ? await getRecalcQueueState(user.id, membership.workspaceId)
    : {
        status: "idle" as const,
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
      };
  const hasPendingRecalculation = recalcQueueState.status === "updating";
  const hasFailedRecalculation = recalcQueueState.status === "failed";
  const needsRecalculation = Boolean(membership?.workspace.needsRecalculation);
  const dashboardSnapshot = needsRecalculation || hasPendingRecalculation || hasFailedRecalculation
    ? {
        totalIncome: null,
        totalExpense: null,
        taxableProfit: null,
        estimatedTax: null,
        transactionCount: snapshot?.transactionCount ?? 0,
        categorizedCount: snapshot?.categorizedCount ?? 0,
        uncategorizedCount: snapshot?.uncategorizedCount ?? 0,
        isRoughEstimate: Boolean(snapshot?.isRoughEstimate),
        warnings: snapshot?.warnings ?? [],
        assumptions: snapshot?.assumptions ?? [],
        createdAt: snapshot?.createdAt ?? null,
        status: hasFailedRecalculation ? "failed" : "stale",
        version: snapshot?.version ?? null,
      }
    : snapshot
      ? {
          totalIncome: snapshot.totalIncome,
          totalExpense: snapshot.totalExpense,
          taxableProfit: snapshot.taxableProfit,
          estimatedTax: snapshot.estimatedTax,
          transactionCount: snapshot.transactionCount,
          categorizedCount: snapshot.categorizedCount,
          uncategorizedCount: snapshot.uncategorizedCount,
          isRoughEstimate: snapshot.isRoughEstimate,
          warnings: snapshot.warnings,
          assumptions: snapshot.assumptions,
          createdAt: snapshot.createdAt,
          status: snapshot.status,
          version: snapshot.version,
        }
      : {
          totalIncome: null,
          totalExpense: null,
          taxableProfit: null,
          estimatedTax: null,
          transactionCount: 0,
          categorizedCount: 0,
          uncategorizedCount: 0,
          isRoughEstimate: false,
          warnings: [],
          assumptions: [],
          createdAt: null,
          status: "empty",
          version: null,
        };
  const transactionCount = workspaceState?.transactionCount ?? 0;
  const isSetupComplete = Boolean(workspaceState?.hasCategorized);
  const workflowCta = membership ? getWorkflowCta(workspaceState, snapshot) : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            {dashboardSnapshot.status !== "empty" ? (
              <>
                {dashboardSnapshot.version ? (
                  <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">
                    Tax v{dashboardSnapshot.version}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium",
                    dashboardSnapshot.status === "stale" || dashboardSnapshot.status === "failed"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {dashboardSnapshot.status}
                </span>
              </>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            A fast snapshot of money in, money out, and estimated tax.
          </p>
          {membership ? (
            <p className="text-sm text-muted-foreground">
              Workspace: <span className="font-medium text-foreground">{membership.workspace.name}</span>
            </p>
          ) : null}
        </div>
        {membership ? (
          <DashboardClient
            userId={user.id}
            transactionCount={transactionCount}
            isSetupComplete={isSetupComplete}
          />
        ) : null}
      </div>

      {!membership ? (
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>
              Choose or create a workspace to start adding transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/workspaces">Open workspaces</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {membership ? <WorkflowProgress state={workspaceState} /> : null}

      {(dashboardSnapshot.status === "stale" || dashboardSnapshot.status === "failed") && membership ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>
              {dashboardSnapshot.status === "failed" ? "Update failed" : "Figures updating"}
            </CardTitle>
            <CardDescription>
              {dashboardSnapshot.status === "failed"
                ? "Update failed. Retry required."
                : "Some figures need updating. Recalculate to refresh your tax estimate."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardClient
              userId={user.id}
              transactionCount={transactionCount}
              isSetupComplete={isSetupComplete}
            />
          </CardContent>
        </Card>
      ) : null}

      {dashboardSnapshot.status === "empty" && membership ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>No tax calculation yet</CardTitle>
            <CardDescription>
              Add transactions to calculate tax. If transactions already exist, you can create a first estimate now.
            </CardDescription>
          </CardHeader>
          {workflowCta ? (
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{workflowCta.description}</p>
              {workflowCta.href ? (
                <Button asChild>
                  <Link href={workflowCta.href}>{workflowCta.label}</Link>
                </Button>
              ) : (
                <DashboardClient
                  userId={user.id}
                  transactionCount={transactionCount}
                  isSetupComplete={isSetupComplete}
                />
              )}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {dashboardSnapshot.isRoughEstimate && dashboardSnapshot.status === "completed" ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-amber-700" />
              <div>
                <CardTitle>Rough tax estimate</CardTitle>
                <CardDescription>
                  {dashboardSnapshot.uncategorizedCount} transaction
                  {dashboardSnapshot.uncategorizedCount === 1 ? "" : "s"} still need
                  categorisation. They are still included as money in or money out so you can
                  keep moving.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Total Money In</CardDescription>
            <CardTitle>
              {dashboardSnapshot.totalIncome === null ? "—" : formatMoney(dashboardSnapshot.totalIncome)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Money Out</CardDescription>
            <CardTitle>
              {dashboardSnapshot.totalExpense === null
                ? "—"
                : formatMoney(dashboardSnapshot.totalExpense)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Taxable Profit</CardDescription>
            <CardTitle>
              {dashboardSnapshot.taxableProfit === null
                ? "—"
                : formatMoney(dashboardSnapshot.taxableProfit)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Estimated Tax</CardDescription>
            <CardTitle>
              {dashboardSnapshot.estimatedTax === null
                ? "—"
                : formatMoney(dashboardSnapshot.estimatedTax)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Last Updated</CardDescription>
            <CardTitle className="text-base">{formatDateTime(dashboardSnapshot.createdAt)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {dashboardSnapshot.status === "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>Tax estimate assumptions</CardTitle>
            <CardDescription>
              Based on {dashboardSnapshot.transactionCount} transaction
              {dashboardSnapshot.transactionCount === 1 ? "" : "s"}:
              {" "}
              {dashboardSnapshot.categorizedCount} categorised and{" "}
              {dashboardSnapshot.uncategorizedCount} uncategorised.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardSnapshot.warnings.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {dashboardSnapshot.warnings[0]}
              </div>
            ) : null}
            <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              {dashboardSnapshot.assumptions.map((assumption) => (
                <li key={assumption} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{assumption}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {workflowLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href={item.href}>Open {item.label}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4" />
        Dashboard figures update when you save a new tax snapshot.
      </div>
    </section>
  );
}
