import Link from "next/link";
import { FeatureGateCard } from "@/components/billing/feature-gate-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";
import { formatCurrency, parseClientBusinessFilter } from "@/lib/tax-engine";
import { getWorkspaceTaxFilingWorkspace } from "@/lib/tax-filing";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

type SearchParams = {
  period?: string | string[];
  month?: string | string[];
  quarter?: string | string[];
  year?: string | string[];
  from?: string | string[];
  to?: string | string[];
  clientBusinessId?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getStatusVariant(status: string) {
  if (status === "APPROVED_FOR_SUBMISSION" || status === "SUBMITTED") return "secondary" as const;
  if (status === "SUBMITTED_MANUALLY") return "secondary" as const;
  if (status === "FAILED" || status === "CANCELLED") return "destructive" as const;
  if (status === "SUBMISSION_PENDING") return "outline" as const;
  return "outline" as const;
}

function getCheckVariant(severity: string) {
  if (severity === "BLOCKING") return "destructive" as const;
  if (severity === "WARNING") return "outline" as const;
  return "secondary" as const;
}

export default async function TaxFilingPage({
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
          <h1 className="text-2xl font-semibold">Tax filing</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to prepare VAT and WHT filing packs.
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
          <h1 className="text-2xl font-semibold">Tax filing</h1>
          <p className="text-muted-foreground">
            Filing packs, approval workflows, and manual submission logs are available from
            Professional.
          </p>
        </div>
        <FeatureGateCard
          feature="TAX_FILING_ASSISTANT"
          currentPlan={access.plan}
          requiredPlan={access.requiredPlan}
          note="Starter and Growth still keep tax summaries, but filing workflows stay on Professional and Enterprise."
        />
      </section>
    );
  }

  const period = resolveTaxPeriodState({
    period: firstValue(resolvedSearchParams.period),
    month: firstValue(resolvedSearchParams.month),
    quarter: firstValue(resolvedSearchParams.quarter),
    year: firstValue(resolvedSearchParams.year),
    from: firstValue(resolvedSearchParams.from),
    to: firstValue(resolvedSearchParams.to),
  });
  const clientBusinessId = parseClientBusinessFilter(
    firstValue(resolvedSearchParams.clientBusinessId)
  );

  const workspace = period.errorMsg
    ? null
    : await getWorkspaceTaxFilingWorkspace({
        workspaceId: membership.workspaceId,
        clientBusinessId,
        period,
      });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax filing workspace</h1>
          <p className="text-muted-foreground">
            Prepare VAT and WHT filing packs, review exceptions, export schedules, and log manual
            submissions without pretending a direct FIRS submission exists.
          </p>
          <p className="text-sm text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">
              {membership.workspace.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Prepare only</Badge>
          <Badge variant="outline">TaxPro Max ready</Badge>
          <Badge variant="outline">Audit trail</Badge>
        </div>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Scope the filing workspace by period and client business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-2">
              <Label htmlFor="period">Period mode</Label>
              <select
                id="period"
                name="period"
                defaultValue={period.mode}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="custom">Custom</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="month">Month</Label>
              <Input id="month" name="month" type="month" defaultValue={period.monthInput} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quarter">Quarter</Label>
              <select
                id="quarter"
                name="quarter"
                defaultValue={period.quarterInput}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                {["1", "2", "3", "4"].map((value) => (
                  <option key={value} value={value}>
                    Q{value}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="year">Year</Label>
              <Input id="year" name="year" type="number" defaultValue={period.yearInput} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="clientBusinessId">Client business</Label>
              <select
                id="clientBusinessId"
                name="clientBusinessId"
                defaultValue={clientBusinessId ? String(clientBusinessId) : ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="">All businesses</option>
                {workspace?.overview.clientBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={period.fromInput} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={period.toInput} />
            </div>
            <div className="flex items-end gap-2 xl:col-span-2">
              <Button type="submit">Apply filters</Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/tax-filing">Reset</Link>
              </Button>
            </div>
          </form>
          {period.errorMsg ? (
            <p className="mt-3 text-sm text-destructive">{period.errorMsg}</p>
          ) : null}
        </CardContent>
      </Card>

      {workspace ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net VAT</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(
                    workspace.overview.totals.netVatMinor,
                    workspace.overview.period.currency
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net WHT position</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(
                    workspace.overview.totals.whtSufferedMinor -
                      workspace.overview.totals.whtDeductedMinor,
                    workspace.overview.period.currency
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CIT support</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(
                    workspace.overview.totals.taxAdjustedProfitMinor,
                    workspace.overview.period.currency
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unresolved exceptions</CardDescription>
                <CardTitle className="text-xl">{workspace.overview.exceptions.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Adapter foundation</CardTitle>
              <CardDescription>
                TaxBook AI prepares structured packs for manual filing. Direct government submission
                remains disabled by design.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {workspace.adapters.map((adapter) => (
                <div key={adapter.code} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{adapter.label}</div>
                    <Badge variant="outline">{adapter.mode}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{adapter.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {workspace.drafts.map((draft) => (
              <Card key={draft.id} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>{draft.taxType} draft</CardTitle>
                      <CardDescription>
                        {draft.clientBusinessName ?? "Workspace-level filing pack"}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusVariant(draft.status)}>{draft.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{draft.summaryAmountLabel}</span>
                      <span className="font-medium">
                        {formatCurrency(
                          draft.summaryAmountMinor,
                          workspace.overview.period.currency
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Exceptions</span>
                      <span>{draft.exceptionCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Filing items</span>
                      <span>{draft.itemCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Evidence</span>
                      <span>{draft.evidenceCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Submission logs</span>
                      <span>{draft.submissionLogCount}</span>
                    </div>
                  </div>

                  {draft.reference ? (
                    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      Filing ID: {draft.reference}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {draft.checks.slice(0, 3).map((check) => (
                      <Badge key={`${draft.id}-${check.code}`} variant={getCheckVariant(check.severity)}>
                        {check.severity}: {check.title}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/dashboard/tax-filing/${draft.id}`}>Open draft</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <a href={`/api/tax-filing/${draft.id}/export?format=schedule-csv`}>
                        Export schedule
                      </a>
                    </Button>
                    <Button asChild variant="outline">
                      <a href={`/api/tax-filing/${draft.id}/export?format=summary-html`} target="_blank" rel="noreferrer">
                        Printable pack
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Manual submission workflow</CardTitle>
              <CardDescription>
                Use the draft detail page to prepare the payload, approve it for submission,
                export the pack, and log the manual filing reference after completing TaxPro Max.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      ) : null}
    </section>
  );
}
