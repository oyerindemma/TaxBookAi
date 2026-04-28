import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";
import {
  getWorkspaceTaxEngineOverview,
  parseClientBusinessFilter,
  parseReviewedFilter,
  parseTaxTypeFilter,
} from "@/lib/tax-engine";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import TaxRecordsClient from "./_components/TaxRecordsClient";
import TaxReviewQueueClient from "./_components/TaxReviewQueueClient";

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

export default async function TaxRecordsPage({
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
          <h1 className="text-2xl font-semibold">Tax records</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Choose a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to view or create tax records.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const resolvedSearchParams = await searchParams;
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

  const reviewRows = overview
    ? [
        ...overview.vatRows.map((row) => ({
          kind: "vat" as const,
          id: row.id,
          occurredOn: row.occurredOn,
          clientBusinessName: row.clientBusinessName,
          counterpartyName: row.counterpartyName,
          sourceType: row.sourceType,
          sourceRecordId: row.sourceRecordId,
          taxCategory: row.taxCategory,
          treatment: row.vatTreatment,
          basisAmountMinor: row.basisAmountMinor,
          taxAmountMinor: row.vatAmountMinor,
          currency: row.currency,
          sourceDocumentNumber: row.sourceDocumentNumber,
          reviewed: row.reviewed,
          reviewNote: row.reviewNote,
          flags: row.flags,
          evidenceCount: row.evidenceCount,
        })),
        ...overview.whtRows.map((row) => ({
          kind: "wht" as const,
          id: row.id,
          occurredOn: row.occurredOn,
          clientBusinessName: row.clientBusinessName,
          counterpartyName: row.counterpartyName,
          counterpartyTaxId: row.counterpartyTaxId,
          sourceType: row.sourceType,
          sourceRecordId: row.sourceRecordId,
          taxCategory: row.taxCategory,
          treatment: row.whtTreatment,
          basisAmountMinor: row.basisAmountMinor,
          taxAmountMinor: row.whtAmountMinor,
          currency: row.currency,
          sourceDocumentNumber: row.sourceDocumentNumber,
          reviewed: row.reviewed,
          reviewNote: row.reviewNote,
          flags: row.flags,
          evidenceCount: row.evidenceCount,
          whtRate: row.whtRate,
        })),
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax records</h1>
          <p className="text-muted-foreground">
            Review engine-generated VAT and WHT items, then keep manual tax records in sync.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Review queue</Badge>
          <Badge variant="outline">Manual records included</Badge>
          {overview ? (
            <Badge variant={overview.unresolvedSummary.total > 0 ? "destructive" : "outline"}>
              {overview.unresolvedSummary.total} unresolved
            </Badge>
          ) : null}
        </div>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Review filters</CardTitle>
          <CardDescription>
            Filter the tax review queue by period, business, tax type, and review status.
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
                <Link href="/dashboard/tax-records">Reset</Link>
              </Button>
            </div>
          </form>
          {period.errorMsg ? (
            <p className="mt-3 text-sm text-destructive">{period.errorMsg}</p>
          ) : null}
        </CardContent>
      </Card>

      <TaxReviewQueueClient role={membership.role} rows={reviewRows} />

      <TaxRecordsClient role={membership.role} />
    </section>
  );
}
