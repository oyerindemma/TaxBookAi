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
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";
import {
  buildTaxEngineExportQuery,
  formatCurrency,
  getWorkspaceTaxEngineOverview,
  parseClientBusinessFilter,
  parseReviewedFilter,
  parseTaxTypeFilter,
} from "@/lib/tax-engine";
import type { NigerianTaxOutputStatus } from "@/lib/nigeria-tax-rules";

type SearchParams = {
  period?: string | string[];
  month?: string | string[];
  quarter?: string | string[];
  year?: string | string[];
  from?: string | string[];
  to?: string | string[];
  clientBusinessId?: string | string[];
  reviewed?: string | string[];
  taxType?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getOutputStatusLabel(status: NigerianTaxOutputStatus) {
  if (status === "filing-ready") return "Filing-ready";
  if (status === "review-needed") return "Review needed";
  if (status === "filed") return "Filed";
  return "Estimate";
}

function getExportUrl(
  format: string,
  query: string
) {
  return query
    ? `/api/tax-engine/export?format=${format}&${query}`
    : `/api/tax-engine/export?format=${format}`;
}

export default async function TaxSummaryPage({
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
          <h1 className="text-2xl font-semibold">Tax summary</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to compute VAT, WHT, and CIT support schedules.
            </CardDescription>
          </CardHeader>
        </Card>
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
  const reviewed = parseReviewedFilter(firstValue(resolvedSearchParams.reviewed));
  const taxType = parseTaxTypeFilter(firstValue(resolvedSearchParams.taxType));

  const overview = period.errorMsg
    ? null
    : await getWorkspaceTaxEngineOverview({
        workspaceId: membership.workspaceId,
        clientBusinessId,
        reviewed,
        taxType,
        period,
      });
  const exportQuery = overview
    ? buildTaxEngineExportQuery({
        period,
        clientBusinessId,
        reviewed,
        taxType,
      })
    : "";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax summary</h1>
          <p className="text-muted-foreground">
            Nigeria-first VAT, WHT, and CIT support schedules computed from live workspace data.
          </p>
          <p className="text-sm text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">
              {membership.workspace.name}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Rules engine</Badge>
          {overview ? (
            <Badge variant="outline">{getOutputStatusLabel(overview.outputStatus)}</Badge>
          ) : null}
          <Badge variant="outline">Workspace scoped</Badge>
          <Badge variant="outline">Audit friendly</Badge>
        </div>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Scope the tax engine by filing period, business, tax type, and review status.
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
                {overview?.clientBusinesses.map((business) => (
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
            <div className="grid gap-2">
              <Label htmlFor="taxType">Tax type</Label>
              <select
                id="taxType"
                name="taxType"
                defaultValue={taxType}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="ALL">All</option>
                <option value="VAT">VAT</option>
                <option value="WHT">WHT</option>
                <option value="CIT">CIT</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reviewed">Review state</Label>
              <select
                id="reviewed"
                name="reviewed"
                defaultValue={reviewed}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="ALL">All</option>
                <option value="REVIEWED">Reviewed only</option>
                <option value="UNREVIEWED">Unreviewed only</option>
                <option value="UNRESOLVED">Unresolved only</option>
              </select>
            </div>
            <div className="flex items-end gap-2 xl:col-span-2">
              <Button type="submit">Apply filters</Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/tax-summary">Reset</Link>
              </Button>
            </div>
          </form>
          {period.errorMsg ? (
            <p className="mt-3 text-sm text-destructive">{period.errorMsg}</p>
          ) : null}
        </CardContent>
      </Card>

      {overview ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={getExportUrl("vat-summary-csv", exportQuery)}>VAT summary CSV</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getExportUrl("wht-schedule-csv", exportQuery)}>WHT schedule CSV</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getExportUrl("period-summary-csv", exportQuery)}>
                Filing-ready period summary
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getExportUrl("exception-report-csv", exportQuery)}>
                Exception report
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getExportUrl("json", exportQuery)}>JSON payload</Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Output VAT</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.outputVatMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Input VAT</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.inputVatMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net VAT</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.netVatMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>WHT deducted</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.whtDeductedMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>WHT suffered</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.whtSufferedMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tax-adjusted profit</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(
                    overview.totals.taxAdjustedProfitMinor,
                    overview.period.currency
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Estimated CIT</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(overview.totals.estimatedCitMinor, overview.period.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unresolved items</CardDescription>
                <CardTitle className="text-xl">{overview.unresolvedSummary.total}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader>
                <CardTitle>Business breakdown</CardTitle>
                <CardDescription>
                  VAT and WHT exposure by client business for {overview.period.label}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overview.businesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tax-bearing records were found for the selected scope.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2">Business</th>
                          <th className="px-2 py-2">Output VAT</th>
                          <th className="px-2 py-2">Input VAT</th>
                          <th className="px-2 py-2">Net VAT</th>
                          <th className="px-2 py-2">WHT deducted</th>
                          <th className="px-2 py-2">WHT suffered</th>
                          <th className="px-2 py-2">Records</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.businesses.map((business) => (
                          <tr key={`${business.clientBusinessId ?? "workspace"}-row`} className="border-t">
                            <td className="px-2 py-3 font-medium">{business.clientBusinessName}</td>
                            <td className="px-2 py-3">
                              {formatCurrency(business.outputVatMinor, overview.period.currency)}
                            </td>
                            <td className="px-2 py-3">
                              {formatCurrency(business.inputVatMinor, overview.period.currency)}
                            </td>
                            <td className="px-2 py-3">
                              {formatCurrency(business.netVatMinor, overview.period.currency)}
                            </td>
                            <td className="px-2 py-3">
                              {formatCurrency(business.whtDeductedMinor, overview.period.currency)}
                            </td>
                            <td className="px-2 py-3">
                              {formatCurrency(business.whtSufferedMinor, overview.period.currency)}
                            </td>
                            <td className="px-2 py-3">{business.recordCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Filing drafts</CardTitle>
                <CardDescription>
                  Persisted filing-ready period summaries for VAT, WHT, and CIT.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.filings.map((draft) => (
                  <div key={draft.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{draft.taxType}</div>
                      <Badge variant={draft.exceptionCount > 0 ? "destructive" : "secondary"}>
                        {draft.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {draft.exceptionCount} exception
                      {draft.exceptionCount === 1 ? "" : "s"}
                    </div>
                    {draft.reference ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Reference: {draft.reference}
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>VAT source mix</CardTitle>
                <CardDescription>
                  Output vs input VAT grouped by source type for the selected period.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overview.vatBreakdownBySource.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No VAT-bearing records were found for this scope.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overview.vatBreakdownBySource.map((row) => (
                      <div key={row.sourceType} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{row.sourceType}</span>
                          <span className="text-muted-foreground">{row.recordCount} records</span>
                        </div>
                        <div className="mt-2 grid gap-1 text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <span>Output VAT</span>
                            <span>{formatCurrency(row.outputVatMinor, overview.period.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Input VAT</span>
                            <span>{formatCurrency(row.inputVatMinor, overview.period.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t pt-1 font-medium text-foreground">
                            <span>Net VAT</span>
                            <span>{formatCurrency(row.netVatMinor, overview.period.currency)}</span>
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
                <CardTitle>WHT exposure</CardTitle>
                <CardDescription>
                  Withholding grouped by counterparty and category for accountant review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {overview.whtBreakdownByCounterparty.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No WHT-bearing records were found for this scope.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overview.whtBreakdownByCounterparty.slice(0, 6).map((row) => (
                      <div key={row.counterpartyName} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{row.counterpartyName}</span>
                          <Badge variant={row.missingCounterpartyTaxId ? "destructive" : "outline"}>
                            {row.direction}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <span>Deducted</span>
                            <span>{formatCurrency(row.deductedMinor, overview.period.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Suffered</span>
                            <span>{formatCurrency(row.sufferedMinor, overview.period.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Records</span>
                            <span>{row.recordCount}</span>
                          </div>
                          {row.missingCounterpartyTaxId ? (
                            <p className="pt-1 text-xs text-destructive">
                              Counterparty tax identity still needs review.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {overview.whtBreakdownByCategory.length > 0 ? (
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="mb-2 font-medium">By tax category</div>
                    <div className="space-y-2">
                      {overview.whtBreakdownByCategory.slice(0, 5).map((row) => (
                        <div key={row.taxCategory} className="flex items-center justify-between gap-3 text-muted-foreground">
                          <span>{row.taxCategory}</span>
                          <span>
                            {formatCurrency(
                              row.deductedMinor + row.sufferedMinor,
                              overview.period.currency
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Compliance exceptions</CardTitle>
                <CardDescription>
                  Missing treatments, evidence, duplicates, and inconsistent totals flagged by the
                  engine.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overview.exceptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No compliance exceptions were detected for this scope.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overview.exceptions.slice(0, 12).map((item, index) => (
                      <div key={`${item.taxType}-${item.sourceType}-${item.sourceRecordId}-${index}`} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{item.title}</div>
                          <Badge variant={item.severity === "HIGH" ? "destructive" : "outline"}>
                            {item.taxType} · {item.severity}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {item.clientBusinessName ? `${item.clientBusinessName} · ` : ""}
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CIT support schedule</CardTitle>
                <CardDescription>
                  Structured support only. Final corporate income tax treatment still needs
                  accountant judgment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>Accounting profit before tax</span>
                    <span className="font-medium">
                      {formatCurrency(
                        overview.computations.CIT.accountingProfitMinor,
                        overview.period.currency
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Add-backs</span>
                    <span className="font-medium">
                      {formatCurrency(overview.computations.CIT.addBacksMinor, overview.period.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Deductions</span>
                    <span className="font-medium">
                      {formatCurrency(
                        overview.computations.CIT.deductionsMinor,
                        overview.period.currency
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-2">
                    <span>Tax-adjusted profit</span>
                    <span className="font-medium">
                      {formatCurrency(
                        overview.computations.CIT.taxAdjustedProfitMinor,
                        overview.period.currency
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      Estimated CIT ({overview.computations.CIT.companyBand.toLowerCase()} ·{" "}
                      {overview.computations.CIT.appliedRate}%)
                    </span>
                    <span className="font-medium">
                      {formatCurrency(
                        overview.computations.CIT.estimatedCitMinor,
                        overview.period.currency
                      )}
                    </span>
                  </div>
                </div>
                {overview.computations.CIT.rows.length > 0 ? (
                  <div className="space-y-2">
                    {overview.computations.CIT.rows.slice(0, 8).map((row, index) => (
                      <div key={`${row.label}-${index}`} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span>{row.label}</span>
                          <span className="font-medium">
                            {formatCurrency(row.amountMinor, overview.period.currency)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.direction}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {overview.computations.CIT.placeholders.length > 0 ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {overview.computations.CIT.placeholders.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
