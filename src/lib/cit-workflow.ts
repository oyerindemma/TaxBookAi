import "server-only";

import type {
  CITAdjustmentCategory,
  CITBlockerSeverity,
  CITWorkflowStatus,
  FilingEvidenceKind,
  FilingItemStatus,
  TaxAdjustmentDirection,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import type { TaxPeriodState } from "@/lib/tax-compliance";
import {
  formatCurrency,
  getWorkspaceTaxEngineOverview,
  recomputeStoredTaxPeriod,
} from "@/lib/tax-engine";
import { getTaxFilingDetail, recordTaxFilingExport, type TaxFilingDetail } from "@/lib/tax-filing";
import { prisma } from "@/lib/prisma";

const CIT_WORKFLOW_EXPORT_SCHEMA_VERSION = 1;

const CIT_ADJUSTMENT_CATEGORIES = [
  "NON_DEDUCTIBLE_EXPENSE",
  "PERSONAL_EXPENSE",
  "DONATION",
  "DEPRECIATION_ADD_BACK",
  "CAPITAL_ALLOWANCE",
  "TAX_EXEMPT_INCOME",
  "PRIOR_YEAR_LOSS",
  "INCENTIVE_DEDUCTION",
  "FX_REVALUATION",
  "OTHER",
] as const satisfies readonly CITAdjustmentCategory[];

const CIT_EVIDENCE_KINDS = [
  "SOURCE_DOCUMENT",
  "NOTE",
  "SUPPORT_SCHEDULE",
  "BANK_PROOF",
  "OTHER",
] as const satisfies readonly FilingEvidenceKind[];

const CIT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "READY",
  "BLOCKED",
  "APPROVED_FOR_EXPORT",
] as const satisfies readonly CITWorkflowStatus[];

const CIT_DIRECTIONS = [
  "ADD_BACK",
  "DEDUCTION",
  "NEUTRAL",
] as const satisfies readonly TaxAdjustmentDirection[];

type CITBlockerSeed = {
  code: string;
  severity: CITBlockerSeverity;
  title: string;
  detail: string;
  href?: string | null;
};

type WorkspaceScopeContext = {
  workspace: {
    id: number;
    name: string;
    businessName: string | null;
    taxIdentificationNumber: string | null;
    fiscalYearStartMonth: number;
    defaultCurrency: string;
  };
  clientBusinesses: Array<{
    id: number;
    name: string;
    legalName: string | null;
    taxIdentificationNumber: string | null;
    fiscalYearStartMonth: number;
    defaultCurrency: string;
  }>;
  selectedBusiness: {
    id: number;
    name: string;
    legalName: string | null;
    taxIdentificationNumber: string | null;
    fiscalYearStartMonth: number;
    defaultCurrency: string;
  } | null;
};

export type CITWorkflowFilters = {
  clientBusinessId: number | null;
  year: number;
};

export type CITWorkflowClientBusinessOption = {
  id: number;
  name: string;
  legalName: string | null;
  taxIdentificationNumber: string | null;
  fiscalYearStartMonth: number;
  defaultCurrency: string;
};

export type CITWorkflowBlocker = {
  id: number;
  code: string;
  severity: CITBlockerSeverity;
  title: string;
  detail: string;
  href: string | null;
  resolved: boolean;
};

export type CITWorkflowAdjustment = {
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
};

export type CITWorkflowEvidence = {
  id: number;
  label: string;
  evidenceKind: FilingEvidenceKind;
  note: string | null;
  url: string | null;
  taxAdjustmentId: number | null;
  taxAdjustmentLabel: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

export type CITWorkflowScheduleRow = {
  label: string;
  direction: string;
  amountMinor: number;
  taxAmountMinor: number | null;
  status: FilingItemStatus | string;
  flags: string[];
  note: string | null;
};

export type CITWorkflowExportSummary = {
  schemaVersion: number;
  generatedAt: string;
  countryCode: "NG";
  manualSubmissionRequired: true;
  workflow: {
    citPeriodId: number;
    status: CITWorkflowStatus;
    filingDraftId: number | null;
    blockerCount: number;
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
  };
  blockers: Array<{
    code: string;
    severity: CITBlockerSeverity;
    title: string;
    detail: string;
    href: string | null;
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
  }>;
  evidence: Array<{
    id: number;
    label: string;
    evidenceKind: FilingEvidenceKind;
    note: string | null;
    url: string | null;
    taxAdjustmentId: number | null;
    taxAdjustmentLabel: string | null;
  }>;
  scheduleRows: CITWorkflowScheduleRow[];
  placeholders: string[];
  exceptions: string[];
  filing: {
    draftId: number | null;
    reference: string | null;
    filingStatus: string | null;
    adapterCode: string | null;
    adapterMode: string | null;
    submissionReference: string | null;
    checks: TaxFilingDetail["checks"];
    checklist: TaxFilingDetail["checklist"];
    payloadCandidate: Record<string, unknown> | null;
  };
};

export type CITWorkflowDetail = {
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
  blockers: CITWorkflowBlocker[];
  adjustments: CITWorkflowAdjustment[];
  evidence: CITWorkflowEvidence[];
  scheduleRows: CITWorkflowScheduleRow[];
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
    checks: TaxFilingDetail["checks"];
    checklist: TaxFilingDetail["checklist"];
    payloadCandidate: Record<string, unknown> | null;
  };
  exportSummary: CITWorkflowExportSummary;
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

export type CITWorkflowPageData = {
  filters: CITWorkflowFilters;
  clientBusinesses: CITWorkflowClientBusinessOption[];
  detail: CITWorkflowDetail;
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

function toPayload(value: unknown) {
  return JSON.stringify(value);
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function clampFiscalYearStartMonth(value: number | null | undefined) {
  if (!Number.isInteger(value) || (value ?? 0) < 1 || (value ?? 0) > 12) {
    return 1;
  }
  return value as number;
}

function getCITYearEnd(value?: number | null) {
  const year = value ?? new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return new Date().getUTCFullYear();
  }
  return year;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildCitFiscalYearState(input: {
  year: number;
  fiscalYearStartMonth: number;
}): TaxPeriodState {
  const year = getCITYearEnd(input.year);
  const fiscalYearStartMonth = clampFiscalYearStartMonth(input.fiscalYearStartMonth);
  const startYear = fiscalYearStartMonth === 1 ? year : year - 1;
  const startDate = new Date(Date.UTC(startYear, fiscalYearStartMonth - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(
    Date.UTC(startYear + 1, fiscalYearStartMonth - 1, 0, 23, 59, 59, 999)
  );
  const fromParam = toIsoDate(startDate);
  const toParam = toIsoDate(endDate);

  return {
    mode: "custom",
    label:
      fiscalYearStartMonth === 1
        ? `FY ${year}`
        : `FY ${year} (${startDate.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })} - ${endDate.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })})`,
    fromParam,
    toParam,
    monthInput: "",
    quarterInput: "",
    yearInput: String(year),
    fromInput: fromParam,
    toInput: toParam,
    errorMsg: null,
  };
}

async function loadWorkspaceScopeContext(input: {
  workspaceId: number;
  clientBusinessId?: number | null;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: input.workspaceId,
    },
    select: {
      id: true,
      name: true,
      businessProfile: {
        select: {
          businessName: true,
          taxIdentificationNumber: true,
          fiscalYearStartMonth: true,
          defaultCurrency: true,
        },
      },
      clientBusinesses: {
        where: {
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          legalName: true,
          taxIdentificationNumber: true,
          fiscalYearStartMonth: true,
          defaultCurrency: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const selectedBusiness =
    typeof input.clientBusinessId === "number"
      ? workspace.clientBusinesses.find((item) => item.id === input.clientBusinessId) ?? null
      : null;

  if (input.clientBusinessId && !selectedBusiness) {
    throw new Error("Client business not found in the active workspace.");
  }

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      businessName: workspace.businessProfile?.businessName ?? null,
      taxIdentificationNumber: workspace.businessProfile?.taxIdentificationNumber ?? null,
      fiscalYearStartMonth: clampFiscalYearStartMonth(
        workspace.businessProfile?.fiscalYearStartMonth
      ),
      defaultCurrency: workspace.businessProfile?.defaultCurrency ?? "NGN",
    },
    clientBusinesses: workspace.clientBusinesses,
    selectedBusiness,
  } satisfies WorkspaceScopeContext;
}

function buildCitAdjustmentCategoryOptions() {
  return CIT_ADJUSTMENT_CATEGORIES.map((value) => ({
    value,
    label: humanizeEnum(value),
  }));
}

function buildTaxAdjustmentDirectionOptions() {
  return CIT_DIRECTIONS.map((value) => ({
    value,
    label: humanizeEnum(value),
  }));
}

function buildEvidenceKindOptions() {
  return CIT_EVIDENCE_KINDS.map((value) => ({
    value,
    label: humanizeEnum(value),
  }));
}

function buildStatusOptions() {
  return CIT_STATUSES.map((value) => ({
    value,
    label: humanizeEnum(value),
  }));
}

function buildCitBlockers(input: {
  filingDetail: TaxFilingDetail | null;
  evidenceCount: number;
  adjustmentSupportGapCount: number;
  mixedFiscalYearStarts: boolean;
}) {
  const blockers: CITBlockerSeed[] = [];
  const filingDetail = input.filingDetail;

  if (!filingDetail) {
    blockers.push({
      code: "MISSING_FILING_DRAFT",
      severity: "BLOCKING",
      title: "CIT draft is missing",
      detail:
        "TaxBook AI could not find the backing CIT filing draft for this fiscal year. Refresh the period to regenerate the draft.",
      href: "/dashboard/tax-filing",
    });
    return blockers;
  }

  if (!filingDetail.draft.businessTinSnapshot) {
    blockers.push({
      code: "MISSING_TIN",
      severity: "BLOCKING",
      title: "Business TIN is missing",
      detail:
        "Add the client business or workspace TIN before approving this CIT pack for export or manual submission.",
      href: "/dashboard/business-profile",
    });
  }

  if (filingDetail.scheduleRows.length === 0) {
    blockers.push({
      code: "EMPTY_SUPPORT_SCHEDULE",
      severity: "BLOCKING",
      title: "CIT support schedule is empty",
      detail:
        "No CIT schedule rows were generated for this fiscal year. Review transactions and recompute the tax period.",
      href: "/dashboard/tax",
    });
  }

  if (filingDetail.checks.some((item) => item.code === "INCONSISTENT_TOTALS")) {
    blockers.push({
      code: "INCONSISTENT_TOTALS",
      severity: "BLOCKING",
      title: "Taxable profit totals are inconsistent",
      detail:
        "The schedule rows and CIT totals do not currently reconcile. Recompute the tax period before approving the export pack.",
      href: "/dashboard/tax",
    });
  }

  if (filingDetail.exceptions.length > 0) {
    blockers.push({
      code: "UNRESOLVED_CIT_EXCEPTIONS",
      severity: "BLOCKING",
      title: "Unresolved CIT exceptions remain",
      detail: `${filingDetail.exceptions.length} CIT exception(s) still need accountant review before export.`,
      href: "/dashboard/cit",
    });
  }

  if (input.evidenceCount === 0) {
    blockers.push({
      code: "MISSING_EVIDENCE",
      severity: "WARNING",
      title: "Supporting evidence is missing",
      detail:
        "Attach schedules, source documents, or explanatory notes before the CIT pack is finalized for manual submission.",
      href: "/dashboard/cit",
    });
  }

  if (filingDetail.scheduleRows.some((row) => row.direction === "PLACEHOLDER")) {
    blockers.push({
      code: "PLACEHOLDER_ASSUMPTIONS",
      severity: "WARNING",
      title: "Manual CIT assumptions remain open",
      detail:
        "Capital allowances, loss relief, or other manual CIT assumptions still need explicit accountant support.",
      href: "/dashboard/cit",
    });
  }

  if (input.adjustmentSupportGapCount > 0) {
    blockers.push({
      code: "ADJUSTMENT_SUPPORT_GAPS",
      severity: "WARNING",
      title: "Some adjustments still lack support",
      detail: `${input.adjustmentSupportGapCount} adjustment(s) need either a source reference, supporting evidence, or a clearer note.`,
      href: "/dashboard/cit",
    });
  }

  if (input.mixedFiscalYearStarts) {
    blockers.push({
      code: "MIXED_FISCAL_YEAR_SCOPE",
      severity: "INFO",
      title: "Workspace scope spans mixed fiscal year starts",
      detail:
        "This CIT view is aggregated across businesses with different fiscal year starts, so a client-business filter will produce a cleaner pack.",
      href: "/dashboard/client-businesses",
    });
  }

  blockers.push({
    code: "MANUAL_SUBMISSION_ONLY",
    severity: "INFO",
    title: "Submission remains manual",
    detail:
      "TaxBook AI prepares the CIT pack and exports supporting schedules, but final submission still happens manually outside the platform.",
    href: "/dashboard/tax-filing",
  });

  return blockers;
}

function deriveCitStatus(
  currentStatus: CITWorkflowStatus | null,
  blockers: CITBlockerSeed[]
): CITWorkflowStatus {
  const hasBlocking = blockers.some((item) => item.severity === "BLOCKING");
  const hasWarning = blockers.some((item) => item.severity === "WARNING");

  if (hasBlocking) {
    return "BLOCKED";
  }

  if (currentStatus === "APPROVED_FOR_EXPORT") {
    return "APPROVED_FOR_EXPORT";
  }

  if (hasWarning) {
    return "IN_REVIEW";
  }

  if (!currentStatus || currentStatus === "DRAFT" || currentStatus === "BLOCKED") {
    return "READY";
  }

  return currentStatus;
}

function buildCitPack(input: {
  detail: TaxFilingDetail;
  citPeriodId: number;
  status: CITWorkflowStatus;
  blockerCount: number;
  blockers: CITWorkflowBlocker[];
  adjustments: CITWorkflowAdjustment[];
  evidence: CITWorkflowEvidence[];
  year: number;
  fiscalYearStartMonth: number;
}) {
  return {
    schemaVersion: CIT_WORKFLOW_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    countryCode: "NG" as const,
    manualSubmissionRequired: true as const,
    workflow: {
      citPeriodId: input.citPeriodId,
      status: input.status,
      filingDraftId: input.detail.draft.id,
      blockerCount: input.blockerCount,
    },
    workspace: {
      id: input.detail.workspace.id,
      name: input.detail.workspace.name,
      businessName: input.detail.workspace.businessName,
    },
    clientBusiness: {
      id: input.detail.clientBusiness.id,
      name: input.detail.clientBusiness.name,
      legalName: input.detail.clientBusiness.legalName,
      taxIdentificationNumber: input.detail.clientBusiness.taxIdentificationNumber,
    },
    fiscalYear: {
      year: input.year,
      label: input.detail.period.label,
      startDate: input.detail.period.startDate,
      endDate: input.detail.period.endDate,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
    },
    summary: {
      currency: input.detail.summary.currency,
      accountingProfitMinor: input.detail.summary.totals.accountingProfitMinor ?? 0,
      addBacksMinor: input.detail.summary.totals.addBacksMinor ?? 0,
      deductionsMinor: input.detail.summary.totals.deductionsMinor ?? 0,
      taxAdjustedProfitMinor: input.detail.summary.totals.taxAdjustedProfitMinor ?? 0,
      sourceCount: input.detail.scheduleRows.length,
      exceptionCount: input.detail.exceptions.length,
      placeholderCount: input.detail.scheduleRows.filter((row) => row.direction === "PLACEHOLDER")
        .length,
    },
    blockers: input.blockers.map((item) => ({
      code: item.code,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      href: item.href,
    })),
    adjustments: input.adjustments.map((item) => ({
      id: item.id,
      category: item.category,
      direction: item.direction,
      label: item.label,
      amountMinor: item.amountMinor,
      reason: item.reason,
      note: item.note,
      sourceReference: item.sourceReference,
      evidenceCount: item.evidenceCount,
    })),
    evidence: input.evidence.map((item) => ({
      id: item.id,
      label: item.label,
      evidenceKind: item.evidenceKind,
      note: item.note,
      url: item.url,
      taxAdjustmentId: item.taxAdjustmentId,
      taxAdjustmentLabel: item.taxAdjustmentLabel,
    })),
    scheduleRows: input.detail.scheduleRows.map((row) => ({
      label: String(row.label ?? ""),
      direction: String(row.direction ?? ""),
      amountMinor: Number(row.amountMinor ?? 0),
      taxAmountMinor:
        typeof row.taxAmountMinor === "number" ? row.taxAmountMinor : Number(row.taxAmountMinor ?? 0),
      status: String(row.status ?? "PENDING"),
      flags: Array.isArray(row.flags) ? row.flags.map(String) : [],
      note: typeof row.note === "string" ? row.note : null,
    })),
    placeholders: input.detail.scheduleRows
      .filter((row) => row.direction === "PLACEHOLDER")
      .map((row) => String(row.label ?? "Manual placeholder")),
    exceptions: input.detail.exceptions.map((item) => item.title),
    filing: {
      draftId: input.detail.draft.id,
      reference: input.detail.draft.reference,
      filingStatus: input.detail.draft.status,
      adapterCode: input.detail.draft.adapterCode,
      adapterMode: input.detail.draft.adapterMode,
      submissionReference: input.detail.draft.submissionReference,
      checks: input.detail.checks,
      checklist: input.detail.checklist,
      payloadCandidate: input.detail.payloadCandidate,
    },
  } satisfies CITWorkflowExportSummary;
}

function buildCitCsv(detail: CITWorkflowDetail) {
  const rows: Array<Array<string | number | null>> = [
    ["Section", "Label", "Value", "Detail"],
    ["Summary", "Accounting profit before tax", detail.summary.accountingProfitMinor, null],
    ["Summary", "Add-backs", detail.summary.addBacksMinor, null],
    ["Summary", "Deductions", detail.summary.deductionsMinor, null],
    ["Summary", "Tax-adjusted profit", detail.summary.taxAdjustedProfitMinor, null],
  ];

  for (const blocker of detail.blockers) {
    rows.push(["Blocker", blocker.title, blocker.severity, blocker.detail]);
  }

  for (const adjustment of detail.adjustments) {
    rows.push([
      "Adjustment",
      adjustment.label,
      adjustment.amountMinor,
      `${adjustment.direction} · ${adjustment.category ?? "OTHER"}`,
    ]);
  }

  for (const row of detail.scheduleRows) {
    rows.push([
      "Schedule",
      row.label,
      row.amountMinor,
      `${row.direction} · ${row.status}`,
    ]);
  }

  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          if (text.includes('"')) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          if (text.includes(",") || text.includes("\n") || text.includes("\r")) {
            return `"${text}"`;
          }
          return text;
        })
        .join(",")
    )
    .join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCitHtml(detail: CITWorkflowDetail) {
  const blockers =
    detail.blockers.length === 0
      ? "<li>No active blockers.</li>"
      : detail.blockers
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.severity)}</strong>: ${escapeHtml(item.title)} - ${escapeHtml(item.detail)}</li>`
          )
          .join("");
  const adjustments =
    detail.adjustments.length === 0
      ? "<li>No CIT adjustments recorded.</li>"
      : detail.adjustments
          .map(
            (item) =>
              `<li>${escapeHtml(item.label)} (${escapeHtml(item.direction)}) - ${escapeHtml(
                formatCurrency(item.amountMinor, detail.summary.currency)
              )}</li>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaxBook AI CIT Pack</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #f6f5ef; color: #1f2937; }
      .shell { max-width: 980px; margin: 0 auto; padding: 24px; }
      .paper { background: white; border: 1px solid #ddd5c5; padding: 28px; }
      .meta { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 20px 0; }
      .meta div { border: 1px solid #ddd5c5; padding: 12px; }
      .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
      .value { margin-top: 6px; font-weight: 700; }
      .card { border: 1px solid #ddd5c5; padding: 16px; margin-bottom: 16px; }
      ul { margin: 12px 0 0; padding-left: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-top: 1px solid #ece5d9; padding: 8px 0; text-align: left; font-size: 14px; }
      @media print { body { background: white; } .shell { padding: 0; } .paper { border: 0; padding: 0; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="paper">
        <h1>Company Income Tax preparation pack</h1>
        <p>Prepared by TaxBook AI for manual CIT review and external submission support.</p>
        <div class="meta">
          <div><div class="label">Workspace</div><div class="value">${escapeHtml(detail.workspace.name)}</div></div>
          <div><div class="label">Business</div><div class="value">${escapeHtml(detail.clientBusiness.name ?? detail.workspace.businessName ?? detail.workspace.name)}</div></div>
          <div><div class="label">Fiscal year</div><div class="value">${escapeHtml(detail.fiscalYear.label)}</div></div>
          <div><div class="label">Status</div><div class="value">${escapeHtml(detail.citPeriod.status)}</div></div>
        </div>
        <div class="card">
          <div class="label">Tax-adjusted profit</div>
          <div class="value">${escapeHtml(detail.summary.taxAdjustedProfitFormatted)}</div>
        </div>
        <div class="card">
          <div class="label">Blockers</div>
          <ul>${blockers}</ul>
        </div>
        <div class="card">
          <div class="label">Adjustments</div>
          <ul>${adjustments}</ul>
        </div>
        <div class="card">
          <div class="label">Schedule preview</div>
          <table>
            <thead>
              <tr><th>Row</th><th>Direction</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${detail.scheduleRows
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.direction)}</td><td>${escapeHtml(formatCurrency(row.amountMinor, detail.summary.currency))}</td><td>${escapeHtml(String(row.status))}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function syncCitPeriodRecord(input: {
  workspaceId: number;
  clientBusinessId: number | null;
  year: number;
}) {
  const context = await loadWorkspaceScopeContext({
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId,
  });
  const fiscalYearStartMonth =
    context.selectedBusiness?.fiscalYearStartMonth ?? context.workspace.fiscalYearStartMonth;
  const period = buildCitFiscalYearState({
    year: input.year,
    fiscalYearStartMonth,
  });
  const mixedFiscalYearStarts =
    !context.selectedBusiness &&
    new Set(context.clientBusinesses.map((item) => item.fiscalYearStartMonth)).size > 1;

  const overview = await getWorkspaceTaxEngineOverview({
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    taxType: "CIT",
    period,
  });

  const [computation, filingDraft, existingCitPeriod, adjustments] = await Promise.all([
    prisma.taxComputation.findUnique({
      where: {
        taxPeriodId_taxType: {
          taxPeriodId: overview.period.id,
          taxType: "CIT",
        },
      },
      include: {
        citPeriod: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.filingDraft.findUnique({
      where: {
        taxPeriodId_taxType: {
          taxPeriodId: overview.period.id,
          taxType: "CIT",
        },
      },
      include: {
        citPeriod: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.cITPeriod.findUnique({
      where: {
        taxPeriodId: overview.period.id,
      },
      select: {
        id: true,
        status: true,
        note: true,
        evidenceNote: true,
        reviewedAt: true,
        reviewedByUserId: true,
        exportedAt: true,
      },
    }),
    prisma.taxAdjustment.findMany({
      where: {
        workspaceId: input.workspaceId,
        taxPeriodId: overview.period.id,
        taxType: "CIT",
        ...(input.clientBusinessId ? { clientBusinessId: input.clientBusinessId } : {}),
      },
      include: {
        evidence: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  if (!filingDraft) {
    throw new Error("CIT filing draft could not be prepared for the selected fiscal year.");
  }

  const filingDetail = await getTaxFilingDetail({
    workspaceId: input.workspaceId,
    filingDraftId: filingDraft.id,
  });

  const adjustmentIds = adjustments.map((item) => item.id);
  const evidenceRows = await prisma.filingEvidence.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        {
          filingDraftId: filingDraft.id,
        },
        ...(adjustmentIds.length > 0
          ? [
              {
                taxAdjustmentId: {
                  in: adjustmentIds,
                },
              },
            ]
          : []),
        ...(existingCitPeriod
          ? [
              {
                citPeriodId: existingCitPeriod.id,
              },
            ]
          : []),
      ],
    },
    include: {
      uploadedBy: {
        select: {
          fullName: true,
          email: true,
        },
      },
      taxAdjustment: {
        select: {
          id: true,
          label: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const adjustmentSupportGapCount = adjustments.filter(
    (item) =>
      item.evidence.length === 0 &&
      !normalizeOptionalText(item.sourceReference) &&
      !normalizeOptionalText(item.note)
  ).length;
  const blockers = buildCitBlockers({
    filingDetail,
    evidenceCount: evidenceRows.length,
    adjustmentSupportGapCount,
    mixedFiscalYearStarts,
  });
  const nextStatus = deriveCitStatus(existingCitPeriod?.status ?? null, blockers);
  const summaryPayload = {
    schemaVersion: CIT_WORKFLOW_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    currency: filingDetail?.summary.currency ?? context.selectedBusiness?.defaultCurrency ?? context.workspace.defaultCurrency,
    blockerCount: blockers.length,
    evidenceCount: evidenceRows.length,
    adjustmentCount: adjustments.length,
    exceptionCount: filingDetail?.exceptions.length ?? 0,
    placeholderCount:
      filingDetail?.scheduleRows.filter((row) => row.direction === "PLACEHOLDER").length ?? 0,
    taxAdjustedProfitMinor:
      filingDetail?.summary.totals.taxAdjustedProfitMinor ??
      computation?.taxAdjustedProfitMinor ??
      0,
  };

  const citPeriod = await prisma.cITPeriod.upsert({
    where: {
      taxPeriodId: overview.period.id,
    },
    create: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? null,
      taxPeriodId: overview.period.id,
      computationId: computation?.id ?? null,
      filingDraftId: filingDraft.id,
      status: nextStatus,
      blockerCount: blockers.length,
      note: null,
      evidenceNote: null,
      summaryPayload: toPayload(summaryPayload),
      reviewedAt: null,
      reviewedByUserId: null,
      exportedAt: null,
    },
    update: {
      clientBusinessId: input.clientBusinessId ?? null,
      computationId: computation?.id ?? null,
      filingDraftId: filingDraft.id,
      status: nextStatus,
      blockerCount: blockers.length,
      summaryPayload: toPayload(summaryPayload),
    },
    include: {
      reviewedBy: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
  });

  await prisma.cITBlocker.deleteMany({
    where: {
      citPeriodId: citPeriod.id,
    },
  });

  if (blockers.length > 0) {
    await prisma.cITBlocker.createMany({
      data: blockers.map((item) => ({
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        citPeriodId: citPeriod.id,
        code: item.code,
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        href: item.href ?? null,
        resolved: false,
      })),
    });
  }

  const [blockerRows, fullEvidenceRows, recentPeriods] = await Promise.all([
    prisma.cITBlocker.findMany({
      where: {
        citPeriodId: citPeriod.id,
      },
      orderBy: [{ resolved: "asc" }, { severity: "desc" }, { createdAt: "asc" }],
    }),
    prisma.filingEvidence.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          {
            filingDraftId: filingDraft.id,
          },
          {
            citPeriodId: citPeriod.id,
          },
          ...(adjustmentIds.length > 0
            ? [
                {
                  taxAdjustmentId: {
                    in: adjustmentIds,
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        uploadedBy: {
          select: {
            fullName: true,
            email: true,
          },
        },
        taxAdjustment: {
          select: {
            id: true,
            label: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.cITPeriod.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      include: {
        clientBusiness: {
          select: {
            name: true,
          },
        },
        taxPeriod: {
          select: {
            label: true,
            endDate: true,
            currency: true,
          },
        },
        computation: {
          select: {
            taxAdjustedProfitMinor: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 6,
    }),
  ]);

  const mappedAdjustments = adjustments.map((item) => ({
    id: item.id,
    category: item.citCategory,
    direction: item.direction,
    label: item.label,
    amountMinor: item.amountMinor,
    reason: item.reason,
    note: item.note,
    sourceReference: item.sourceReference,
    evidenceCount: item.evidence.length,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  })) satisfies CITWorkflowAdjustment[];

  const mappedEvidence = fullEvidenceRows.map((item) => ({
    id: item.id,
    label: item.label,
    evidenceKind: item.evidenceKind,
    note: item.note,
    url: item.url,
    taxAdjustmentId: item.taxAdjustmentId,
    taxAdjustmentLabel: item.taxAdjustment?.label ?? null,
    uploadedByName: item.uploadedBy?.fullName ?? item.uploadedBy?.email ?? null,
    createdAt: item.createdAt.toISOString(),
  })) satisfies CITWorkflowEvidence[];

  const mappedBlockers = blockerRows.map((item) => ({
    id: item.id,
    code: item.code,
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    href: item.href,
    resolved: item.resolved,
  })) satisfies CITWorkflowBlocker[];

  if (!filingDetail) {
    throw new Error("CIT filing detail could not be loaded.");
  }

  const exportSummary = buildCitPack({
    detail: filingDetail,
    citPeriodId: citPeriod.id,
    status: citPeriod.status,
    blockerCount: mappedBlockers.length,
    blockers: mappedBlockers,
    adjustments: mappedAdjustments,
    evidence: mappedEvidence,
    year: getCITYearEnd(input.year),
    fiscalYearStartMonth,
  });

  return {
    filters: {
      clientBusinessId: input.clientBusinessId ?? null,
      year: getCITYearEnd(input.year),
    },
    clientBusinesses: context.clientBusinesses,
    detail: {
      citPeriod: {
        id: citPeriod.id,
        status: citPeriod.status,
        blockerCount: mappedBlockers.length,
        note: citPeriod.note,
        evidenceNote: citPeriod.evidenceNote,
        exportedAt: citPeriod.exportedAt?.toISOString() ?? null,
        reviewedAt: citPeriod.reviewedAt?.toISOString() ?? null,
        reviewedByName: citPeriod.reviewedBy?.fullName ?? citPeriod.reviewedBy?.email ?? null,
      },
      workspace: {
        id: context.workspace.id,
        name: context.workspace.name,
        businessName: context.workspace.businessName,
      },
      clientBusiness: {
        id: context.selectedBusiness?.id ?? null,
        name: context.selectedBusiness?.name ?? null,
        legalName: context.selectedBusiness?.legalName ?? null,
        taxIdentificationNumber:
          context.selectedBusiness?.taxIdentificationNumber ?? null,
      },
      fiscalYear: {
        year: getCITYearEnd(input.year),
        label: period.label,
        startDate: period.fromParam ?? filingDetail.period.startDate,
        endDate: period.toParam ?? filingDetail.period.endDate,
        fiscalYearStartMonth,
      },
      summary: {
        currency: filingDetail.summary.currency,
        accountingProfitMinor: filingDetail.summary.totals.accountingProfitMinor ?? 0,
        addBacksMinor: filingDetail.summary.totals.addBacksMinor ?? 0,
        deductionsMinor: filingDetail.summary.totals.deductionsMinor ?? 0,
        taxAdjustedProfitMinor: filingDetail.summary.totals.taxAdjustedProfitMinor ?? 0,
        sourceCount: filingDetail.scheduleRows.length,
        exceptionCount: filingDetail.exceptions.length,
        placeholderCount: filingDetail.scheduleRows.filter((row) => row.direction === "PLACEHOLDER")
          .length,
        accountingProfitFormatted: formatCurrency(
          filingDetail.summary.totals.accountingProfitMinor ?? 0,
          filingDetail.summary.currency
        ),
        addBacksFormatted: formatCurrency(
          filingDetail.summary.totals.addBacksMinor ?? 0,
          filingDetail.summary.currency
        ),
        deductionsFormatted: formatCurrency(
          filingDetail.summary.totals.deductionsMinor ?? 0,
          filingDetail.summary.currency
        ),
        taxAdjustedProfitFormatted: formatCurrency(
          filingDetail.summary.totals.taxAdjustedProfitMinor ?? 0,
          filingDetail.summary.currency
        ),
      },
      blockers: mappedBlockers,
      adjustments: mappedAdjustments,
      evidence: mappedEvidence,
      scheduleRows: filingDetail.scheduleRows.map((row) => ({
        label: String(row.label ?? ""),
        direction: String(row.direction ?? ""),
        amountMinor: Number(row.amountMinor ?? 0),
        taxAmountMinor:
          typeof row.taxAmountMinor === "number" ? row.taxAmountMinor : Number(row.taxAmountMinor ?? 0),
        status: String(row.status ?? "PENDING"),
        flags: Array.isArray(row.flags) ? row.flags.map(String) : [],
        note: typeof row.note === "string" ? row.note : null,
      })),
      placeholders: filingDetail.scheduleRows
        .filter((row) => row.direction === "PLACEHOLDER")
        .map((row) => String(row.label ?? "Manual placeholder")),
      exceptions: filingDetail.exceptions.map((item) => item.title),
      filing: {
        draftId: filingDetail.draft.id,
        status: filingDetail.draft.status,
        reference: filingDetail.draft.reference,
        reviewNote: filingDetail.draft.reviewNote,
        adapterCode: filingDetail.draft.adapterCode,
        adapterMode: filingDetail.draft.adapterMode,
        submissionReference: filingDetail.draft.submissionReference,
        lastExportedAt: filingDetail.draft.lastExportedAt,
        checks: filingDetail.checks,
        checklist: filingDetail.checklist,
        payloadCandidate: filingDetail.payloadCandidate,
      },
      exportSummary,
      options: {
        adjustmentCategories: buildCitAdjustmentCategoryOptions(),
        directions: buildTaxAdjustmentDirectionOptions(),
        evidenceKinds: buildEvidenceKindOptions(),
        statuses: buildStatusOptions(),
      },
    },
    recentPeriods: recentPeriods.map((item) => ({
      id: item.id,
      year: item.taxPeriod.endDate.getUTCFullYear(),
      label: item.taxPeriod.label,
      status: item.status,
      clientBusinessName: item.clientBusiness?.name ?? null,
      taxAdjustedProfitMinor: item.computation?.taxAdjustedProfitMinor ?? 0,
      currency: item.taxPeriod.currency,
      blockerCount: item.blockerCount,
      updatedAt: item.updatedAt.toISOString(),
      href: `/dashboard/cit?year=${item.taxPeriod.endDate.getUTCFullYear()}${
        item.clientBusinessId ? `&clientBusinessId=${item.clientBusinessId}` : ""
      }`,
    })),
  } satisfies CITWorkflowPageData;
}

export async function getWorkspaceCitWorkflowPageData(input: {
  workspaceId: number;
  clientBusinessId?: number | null;
  year?: number | null;
}) {
  return syncCitPeriodRecord({
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    year: getCITYearEnd(input.year),
  });
}

export async function getCitWorkflowDetail(input: {
  workspaceId: number;
  citPeriodId: number;
}) {
  const citPeriod = await prisma.cITPeriod.findFirst({
    where: {
      id: input.citPeriodId,
      workspaceId: input.workspaceId,
    },
    select: {
      taxPeriod: {
        select: {
          endDate: true,
        },
      },
      clientBusinessId: true,
    },
  });

  if (!citPeriod) {
    return null;
  }

  const pageData = await getWorkspaceCitWorkflowPageData({
    workspaceId: input.workspaceId,
    clientBusinessId: citPeriod.clientBusinessId,
    year: citPeriod.taxPeriod.endDate.getUTCFullYear(),
  });

  return pageData.detail;
}

export async function updateCitWorkflowPeriod(input: {
  workspaceId: number;
  citPeriodId: number;
  actorUserId: number;
  action: "SAVE_NOTES" | "MARK_IN_REVIEW" | "MARK_READY" | "MARK_BLOCKED" | "MARK_APPROVED_FOR_EXPORT";
  note?: string | null;
  evidenceNote?: string | null;
}) {
  const period = await prisma.cITPeriod.findFirst({
    where: {
      id: input.citPeriodId,
      workspaceId: input.workspaceId,
    },
    include: {
      blockers: true,
      taxPeriod: {
        select: {
          id: true,
          endDate: true,
        },
      },
    },
  });

  if (!period) {
    throw new Error("CIT period not found.");
  }

  if (
    (input.action === "MARK_READY" || input.action === "MARK_APPROVED_FOR_EXPORT") &&
    period.blockers.some((item) => item.severity === "BLOCKING")
  ) {
    throw new Error("Resolve blocking CIT issues before marking this pack ready.");
  }

  const nextStatus =
    input.action === "MARK_IN_REVIEW"
      ? "IN_REVIEW"
      : input.action === "MARK_READY"
        ? "READY"
        : input.action === "MARK_BLOCKED"
          ? "BLOCKED"
          : input.action === "MARK_APPROVED_FOR_EXPORT"
            ? "APPROVED_FOR_EXPORT"
            : period.status;

  await prisma.cITPeriod.update({
    where: {
      id: period.id,
    },
    data: {
      status: nextStatus,
      note:
        typeof input.note === "string"
          ? normalizeOptionalText(input.note)
          : undefined,
      evidenceNote:
        typeof input.evidenceNote === "string"
          ? normalizeOptionalText(input.evidenceNote)
          : undefined,
      reviewedAt:
        input.action === "MARK_APPROVED_FOR_EXPORT" ? new Date() : period.reviewedAt ?? undefined,
      reviewedByUserId:
        input.action === "MARK_APPROVED_FOR_EXPORT"
          ? input.actorUserId
          : period.reviewedByUserId ?? undefined,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_PERIOD_UPDATED",
    metadata: {
      citPeriodId: period.id,
      action: input.action,
      nextStatus,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: period.id,
  });
}

export async function createCitAdjustment(input: {
  workspaceId: number;
  citPeriodId: number;
  actorUserId: number;
  category: CITAdjustmentCategory | null;
  direction: TaxAdjustmentDirection;
  label: string;
  amountMinor: number;
  reason?: string | null;
  note?: string | null;
  sourceReference?: string | null;
}) {
  const period = await prisma.cITPeriod.findFirst({
    where: {
      id: input.citPeriodId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      taxPeriodId: true,
    },
  });

  if (!period) {
    throw new Error("CIT period not found.");
  }

  const label = normalizeOptionalText(input.label);
  if (!label) {
    throw new Error("Adjustment label is required.");
  }

  await prisma.taxAdjustment.create({
    data: {
      workspaceId: input.workspaceId,
      clientBusinessId: period.clientBusinessId,
      taxPeriodId: period.taxPeriodId,
      taxType: "CIT",
      direction: input.direction,
      citCategory: input.category,
      label,
      amountMinor: input.amountMinor,
      reason: normalizeOptionalText(input.reason),
      note: normalizeOptionalText(input.note),
      sourceReference: normalizeOptionalText(input.sourceReference),
      createdByUserId: input.actorUserId,
    },
  });

  await recomputeStoredTaxPeriod(period.taxPeriodId);

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_ADJUSTMENT_CREATED",
    metadata: {
      citPeriodId: period.id,
      direction: input.direction,
      category: input.category,
      amountMinor: input.amountMinor,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: period.id,
  });
}

export async function updateCitAdjustment(input: {
  workspaceId: number;
  adjustmentId: number;
  actorUserId: number;
  category: CITAdjustmentCategory | null;
  direction: TaxAdjustmentDirection;
  label: string;
  amountMinor: number;
  reason?: string | null;
  note?: string | null;
  sourceReference?: string | null;
}) {
  const adjustment = await prisma.taxAdjustment.findFirst({
    where: {
      id: input.adjustmentId,
      workspaceId: input.workspaceId,
      taxType: "CIT",
    },
    select: {
      id: true,
      taxPeriodId: true,
    },
  });

  if (!adjustment) {
    throw new Error("CIT adjustment not found.");
  }

  const citPeriod = await prisma.cITPeriod.findUnique({
    where: {
      taxPeriodId: adjustment.taxPeriodId,
    },
    select: {
      id: true,
    },
  });

  if (!citPeriod) {
    throw new Error("Linked CIT period not found.");
  }

  const label = normalizeOptionalText(input.label);
  if (!label) {
    throw new Error("Adjustment label is required.");
  }

  await prisma.taxAdjustment.update({
    where: {
      id: adjustment.id,
    },
    data: {
      direction: input.direction,
      citCategory: input.category,
      label,
      amountMinor: input.amountMinor,
      reason: normalizeOptionalText(input.reason),
      note: normalizeOptionalText(input.note),
      sourceReference: normalizeOptionalText(input.sourceReference),
    },
  });

  await recomputeStoredTaxPeriod(adjustment.taxPeriodId);

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_ADJUSTMENT_UPDATED",
    metadata: {
      citPeriodId: citPeriod.id,
      adjustmentId: adjustment.id,
      direction: input.direction,
      category: input.category,
      amountMinor: input.amountMinor,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: citPeriod.id,
  });
}

export async function deleteCitAdjustment(input: {
  workspaceId: number;
  adjustmentId: number;
  actorUserId: number;
}) {
  const adjustment = await prisma.taxAdjustment.findFirst({
    where: {
      id: input.adjustmentId,
      workspaceId: input.workspaceId,
      taxType: "CIT",
    },
    select: {
      id: true,
      taxPeriodId: true,
    },
  });

  if (!adjustment) {
    throw new Error("CIT adjustment not found.");
  }

  const citPeriod = await prisma.cITPeriod.findUnique({
    where: {
      taxPeriodId: adjustment.taxPeriodId,
    },
    select: {
      id: true,
    },
  });

  if (!citPeriod) {
    throw new Error("Linked CIT period not found.");
  }

  await prisma.filingEvidence.deleteMany({
    where: {
      taxAdjustmentId: adjustment.id,
      workspaceId: input.workspaceId,
    },
  });

  await prisma.taxAdjustment.delete({
    where: {
      id: adjustment.id,
    },
  });

  await recomputeStoredTaxPeriod(adjustment.taxPeriodId);

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_ADJUSTMENT_DELETED",
    metadata: {
      citPeriodId: citPeriod.id,
      adjustmentId: adjustment.id,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: citPeriod.id,
  });
}

export async function addCitWorkflowEvidence(input: {
  workspaceId: number;
  citPeriodId: number;
  actorUserId: number;
  label: string;
  evidenceKind: FilingEvidenceKind;
  note?: string | null;
  url?: string | null;
  taxAdjustmentId?: number | null;
}) {
  const period = await prisma.cITPeriod.findFirst({
    where: {
      id: input.citPeriodId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      filingDraftId: true,
      taxPeriodId: true,
    },
  });

  if (!period) {
    throw new Error("CIT period not found.");
  }

  const label = normalizeOptionalText(input.label);
  if (!label) {
    throw new Error("Evidence label is required.");
  }

  if (input.taxAdjustmentId) {
    const adjustment = await prisma.taxAdjustment.findFirst({
      where: {
        id: input.taxAdjustmentId,
        workspaceId: input.workspaceId,
        taxPeriodId: period.taxPeriodId,
        taxType: "CIT",
      },
      select: {
        id: true,
      },
    });
    if (!adjustment) {
      throw new Error("Selected CIT adjustment was not found for this period.");
    }
  }

  const evidence = await prisma.filingEvidence.create({
    data: {
      workspaceId: input.workspaceId,
      clientBusinessId: period.clientBusinessId,
      filingDraftId: period.filingDraftId,
      citPeriodId: period.id,
      taxAdjustmentId: input.taxAdjustmentId ?? null,
      label,
      evidenceKind: input.evidenceKind,
      note: normalizeOptionalText(input.note),
      url: normalizeOptionalText(input.url),
      uploadedByUserId: input.actorUserId,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_EVIDENCE_ATTACHED",
    metadata: {
      citPeriodId: period.id,
      evidenceId: evidence.id,
      taxAdjustmentId: input.taxAdjustmentId ?? null,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: period.id,
  });
}

export async function recordCitWorkflowExport(input: {
  workspaceId: number;
  citPeriodId: number;
  actorUserId: number;
  format: string;
}) {
  const period = await prisma.cITPeriod.findFirst({
    where: {
      id: input.citPeriodId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      filingDraftId: true,
    },
  });

  if (!period) {
    throw new Error("CIT period not found.");
  }

  if (period.filingDraftId) {
    await recordTaxFilingExport({
      workspaceId: input.workspaceId,
      filingDraftId: period.filingDraftId,
      actorUserId: input.actorUserId,
      format: input.format,
    });
  }

  await prisma.cITPeriod.update({
    where: {
      id: period.id,
    },
    data: {
      exportedAt: new Date(),
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "CIT_WORKFLOW_EXPORTED",
    metadata: {
      citPeriodId: period.id,
      format: input.format,
    },
  });

  return getCitWorkflowDetail({
    workspaceId: input.workspaceId,
    citPeriodId: period.id,
  });
}

export async function buildCitWorkflowExport(input: {
  workspaceId: number;
  citPeriodId: number;
}) {
  const detail = await getCitWorkflowDetail(input);
  if (!detail) {
    throw new Error("CIT period not found.");
  }

  return {
    json: detail.exportSummary,
    csv: buildCitCsv(detail),
    html: renderCitHtml(detail),
  };
}
