"use client";

import Link from "next/link";
import { startTransition, useState, type FormEvent } from "react";
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

type FilingDetail = {
  draft: {
    id: number;
    taxType: "VAT" | "WHT" | "CIT";
    status: string;
    title: string | null;
    reference: string | null;
    reviewNote: string | null;
    adapterCode: string;
    adapterMode: string;
    businessTinSnapshot: string | null;
    portalUsernameHint: string | null;
    submissionReference: string | null;
    readyAt: string | null;
    packGeneratedAt: string | null;
    lastExportedAt: string | null;
    reviewedAt: string | null;
    reviewedByName: string | null;
    submittedAt: string | null;
    exceptionCount: number;
  };
  workspace: {
    id: number;
    name: string;
    businessName: string | null;
  };
  clientBusiness: {
    id: number | null;
    name: string | null;
    legalName: string | null;
    taxIdentificationNumber: string | null;
    vatRegistrationNumber: string | null;
  };
  period: {
    id: number;
    label: string;
    type: string;
    startDate: string;
    endDate: string;
    currency: string;
  };
  summary: {
    currency: string;
    totals: Record<string, number>;
    headlineLabel: string;
    headlineAmountMinor: number;
    headlineAmountFormatted: string;
  };
  checks: Array<{
    code: string;
    severity: string;
    title: string;
    detail: string;
  }>;
  checklist: Array<{
    code: string;
    label: string;
    detail: string;
    required: boolean;
  }>;
  adapter: {
    code: string;
    label: string;
    portalName: string;
    mode: string;
    description: string;
  };
  scheduleRows: Array<Record<string, unknown>>;
  sourceItems: Array<{
    id: number;
    label: string;
    sourceType: string;
    sourceRecordId: number | null;
    amountMinor: number;
    taxAmountMinor: number | null;
    status: string;
    note: string | null;
    flags: string[];
  }>;
  exceptions: Array<{
    severity: string;
    title: string;
    detail: string;
    reviewed: boolean;
  }>;
  evidence: Array<{
    id: number;
    label: string;
    evidenceKind: string;
    note: string | null;
    url: string | null;
    uploadedByName: string | null;
    createdAt: string;
  }>;
  submissionLogs: Array<{
    id: number;
    provider: string | null;
    action: string;
    status: string;
    reference: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
  payloadCandidate: Record<string, unknown>;
};

type Props = {
  role: Role;
  initialDetail: FilingDetail;
};

const inputClassName =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function canApprove(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAmount(amountMinor: number | null | undefined, currency: string) {
  if (typeof amountMinor !== "number") return "-";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function getStatusVariant(status: string) {
  if (status === "APPROVED_FOR_SUBMISSION" || status === "SUBMITTED") return "secondary" as const;
  if (status === "SUBMITTED_MANUALLY") return "secondary" as const;
  if (status === "FAILED" || status === "CANCELLED") return "destructive" as const;
  if (status === "SUBMISSION_PENDING") return "outline" as const;
  return "outline" as const;
}

function getCheckVariant(severity: string) {
  if (severity === "BLOCKING") return "destructive" as const;
  if (severity === "WARNING") return "outline" as const;
  return "secondary" as const;
}

function getLogVariant(status: string) {
  if (status === "FAILED" || status === "CANCELLED") return "destructive" as const;
  if (status === "ACCEPTED") return "secondary" as const;
  return "outline" as const;
}

export function TaxFilingDetailClient({ role, initialDetail }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState(initialDetail.draft.reviewNote ?? "");
  const [portalUsernameHint, setPortalUsernameHint] = useState(
    initialDetail.draft.portalUsernameHint ?? ""
  );
  const [adapterCode, setAdapterCode] = useState(initialDetail.draft.adapterCode);
  const [submissionReference, setSubmissionReference] = useState(
    initialDetail.draft.submissionReference ?? ""
  );
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceKind, setEvidenceKind] = useState("OTHER");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");

  async function runAction(action: string, extra?: Record<string, unknown>) {
    setError(null);
    setFeedback(null);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/tax-filing/${detail.draft.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          adapterCode,
          reviewNote,
          portalUsernameHint,
          submissionReference,
          ...extra,
        }),
      });
      const payload = (await response.json()) as {
        detail?: FilingDetail;
        error?: string;
      };

      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? "The filing action could not be completed.");
      }

      setDetail(payload.detail);
      setReviewNote(payload.detail.draft.reviewNote ?? "");
      setPortalUsernameHint(payload.detail.draft.portalUsernameHint ?? "");
      setAdapterCode(payload.detail.draft.adapterCode);
      setSubmissionReference(payload.detail.draft.submissionReference ?? "");
      setFeedback(`Action ${action} completed.`);
      startTransition(() => {
        router.refresh();
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The filing action failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function onEvidenceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/tax-filing/${detail.draft.id}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: evidenceLabel,
          evidenceKind,
          url: evidenceUrl,
          note: evidenceNote,
        }),
      });
      const payload = (await response.json()) as {
        detail?: FilingDetail;
        error?: string;
      };

      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? "Evidence could not be attached.");
      }

      setDetail(payload.detail);
      setEvidenceLabel("");
      setEvidenceUrl("");
      setEvidenceNote("");
      setEvidenceKind("OTHER");
      setFeedback("Evidence attached to filing draft.");
      startTransition(() => {
        router.refresh();
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Evidence attach failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusVariant(detail.draft.status)}>{detail.draft.status}</Badge>
            <Badge variant="outline">{detail.adapter.label}</Badge>
            <Badge variant="outline">{detail.adapter.mode}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {detail.clientBusiness.name ?? detail.workspace.businessName ?? detail.workspace.name} ·{" "}
            {detail.period.label}
          </p>
          {detail.draft.reference ? (
            <p className="text-xs text-muted-foreground">Filing ID: {detail.draft.reference}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/tax-filing/${detail.draft.id}/export?format=schedule-csv`}>Schedule CSV</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/tax-filing/${detail.draft.id}/export?format=checklist-csv`}>Checklist CSV</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/tax-filing/${detail.draft.id}/export?format=json`}>JSON payload</a>
          </Button>
          <Button asChild>
            <a
              href={`/api/tax-filing/${detail.draft.id}/export?format=summary-html`}
              target="_blank"
              rel="noreferrer"
            >
              Printable pack
            </a>
          </Button>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{detail.summary.headlineLabel}</CardDescription>
            <CardTitle className="text-xl">{detail.summary.headlineAmountFormatted}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Exceptions</CardDescription>
            <CardTitle className="text-xl">{detail.exceptions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Evidence items</CardDescription>
            <CardTitle className="text-xl">{detail.evidence.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submission logs</CardDescription>
            <CardTitle className="text-xl">{detail.submissionLogs.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Draft metadata</CardTitle>
            <CardDescription>
              Store review notes, the filing portal hint, and the prepare-only adapter choice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="adapterCode">Adapter</Label>
                <select
                  id="adapterCode"
                  value={adapterCode}
                  onChange={(event) => setAdapterCode(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                  disabled={!canEdit(role) || isBusy}
                >
                  <option value="TAXPRO_MAX">TaxPro Max</option>
                  <option value="NRS_MBS">NRS MBS</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="portalUsernameHint">Portal username hint</Label>
                <Input
                  id="portalUsernameHint"
                  value={portalUsernameHint}
                  onChange={(event) => setPortalUsernameHint(event.target.value)}
                  placeholder="Optional masked login hint"
                  disabled={!canEdit(role) || isBusy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="submissionReference">Submission reference</Label>
                <Input
                  id="submissionReference"
                  value={submissionReference}
                  onChange={(event) => setSubmissionReference(event.target.value)}
                  placeholder="Manual TaxPro Max reference"
                  disabled={!canEdit(role) || isBusy}
                />
              </div>
              <div className="grid gap-2">
                <Label>Business TIN snapshot</Label>
                <div className="rounded-md border px-3 py-2 text-sm">
                  {detail.draft.businessTinSnapshot ?? "Missing"}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reviewNote">Reviewer note</Label>
              <textarea
                id="reviewNote"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                className={inputClassName}
                placeholder="Add filing notes, approval context, or manual portal guidance."
                disabled={!canEdit(role) || isBusy}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => runAction("SAVE_METADATA")}
                disabled={!canEdit(role) || isBusy}
              >
                Save metadata
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runAction("PREPARE_DRAFT")}
                disabled={!canEdit(role) || isBusy}
              >
                Prepare draft pack
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runAction("REOPEN_REVIEW")}
                disabled={!canEdit(role) || isBusy}
              >
                Reopen review
              </Button>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Ready for review: {formatDateTime(detail.draft.readyAt)}</p>
              <p>Pack generated: {formatDateTime(detail.draft.packGeneratedAt)}</p>
              <p>Last exported: {formatDateTime(detail.draft.lastExportedAt)}</p>
              <p>
                Approved by: {detail.draft.reviewedByName ?? "Not yet"} ·{" "}
                {formatDateTime(detail.draft.reviewedAt)}
              </p>
              <p>Submitted at: {formatDateTime(detail.draft.submittedAt)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pre-submission checks</CardTitle>
            <CardDescription>
              Blocking issues must be resolved before approval or submission. Warnings can be
              logged and carried forward if the accountant decides to proceed manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.checks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No checks generated for this draft.</p>
            ) : (
              detail.checks.map((check) => (
                <div key={check.code} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{check.title}</div>
                    <Badge variant={getCheckVariant(check.severity)}>{check.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                </div>
              ))
            )}
            <div className="rounded-lg border border-dashed p-3">
              <div className="text-sm font-medium">Submission checklist</div>
              <div className="mt-2 space-y-2">
                {detail.checklist.map((item) => (
                  <div key={item.code} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{item.label}</span>
                      <Badge variant={item.required ? "outline" : "secondary"}>
                        {item.required ? "Required" : "Optional"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle actions</CardTitle>
          <CardDescription>
            Approval and submission actions are logged. Manual submission remains the only supported
            path for government portal completion.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => runAction("APPROVE_FOR_SUBMISSION")}
            disabled={!canApprove(role) || isBusy}
          >
            Approve for submission
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => runAction("MARK_SUBMISSION_PENDING")}
            disabled={!canApprove(role) || isBusy}
          >
            Mark submission pending
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!submissionReference.trim()) {
                setError("Enter the manual submission reference before marking as submitted.");
                return;
              }
              void runAction("MARK_SUBMITTED_MANUALLY");
            }}
            disabled={!canApprove(role) || isBusy}
          >
            Mark submitted manually
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!submissionReference.trim()) {
                setError("Enter the adapter or portal submission reference before marking as submitted.");
                return;
              }
              void runAction("MARK_SUBMITTED");
            }}
            disabled={!canApprove(role) || isBusy}
          >
            Mark submitted
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => runAction("MARK_FAILED")}
            disabled={!canApprove(role) || isBusy}
          >
            Mark failed
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => runAction("CANCEL")}
            disabled={!canApprove(role) || isBusy}
          >
            Cancel draft
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Schedule and source rows</CardTitle>
            <CardDescription>
              Filing-ready schedule rows generated from the tax engine for this draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.draft.taxType === "VAT" ? (
              detail.scheduleRows.map((row, index) => (
                <div key={`vat-row-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {String(row.sourceType ?? "SOURCE")} #{String(row.sourceRecordId ?? "-")}
                    </span>
                    <Badge variant="outline">{String(row.direction ?? "OUTPUT")}</Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <div>Counterparty: {String(row.counterpartyName ?? "Unknown")}</div>
                    <div>
                      Basis: {formatAmount(Number(row.basisAmountMinor ?? 0), detail.period.currency)}
                    </div>
                    <div>
                      VAT: {formatAmount(Number(row.vatAmountMinor ?? 0), detail.period.currency)}
                    </div>
                    <div>Flags: {Array.isArray(row.flags) && row.flags.length > 0 ? row.flags.join(", ") : "None"}</div>
                  </div>
                </div>
              ))
            ) : null}
            {detail.draft.taxType === "WHT" ? (
              detail.scheduleRows.map((row, index) => (
                <div key={`wht-row-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {String(row.sourceType ?? "SOURCE")} #{String(row.sourceRecordId ?? "-")}
                    </span>
                    <Badge variant="outline">{String(row.direction ?? "DEDUCTED")}</Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <div>Counterparty: {String(row.counterpartyName ?? "Unknown")}</div>
                    <div>
                      Basis: {formatAmount(Number(row.basisAmountMinor ?? 0), detail.period.currency)}
                    </div>
                    <div>
                      WHT: {formatAmount(Number(row.whtAmountMinor ?? 0), detail.period.currency)}
                    </div>
                    <div>Rate: {String(row.whtRate ?? 0)}%</div>
                    <div>Flags: {Array.isArray(row.flags) && row.flags.length > 0 ? row.flags.join(", ") : "None"}</div>
                  </div>
                </div>
              ))
            ) : null}
            {detail.draft.taxType === "CIT" ? (
              detail.scheduleRows.map((row, index) => (
                <div key={`cit-row-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{String(row.label ?? "Schedule row")}</span>
                    <Badge variant="outline">{String(row.direction ?? "NEUTRAL")}</Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <div>
                      Amount: {formatAmount(Number(row.amountMinor ?? 0), detail.period.currency)}
                    </div>
                    <div>Status: {String(row.status ?? "PENDING")}</div>
                    <div>Flags: {Array.isArray(row.flags) && row.flags.length > 0 ? row.flags.join(", ") : "None"}</div>
                  </div>
                </div>
              ))
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
            <CardDescription>
              Unresolved issues that should be cleared or explicitly accepted before manual filing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.exceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exceptions are open on this draft.</p>
            ) : (
              detail.exceptions.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.title}</div>
                    <Badge variant={getCheckVariant(item.severity)}>{item.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Attach support evidence</CardTitle>
            <CardDescription>
              Add notes, links to source documents, or bank proof references to the filing pack.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={onEvidenceSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="evidenceLabel">Label</Label>
                <Input
                  id="evidenceLabel"
                  value={evidenceLabel}
                  onChange={(event) => setEvidenceLabel(event.target.value)}
                  placeholder="WHT certificate - March 2026"
                  disabled={!canEdit(role) || isBusy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="evidenceKind">Kind</Label>
                <select
                  id="evidenceKind"
                  value={evidenceKind}
                  onChange={(event) => setEvidenceKind(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                  disabled={!canEdit(role) || isBusy}
                >
                  <option value="SOURCE_DOCUMENT">Source document</option>
                  <option value="NOTE">Note</option>
                  <option value="SUPPORT_SCHEDULE">Support schedule</option>
                  <option value="BANK_PROOF">Bank proof</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="evidenceUrl">URL</Label>
                <Input
                  id="evidenceUrl"
                  value={evidenceUrl}
                  onChange={(event) => setEvidenceUrl(event.target.value)}
                  placeholder="https://..."
                  disabled={!canEdit(role) || isBusy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="evidenceNote">Note</Label>
                <textarea
                  id="evidenceNote"
                  value={evidenceNote}
                  onChange={(event) => setEvidenceNote(event.target.value)}
                  className={inputClassName}
                  disabled={!canEdit(role) || isBusy}
                />
              </div>
              <Button type="submit" disabled={!canEdit(role) || isBusy}>
                Attach evidence
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence and submission logs</CardTitle>
            <CardDescription>
              Audit trail for supporting documents, exports, approvals, and manual filing steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {detail.evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">No support evidence attached yet.</p>
              ) : (
                detail.evidence.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.label}</span>
                      <Badge variant="outline">{item.evidenceKind}</Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p>Uploaded by: {item.uploadedByName ?? "Unknown"}</p>
                      <p>Created: {formatDateTime(item.createdAt)}</p>
                      {item.note ? <p>Note: {item.note}</p> : null}
                      {item.url ? (
                        <p>
                          URL:{" "}
                          <Link href={item.url} target="_blank" className="underline">
                            Open reference
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 border-t pt-4">
              {detail.submissionLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submission events logged yet.</p>
              ) : (
                detail.submissionLogs.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.action}</span>
                      <Badge variant={getLogVariant(item.status)}>{item.status}</Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-muted-foreground">
                      <div>Actor: {item.actorName ?? "Unknown"}</div>
                      <div>Provider: {item.provider ?? "N/A"}</div>
                      <div>When: {formatDateTime(item.createdAt)}</div>
                      {item.reference ? <div>Reference: {item.reference}</div> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>JSON payload preview</CardTitle>
          <CardDescription>
            Filing-ready adapter payload for future integration work. Export it from this page when
            you need the full JSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
            {JSON.stringify(detail.payloadCandidate, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
