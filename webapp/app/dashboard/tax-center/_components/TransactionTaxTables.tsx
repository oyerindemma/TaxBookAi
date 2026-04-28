import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TransactionTaxFutureModule,
  TransactionTaxBreakdownRow,
  TransactionTaxDrilldownRow,
  TransactionTaxLiabilityExplanation,
} from "@/lib/transaction-tax";

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${value}%`;
}

function formatSourceLabel(row: TransactionTaxDrilldownRow) {
  if (row.taxTreatmentSource === "MANUAL") return "Manual";
  if (row.taxTreatmentSource === "SUGGESTED") return "Stored suggestion";
  if (row.usesSuggestedFallback) return "Suggestion fallback";
  return "Unspecified";
}

function formatEffect(amountMinor: number, currency: string) {
  if (amountMinor === 0) {
    return "No effect";
  }

  const formatted = formatMoney(Math.abs(amountMinor), currency);
  return amountMinor > 0 ? `+${formatted}` : `-${formatted}`;
}

function changeBadgeVariant(direction: TransactionTaxLiabilityExplanation["changeDirection"]) {
  if (direction === "UP" || direction === "NEW") return "destructive";
  if (direction === "DOWN") return "secondary";
  return "outline";
}

function formatChangeLabel(explanation: TransactionTaxLiabilityExplanation, currency: string) {
  if (explanation.changeMinor === null) {
    return "No comparison baseline";
  }

  if (explanation.changeMinor === 0) {
    return "No change";
  }

  return `${explanation.changeMinor > 0 ? "+" : "-"}${formatMoney(
    Math.abs(explanation.changeMinor),
    currency
  )}`;
}

export function TransactionTaxSummaryTable({
  title,
  description,
  rows,
  currency,
}: {
  title: string;
  description: string;
  rows: TransactionTaxBreakdownRow[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No transactions matched this tax bucket in the current filter range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Treatment</th>
                  <th className="px-3 py-3 text-right">Transactions</th>
                  <th className="px-3 py-3 text-right">Gross</th>
                  <th className="px-3 py-3 text-right">Taxable base</th>
                  <th className="px-3 py-3 text-right">Tax amount</th>
                  <th className="px-3 py-3 text-right">Avg rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b align-top last:border-0">
                    <td className="px-3 py-3 font-medium">{row.label}</td>
                    <td className="px-3 py-3 text-right">{row.transactionCount}</td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(row.grossAmountMinor, currency)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(row.taxableAmountMinor, currency)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(row.taxAmountMinor, currency)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatRate(row.averageRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransactionTaxDrilldownTable({
  rows,
}: {
  rows: TransactionTaxDrilldownRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction drill-down</CardTitle>
        <CardDescription>
          Review the exact transactions contributing to the active VAT and WHT totals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No transactions matched the active tax filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Transaction</th>
                  <th className="px-3 py-3">Business</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">VAT</th>
                  <th className="px-3 py-3">WHT</th>
                  <th className="px-3 py-3">Liability effect</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.transactionDate)}</td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div className="font-medium">{row.description}</div>
                        {row.reference ? (
                          <div className="text-xs text-muted-foreground">Ref: {row.reference}</div>
                        ) : null}
                        {row.reviewNotes ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {row.reviewNotes}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div>{row.clientBusiness?.name ?? "Unassigned"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.category?.name ?? "No category"}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {formatMoney(row.amountMinor, row.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div>{formatLabel(row.vatTreatment)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatRate(row.vatRate)} · {formatMoney(row.vatAmountMinor, row.currency)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div>{formatLabel(row.whtTreatment)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatRate(row.whtRate)} · {formatMoney(row.whtAmountMinor, row.currency)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1 text-xs">
                        <div>VAT: {formatEffect(row.trace.vatLiabilityEffectMinor, row.currency)}</div>
                        <div>WHT: {formatEffect(row.trace.whtLiabilityEffectMinor, row.currency)}</div>
                        <div className="text-muted-foreground">{row.trace.explanation}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-2">
                        <Badge variant="outline">{formatSourceLabel(row)}</Badge>
                        <div>
                          <Link
                            href={row.trace.sourceRecordHref}
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Open source transaction
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={row.reviewStatus === "FLAGGED" ? "destructive" : "secondary"}>
                        {formatLabel(row.reviewStatus)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransactionTaxLiabilityExplanationCards({
  explanations,
  currency,
}: {
  explanations: TransactionTaxLiabilityExplanation[];
  currency: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {explanations.map((item) => (
        <Card key={item.taxType}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.summary}</CardDescription>
              </div>
              <Badge variant={changeBadgeVariant(item.changeDirection)}>
                {formatChangeLabel(item, currency)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs text-muted-foreground">Current due</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatMoney(item.currentDueMinor, currency)}
                </div>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs text-muted-foreground">Previous period</div>
                <div className="mt-1 text-lg font-semibold">
                  {item.previousDueMinor === null
                    ? "N/A"
                    : formatMoney(item.previousDueMinor, currency)}
                </div>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <div className="text-xs text-muted-foreground">Change</div>
                <div className="mt-1 text-lg font-semibold">{formatChangeLabel(item, currency)}</div>
              </div>
            </div>

            {item.drivers.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No active drivers were identified for this liability in the current filter range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-3">Driver</th>
                      <th className="px-3 py-3">Direction</th>
                      <th className="px-3 py-3 text-right">Transactions</th>
                      <th className="px-3 py-3 text-right">Current</th>
                      <th className="px-3 py-3 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.drivers.map((driver) => (
                      <tr key={driver.key} className="border-b align-top last:border-0">
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div className="font-medium">{driver.label}</div>
                            <div className="text-xs text-muted-foreground">{driver.reason}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {driver.direction === "INCREASES_DUE" ? "Increases due" : "Reduces due"}
                        </td>
                        <td className="px-3 py-3 text-right">{driver.transactionCount}</td>
                        <td className="px-3 py-3 text-right">
                          {formatMoney(driver.amountMinor, currency)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {driver.changeMinor === null
                            ? "N/A"
                            : `${driver.changeMinor > 0 ? "+" : ""}${formatMoney(
                                driver.changeMinor,
                                currency
                              )}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {item.topTransactions.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">Largest source transactions</div>
                  <div className="text-xs text-muted-foreground">
                    Trace the strongest liability movements back to the source records.
                  </div>
                </div>
                <div className="space-y-2">
                  {item.topTransactions.map((transaction) => (
                    <div
                      key={`${item.taxType}-${transaction.id}`}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{transaction.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(transaction.transactionDate)} · {transaction.trace.explanation}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-medium">
                          {formatMoney(transaction.trace.totalLiabilityEffectMinor, currency)}
                        </div>
                        <Link
                          href={transaction.trace.sourceRecordHref}
                          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Open source
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TransactionTaxFutureModulesCard({
  items,
}: {
  items: TransactionTaxFutureModule[];
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>Future modules</CardTitle>
        <CardDescription>
          The liability center is ready to absorb more Nigeria tax layers without changing the UI
          contract.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{item.label}</div>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
