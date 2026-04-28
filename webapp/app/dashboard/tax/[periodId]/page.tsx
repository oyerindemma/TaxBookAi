import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getWorkspaceTaxPeriodDetail } from "@/lib/tax-dashboard";
import { formatCurrency } from "@/lib/tax-engine";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{
    periodId: string;
  }>;
  searchParams: Promise<{
    error?: string | string[];
  }>;
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

function getComputationStatusVariant(status: string | null | undefined) {
  if (status === "FINALIZED") return "secondary" as const;
  if (status === "REVIEW_READY") return "outline" as const;
  return "outline" as const;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Pending";
}

export default async function TaxPeriodDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { periodId } = await params;
  const resolvedSearchParams = await searchParams;
  const error = firstValue(resolvedSearchParams.error);
  const parsedPeriodId = Number(periodId);

  if (!Number.isInteger(parsedPeriodId) || parsedPeriodId <= 0) {
    notFound();
  }

  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax period</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to review VAT and WHT computation periods.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const detail = await getWorkspaceTaxPeriodDetail(membership.workspaceId, parsedPeriodId);
  if (!detail) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{detail.period.label}</h1>
            <Badge variant={getPeriodStatusVariant(detail.period.status)}>
              {detail.period.status}
            </Badge>
            <Badge variant="outline">{detail.period.periodType}</Badge>
          </div>
          <p className="text-muted-foreground">
            Filing-ready VAT and WHT computation records for{" "}
            {detail.clientBusiness?.name ?? "the whole workspace"}.
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date(detail.period.startDate).toLocaleDateString()} -{" "}
            {new Date(detail.period.endDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/tax">Back to tax engine</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/tax-summary?${detail.period.queryString}`}>Legacy summary</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/tax-filing?${detail.period.queryString}`}>Filing workspace</Link>
          </Button>
          <form action={`/api/tax/periods/${detail.period.id}/compute`} method="POST">
            <Button type="submit">Refresh computation</Button>
          </form>
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
            <CardDescription>Output VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(detail.totals.outputVatMinor, detail.period.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Input VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(detail.totals.inputVatMinor, detail.period.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net VAT</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(detail.totals.netVatMinor, detail.period.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>WHT deducted</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(detail.totals.whtDeductedMinor, detail.period.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>WHT suffered</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(detail.totals.whtSufferedMinor, detail.period.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Computation status</CardTitle>
            <CardDescription>
              Stored computation metadata, rule version, and review readiness for this period.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">VAT computation</div>
                <Badge variant={getComputationStatusVariant(detail.vatComputation?.status)}>
                  {detail.vatComputation?.status ?? "NOT GENERATED"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Source records</span>
                  <span>{detail.vatComputation?.sourceCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Exceptions</span>
                  <span>{detail.vatComputation?.exceptionCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Computed at</span>
                  <span>
                    {detail.vatComputation?.computedAt
                      ? new Date(detail.vatComputation.computedAt).toLocaleString()
                      : "Not yet generated"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">WHT computation</div>
                <Badge variant={getComputationStatusVariant(detail.whtComputation?.status)}>
                  {detail.whtComputation?.status ?? "NOT GENERATED"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Source records</span>
                  <span>{detail.whtComputation?.sourceCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Exceptions</span>
                  <span>{detail.whtComputation?.exceptionCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Computed at</span>
                  <span>
                    {detail.whtComputation?.computedAt
                      ? new Date(detail.whtComputation.computedAt).toLocaleString()
                      : "Not yet generated"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit summary</CardTitle>
            <CardDescription>
              Who reviewed the period, what rules version ran, and how much supporting activity is
              attached to the computation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Rules version</span>
              <span>{detail.rulesVersion ?? "n/a"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Last computed</span>
              <span>{detail.computedAt ? new Date(detail.computedAt).toLocaleString() : "n/a"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Period review</span>
              <span>{detail.period.reviewedByName ?? "Not reviewed"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">VAT line items</span>
              <span>{detail.vatRows.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">WHT line items</span>
              <span>{detail.whtRows.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Adjustments</span>
              <span>{detail.adjustments.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Filing drafts</span>
              <span>{detail.filingDrafts.length}</span>
            </div>
            {detail.period.notes ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-muted-foreground">
                {detail.period.notes}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {detail.adjustments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tax adjustments</CardTitle>
            <CardDescription>
              Manual add-backs, deductions, or neutral adjustments attached to this period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.adjustments.map((adjustment) => (
              <div key={adjustment.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{adjustment.label}</div>
                  <Badge variant="outline">
                    {adjustment.taxType} {adjustment.direction}
                  </Badge>
                </div>
                <div className="mt-2 text-muted-foreground">
                  {formatCurrency(adjustment.amountMinor, detail.period.currency)}
                </div>
                {adjustment.reason ? <p className="mt-2 text-muted-foreground">{adjustment.reason}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>VAT contributing records</CardTitle>
          <CardDescription>
            Line-by-line VAT rows persisted for this period. Review flags before using the output
            for filing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.vatRows.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              No VAT-contributing records were stored for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Counterparty</th>
                    <th className="px-2 py-2">Treatment</th>
                    <th className="px-2 py-2">Basis</th>
                    <th className="px-2 py-2">VAT</th>
                    <th className="px-2 py-2">Flags</th>
                    <th className="px-2 py-2">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.vatRows.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-2 py-3">{formatDate(row.occurredOn)}</td>
                      <td className="px-2 py-3">
                        <div className="font-medium">{row.sourceType}</div>
                        <div className="text-xs text-muted-foreground">
                          #{row.sourceRecordId ?? "n/a"}
                          {row.sourceDocumentNumber ? ` · ${row.sourceDocumentNumber}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div>{row.counterpartyName ?? "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.taxCategory ?? "UNCLASSIFIED"}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">
                          {row.direction} · {row.vatTreatment}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        {formatCurrency(row.basisAmountMinor, row.currency)}
                      </td>
                      <td className="px-2 py-3">
                        {formatCurrency(row.vatAmountMinor, row.currency)}
                      </td>
                      <td className="px-2 py-3">
                        {row.flags.length === 0 ? (
                          <span className="text-muted-foreground">No flags</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.flags.map((flag) => (
                              <Badge key={`${row.id}-${flag}`} variant="destructive">
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div>{row.reviewed ? "Reviewed" : "Pending"}</div>
                        <div className="text-xs text-muted-foreground">
                          Evidence: {row.evidenceCount}
                        </div>
                        {row.reviewNote ? (
                          <div className="mt-1 text-xs text-muted-foreground">{row.reviewNote}</div>
                        ) : null}
                      </td>
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
          <CardTitle>WHT contributing records</CardTitle>
          <CardDescription>
            Stored withholding rows with counterparty and rate information for accountant review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.whtRows.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              No WHT-contributing records were stored for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Counterparty</th>
                    <th className="px-2 py-2">Treatment</th>
                    <th className="px-2 py-2">Basis</th>
                    <th className="px-2 py-2">Rate</th>
                    <th className="px-2 py-2">WHT</th>
                    <th className="px-2 py-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.whtRows.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-2 py-3">{formatDate(row.occurredOn)}</td>
                      <td className="px-2 py-3">
                        <div className="font-medium">{row.sourceType}</div>
                        <div className="text-xs text-muted-foreground">
                          #{row.sourceRecordId ?? "n/a"}
                          {row.sourceDocumentNumber ? ` · ${row.sourceDocumentNumber}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div>{row.counterpartyName ?? "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.counterpartyTaxId ?? "TIN missing"} · {row.taxCategory ?? "UNCLASSIFIED"}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">
                          {row.direction} · {row.whtTreatment}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        {formatCurrency(row.basisAmountMinor, row.currency)}
                      </td>
                      <td className="px-2 py-3">{row.whtRate}%</td>
                      <td className="px-2 py-3">
                        {formatCurrency(row.whtAmountMinor, row.currency)}
                      </td>
                      <td className="px-2 py-3">
                        {row.flags.length === 0 ? (
                          <span className="text-muted-foreground">No flags</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.flags.map((flag) => (
                              <Badge key={`${row.id}-${flag}`} variant="destructive">
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-muted-foreground">
                          {row.reviewed ? "Reviewed" : "Pending"} · Evidence {row.evidenceCount}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
