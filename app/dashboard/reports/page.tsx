import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import {
  getWorkspaceTaxRecords,
  normalizeSearchParam,
  resolveSummaryCurrency,
  summarizeTaxReport,
} from "@/lib/tax-reporting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
};

function formatAmount(amountKobo: number, currency: string) {
  return `${currency} ${(amountKobo / 100).toFixed(2)}`;
}

function toDateInputValue(value: string | undefined) {
  if (!value) return "";
  return value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);
  if (!membership) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground">No workspace assigned.</p>
      </section>
    );
  }

  const fromParam = normalizeSearchParam(resolvedParams.from);
  const toParam = normalizeSearchParam(resolvedParams.to);
  const { records, errorMsg } = await getWorkspaceTaxRecords(
    membership.workspaceId,
    { fromParam, toParam }
  );
  const { totals, vatTotals, whtTotals, incomeTotals, taxPayable, monthlyRows } =
    summarizeTaxReport(records);
  const currency = resolveSummaryCurrency(totals);

  const exportParams = new URLSearchParams();
  if (fromParam) exportParams.set("from", fromParam);
  if (toParam) exportParams.set("to", toParam);
  const exportUrl = `/api/reports/export${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;
  const vatCurrency = resolveSummaryCurrency(vatTotals);
  const whtCurrency = resolveSummaryCurrency(whtTotals);
  const incomeCurrency = resolveSummaryCurrency(incomeTotals);

  const isEmpty = records.length === 0 && !errorMsg;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">
              {membership.workspace.name}
            </span>
          </p>
          <p className="text-muted-foreground">
            Filter by date range and export your tax activity.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/tax-filing">Open tax compliance</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date filters</CardTitle>
          <CardDescription>Scope reports to a date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" name="from" defaultValue={toDateInputValue(fromParam)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" name="to" defaultValue={toDateInputValue(toParam)} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="submit">Apply filters</Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/reports">Clear</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={exportUrl}>Export CSV</a>
              </Button>
            </div>
          </form>
          {errorMsg && <p className="mt-3 text-sm text-destructive">{errorMsg}</p>}
        </CardContent>
      </Card>

      {isEmpty && (
        <Card>
          <CardHeader>
            <CardTitle>No records yet</CardTitle>
            <CardDescription>
              Add your first tax record to populate reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/tax-records">Create a record</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross total</CardDescription>
            <CardTitle className="text-xl">{formatAmount(totals.gross, currency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tax</CardDescription>
            <CardTitle className="text-xl">{formatAmount(totals.tax, currency)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net total</CardDescription>
            <CardTitle className="text-xl">{formatAmount(totals.net, currency)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>VAT summary</CardTitle>
            <CardDescription>VAT records in this period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gross</span>
              <span className="font-medium">{formatAmount(vatTotals.gross, vatCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">{formatAmount(vatTotals.tax, vatCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Net</span>
              <span className="font-medium">{formatAmount(vatTotals.net, vatCurrency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>WHT summary</CardTitle>
            <CardDescription>Withholding tax entries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gross</span>
              <span className="font-medium">{formatAmount(whtTotals.gross, whtCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">{formatAmount(whtTotals.tax, whtCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Net</span>
              <span className="font-medium">{formatAmount(whtTotals.net, whtCurrency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax payable</CardTitle>
            <CardDescription>VAT + WHT due for the period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">VAT tax</span>
              <span className="font-medium">{formatAmount(vatTotals.tax, vatCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">WHT tax</span>
              <span className="font-medium">{formatAmount(whtTotals.tax, whtCurrency)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total payable</span>
              <span>{formatAmount(taxPayable, currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly income summary</CardTitle>
          <CardDescription>Income totals grouped by month.</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income records in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Month</th>
                  <th className="pb-3 font-medium">Gross</th>
                  <th className="pb-3 font-medium">Tax</th>
                  <th className="pb-3 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0">
                    <td className="py-3">{row.label}</td>
                    <td className="py-3">
                      {formatAmount(row.totals.gross, incomeCurrency)}
                    </td>
                    <td className="py-3">
                      {formatAmount(row.totals.tax, incomeCurrency)}
                    </td>
                    <td className="py-3">
                      {formatAmount(row.totals.net, incomeCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax records</CardTitle>
          <CardDescription>All entries in the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Rate</th>
                  <th className="pb-3 font-medium">Tax</th>
                  <th className="pb-3 font-medium">Net</th>
                  <th className="pb-3 font-medium">Currency</th>
                  <th className="pb-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-b-0">
                    <td className="py-3">
                      {new Date(record.occurredOn).toLocaleDateString()}
                    </td>
                    <td className="py-3">{record.kind}</td>
                    <td className="py-3">
                      {formatAmount(record.amountKobo, record.currency)}
                    </td>
                    <td className="py-3">{record.taxRate}%</td>
                    <td className="py-3">
                      {formatAmount(record.computedTax, record.currency)}
                    </td>
                    <td className="py-3">
                      {formatAmount(record.netAmount, record.currency)}
                    </td>
                    <td className="py-3">{record.currency}</td>
                    <td className="py-3">{record.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
