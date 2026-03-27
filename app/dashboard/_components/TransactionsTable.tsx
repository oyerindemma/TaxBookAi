import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardRecentActivityRow } from "@/lib/dashboard-data";
import {
  formatCurrencyNGN,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type TransactionsTableProps = {
  records?: DashboardRecentActivityRow[] | null;
};

function getTypeTone(type: string) {
  switch (type.toUpperCase()) {
    case "INCOME":
      return "bg-cyan/10 text-cyan ring-cyan/20";
    case "EXPENSE":
      return "bg-blue/10 text-blue ring-blue/20";
    case "TAX":
      return "bg-white/10 text-white ring-white/15";
    case "VAT":
      return "bg-white/10 text-white ring-white/15";
    case "WHT":
      return "bg-white/10 text-white ring-white/15";
    default:
      return "bg-white/5 text-slate-300 ring-white/10";
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "Posted":
    case "Reviewed":
    case "Verified":
      return "bg-cyan/10 text-cyan ring-cyan/20";
    case "In review":
      return "bg-white/10 text-white ring-white/15";
    case "Adjusted":
      return "bg-blue/10 text-blue ring-blue/20";
    case "Draft":
      return "bg-white/5 text-slate-300 ring-white/10";
    case "Reopened":
    case "Missing docs":
      return "bg-white/10 text-white ring-white/15";
    default:
      return "bg-white/5 text-slate-300 ring-white/10";
  }
}

export default function TransactionsTable({
  records,
}: TransactionsTableProps) {
  const safeRecords = records ?? [];

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/20">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-white">
            Recent transactions
          </CardTitle>
          <CardDescription className="text-slate-300">
            The latest ledger-facing activity across your active workspace.
          </CardDescription>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-label="View all transactions"
          className="rounded-xl border-cyan/30 bg-white/5 text-cyan transition hover:bg-white/10 hover:text-cyan focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:ring-offset-0"
        >
          <Link href="/dashboard/tax-records">
            View all
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {safeRecords.length === 0 ? (
          <div
            role="status"
            className="rounded-2xl border border-dashed border-cyan/20 bg-white/5 px-4 py-12 text-center text-sm text-slate-300"
          >
            No transactions yet. Add your first record to populate the dashboard.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Recent transactions for the current dashboard scope
              </caption>
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-cyan">
                <tr>
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Date
                  </th>
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Description
                  </th>
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Type
                  </th>
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="pb-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {safeRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="align-top transition-colors hover:bg-white/5"
                  >
                    <td className="py-4 pr-4 text-slate-300">
                      {formatDashboardDate(record.date)}
                    </td>
                    <td className="py-4 pr-4 text-slate-300">
                      <span className="line-clamp-2 min-w-[12rem]">{record.description}</span>
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getTypeTone(
                          record.type
                        )}`}
                      >
                        {record.type}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-medium text-white">
                      {formatCurrencyNGN(record.amountMinor)}
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusTone(
                          record.status
                        )}`}
                      >
                        {record.status}
                      </span>
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
