import Link from "next/link";
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
import { getWorkspaceTaxDashboardSnapshot } from "@/lib/tax-dashboard";
import { formatCurrency } from "@/lib/tax-engine";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

type SearchParams = {
  error?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getPeriodStatusVariant(status: string) {
  if (status === "READY") return "secondary" as const;
  if (status === "IN_REVIEW") return "outline" as const;
  if (status === "FILED" || status === "CLOSED") return "secondary" as const;
  return "outline" as const;
}

function getComputationStatusVariant(status: string) {
  if (status === "FINALIZED") return "secondary" as const;
  if (status === "REVIEW_READY") return "outline" as const;
  return "outline" as const;
}

function formatDateRange(startDate: string, endDate: string) {
  return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
}

export default async function TaxDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const error = firstValue(resolvedSearchParams.error);
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax engine</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to compute VAT and WHT summaries.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const snapshot = await getWorkspaceTaxDashboardSnapshot(membership.workspaceId);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentQuarter = String(Math.floor(now.getUTCMonth() / 3) + 1);
  const currentYear = String(now.getUTCFullYear());

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax engine</h1>
          <p className="text-muted-foreground">
            Nigeria-first VAT and WHT computations built from invoices, bookkeeping drafts, ledger
            activity, and tax records already inside this workspace.
          </p>
          <p className="text-sm text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">{membership.workspace.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">VAT + WHT</Badge>
          <Badge variant="outline">Workspace scoped</Badge>
          <Badge variant="outline">Filing-ready records</Badge>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{snapshot.totalsScopeLabel} output VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(snapshot.totals.outputVatMinor, snapshot.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{snapshot.totalsScopeLabel} input VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(snapshot.totals.inputVatMinor, snapshot.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{snapshot.totalsScopeLabel} net VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(snapshot.totals.netVatMinor, snapshot.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{snapshot.totalsScopeLabel} WHT deducted</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(snapshot.totals.whtDeductedMinor, snapshot.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{snapshot.totalsScopeLabel} WHT suffered</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(snapshot.totals.whtSufferedMinor, snapshot.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Generate monthly computation</CardTitle>
            <CardDescription>
              Best for monthly VAT and rolling WHT review. Existing computations are reused unless
              you explicitly refresh a stored period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/tax/periods" method="POST" className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="period" value="month" />
              <div className="grid gap-2">
                <Label htmlFor="tax-month">Month</Label>
                <Input id="tax-month" name="month" type="month" defaultValue={currentMonth} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tax-month-business">Client business</Label>
                <select
                  id="tax-month-business"
                  name="clientBusinessId"
                  defaultValue=""
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                  <option value="">All businesses</option>
                  {snapshot.clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button type="submit">Generate monthly computation</Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard/tax-summary">Open legacy summary</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Generate quarterly computation</CardTitle>
            <CardDescription>
              Useful for grouped WHT review and quarter-end tax prep. CIT remains available only as
              a foundation for later phases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/tax/periods" method="POST" className="grid gap-4 md:grid-cols-3">
              <input type="hidden" name="period" value="quarter" />
              <div className="grid gap-2">
                <Label htmlFor="tax-quarter">Quarter</Label>
                <select
                  id="tax-quarter"
                  name="quarter"
                  defaultValue={currentQuarter}
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
                <Label htmlFor="tax-year">Year</Label>
                <Input id="tax-year" name="year" type="number" defaultValue={currentYear} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tax-quarter-business">Client business</Label>
                <select
                  id="tax-quarter-business"
                  name="clientBusinessId"
                  defaultValue=""
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                  <option value="">All businesses</option>
                  {snapshot.clientBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3 flex flex-wrap gap-2">
                <Button type="submit">Generate quarterly computation</Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard/tax-filing">Open filing workspace</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Open periods</CardTitle>
            <CardDescription>
              Periods still in review or ready for filing. These are the records your team is most
              likely to touch next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.openPeriods.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                No open tax periods yet. Generate a monthly or quarterly computation to create the
                first filing-ready period.
              </div>
            ) : (
              <div className="space-y-3">
                {snapshot.openPeriods.map((period) => (
                  <div key={period.id} className="rounded-xl border px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{period.label}</div>
                          <Badge variant={getPeriodStatusVariant(period.status)}>
                            {period.status}
                          </Badge>
                          <Badge variant={getComputationStatusVariant(period.vat.status)}>
                            VAT {period.vat.status}
                          </Badge>
                          <Badge variant={getComputationStatusVariant(period.wht.status)}>
                            WHT {period.wht.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {period.clientBusinessName} · {formatDateRange(period.startDate, period.endDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline">
                          <Link href={`/dashboard/tax/${period.id}`}>Open period</Link>
                        </Button>
                        <form action={`/api/tax/periods/${period.id}/compute`} method="POST">
                          <Button type="submit">Refresh</Button>
                        </form>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-muted-foreground">Net VAT</div>
                        <div className="font-medium">
                          {formatCurrency(period.vat.netVatMinor, period.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">WHT net</div>
                        <div className="font-medium">
                          {formatCurrency(
                            period.wht.whtSufferedMinor - period.wht.whtDeductedMinor,
                            period.currency
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Exceptions</div>
                        <div className="font-medium">{period.exceptionCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Last computed</div>
                        <div className="font-medium">
                          {period.lastComputedAt
                            ? new Date(period.lastComputedAt).toLocaleString()
                            : "Not yet computed"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent period register</CardTitle>
            <CardDescription>
              The latest stored computations across this workspace, ready to reopen or audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.recentPeriods.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                No tax periods have been generated yet.
              </div>
            ) : (
              snapshot.recentPeriods.map((period) => (
                <div key={period.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{period.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {period.clientBusinessName}
                      </div>
                    </div>
                    <Badge variant={getPeriodStatusVariant(period.status)}>{period.status}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    VAT {formatCurrency(period.vat.netVatMinor, period.currency)} · WHT{" "}
                    {formatCurrency(
                      period.wht.whtSufferedMinor - period.wht.whtDeductedMinor,
                      period.currency
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/tax/${period.id}`}>View</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/tax-summary?${period.queryString}`}>Legacy summary</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
