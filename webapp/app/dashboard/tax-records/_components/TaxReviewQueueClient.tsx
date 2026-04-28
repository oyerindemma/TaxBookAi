"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ReviewRow = {
  kind: "vat" | "wht";
  id: number;
  occurredOn: string | null;
  clientBusinessName: string | null;
  counterpartyName: string | null;
  counterpartyTaxId?: string | null;
  sourceType: string;
  sourceRecordId: number | null;
  taxCategory: string | null;
  treatment: string;
  basisAmountMinor: number;
  taxAmountMinor: number;
  currency: string;
  sourceDocumentNumber: string | null;
  reviewed: boolean;
  reviewNote: string | null;
  flags: string[];
  evidenceCount: number;
  whtRate?: number;
};

type Props = {
  role: Role;
  rows: ReviewRow[];
};

const TAX_CATEGORY_OPTIONS = [
  "SALES_GOODS",
  "SALES_SERVICES",
  "PURCHASE_GOODS",
  "PURCHASE_SERVICES",
  "OPERATING_EXPENSE",
  "PROFESSIONAL_SERVICE",
  "RENT",
  "PAYROLL",
  "ASSET_PURCHASE",
  "TAX_PAYMENT",
  "OTHER",
];

const VAT_TREATMENTS = ["NONE", "INPUT", "OUTPUT", "EXEMPT"];
const WHT_TREATMENTS = ["NONE", "PAYABLE", "RECEIVABLE"];

function formatAmount(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function getRowKey(row: ReviewRow) {
  return `${row.kind}:${row.id}`;
}

export default function TaxReviewQueueClient({ role, rows }: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<
    Record<
      string,
      {
        taxCategory: string;
        treatment: string;
        note: string;
        taxEvidenceStatus: string;
        evidenceLabel: string;
        bookkeepingUploadId: string;
        evidenceUrl: string;
        evidenceNote: string;
      }
    >
  >(() =>
    Object.fromEntries(
      rows.map((row) => [
        getRowKey(row),
        {
          taxCategory: row.taxCategory ?? "OTHER",
          treatment: row.treatment,
          note: row.reviewNote ?? "",
          taxEvidenceStatus: "ATTACHED",
          evidenceLabel: `${row.kind.toUpperCase()} evidence`,
          bookkeepingUploadId: "",
          evidenceUrl: "",
          evidenceNote: "",
        },
      ])
    )
  );

  function updateForm(key: string, field: string, value: string) {
    setForms((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  }

  async function handleReviewAction(
    row: ReviewRow,
    action: "REVIEW" | "OVERRIDE" | "REOPEN"
  ) {
    if (!canEdit) return;
    const key = getRowKey(row);
    const form = forms[key];
    setBusyKey(key);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/tax-engine/records/${row.kind}/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          taxCategory: form.taxCategory,
          note: form.note,
          taxEvidenceStatus: form.taxEvidenceStatus,
          ...(row.kind === "vat"
            ? { vatTreatment: form.treatment }
            : { whtTreatment: form.treatment }),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to update tax review item");
        return;
      }
      setFeedback(
        action === "REOPEN" ? "Item reopened." : "Tax review item updated."
      );
      router.refresh();
    } catch {
      setError("Network error updating tax review item");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAttachEvidence(row: ReviewRow) {
    if (!canEdit) return;
    const key = getRowKey(row);
    const form = forms[key];
    if (!form.evidenceLabel.trim()) {
      setError("Add an evidence label before attaching.");
      return;
    }

    setBusyKey(`${key}:evidence`);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/tax-engine/records/${row.kind}/${row.id}/evidence`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label: form.evidenceLabel,
            note: form.evidenceNote,
            url: form.evidenceUrl,
            bookkeepingUploadId: form.bookkeepingUploadId || null,
            evidenceKind: form.bookkeepingUploadId ? "SOURCE_DOCUMENT" : "NOTE",
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to attach evidence");
        return;
      }
      setFeedback("Evidence attached.");
      router.refresh();
    } catch {
      setError("Network error attaching evidence");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review queue</CardTitle>
        <CardDescription>
          Override treatment, mark items reviewed, reopen them, and attach supporting evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No VAT or WHT review rows match the current filters.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const key = getRowKey(row);
              const form = forms[key];
              return (
                <div key={key} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">
                          {row.kind.toUpperCase()} · {row.sourceType} {row.sourceRecordId ?? ""}
                        </div>
                        <Badge variant={row.reviewed ? "secondary" : "outline"}>
                          {row.reviewed ? "Reviewed" : "Pending review"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(row.occurredOn)}
                        {row.clientBusinessName ? ` · ${row.clientBusinessName}` : ""}
                        {row.counterpartyName ? ` · ${row.counterpartyName}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">
                        {formatAmount(row.taxAmountMinor, row.currency)}
                      </div>
                      <div className="text-muted-foreground">
                        Base {formatAmount(row.basisAmountMinor, row.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2">
                      <Label>Tax category</Label>
                      <select
                        value={form.taxCategory}
                        onChange={(event) =>
                          updateForm(key, "taxCategory", event.target.value)
                        }
                        disabled={!canEdit}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                      >
                        {TAX_CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label>{row.kind === "vat" ? "VAT treatment" : "WHT treatment"}</Label>
                      <select
                        value={form.treatment}
                        onChange={(event) =>
                          updateForm(key, "treatment", event.target.value)
                        }
                        disabled={!canEdit}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                      >
                        {(row.kind === "vat" ? VAT_TREATMENTS : WHT_TREATMENTS).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Evidence status</Label>
                      <select
                        value={form.taxEvidenceStatus}
                        onChange={(event) =>
                          updateForm(key, "taxEvidenceStatus", event.target.value)
                        }
                        disabled={!canEdit}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                      >
                        {["UNKNOWN", "PENDING", "ATTACHED", "VERIFIED", "MISSING"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Supporting doc</Label>
                      <Input
                        value={row.sourceDocumentNumber ?? ""}
                        readOnly
                        className="bg-muted/40"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-2">
                      <Label>Review note</Label>
                      <textarea
                        rows={3}
                        value={form.note}
                        onChange={(event) => updateForm(key, "note", event.target.value)}
                        disabled={!canEdit}
                        className="min-h-[84px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                      />
                    </div>
                    {row.flags.length > 0 ? (
                      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        {row.flags.join(" | ")}
                      </div>
                    ) : null}
                    {row.kind === "wht" && row.counterpartyTaxId ? (
                      <p className="text-xs text-muted-foreground">
                        Counterparty TIN: {row.counterpartyTaxId}
                        {row.whtRate !== undefined ? ` · Estimated rate ${row.whtRate.toFixed(1)}%` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => handleReviewAction(row, "REVIEW")}
                      disabled={!canEdit || busyKey === key}
                    >
                      Mark reviewed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleReviewAction(row, "OVERRIDE")}
                      disabled={!canEdit || busyKey === key}
                    >
                      Override and save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleReviewAction(row, "REOPEN")}
                      disabled={!canEdit || busyKey === key}
                    >
                      Reopen
                    </Button>
                  </div>

                  <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Evidence</div>
                        <div className="text-sm text-muted-foreground">
                          {row.evidenceCount} attached
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="grid gap-2">
                        <Label>Evidence label</Label>
                        <Input
                          value={form.evidenceLabel}
                          onChange={(event) =>
                            updateForm(key, "evidenceLabel", event.target.value)
                          }
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Bookkeeping upload ID</Label>
                        <Input
                          value={form.bookkeepingUploadId}
                          onChange={(event) =>
                            updateForm(key, "bookkeepingUploadId", event.target.value)
                          }
                          disabled={!canEdit}
                          placeholder="Optional upload id"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Evidence URL</Label>
                        <Input
                          value={form.evidenceUrl}
                          onChange={(event) =>
                            updateForm(key, "evidenceUrl", event.target.value)
                          }
                          disabled={!canEdit}
                          placeholder="Optional URL"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Evidence note</Label>
                        <Input
                          value={form.evidenceNote}
                          onChange={(event) =>
                            updateForm(key, "evidenceNote", event.target.value)
                          }
                          disabled={!canEdit}
                          placeholder="Optional note"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleAttachEvidence(row)}
                        disabled={!canEdit || busyKey === `${key}:evidence`}
                      >
                        Attach evidence
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
