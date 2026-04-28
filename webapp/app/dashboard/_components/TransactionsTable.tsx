import Link from "next/link";
import { ArrowRight, Rows3 } from "lucide-react";
import type { DashboardRecentActivityRow } from "@/lib/dashboard-data";
import {
  formatDashboardCurrency,
  formatDashboardDate,
} from "@/lib/dashboard-formatting";
import { Button } from "@/components/ui/button";
import DashboardEmptyState from "@/app/dashboard/_components/DashboardEmptyState";
import DashboardPanel from "@/app/dashboard/_components/DashboardPanel";

type TransactionsTableProps = {
  records?: DashboardRecentActivityRow[] | null;
};

function getTypeTone(type: string) {
  switch (type.toUpperCase()) {
    case "INCOME":
      return "border-cyan/20 bg-cyan/10 text-cyan";
    case "EXPENSE":
      return "border-blue/20 bg-blue/10 text-blue";
    case "TAX":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "VAT":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "WHT":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "Posted":
    case "Reviewed":
    case "Verified":
      return "border-cyan/20 bg-cyan/10 text-cyan";
    case "In review":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Adjusted":
      return "border-blue/20 bg-blue/10 text-blue";
    case "Draft":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "Reopened":
    case "Missing docs":
      return "border-rose-200 bg-rose-50 text-rose-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function TransactionsTable({
  records,
}: TransactionsTableProps) {
  const safeRecords = records ?? [];

  return (
    <DashboardPanel
      eyebrow="Operations"
      title="Recent transactions"
      description="The latest ledger-facing activity across your active workspace."
      icon={Rows3}
      headerAction={
        <Button
          asChild
          variant="ghost"
          size="sm"
          aria-label="View all transactions"
          className="-mr-2 text-slate-600 hover:text-slate-950"
        >
          <Link href="/dashboard/tax-records">
            View all
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      }
    >
      {safeRecords.length === 0 ? (
        <DashboardEmptyState
          title="No transactions yet"
          message="Add your first ledger entry or import a bank statement to start populating the executive activity feed."
          action={
            <Button asChild>
              <Link href="/dashboard/banking/reconcile">Import bank statement</Link>
            </Button>
          }
        />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">
              Recent transactions for the current dashboard scope
            </caption>
            <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.18em] text-slate-500">
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
            <tbody className="divide-y divide-slate-200">
              {safeRecords.map((record) => (
                <tr
                  key={record.id}
                  className="align-top transition-colors hover:bg-slate-50/80"
                >
                  <td className="py-4 pr-4 text-slate-600">
                    {formatDashboardDate(record.date)}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">
                    <span className="line-clamp-2 min-w-[12rem]">{record.description}</span>
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getTypeTone(
                        record.type
                      )}`}
                    >
                      {record.type}
                    </span>
                  </td>
                  <td className="py-4 pr-4 font-medium text-slate-950">
                    {formatDashboardCurrency(record.amountMinor, record.currency)}
                  </td>
                  <td className="py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(
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
    </DashboardPanel>
  );
}
