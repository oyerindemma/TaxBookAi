"use client";

import Link from "next/link";

type TaxRecord = {
  id: number;
  kind: string;
  amountKobo: number;
  taxRate: number;
  currency: string;
  occurredOn: string;
  description: string | null;
  createdAt: string;
  invoiceId?: number | null;
  category?: { id: number; name: string } | null;
  vendorName?: string | null;
  recurring?: boolean;
};

type TaxRecordsTableProps = {
  records: TaxRecord[];
  onEdit: (record: TaxRecord) => void;
  onDelete: (record: TaxRecord) => void;
  deletingId?: number | null;
  canEdit?: boolean;
};

function formatAmount(amountKobo: number, currency: string) {
  return `${currency} ${(amountKobo / 100).toFixed(2)}`;
}

export default function TaxRecordsTable({
  records,
  onEdit,
  onDelete,
  deletingId,
  canEdit = true,
}: TaxRecordsTableProps) {
  if (records.length === 0) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>No tax records yet.</p>
        <p>
          {canEdit
            ? "Use the form above to add your first entry."
            : "You can view records once your team adds them."}
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b">
        <tr className="text-left">
          <th className="pb-3 font-medium">Date</th>
          <th className="pb-3 font-medium">Tax Type</th>
          <th className="pb-3 font-medium">Amount</th>
          <th className="pb-3 font-medium">Category</th>
          <th className="pb-3 font-medium">Vendor</th>
          <th className="pb-3 font-medium">Recurring</th>
          <th className="pb-3 font-medium">Invoice</th>
          <th className="pb-3 font-medium">Description</th>
          <th className="pb-3 font-medium">CreatedAt</th>
          {canEdit && <th className="pb-3 font-medium">Actions</th>}
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
            <td className="py-3">{record.category?.name ?? "-"}</td>
            <td className="py-3">{record.vendorName ?? "-"}</td>
            <td className="py-3">{record.recurring ? "Yes" : "-"}</td>
            <td className="py-3">
              {record.invoiceId ? (
                <Link
                  href={`/dashboard/invoices/${record.invoiceId}`}
                  className="font-medium text-primary hover:underline"
                >
                  Invoice #{record.invoiceId}
                </Link>
              ) : (
                "-"
              )}
            </td>
            <td className="py-3">{record.description ?? "-"}</td>
            <td className="py-3">
              {new Date(record.createdAt).toLocaleString()}
            </td>
            {canEdit && (
              <td className="py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => onEdit(record)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-destructive hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => onDelete(record)}
                    disabled={deletingId === record.id}
                  >
                    {deletingId === record.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
