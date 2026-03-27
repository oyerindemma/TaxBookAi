"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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

type ReviewMetrics = {
  businessCount: number;
  transactionCount: number;
  queuedUploadCount: number;
  pendingDraftCount: number;
};

type ClientBusinessOption = {
  id: number;
  name: string;
  defaultCurrency: string;
  categories: Array<{
    id: number;
    name: string;
    type: string;
  }>;
};

type DraftFieldConfidences = {
  documentType: number;
  vendorName: number;
  documentNumber: number;
  transactionDate: number;
  subtotal: number;
  vatAmount: number;
  whtRelevant: number;
  totalAmount: number;
  currency: number;
  paymentMethod: number;
  lineItems: number;
  suggestedCategory: number;
} | null;

type DraftLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
};

type ReviewDraft = {
  id: number;
  description: string | null;
  reference: string | null;
  documentNumber: string | null;
  vendorId: number | null;
  vendorName: string | null;
  categoryId: number | null;
  suggestedCategoryName: string | null;
  paymentMethod: string | null;
  direction: "MONEY_IN" | "MONEY_OUT" | "JOURNAL";
  subtotalMinor: number | null;
  amountMinor: number | null;
  totalAmountMinor: number | null;
  taxAmountMinor: number | null;
  taxRate: number;
  currency: string;
  vatAmountMinor: number;
  whtAmountMinor: number;
  vatTreatment: "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
  whtTreatment: "NONE" | "PAYABLE" | "RECEIVABLE";
  confidence: number | null;
  deductibilityHint: string | null;
  fieldConfidences: DraftFieldConfidences;
  lineItems: DraftLineItem[];
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO";
  reviewerNote: string | null;
  proposedDate: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  ledgerTransactionId: number | null;
  reviewedByName: string | null;
};

type ReviewUpload = {
  id: number;
  fileName: string;
  fileType: string | null;
  sourceType: string;
  documentType: "RECEIPT" | "INVOICE" | "CREDIT_NOTE" | "UNKNOWN";
  status:
    | "UPLOADED"
    | "QUEUED"
    | "PROCESSING"
    | "EXTRACTED"
    | "READY_FOR_REVIEW"
    | "APPROVED"
    | "PARTIALLY_APPROVED"
    | "REJECTED"
    | "FAILED";
  uploadSizeBytes: number | null;
  reviewNotes: string | null;
  rawText: string | null;
  failureReason: string | null;
  duplicateConfidence: number | null;
  duplicateReason: string | null;
  extractedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
  assistant: {
    provider: string | null;
    model: string | null;
    warnings: string[];
    notes: string[];
    historyNotes: string[];
    reviewSignals: Array<{
      code:
        | "POSSIBLE_DUPLICATE"
        | "LOW_CONFIDENCE"
        | "AI_HISTORY_MISMATCH"
        | "MISSING_VENDOR"
        | "MISSING_DATE"
        | "MISSING_AMOUNT"
        | "CATEGORY_UNRESOLVED"
        | "UNUSUAL_AMOUNT"
        | "FALLBACK_EXTRACTION";
      severity: "HIGH" | "MEDIUM" | "LOW";
      label: string;
      detail: string;
    }>;
  };
  duplicateOfUpload: {
    id: number;
    fileName: string;
    createdAt: string;
    status: string;
    clientBusinessName: string;
  } | null;
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  };
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  draftCount: number;
  pendingDraftCount: number;
  approvedDraftCount: number;
  rejectedDraftCount: number;
  drafts: ReviewDraft[];
};

type Props = {
  workspaceName: string;
  role: Role;
  initialUploads: ReviewUpload[];
  metrics: ReviewMetrics;
  clientBusinesses: ClientBusinessOption[];
  aiDevelopmentBypass: boolean;
  title?: string;
  description?: string;
  badgeLabel?: string;
  headerActions?: Array<{
    href: string;
    label: string;
    variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  }>;
  uploadTitle?: string;
  uploadDescription?: string;
  uploadSuccessMessage?: string;
  queueTitle?: string;
  queueDescription?: string;
  emptyQueueMessage?: string;
  emptySelectionTitle?: string;
  emptySelectionDescription?: string;
  draftEndpointBase?: string;
  saveDraftEnabled?: boolean;
  saveButtonLabel?: string;
  saveSuccessMessage?: string;
  approveButtonLabel?: string;
  approveSuccessMessage?: string;
  rejectSuccessMessage?: string;
  initialSelectedUploadId?: number | null;
};

type DraftFormState = {
  description: string;
  reference: string;
  documentNumber: string;
  vendorName: string;
  suggestedCategoryName: string;
  categoryId: string;
  paymentMethod: string;
  subtotal: string;
  amount: string;
  taxAmount: string;
  vatAmount: string;
  whtAmount: string;
  taxRate: string;
  currency: string;
  transactionDate: string;
  suggestedType: "INCOME" | "EXPENSE";
  vatTreatment: "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
  whtTreatment: "NONE" | "PAYABLE" | "RECEIVABLE";
  deductibilityHint: string;
  reviewerNote: string;
};

const selectClassName =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const fieldLabelMap: Record<keyof NonNullable<DraftFieldConfidences>, string> = {
  documentType: "Document type",
  vendorName: "Vendor",
  documentNumber: "Document no.",
  transactionDate: "Date",
  subtotal: "Subtotal",
  vatAmount: "VAT",
  whtRelevant: "WHT",
  totalAmount: "Total",
  currency: "Currency",
  paymentMethod: "Payment",
  lineItems: "Line items",
  suggestedCategory: "Category",
};

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function formatAmount(amountMinor: number | null | undefined, currency: string) {
  if (typeof amountMinor !== "number") return "";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function amountInputValue(amountMinor: number | null | undefined) {
  if (typeof amountMinor !== "number") return "";
  return (amountMinor / 100).toFixed(2);
}

function toDateInputValue(isoDate: string | null) {
  if (!isoDate) return "";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function suggestedTypeFromDirection(direction: ReviewDraft["direction"]) {
  return direction === "MONEY_IN" ? "INCOME" : "EXPENSE";
}

function uploadStatusVariant(status: ReviewUpload["status"]) {
  if (status === "APPROVED") return "secondary";
  if (status === "PARTIALLY_APPROVED") return "outline";
  if (status === "REJECTED" || status === "FAILED") return "destructive";
  if (status === "READY_FOR_REVIEW") return "default";
  return "outline";
}

function draftStatusVariant(status: ReviewDraft["reviewStatus"]) {
  if (status === "APPROVED") return "secondary";
  if (status === "REJECTED") return "destructive";
  if (status === "NEEDS_INFO") return "outline";
  return "default";
}

function confidenceVariant(score: number | null | undefined) {
  if (typeof score !== "number") return "outline";
  if (score >= 0.8) return "secondary";
  if (score >= 0.55) return "outline";
  return "destructive";
}

function formatConfidence(score: number | null | undefined) {
  if (typeof score !== "number") return "n/a";
  return `${Math.round(score * 100)}%`;
}

function reviewSignalVariant(severity: "HIGH" | "MEDIUM" | "LOW") {
  if (severity === "HIGH") return "destructive";
  if (severity === "MEDIUM") return "outline";
  return "secondary";
}

function hasHighPrioritySignal(upload: ReviewUpload) {
  return upload.assistant.reviewSignals.some((signal) => signal.severity === "HIGH");
}

function buildDraftFormState(draft: ReviewDraft, defaultCurrency: string): DraftFormState {
  return {
    description: draft.description ?? "",
    reference: draft.reference ?? "",
    documentNumber: draft.documentNumber ?? "",
    vendorName: draft.vendorName ?? "",
    suggestedCategoryName: draft.suggestedCategoryName ?? "",
    categoryId: draft.categoryId ? String(draft.categoryId) : "",
    paymentMethod: draft.paymentMethod ?? "",
    subtotal: amountInputValue(draft.subtotalMinor),
    amount: amountInputValue(draft.totalAmountMinor ?? draft.amountMinor),
    taxAmount: amountInputValue(draft.taxAmountMinor),
    vatAmount: amountInputValue(draft.vatAmountMinor),
    whtAmount: amountInputValue(draft.whtAmountMinor),
    taxRate: String(draft.taxRate ?? 0),
    currency: draft.currency || defaultCurrency,
    transactionDate: toDateInputValue(draft.proposedDate),
    suggestedType: suggestedTypeFromDirection(draft.direction),
    vatTreatment: draft.vatTreatment,
    whtTreatment: draft.whtTreatment,
    deductibilityHint: draft.deductibilityHint ?? "",
    reviewerNote: draft.reviewerNote ?? "",
  };
}

function ConfidenceFields({ fieldConfidences }: { fieldConfidences: DraftFieldConfidences }) {
  if (!fieldConfidences) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(fieldConfidences).map(([key, value]) => (
        <Badge key={key} variant={confidenceVariant(value)}>
          {fieldLabelMap[key as keyof typeof fieldLabelMap]} {formatConfidence(value)}
        </Badge>
      ))}
    </div>
  );
}

function DocumentPreview({ upload }: { upload: ReviewUpload }) {
  const [previewFailed, setPreviewFailed] = useState(false);

  const fileType = upload.fileType ?? "";
  const canShowImage = fileType.startsWith("image/") && !/heic|heif/i.test(fileType);
  const canShowPdf = fileType === "application/pdf";

  if (previewFailed || (!canShowImage && !canShowPdf)) {
    return (
      <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
        <p className="text-sm font-medium text-foreground">Preview unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This file type can still be reviewed, but the browser preview is not available here.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <a href={upload.previewUrl} target="_blank" rel="noreferrer">
            Open source document
          </a>
        </Button>
      </div>
    );
  }

  if (canShowPdf) {
    return (
      <iframe
        title={upload.fileName}
        src={upload.previewUrl}
        className="h-[28rem] w-full rounded-xl border bg-white"
        onError={() => setPreviewFailed(true)}
      />
    );
  }

  return (
    <div className="relative h-[28rem] w-full overflow-hidden rounded-xl border bg-white">
      <Image
        src={upload.previewUrl}
        alt={upload.fileName}
        fill
        unoptimized
        className="object-contain"
        onError={() => setPreviewFailed(true)}
      />
    </div>
  );
}

function DraftReviewEditor({
  draft,
  clientBusiness,
  editable,
  draftEndpointBase,
  saveDraftEnabled,
  saveButtonLabel,
  saveSuccessMessage,
  approveButtonLabel,
  approveSuccessMessage,
  rejectSuccessMessage,
}: {
  draft: ReviewDraft;
  clientBusiness: ClientBusinessOption | undefined;
  editable: boolean;
  draftEndpointBase: string;
  saveDraftEnabled: boolean;
  saveButtonLabel: string;
  saveSuccessMessage: string;
  approveButtonLabel: string;
  approveSuccessMessage: string;
  rejectSuccessMessage: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    buildDraftFormState(draft, clientBusiness?.defaultCurrency ?? "NGN")
  );
  const [savingAction, setSavingAction] = useState<"save" | "approve" | "reject" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildDraftFormState(draft, clientBusiness?.defaultCurrency ?? "NGN"));
    setError(null);
    setMessage(null);
    setSavingAction(null);
  }, [draft, clientBusiness]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitReview(action: "save" | "approve" | "reject") {
    if (!editable || savingAction) return;

    setSavingAction(action);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`${draftEndpointBase}/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to review draft.");
        return;
      }

      if (action === "save") {
        setMessage(saveSuccessMessage);
      } else if (action === "approve") {
        setMessage(approveSuccessMessage);
      } else {
        setMessage(rejectSuccessMessage);
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error reviewing draft.");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">
                {draft.description ?? "Untitled extracted draft"}
              </CardTitle>
              <Badge variant={draftStatusVariant(draft.reviewStatus)}>
                {draft.reviewStatus.replace(/_/g, " ")}
              </Badge>
              {draft.ledgerTransactionId ? (
                <Badge variant="secondary">Ledger #{draft.ledgerTransactionId}</Badge>
              ) : null}
              <Badge variant={confidenceVariant(draft.confidence)}>
                Overall confidence {formatConfidence(draft.confidence)}
              </Badge>
            </div>
            <CardDescription>
              {draft.proposedDate
                ? new Date(draft.proposedDate).toLocaleDateString()
                : "Date pending"}
              {" · "}
              {formatAmount(draft.totalAmountMinor ?? draft.amountMinor, draft.currency) ||
                "Amount pending"}
              {draft.reviewedByName ? ` · Reviewed by ${draft.reviewedByName}` : ""}
            </CardDescription>
          </div>
        </div>
        <ConfidenceFields fieldConfidences={draft.fieldConfidences} />
      </CardHeader>
      <CardContent className="space-y-5">
        {draft.lineItems.length > 0 ? (
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-2 text-sm font-medium text-foreground">Detected line items</div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {draft.lineItems.map((line, index) => (
                <div
                  key={`${draft.id}-line-${index}`}
                  className="grid gap-2 rounded-lg border bg-background px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div>{line.description}</div>
                  <div className="text-right font-medium text-foreground">
                    {formatAmount(
                      typeof line.total === "number" ? Math.round(line.total * 100) : null,
                      draft.currency
                    ) || "No line total"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {draft.deductibilityHint ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {draft.deductibilityHint}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-2 xl:col-span-2">
            <Label htmlFor={`description-${draft.id}`}>Description</Label>
            <Input
              id={`description-${draft.id}`}
              name="description"
              value={form.description}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`transactionDate-${draft.id}`}>Transaction date</Label>
            <Input
              id={`transactionDate-${draft.id}`}
              name="transactionDate"
              type="date"
              value={form.transactionDate}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`documentNumber-${draft.id}`}>Document number</Label>
            <Input
              id={`documentNumber-${draft.id}`}
              name="documentNumber"
              value={form.documentNumber}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`reference-${draft.id}`}>Reference</Label>
            <Input
              id={`reference-${draft.id}`}
              name="reference"
              value={form.reference}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`paymentMethod-${draft.id}`}>Payment method</Label>
            <Input
              id={`paymentMethod-${draft.id}`}
              name="paymentMethod"
              value={form.paymentMethod}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              placeholder="CARD, CASH, TRANSFER..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vendorName-${draft.id}`}>Vendor</Label>
            <Input
              id={`vendorName-${draft.id}`}
              name="vendorName"
              value={form.vendorName}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`suggestedType-${draft.id}`}>Suggested type</Label>
            <select
              id={`suggestedType-${draft.id}`}
              name="suggestedType"
              value={form.suggestedType}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              className={selectClassName}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`categoryId-${draft.id}`}>Category</Label>
            <select
              id={`categoryId-${draft.id}`}
              name="categoryId"
              value={form.categoryId}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              className={selectClassName}
            >
              <option value="">Use suggested category</option>
              {(clientBusiness?.categories ?? []).map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`suggestedCategoryName-${draft.id}`}>Suggested category</Label>
            <Input
              id={`suggestedCategoryName-${draft.id}`}
              name="suggestedCategoryName"
              value={form.suggestedCategoryName}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`subtotal-${draft.id}`}>Subtotal</Label>
            <Input
              id={`subtotal-${draft.id}`}
              name="subtotal"
              inputMode="decimal"
              value={form.subtotal}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`amount-${draft.id}`}>Total amount</Label>
            <Input
              id={`amount-${draft.id}`}
              name="amount"
              inputMode="decimal"
              value={form.amount}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`taxAmount-${draft.id}`}>Tax amount</Label>
            <Input
              id={`taxAmount-${draft.id}`}
              name="taxAmount"
              inputMode="decimal"
              value={form.taxAmount}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`taxRate-${draft.id}`}>Tax rate %</Label>
            <Input
              id={`taxRate-${draft.id}`}
              name="taxRate"
              inputMode="decimal"
              value={form.taxRate}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vatAmount-${draft.id}`}>VAT amount</Label>
            <Input
              id={`vatAmount-${draft.id}`}
              name="vatAmount"
              inputMode="decimal"
              value={form.vatAmount}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`whtAmount-${draft.id}`}>WHT amount</Label>
            <Input
              id={`whtAmount-${draft.id}`}
              name="whtAmount"
              inputMode="decimal"
              value={form.whtAmount}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`currency-${draft.id}`}>Currency</Label>
            <Input
              id={`currency-${draft.id}`}
              name="currency"
              value={form.currency}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`vatTreatment-${draft.id}`}>VAT treatment</Label>
            <select
              id={`vatTreatment-${draft.id}`}
              name="vatTreatment"
              value={form.vatTreatment}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              className={selectClassName}
            >
              <option value="NONE">None</option>
              <option value="INPUT">Input VAT</option>
              <option value="OUTPUT">Output VAT</option>
              <option value="EXEMPT">Exempt</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`whtTreatment-${draft.id}`}>WHT treatment</Label>
            <select
              id={`whtTreatment-${draft.id}`}
              name="whtTreatment"
              value={form.whtTreatment}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              className={selectClassName}
            >
              <option value="NONE">None</option>
              <option value="PAYABLE">Payable</option>
              <option value="RECEIVABLE">Receivable</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`deductibilityHint-${draft.id}`}>Deductibility hint</Label>
            <textarea
              id={`deductibilityHint-${draft.id}`}
              name="deductibilityHint"
              value={form.deductibilityHint}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`reviewerNote-${draft.id}`}>Reviewer note</Label>
            <textarea
              id={`reviewerNote-${draft.id}`}
              name="reviewerNote"
              value={form.reviewerNote}
              onChange={handleChange}
              disabled={!editable || Boolean(draft.ledgerTransactionId)}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {draft.approvedAt
              ? `Approved ${new Date(draft.approvedAt).toLocaleString()}`
              : draft.rejectedAt
                ? `Rejected ${new Date(draft.rejectedAt).toLocaleString()}`
                : "Pending review"}
          </div>
          <div className="flex flex-wrap gap-2">
            {saveDraftEnabled ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => submitReview("save")}
                disabled={
                  !editable || Boolean(draft.ledgerTransactionId) || savingAction !== null
                }
              >
                {savingAction === "save" ? "Saving..." : saveButtonLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => submitReview("reject")}
              disabled={!editable || Boolean(draft.ledgerTransactionId) || savingAction !== null}
            >
              {savingAction === "reject" ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              type="button"
              onClick={() => submitReview("approve")}
              disabled={!editable || Boolean(draft.ledgerTransactionId) || savingAction !== null}
            >
              {savingAction === "approve" ? "Approving..." : approveButtonLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookkeepingReviewClient({
  workspaceName,
  role,
  initialUploads,
  metrics,
  clientBusinesses,
  aiDevelopmentBypass,
  title = "Bookkeeping review",
  description = "Upload receipts and invoices, review AI capture, then approve clean drafts into the ledger.",
  badgeLabel = "AI capture queue",
  headerActions = [
    { href: "/dashboard/client-businesses", label: "Client businesses", variant: "outline" },
    { href: "/dashboard/tax-summary", label: "Tax summary", variant: "default" },
  ],
  uploadTitle = "Upload source document",
  uploadDescription = "Supports JPG, PNG, WEBP, HEIC, HEIF, and PDF receipts or invoices. Every upload stays in review until an accountant approves it.",
  uploadSuccessMessage = "Upload processed and routed into the bookkeeping review queue.",
  queueTitle = "Review queue",
  queueDescription = "Latest uploads across this workspace. Select one to inspect the source document and extracted fields.",
  emptyQueueMessage = "No uploads yet. The first scanned document will appear here with duplicate warnings and editable extracted fields.",
  emptySelectionTitle = "Select an upload",
  emptySelectionDescription = "Choose a scanned receipt or invoice from the queue to review the extracted fields.",
  draftEndpointBase = "/api/bookkeeping/drafts",
  saveDraftEnabled = false,
  saveButtonLabel = "Save draft",
  saveSuccessMessage = "Draft changes saved.",
  approveButtonLabel = "Approve to ledger",
  approveSuccessMessage = "Draft approved and posted into the ledger.",
  rejectSuccessMessage = "Draft rejected and kept out of the ledger.",
  initialSelectedUploadId = null,
}: Props) {
  const router = useRouter();
  const editable = canEdit(role);
  const [selectedClientBusinessId, setSelectedClientBusinessId] = useState(
    clientBusinesses[0]?.id ? String(clientBusinesses[0].id) : ""
  );
  const initialSelectedUpload =
    initialUploads.find((upload) => upload.id === initialSelectedUploadId) ?? initialUploads[0];
  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(
    initialSelectedUpload?.id ?? null
  );
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(
    initialSelectedUpload?.drafts[0]?.id ?? null
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedUploadId || !initialUploads.some((upload) => upload.id === selectedUploadId)) {
      const nextUpload = initialUploads[0] ?? null;
      setSelectedUploadId(nextUpload?.id ?? null);
      setSelectedDraftId(nextUpload?.drafts[0]?.id ?? null);
      return;
    }

    const selectedUpload = initialUploads.find((upload) => upload.id === selectedUploadId) ?? null;
    if (!selectedUpload) return;
    if (!selectedDraftId || !selectedUpload.drafts.some((draft) => draft.id === selectedDraftId)) {
      setSelectedDraftId(selectedUpload.drafts[0]?.id ?? null);
    }
  }, [initialUploads, selectedUploadId, selectedDraftId]);

  const approvedDraftCount = initialUploads.reduce(
    (total, upload) => total + upload.approvedDraftCount,
    0
  );
  const selectedUpload =
    initialUploads.find((upload) => upload.id === selectedUploadId) ?? initialUploads[0] ?? null;
  const selectedDraft =
    selectedUpload?.drafts.find((draft) => draft.id === selectedDraftId) ??
    selectedUpload?.drafts[0] ??
    null;
  const selectedBusiness = selectedUpload
    ? clientBusinesses.find((business) => business.id === selectedUpload.clientBusiness.id)
    : undefined;

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!editable || uploading) return;

    if (!selectedClientBusinessId) {
      setUploadError("Select a client business before uploading.");
      return;
    }
    if (!file) {
      setUploadError("Choose a receipt, invoice, or PDF to scan.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.set("clientBusinessId", selectedClientBusinessId);
      formData.set("file", file);

      const res = await fetch("/api/ai/bookkeeping-extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error ?? "Unable to extract bookkeeping draft.");
        return;
      }

      setUploadMessage(uploadSuccessMessage);
      setSelectedUploadId(data.uploadId ?? null);
      setSelectedDraftId(null);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setUploadError("Network error uploading document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          <p className="text-sm text-muted-foreground">
            Workspace: <span className="font-medium text-foreground">{workspaceName}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{badgeLabel}</Badge>
          {headerActions.map((action) => (
            <Button key={action.href} asChild variant={action.variant ?? "outline"}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Businesses in scope</CardDescription>
            <CardTitle className="text-xl">{metrics.businessCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queue items</CardDescription>
            <CardTitle className="text-xl">{metrics.queuedUploadCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Drafts needing review</CardDescription>
            <CardTitle className="text-xl">{metrics.pendingDraftCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved drafts</CardDescription>
            <CardTitle className="text-xl">{approvedDraftCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>{uploadTitle}</CardTitle>
          <CardDescription>{uploadDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiDevelopmentBypass ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Development mode: AI receipt scanning is temporarily available without the paid plan gate for local testing.
            </div>
          ) : null}
          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
          {uploadMessage ? <p className="text-sm text-emerald-700">{uploadMessage}</p> : null}
          {clientBusinesses.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Create a client business before uploading source documents.
            </div>
          ) : (
            <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-2">
                <Label htmlFor="clientBusinessId">Client business</Label>
                <select
                  id="clientBusinessId"
                  value={selectedClientBusinessId}
                  onChange={(event) => setSelectedClientBusinessId(event.target.value)}
                  disabled={!editable || uploading}
                  className={selectClassName}
                >
                  {clientBusinesses.map((business) => (
                    <option key={business.id} value={String(business.id)}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bookkeeping-file">Receipt / invoice file</Label>
                <input
                  ref={fileInputRef}
                  id="bookkeeping-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={!editable || uploading}
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={!editable || uploading}>
                  {uploading ? "Scanning..." : "Scan document"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>{queueTitle}</CardTitle>
            <CardDescription>{queueDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initialUploads.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                {emptyQueueMessage}
              </div>
            ) : (
              initialUploads.map((upload) => (
                <button
                  key={upload.id}
                  type="button"
                  onClick={() => {
                    setSelectedUploadId(upload.id);
                    setSelectedDraftId(upload.drafts[0]?.id ?? null);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedUpload?.id === upload.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">{upload.fileName}</div>
                      <Badge variant={uploadStatusVariant(upload.status)}>
                        {upload.status.replace(/_/g, " ")}
                      </Badge>
                      {hasHighPrioritySignal(upload) ? (
                        <Badge variant="destructive">Needs attention</Badge>
                      ) : null}
                      {upload.duplicateOfUpload ? (
                        <Badge variant="destructive">Duplicate warning</Badge>
                      ) : null}
                  </div>
                  <div
                    className={`mt-2 text-sm ${
                      selectedUpload?.id === upload.id ? "text-white/75" : "text-muted-foreground"
                    }`}
                  >
                    {upload.clientBusiness.name} · {upload.documentType.replace(/_/g, " ")}
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      selectedUpload?.id === upload.id ? "text-white/65" : "text-muted-foreground"
                    }`}
                  >
                    Submitted {new Date(upload.createdAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!selectedUpload || !selectedDraft ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>{emptySelectionTitle}</CardTitle>
                <CardDescription>{emptySelectionDescription}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <Card className="border-border/70">
                <CardHeader className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-xl">{selectedUpload.fileName}</CardTitle>
                        <Badge variant={uploadStatusVariant(selectedUpload.status)}>
                          {selectedUpload.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline">
                          {selectedUpload.documentType.replace(/_/g, " ")}
                        </Badge>
                        {selectedUpload.assistant.provider ? (
                          <Badge variant="outline">
                            {selectedUpload.assistant.provider === "openai"
                              ? "OpenAI extraction"
                              : selectedUpload.assistant.provider === "heuristic-fallback"
                                ? "Heuristic fallback"
                                : "Metadata fallback"}
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription>
                        {selectedUpload.clientBusiness.name}
                        {" · "}
                        {selectedUpload.uploadedByName ||
                          selectedUpload.uploadedByEmail ||
                          "Unknown uploader"}
                        {" · "}
                        {selectedUpload.extractedAt
                          ? `Extracted ${new Date(selectedUpload.extractedAt).toLocaleString()}`
                          : `Uploaded ${new Date(selectedUpload.createdAt).toLocaleString()}`}
                      </CardDescription>
                    </div>
                    <div className="grid gap-1 text-right text-xs text-muted-foreground">
                      <span>{selectedUpload.draftCount} draft line(s)</span>
                      <span>{selectedUpload.pendingDraftCount} pending review</span>
                      <span>{selectedUpload.approvedDraftCount} approved</span>
                    </div>
                  </div>

                  {selectedUpload.duplicateOfUpload ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <p className="font-medium">Possible duplicate detected</p>
                      <p className="mt-1">
                        {selectedUpload.duplicateReason ?? "This document looks similar to an earlier upload."}
                      </p>
                      <p className="mt-1">
                        Match confidence: {formatConfidence(selectedUpload.duplicateConfidence)}
                      </p>
                      <p className="mt-1 text-red-800">
                        Similar upload: {selectedUpload.duplicateOfUpload.fileName} from{" "}
                        {selectedUpload.duplicateOfUpload.clientBusinessName} on{" "}
                        {new Date(selectedUpload.duplicateOfUpload.createdAt).toLocaleString()}.
                      </p>
                    </div>
                  ) : null}

                  {selectedUpload.failureReason ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      {selectedUpload.failureReason}
                    </div>
                  ) : null}

                  {selectedUpload.assistant.warnings.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      {selectedUpload.assistant.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}

                  {selectedUpload.assistant.reviewSignals.length > 0 ? (
                    <div className="rounded-xl border border-cyan/20 bg-cyan/5 px-4 py-3 text-sm text-slate-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">Review signals</p>
                        {selectedUpload.assistant.reviewSignals.map((signal) => (
                          <Badge
                            key={`${signal.code}-${signal.label}`}
                            variant={reviewSignalVariant(signal.severity)}
                          >
                            {signal.label}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedUpload.assistant.reviewSignals.map((signal) => (
                          <p key={`${signal.code}-${signal.detail}`}>{signal.detail}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                    <DocumentPreview key={selectedUpload.id} upload={selectedUpload} />
                    {selectedUpload.rawText ? (
                      <details className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-foreground">
                          Raw extracted text
                        </summary>
                        <pre className="mt-3 whitespace-pre-wrap font-sans text-xs">
                          {selectedUpload.rawText}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Vendor
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedDraft.vendorName || "Pending"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Document no.
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedDraft.documentNumber || "Pending"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Date
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedDraft.proposedDate
                            ? new Date(selectedDraft.proposedDate).toLocaleDateString()
                            : "Pending"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Payment
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedDraft.paymentMethod || "Unknown"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Subtotal
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {formatAmount(selectedDraft.subtotalMinor, selectedDraft.currency) ||
                            "Pending"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {formatAmount(
                            selectedDraft.totalAmountMinor ?? selectedDraft.amountMinor,
                            selectedDraft.currency
                          ) || "Pending"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          VAT
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {formatAmount(selectedDraft.vatAmountMinor, selectedDraft.currency) ||
                            "None"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          WHT
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {formatAmount(selectedDraft.whtAmountMinor, selectedDraft.currency) ||
                            "None"}
                        </div>
                      </div>
                    </div>

                    {selectedUpload.assistant.notes.length > 0 ? (
                      <div className="rounded-xl border bg-background p-4">
                        <div className="text-sm font-medium text-foreground">Extraction notes</div>
                        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                          {selectedUpload.assistant.notes.map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedUpload.assistant.historyNotes.length > 0 ? (
                      <div className="rounded-xl border bg-background p-4">
                        <div className="text-sm font-medium text-foreground">History-based suggestions</div>
                        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                          {selectedUpload.assistant.historyNotes.map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedUpload.reviewNotes ? (
                      <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground whitespace-pre-wrap">
                        {selectedUpload.reviewNotes}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {selectedUpload.drafts.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedUpload.drafts.map((draft) => (
                    <Button
                      key={draft.id}
                      type="button"
                      variant={selectedDraft?.id === draft.id ? "default" : "outline"}
                      onClick={() => setSelectedDraftId(draft.id)}
                    >
                      Draft #{draft.id}
                    </Button>
                  ))}
                </div>
              ) : null}

              <DraftReviewEditor
                draft={selectedDraft}
                clientBusiness={selectedBusiness}
                editable={editable}
                draftEndpointBase={draftEndpointBase}
                saveDraftEnabled={saveDraftEnabled}
                saveButtonLabel={saveButtonLabel}
                saveSuccessMessage={saveSuccessMessage}
                approveButtonLabel={approveButtonLabel}
                approveSuccessMessage={approveSuccessMessage}
                rejectSuccessMessage={rejectSuccessMessage}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
