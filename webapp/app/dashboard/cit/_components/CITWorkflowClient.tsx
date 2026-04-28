"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  FolderSearch,
  Paperclip,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
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
type CITWorkflowStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "READY"
  | "BLOCKED"
  | "APPROVED_FOR_EXPORT";
type CITBlockerSeverity = "INFO" | "WARNING" | "BLOCKING";
type CITAdjustmentCategory =
  | "NON_DEDUCTIBLE_EXPENSE"
  | "PERSONAL_EXPENSE"
  | "DONATION"
  | "DEPRECIATION_ADD_BACK"
  | "CAPITAL_ALLOWANCE"
  | "TAX_EXEMPT_INCOME"
  | "PRIOR_YEAR_LOSS"
  | "INCENTIVE_DEDUCTION"
  | "FX_REVALUATION"
  | "OTHER";
type TaxAdjustmentDirection = "ADD_BACK" | "DEDUCTION" | "NEUTRAL";
type FilingEvidenceKind =
  | "SOURCE_DOCUMENT"
  | "NOTE"
  | "SUPPORT_SCHEDULE"
  | "BANK_PROOF"
  | "OTHER";

type CITWorkflowPageData = {
  filters: {
    clientBusinessId: number | null;
    year: number;
  };
  clientBusinesses: Array<{
    id: number;
    name: string;
    legalName: string | null;
    taxIdentificationNumber: string | null;
    fiscalYearStartMonth: number;
    defaultCurrency: string;
  }>;
  detail: {
    citPeriod: {
      id: number;
      status: CITWorkflowStatus;
      blockerCount: number;
      note: string | null;
      evidenceNote: string | null;
      exportedAt: string | null;
      reviewedAt: string | null;
      reviewedByName: string | null;
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
    };
    fiscalYear: {
      year: number;
      label: string;
      startDate: string;
      endDate: string;
      fiscalYearStartMonth: number;
    };
    summary: {
      currency: string;
      accountingProfitMinor: number;
      addBacksMinor: number;
      deductionsMinor: number;
      taxAdjustedProfitMinor: number;
      sourceCount: number;
      exceptionCount: number;
      placeholderCount: number;
      accountingProfitFormatted: string;
      addBacksFormatted: string;
      deductionsFormatted: string;
      taxAdjustedProfitFormatted: string;
    };
    blockers: Array<{
      id: number;
      code: string;
      severity: CITBlockerSeverity;
      title: string;
      detail: string;
      href: string | null;
      resolved: boolean;
    }>;
    adjustments: Array<{
      id: number;
      category: CITAdjustmentCategory | null;
      direction: TaxAdjustmentDirection;
      label: string;
      amountMinor: number;
      reason: string | null;
      note: string | null;
      sourceReference: string | null;
      evidenceCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
    evidence: Array<{
      id: number;
      label: string;
      evidenceKind: FilingEvidenceKind;
      note: string | null;
      url: string | null;
      taxAdjustmentId: number | null;
      taxAdjustmentLabel: string | null;
      uploadedByName: string | null;
      createdAt: string;
    }>;
    scheduleRows: Array<{
      label: string;
      direction: string;
      amountMinor: number;
      taxAmountMinor: number | null;
      status: string;
      flags: string[];
      note: string | null;
    }>;
    placeholders: string[];
    exceptions: string[];
    filing: {
      draftId: number | null;
      status: string | null;
      reference: string | null;
      reviewNote: string | null;
      adapterCode: string | null;
      adapterMode: string | null;
      submissionReference: string | null;
      lastExportedAt: string | null;
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
      payloadCandidate: Record<string, unknown> | null;
    };
    exportSummary: {
      schemaVersion: number;
    };
    options: {
      adjustmentCategories: Array<{
        value: CITAdjustmentCategory;
        label: string;
      }>;
      directions: Array<{
        value: TaxAdjustmentDirection;
        label: string;
      }>;
      evidenceKinds: Array<{
        value: FilingEvidenceKind;
        label: string;
      }>;
      statuses: Array<{
        value: CITWorkflowStatus;
        label: string;
      }>;
    };
  };
  recentPeriods: Array<{
    id: number;
    year: number;
    label: string;
    status: CITWorkflowStatus;
    clientBusinessName: string | null;
    taxAdjustedProfitMinor: number;
    currency: string;
    blockerCount: number;
    updatedAt: string;
    href: string;
  }>;
};

type Filters = {
  year: string;
  clientBusinessId: string;
};

type AdjustmentForm = {
  id: number | null;
  category: string;
  direction: TaxAdjustmentDirection;
  label: string;
  amount: string;
  reason: string;
  note: string;
  sourceReference: string;
};

type EvidenceForm = {
  label: string;
  evidenceKind: FilingEvidenceKind;
  url: string;
  note: string;
  taxAdjustmentId: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const textAreaClassName =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function canApprove(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmountInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function parseAmountInputToMinor(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function parseJson<T>(value: Response) {
  return value.json().catch(() => null) as Promise<T | null>;
}

function getStatusVariant(status: CITWorkflowStatus) {
  if (status === "APPROVED_FOR_EXPORT" || status === "READY") return "secondary" as const;
  if (status === "BLOCKED") return "destructive" as const;
  return "outline" as const;
}

function getBlockerVariant(severity: CITBlockerSeverity) {
  if (severity === "BLOCKING") return "destructive" as const;
  if (severity === "WARNING") return "outline" as const;
  return "secondary" as const;
}

function getCheckVariant(severity: string) {
  if (severity === "BLOCKING") return "destructive" as const;
  if (severity === "WARNING") return "outline" as const;
  return "secondary" as const;
}

function buildQueryString(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", filters.year);
  if (filters.clientBusinessId) params.set("clientBusinessId", filters.clientBusinessId);
  return params.toString();
}

function buildAdjustmentForm(direction: TaxAdjustmentDirection): AdjustmentForm {
  return {
    id: null,
    category: "",
    direction,
    label: "",
    amount: "",
    reason: "",
    note: "",
    sourceReference: "",
  };
}

function buildEvidenceForm(): EvidenceForm {
  return {
    label: "",
    evidenceKind: "SOURCE_DOCUMENT",
    url: "",
    note: "",
    taxAdjustmentId: "",
  };
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{label}</CardDescription>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function CITWorkflowClient({
  role,
  initialData,
}: {
  role: Role;
  initialData: CITWorkflowPageData;
}) {
  const pathname = usePathname();
  const editable = canEdit(role);
  const approvable = canApprove(role);
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<Filters>({
    year: String(initialData.filters.year),
    clientBusinessId: initialData.filters.clientBusinessId
      ? String(initialData.filters.clientBusinessId)
      : "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(initialData.detail.citPeriod.note ?? "");
  const [evidenceNote, setEvidenceNote] = useState(
    initialData.detail.citPeriod.evidenceNote ?? ""
  );
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>(
    buildAdjustmentForm(initialData.detail.options.directions[0]?.value ?? "ADD_BACK")
  );
  const [evidenceForm, setEvidenceForm] = useState<EvidenceForm>(buildEvidenceForm());
  const defaultAdjustmentDirection =
    data.detail.options.directions[0]?.value ?? ("ADD_BACK" as TaxAdjustmentDirection);

  useEffect(() => {
    setNote(data.detail.citPeriod.note ?? "");
    setEvidenceNote(data.detail.citPeriod.evidenceNote ?? "");
    setAdjustmentForm(buildAdjustmentForm(defaultAdjustmentDirection));
    setEvidenceForm(buildEvidenceForm());
  }, [
    data.detail.citPeriod.id,
    data.detail.citPeriod.note,
    data.detail.citPeriod.evidenceNote,
    defaultAdjustmentDirection,
  ]);

  async function loadPageData(nextFilters: Filters, syncUrl = false, clearMessage = true) {
    setIsLoading(true);
    setError(null);

    try {
      const query = buildQueryString(nextFilters);
      const response = await fetch(`/api/cit/periods${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const payload = await parseJson<{ pageData?: CITWorkflowPageData; error?: string }>(response);

      if (!response.ok || !payload?.pageData) {
        throw new Error(payload?.error ?? "Unable to load the CIT workflow.");
      }

      setData(payload.pageData);
      if (clearMessage) {
        setMessage(null);
      }

      if (syncUrl && typeof window !== "undefined") {
        const href = query ? `${pathname}?${query}` : pathname;
        window.history.replaceState(null, "", href);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load the CIT workflow."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshCurrentPage() {
    await loadPageData(filters, true);
  }

  async function runPeriodAction(
    action:
      | "SAVE_NOTES"
      | "MARK_IN_REVIEW"
      | "MARK_READY"
      | "MARK_BLOCKED"
      | "MARK_APPROVED_FOR_EXPORT",
    successMessage: string
  ) {
    setIsMutating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/cit/periods/${data.detail.citPeriod.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          note,
          evidenceNote,
        }),
      });
      const payload = await parseJson<{
        detail?: CITWorkflowPageData["detail"];
        error?: string;
      }>(response);

      if (!response.ok || !payload?.detail) {
        throw new Error(payload?.error ?? "Unable to update the CIT workflow.");
      }

      setData((current) => ({
        ...current,
        detail: payload.detail ?? current.detail,
      }));
      setMessage(successMessage);
      void loadPageData(filters, false, false);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Unable to update the CIT workflow."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const amountMinor = parseAmountInputToMinor(adjustmentForm.amount);
    if (amountMinor === null) {
      setError("Enter a valid adjustment amount.");
      return;
    }

    setIsMutating(true);

    try {
      const endpoint = adjustmentForm.id
        ? `/api/cit/adjustments/${adjustmentForm.id}`
        : `/api/cit/periods/${data.detail.citPeriod.id}/adjustments`;
      const method = adjustmentForm.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: adjustmentForm.category || null,
          direction: adjustmentForm.direction,
          label: adjustmentForm.label,
          amountMinor,
          reason: adjustmentForm.reason,
          note: adjustmentForm.note,
          sourceReference: adjustmentForm.sourceReference,
        }),
      });
      const payload = await parseJson<{
        detail?: CITWorkflowPageData["detail"];
        error?: string;
      }>(response);

      if (!response.ok || !payload?.detail) {
        throw new Error(payload?.error ?? "Unable to save the CIT adjustment.");
      }

      setData((current) => ({
        ...current,
        detail: payload.detail ?? current.detail,
      }));
      setAdjustmentForm(
        buildAdjustmentForm(payload.detail.options.directions[0]?.value ?? "ADD_BACK")
      );
      setEvidenceForm((current) => ({
        ...current,
        taxAdjustmentId: "",
      }));
      setMessage(
        adjustmentForm.id ? "CIT adjustment updated." : "CIT adjustment added to the period."
      );
      void loadPageData(filters, false, false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to save the CIT adjustment."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteAdjustment(adjustmentId: number) {
    const confirmed =
      typeof window === "undefined" ? true : window.confirm("Delete this CIT adjustment?");
    if (!confirmed) return;

    setIsMutating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/cit/adjustments/${adjustmentId}`, {
        method: "DELETE",
      });
      const payload = await parseJson<{
        detail?: CITWorkflowPageData["detail"];
        error?: string;
      }>(response);

      if (!response.ok || !payload?.detail) {
        throw new Error(payload?.error ?? "Unable to delete the CIT adjustment.");
      }

      setData((current) => ({
        ...current,
        detail: payload.detail ?? current.detail,
      }));
      setAdjustmentForm(
        buildAdjustmentForm(payload.detail.options.directions[0]?.value ?? "ADD_BACK")
      );
      setMessage("CIT adjustment deleted.");
      void loadPageData(filters, false, false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete the CIT adjustment."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsMutating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/cit/periods/${data.detail.citPeriod.id}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: evidenceForm.label,
          evidenceKind: evidenceForm.evidenceKind,
          url: evidenceForm.url,
          note: evidenceForm.note,
          taxAdjustmentId: evidenceForm.taxAdjustmentId || null,
        }),
      });
      const payload = await parseJson<{
        detail?: CITWorkflowPageData["detail"];
        error?: string;
      }>(response);

      if (!response.ok || !payload?.detail) {
        throw new Error(payload?.error ?? "Unable to attach CIT evidence.");
      }

      setData((current) => ({
        ...current,
        detail: payload.detail ?? current.detail,
      }));
      setEvidenceForm(buildEvidenceForm());
      setMessage("Evidence attached to the CIT period.");
      void loadPageData(filters, false, false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to attach CIT evidence."
      );
    } finally {
      setIsMutating(false);
    }
  }

  const blockingBlockers = data.detail.blockers.filter((item) => item.severity === "BLOCKING");
  const warningBlockers = data.detail.blockers.filter((item) => item.severity === "WARNING");
  const infoBlockers = data.detail.blockers.filter((item) => item.severity === "INFO");
  const activeFilters = Boolean(filters.clientBusinessId);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-primary p-6 text-white shadow-glow">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                CIT workflow
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                {data.detail.workspace.name}
              </Badge>
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                Manual submission
              </Badge>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">
                Company income tax preparation
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-white/80">
                Review taxable-profit movements, log adjustments, attach support, and export a
                filing-ready CIT pack without pretending submission is automated.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <span>
                Fiscal year: <span className="font-medium text-white">{data.detail.fiscalYear.label}</span>
              </span>
              <span>
                Business:{" "}
                <span className="font-medium text-white">
                  {data.detail.clientBusiness.name ??
                    data.detail.workspace.businessName ??
                    data.detail.workspace.name}
                </span>
              </span>
              <span>
                Status: <span className="font-medium text-white">{data.detail.citPeriod.status}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="bg-white text-slate-900 hover:bg-white/90"
              onClick={() => void refreshCurrentPage()}
              disabled={isLoading || isMutating}
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            {data.detail.filing.draftId ? (
              <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white">
                <Link href={`/dashboard/tax-filing/${data.detail.filing.draftId}`}>Open filing draft</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Scope the CIT workflow by fiscal year end and client business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void loadPageData(filters, true);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="cit-year">Fiscal year end</Label>
              <Input
                id="cit-year"
                type="number"
                min={2000}
                max={9999}
                value={filters.year}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    year: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cit-client-business">Client business</Label>
              <select
                id="cit-client-business"
                value={filters.clientBusinessId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    clientBusinessId: event.target.value,
                  }))
                }
                className={selectClassName}
              >
                <option value="">All businesses</option>
                {data.clientBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 xl:col-span-2">
              <Button type="submit" disabled={isLoading || isMutating}>
                Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || isMutating}
                onClick={() => {
                  const nextFilters = {
                    year: String(new Date().getUTCFullYear()),
                    clientBusinessId: "",
                  };
                  setFilters(nextFilters);
                  void loadPageData(nextFilters, true);
                }}
              >
                Reset
              </Button>
            </div>
          </form>
          {activeFilters ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Focused on a single client business. Remove the client filter to compare the wider
              accountant portfolio.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Accounting profit"
          value={data.detail.summary.accountingProfitFormatted}
          description="The raw profit before tax adjustments for this CIT period."
          icon={FolderSearch}
        />
        <SummaryCard
          label="Add-backs"
          value={data.detail.summary.addBacksFormatted}
          description="Non-deductible or timing items added back into taxable profit."
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Deductions"
          value={data.detail.summary.deductionsFormatted}
          description="Tax deductions, reliefs, and manual supports reducing the taxable base."
          icon={Paperclip}
        />
        <SummaryCard
          label="Tax-adjusted profit"
          value={data.detail.summary.taxAdjustedProfitFormatted}
          description="The current export-ready taxable profit position for manual filing."
          icon={ShieldCheck}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Status and notes</CardTitle>
                  <CardDescription>
                    Keep the CIT pack in review, log accountant notes, and approve it for export
                    when blockers are cleared.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusVariant(data.detail.citPeriod.status)}>
                    {data.detail.citPeriod.status}
                  </Badge>
                  <Badge variant="outline">{data.detail.citPeriod.blockerCount} blocker(s)</Badge>
                  <Badge variant="outline">Schema v{data.detail.exportSummary.schemaVersion}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="text-sm font-medium">Reviewed</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.detail.citPeriod.reviewedByName
                      ? `${data.detail.citPeriod.reviewedByName} · ${formatDateTime(
                          data.detail.citPeriod.reviewedAt
                        )}`
                      : "Not yet reviewed for export."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="text-sm font-medium">Last export</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDateTime(
                      data.detail.citPeriod.exportedAt ?? data.detail.filing.lastExportedAt
                    )}
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cit-note">Accountant notes</Label>
                  <textarea
                    id="cit-note"
                    className={textAreaClassName}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Summarize the taxable-profit position, assumptions, or review context."
                    disabled={!editable || isMutating}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cit-evidence-note">Evidence note</Label>
                  <textarea
                    id="cit-evidence-note"
                    className={textAreaClassName}
                    value={evidenceNote}
                    onChange={(event) => setEvidenceNote(event.target.value)}
                    placeholder="Call out missing schedules, external workpapers, or manual support still pending."
                    disabled={!editable || isMutating}
                  />
                </div>
              </div>

              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void runPeriodAction("SAVE_NOTES", "CIT notes saved.")}
                    disabled={isMutating}
                  >
                    Save notes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void runPeriodAction("MARK_IN_REVIEW", "CIT pack moved into review.")
                    }
                    disabled={isMutating}
                  >
                    Mark in review
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runPeriodAction("MARK_READY", "CIT pack marked ready.")}
                    disabled={isMutating}
                  >
                    Mark ready
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void runPeriodAction("MARK_BLOCKED", "CIT pack marked as blocked.")
                    }
                    disabled={isMutating}
                  >
                    Mark blocked
                  </Button>
                  {approvable ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void runPeriodAction(
                          "MARK_APPROVED_FOR_EXPORT",
                          "CIT pack approved for export."
                        )
                      }
                      disabled={isMutating}
                    >
                      Approve for export
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your role can review the CIT pack, but only members and admins can update notes
                  or workflow status.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Adjustment schedule</CardTitle>
                  <CardDescription>
                    Capture add-backs, deductions, and manual CIT supports alongside evidence.
                  </CardDescription>
                </div>
                <Badge variant="outline">{data.detail.adjustments.length} adjustments</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {editable ? (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={submitAdjustment}>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-adjustment-category">Adjustment category</Label>
                    <select
                      id="cit-adjustment-category"
                      value={adjustmentForm.category}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                      className={selectClassName}
                      disabled={isMutating}
                    >
                      <option value="">No category</option>
                      {data.detail.options.adjustmentCategories.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-adjustment-direction">Direction</Label>
                    <select
                      id="cit-adjustment-direction"
                      value={adjustmentForm.direction}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          direction: event.target.value as TaxAdjustmentDirection,
                        }))
                      }
                      className={selectClassName}
                      disabled={isMutating}
                    >
                      {data.detail.options.directions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="cit-adjustment-label">Label</Label>
                    <Input
                      id="cit-adjustment-label"
                      value={adjustmentForm.label}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                      placeholder="Example: Disallow personal fuel expense"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-adjustment-amount">Amount</Label>
                    <Input
                      id="cit-adjustment-amount"
                      inputMode="decimal"
                      value={adjustmentForm.amount}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-adjustment-reference">Source reference</Label>
                    <Input
                      id="cit-adjustment-reference"
                      value={adjustmentForm.sourceReference}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          sourceReference: event.target.value,
                        }))
                      }
                      placeholder="Workpaper tab, memo, or external schedule reference"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="cit-adjustment-reason">Reason</Label>
                    <Input
                      id="cit-adjustment-reason"
                      value={adjustmentForm.reason}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                      placeholder="Why this item affects taxable profit"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="cit-adjustment-note">Note</Label>
                    <textarea
                      id="cit-adjustment-note"
                      className={textAreaClassName}
                      value={adjustmentForm.note}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Extra reviewer context, evidence gap, or supporting explanation"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button type="submit" disabled={isMutating}>
                      {adjustmentForm.id ? "Update adjustment" : "Add adjustment"}
                    </Button>
                    {adjustmentForm.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isMutating}
                        onClick={() => setAdjustmentForm(buildAdjustmentForm(defaultAdjustmentDirection))}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                </form>
              ) : null}

              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">Direction</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-left font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Support</th>
                      <th className="px-4 py-3 text-left font-medium">Updated</th>
                      {editable ? <th className="px-4 py-3 text-left font-medium">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.detail.adjustments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={editable ? 7 : 6}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No CIT adjustments recorded yet.
                        </td>
                      </tr>
                    ) : (
                      data.detail.adjustments.map((adjustment) => (
                        <tr key={adjustment.id}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium">{adjustment.label}</div>
                            {adjustment.reason ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {adjustment.reason}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline">{adjustment.direction}</Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {adjustment.category ? (
                              <Badge variant="secondary">{adjustment.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">Unclassified</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {formatMoney(adjustment.amountMinor, data.detail.summary.currency)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div>{adjustment.evidenceCount} evidence item(s)</div>
                            {adjustment.sourceReference ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Ref: {adjustment.sourceReference}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top text-muted-foreground">
                            {formatDateTime(adjustment.updatedAt)}
                          </td>
                          {editable ? (
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isMutating}
                                  onClick={() =>
                                    setAdjustmentForm({
                                      id: adjustment.id,
                                      category: adjustment.category ?? "",
                                      direction: adjustment.direction,
                                      label: adjustment.label,
                                      amount: formatAmountInput(adjustment.amountMinor),
                                      reason: adjustment.reason ?? "",
                                      note: adjustment.note ?? "",
                                      sourceReference: adjustment.sourceReference ?? "",
                                    })
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isMutating}
                                  onClick={() => void deleteAdjustment(adjustment.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Evidence and support</CardTitle>
                  <CardDescription>
                    Attach schedules, notes, and source links for the overall CIT period or a
                    specific adjustment.
                  </CardDescription>
                </div>
                <Badge variant="outline">{data.detail.evidence.length} evidence item(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {editable ? (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={submitEvidence}>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-evidence-label">Evidence label</Label>
                    <Input
                      id="cit-evidence-label"
                      value={evidenceForm.label}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                      placeholder="Capital allowance schedule"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-evidence-kind">Evidence kind</Label>
                    <select
                      id="cit-evidence-kind"
                      value={evidenceForm.evidenceKind}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          evidenceKind: event.target.value as FilingEvidenceKind,
                        }))
                      }
                      className={selectClassName}
                      disabled={isMutating}
                    >
                      {data.detail.options.evidenceKinds.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-evidence-adjustment">Linked adjustment</Label>
                    <select
                      id="cit-evidence-adjustment"
                      value={evidenceForm.taxAdjustmentId}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          taxAdjustmentId: event.target.value,
                        }))
                      }
                      className={selectClassName}
                      disabled={isMutating}
                    >
                      <option value="">Entire CIT period</option>
                      {data.detail.adjustments.map((adjustment) => (
                        <option key={adjustment.id} value={adjustment.id}>
                          {adjustment.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cit-evidence-url">Reference URL</Label>
                    <Input
                      id="cit-evidence-url"
                      value={evidenceForm.url}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="cit-evidence-note-text">Evidence note</Label>
                    <textarea
                      id="cit-evidence-note-text"
                      className={textAreaClassName}
                      value={evidenceForm.note}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Explain what this support covers or what reviewer should look for."
                      disabled={isMutating}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={isMutating}>
                      Attach evidence
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-3">
                {data.detail.evidence.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    No evidence attached yet. Add support schedules, notes, or external references
                    before export.
                  </div>
                ) : (
                  data.detail.evidence.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border/70 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.label}</p>
                            <Badge variant="outline">{item.evidenceKind}</Badge>
                            {item.taxAdjustmentLabel ? (
                              <Badge variant="secondary">{item.taxAdjustmentLabel}</Badge>
                            ) : null}
                          </div>
                          {item.note ? (
                            <p className="text-sm text-muted-foreground">{item.note}</p>
                          ) : null}
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary underline-offset-4 hover:underline"
                            >
                              Open reference
                            </a>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{item.uploadedByName ?? "Unknown uploader"}</p>
                          <p>{formatDateTime(item.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Taxable-profit schedule</CardTitle>
                  <CardDescription>
                    Preview the line items that currently drive CIT preparation for this period.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{data.detail.summary.sourceCount} rows</Badge>
                  <Badge variant="outline">{data.detail.summary.exceptionCount} exceptions</Badge>
                  <Badge variant="outline">{data.detail.summary.placeholderCount} placeholders</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">Direction</th>
                      <th className="px-4 py-3 text-left font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Tax amount</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.detail.scheduleRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                          The CIT schedule is empty for this selection.
                        </td>
                      </tr>
                    ) : (
                      data.detail.scheduleRows.map((row, index) => (
                        <tr key={`${row.label}-${index}`}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium">{row.label}</div>
                            {row.note ? (
                              <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="outline">{row.direction}</Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {formatMoney(row.amountMinor, data.detail.summary.currency)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {typeof row.taxAmountMinor === "number"
                              ? formatMoney(row.taxAmountMinor, data.detail.summary.currency)
                              : "-"}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant="secondary">{row.status}</Badge>
                          </td>
                          <td className="px-4 py-3 align-top text-muted-foreground">
                            {row.flags.length > 0 ? row.flags.join(", ") : "None"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="text-sm font-medium">Open exceptions</p>
                  <div className="mt-3 space-y-2">
                    {data.detail.exceptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No CIT exceptions are open.</p>
                    ) : (
                      data.detail.exceptions.map((item) => (
                        <p key={item} className="text-sm text-muted-foreground">
                          {item}
                        </p>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="text-sm font-medium">Manual placeholders</p>
                  <div className="mt-3 space-y-2">
                    {data.detail.placeholders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No placeholder assumptions remain.
                      </p>
                    ) : (
                      data.detail.placeholders.map((item) => (
                        <p key={item} className="text-sm text-muted-foreground">
                          {item}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Blockers</CardTitle>
                  <CardDescription>
                    See what is stopping this workspace from finishing CIT preparation cleanly.
                  </CardDescription>
                </div>
                <Badge variant="outline">{data.detail.blockers.length} total</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Blocking
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{blockingBlockers.length}</p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Warnings
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{warningBlockers.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Info
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{infoBlockers.length}</p>
                </div>
              </div>

              {data.detail.blockers.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700">
                  No active blockers. This CIT pack is clear from the current rules-based review
                  pass.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.detail.blockers.map((blocker) => (
                    <div
                      key={blocker.id}
                      className="rounded-2xl border border-border/70 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getBlockerVariant(blocker.severity)}>
                              {blocker.severity}
                            </Badge>
                            <p className="font-medium">{blocker.title}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{blocker.detail}</p>
                          {blocker.href ? (
                            <Link
                              href={blocker.href}
                              className="text-sm text-primary underline-offset-4 hover:underline"
                            >
                              Open linked record
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Filing checks</CardTitle>
                  <CardDescription>
                    Export-readiness checks and checklist items inherited from the filing draft.
                  </CardDescription>
                </div>
                <Badge variant="outline">{data.detail.filing.status ?? "No draft"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {data.detail.filing.checks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No filing checks were produced for this CIT pack.
                  </p>
                ) : (
                  data.detail.filing.checks.map((check) => (
                    <div key={check.code} className="rounded-2xl border border-border/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getCheckVariant(check.severity)}>{check.severity}</Badge>
                        <p className="font-medium">{check.title}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{check.detail}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                <p className="text-sm font-medium">Checklist</p>
                {data.detail.filing.checklist.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No checklist items were generated for this filing draft.
                  </p>
                ) : (
                  data.detail.filing.checklist.map((item) => (
                    <div key={item.code} className="rounded-xl border border-border/60 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.label}</p>
                        {item.required ? <Badge variant="secondary">Required</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Export pack</CardTitle>
                  <CardDescription>
                    Download the current CIT preparation pack in formats that are ready for manual
                    review and submission support.
                  </CardDescription>
                </div>
                <FileSpreadsheet className="size-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href={`/api/cit/periods/${data.detail.citPeriod.id}/export?format=json`}>
                    JSON summary
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/api/cit/periods/${data.detail.citPeriod.id}/export?format=summary-csv`}>
                    Summary CSV
                  </a>
                </Button>
                <Button asChild>
                  <a
                    href={`/api/cit/periods/${data.detail.citPeriod.id}/export?format=summary-html`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Printable pack
                  </a>
                </Button>
              </div>
              <div className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">
                Final submission stays manual for now. TaxBook AI prepares the pack, logs export
                activity, and keeps evidence and blocker traceability attached to the workspace.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent CIT periods</CardTitle>
              <CardDescription>
                Jump between the most recently updated CIT workspaces without losing your current
                review context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentPeriods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent CIT periods yet.</p>
              ) : (
                data.recentPeriods.map((period) => (
                  <Link
                    key={period.id}
                    href={period.href}
                    className="block rounded-2xl border border-border/70 px-4 py-4 transition hover:border-primary/30 hover:bg-muted/20"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={getStatusVariant(period.status)}>{period.status}</Badge>
                          {period.clientBusinessName ? (
                            <Badge variant="outline">{period.clientBusinessName}</Badge>
                          ) : null}
                        </div>
                        <div>
                          <p className="font-medium">{period.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatMoney(period.taxAdjustedProfitMinor, period.currency)} taxable
                            profit
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{period.blockerCount} blocker(s)</p>
                        <p>{formatDateTime(period.updatedAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
