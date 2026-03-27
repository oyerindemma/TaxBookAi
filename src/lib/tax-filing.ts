import "server-only";

import type {
  FilingDraftStatus,
  FilingEvidenceKind,
  SubmissionStatus,
  TaxType,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import {
  buildStoredTaxPeriodState,
  formatCurrency,
  getWorkspaceTaxEngineOverview,
  recomputeStoredTaxPeriod,
} from "@/lib/tax-engine";
import {
  getTaxFilingAdapter,
  listTaxFilingAdapters,
  type FilingAdapterCode,
  type FilingAdapterPack,
  type FilingChecklistItem,
} from "@/lib/tax-filing-adapters";
import { prisma } from "@/lib/prisma";

type FilingCheckSeverity = "BLOCKING" | "WARNING" | "INFO";

export type FilingCheck = {
  code: string;
  severity: FilingCheckSeverity;
  title: string;
  detail: string;
};

export type TaxFilingWorkspaceView = {
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>;
  drafts: Array<{
    id: number;
    taxType: TaxType;
    status: FilingDraftStatus;
    title: string | null;
    reference: string | null;
    clientBusinessName: string | null;
    exceptionCount: number;
    adapterCode: string;
    adapterMode: string;
    submissionReference: string | null;
    reviewedAt: string | null;
    submittedAt: string | null;
    lastExportedAt: string | null;
    itemCount: number;
    evidenceCount: number;
    submissionLogCount: number;
    summaryAmountMinor: number;
    summaryAmountLabel: string;
    checks: FilingCheck[];
  }>;
  adapters: Array<{
    code: string;
    label: string;
    portalName: string;
    mode: string;
    description: string;
  }>;
};

export type TaxFilingDetail = {
  draft: {
    id: number;
    taxType: TaxType;
    status: FilingDraftStatus;
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
  checks: FilingCheck[];
  checklist: FilingChecklistItem[];
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
    status: SubmissionStatus;
    reference: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
  payloadCandidate: Record<string, unknown>;
};

type WorkspaceFilters = {
  workspaceId: number;
  clientBusinessId?: number | null;
  period: Parameters<typeof getWorkspaceTaxEngineOverview>[0]["period"];
};

type DetailInput = {
  workspaceId: number;
  filingDraftId: number;
};

type DraftUpdateAction =
  | "PREPARE_DRAFT"
  | "SAVE_METADATA"
  | "APPROVE_FOR_SUBMISSION"
  | "MARK_SUBMISSION_PENDING"
  | "MARK_SUBMITTED_MANUALLY"
  | "MARK_SUBMITTED"
  | "MARK_FAILED"
  | "CANCEL"
  | "REOPEN_REVIEW";

type DraftActionInput = {
  workspaceId: number;
  filingDraftId: number;
  actorUserId: number;
  action: DraftUpdateAction;
  reviewNote?: string | null;
  portalUsernameHint?: string | null;
  adapterCode?: string | null;
  submissionReference?: string | null;
};

type DraftSeedInput = {
  workspaceId: number;
  actorUserId: number;
  taxType: TaxType;
  period: Parameters<typeof getWorkspaceTaxEngineOverview>[0]["period"];
  clientBusinessId?: number | null;
  reviewNote?: string | null;
  portalUsernameHint?: string | null;
  adapterCode?: string | null;
};

type FilingCoreContext = {
  businessTin: string | null;
  exceptionCount: number;
  evidenceCount: number;
  hasPeriod: boolean;
  itemCount: number;
  totalsConsistent: boolean;
  manualSubmissionRequired: boolean;
  portalName: string;
};

function parsePayload<T>(payload?: string | null): T | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function toPayload(value: unknown) {
  return JSON.stringify(value);
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildChecks(input: FilingCoreContext): FilingCheck[] {
  const checks: FilingCheck[] = [];

  if (!input.businessTin) {
    checks.push({
      code: "MISSING_TIN",
      severity: "BLOCKING",
      title: "Business TIN is missing",
      detail:
        "Add the client business or workspace tax identification number before approving or submitting this filing draft.",
    });
  }

  if (!input.hasPeriod) {
    checks.push({
      code: "MISSING_PERIOD",
      severity: "BLOCKING",
      title: "Filing period is incomplete",
      detail: "This filing draft is missing a valid period window and needs to be regenerated.",
    });
  }

  if (input.itemCount === 0) {
    checks.push({
      code: "EMPTY_PACK",
      severity: "BLOCKING",
      title: "No filing items were generated",
      detail: "TaxBook AI could not find any schedule rows to include in this filing pack.",
    });
  }

  if (!input.totalsConsistent) {
    checks.push({
      code: "INCONSISTENT_TOTALS",
      severity: "BLOCKING",
      title: "Tax totals are inconsistent",
      detail:
        "The filing-item schedule does not match the computed tax totals. Recompute the draft before review.",
    });
  }

  if (input.exceptionCount > 0) {
    checks.push({
      code: "UNRESOLVED_EXCEPTIONS",
      severity: "WARNING",
      title: "Unresolved exceptions remain",
      detail: `${input.exceptionCount} unresolved exception(s) still need accountant review before submission.`,
    });
  }

  if (input.evidenceCount === 0) {
    checks.push({
      code: "MISSING_EVIDENCE",
      severity: "WARNING",
      title: "Supporting evidence is missing",
      detail:
        "Attach invoices, withholding certificates, or support notes before moving this filing through submission.",
    });
  }

  if (input.manualSubmissionRequired) {
    checks.push({
      code: "MANUAL_SUBMISSION_REQUIRED",
      severity: "INFO",
      title: "Manual submission is required",
      detail: `${input.portalName} is in prepare-only mode. Export the pack and submit it manually outside TaxBook AI.`,
    });
  }

  return checks;
}

function getSummarySnapshot(input: {
  taxType: TaxType;
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>;
}): {
  totals: Record<string, number>;
  headlineLabel: string;
  headlineAmountMinor: number;
} {
  if (input.taxType === "VAT") {
    return {
      totals: {
        outputVatMinor: input.overview.totals.outputVatMinor,
        inputVatMinor: input.overview.totals.inputVatMinor,
        netVatMinor: input.overview.totals.netVatMinor,
      },
      headlineLabel: "Net VAT payable / refundable",
      headlineAmountMinor: input.overview.totals.netVatMinor,
    };
  }

  if (input.taxType === "WHT") {
    return {
      totals: {
        whtDeductedMinor: input.overview.totals.whtDeductedMinor,
        whtSufferedMinor: input.overview.totals.whtSufferedMinor,
      },
      headlineLabel: "Net WHT position",
      headlineAmountMinor:
        input.overview.totals.whtSufferedMinor - input.overview.totals.whtDeductedMinor,
    };
  }

  return {
    totals: {
      accountingProfitMinor: input.overview.totals.accountingProfitMinor,
      addBacksMinor: input.overview.totals.addBacksMinor,
      deductionsMinor: input.overview.totals.deductionsMinor,
      taxAdjustedProfitMinor: input.overview.totals.taxAdjustedProfitMinor,
    },
    headlineLabel: "Tax-adjusted profit",
    headlineAmountMinor: input.overview.totals.taxAdjustedProfitMinor,
  };
}

function buildScheduleRows(input: {
  taxType: TaxType;
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>;
  draftItems: Array<{
    id: number;
    status: string;
    note: string | null;
    flagsPayload: string | null;
    vatRecordId: number | null;
    whtRecordId: number | null;
    label: string;
    sourceType: string;
    sourceRecordId: number | null;
    amountMinor: number;
    taxAmountMinor: number | null;
  }>;
}) {
  const vatItemMap = new Map(
    input.draftItems
      .filter((item) => typeof item.vatRecordId === "number")
      .map((item) => [item.vatRecordId as number, item])
  );
  const whtItemMap = new Map(
    input.draftItems
      .filter((item) => typeof item.whtRecordId === "number")
      .map((item) => [item.whtRecordId as number, item])
  );

  if (input.taxType === "VAT") {
    return input.overview.vatRows.map((row) => {
      const item = vatItemMap.get(row.id);
      return {
        recordId: row.id,
        occurredOn: row.occurredOn,
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessName: row.clientBusinessName,
        counterpartyName: row.counterpartyName,
        direction: row.direction,
        vatTreatment: row.vatTreatment,
        taxCategory: row.taxCategory,
        basisAmountMinor: row.basisAmountMinor,
        vatAmountMinor: row.vatAmountMinor,
        totalAmountMinor: row.totalAmountMinor,
        currency: row.currency,
        sourceDocumentNumber: row.sourceDocumentNumber,
        filingItemStatus: item?.status ?? "PENDING",
        filingItemNote: item?.note ?? row.reviewNote,
        flags: item ? parsePayload<string[]>(item.flagsPayload) ?? [] : row.flags,
      };
    });
  }

  if (input.taxType === "WHT") {
    return input.overview.whtRows.map((row) => {
      const item = whtItemMap.get(row.id);
      return {
        recordId: row.id,
        occurredOn: row.occurredOn,
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessName: row.clientBusinessName,
        counterpartyName: row.counterpartyName,
        counterpartyTaxId: row.counterpartyTaxId,
        direction: row.direction,
        whtTreatment: row.whtTreatment,
        taxCategory: row.taxCategory,
        basisAmountMinor: row.basisAmountMinor,
        whtRate: row.whtRate,
        whtAmountMinor: row.whtAmountMinor,
        currency: row.currency,
        sourceDocumentNumber: row.sourceDocumentNumber,
        filingItemStatus: item?.status ?? "PENDING",
        filingItemNote: item?.note ?? row.reviewNote,
        flags: item ? parsePayload<string[]>(item.flagsPayload) ?? [] : row.flags,
      };
    });
  }

  return input.draftItems.map((item) => ({
    label: item.label,
    direction: item.sourceType,
    sourceRecordId: item.sourceRecordId,
    amountMinor: item.amountMinor,
    taxAmountMinor: item.taxAmountMinor,
    status: item.status,
    note: item.note,
    flags: parsePayload<string[]>(item.flagsPayload) ?? [],
  }));
}

function areTotalsConsistent(input: {
  taxType: TaxType;
  scheduleRows: Array<Record<string, unknown>>;
  summaryTotals: Record<string, number>;
}) {
  if (input.taxType === "VAT") {
    const scheduleTotal = input.scheduleRows.reduce(
      (sum, row) => sum + Number(row.vatAmountMinor ?? 0),
      0
    );
    return (
      scheduleTotal ===
      (input.summaryTotals.outputVatMinor ?? 0) + (input.summaryTotals.inputVatMinor ?? 0)
    );
  }

  if (input.taxType === "WHT") {
    const scheduleTotal = input.scheduleRows.reduce(
      (sum, row) => sum + Number(row.whtAmountMinor ?? 0),
      0
    );
    return (
      scheduleTotal ===
      (input.summaryTotals.whtDeductedMinor ?? 0) +
        (input.summaryTotals.whtSufferedMinor ?? 0)
    );
  }

  const adjustedProfit =
    (input.summaryTotals.accountingProfitMinor ?? 0) +
    (input.summaryTotals.addBacksMinor ?? 0) -
    (input.summaryTotals.deductionsMinor ?? 0);
  return adjustedProfit === (input.summaryTotals.taxAdjustedProfitMinor ?? 0);
}

async function appendSubmissionLog(input: {
  workspaceId: number;
  filingDraftId: number;
  actorUserId: number;
  provider?: string | null;
  action: string;
  status?: SubmissionStatus;
  reference?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
}) {
  await prisma.submissionLog.create({
    data: {
      workspaceId: input.workspaceId,
      filingDraftId: input.filingDraftId,
      actorUserId: input.actorUserId,
      provider: input.provider ?? null,
      action: input.action,
      status: input.status ?? "PENDING",
      reference: input.reference ?? null,
      requestPayload:
        typeof input.requestPayload === "undefined" ? null : toPayload(input.requestPayload),
      responsePayload:
        typeof input.responsePayload === "undefined" ? null : toPayload(input.responsePayload),
    },
  });
}

export async function getWorkspaceTaxFilingWorkspace(
  input: WorkspaceFilters
): Promise<TaxFilingWorkspaceView> {
  const overview = await getWorkspaceTaxEngineOverview({
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    period: input.period,
  });

  const drafts = await prisma.filingDraft.findMany({
    where: {
      workspaceId: input.workspaceId,
      taxPeriodId: overview.period.id,
    },
    include: {
      workspace: {
        select: {
          businessProfile: {
            select: {
              businessName: true,
              taxIdentificationNumber: true,
            },
          },
        },
      },
      clientBusiness: {
        select: {
          name: true,
          taxIdentificationNumber: true,
        },
      },
      _count: {
        select: {
          items: true,
          evidence: true,
          submissions: true,
        },
      },
    },
    orderBy: { taxType: "asc" },
  });

  return {
    overview,
    drafts: drafts.map((draft) => {
      const summary = getSummarySnapshot({
        taxType: draft.taxType,
        overview: awaitlessOverviewForTaxType(overview, draft.taxType),
      });
      const adapter = getTaxFilingAdapter(draft.adapterCode);
      const checks = buildChecks({
        businessTin:
          draft.businessTinSnapshot ??
          draft.clientBusiness?.taxIdentificationNumber ??
          draft.workspace.businessProfile?.taxIdentificationNumber ??
          null,
        exceptionCount: draft.exceptionCount,
        evidenceCount: draft._count.evidence,
        hasPeriod: Boolean(overview.period.startDate && overview.period.endDate),
        itemCount: draft._count.items,
        totalsConsistent: true,
        manualSubmissionRequired: adapter.mode === "PREPARE_ONLY",
        portalName: adapter.portalName,
      });

      return {
        id: draft.id,
        taxType: draft.taxType,
        status: draft.status,
        title: draft.title,
        reference: draft.reference,
        clientBusinessName: draft.clientBusiness?.name ?? null,
        exceptionCount: draft.exceptionCount,
        adapterCode: draft.adapterCode,
        adapterMode: draft.adapterMode,
        submissionReference: draft.submissionReference,
        reviewedAt: draft.reviewedAt?.toISOString() ?? null,
        submittedAt: draft.submittedAt?.toISOString() ?? null,
        lastExportedAt: draft.lastExportedAt?.toISOString() ?? null,
        itemCount: draft._count.items,
        evidenceCount: draft._count.evidence,
        submissionLogCount: draft._count.submissions,
        summaryAmountMinor: summary.headlineAmountMinor,
        summaryAmountLabel: summary.headlineLabel,
        checks,
      };
    }),
    adapters: listTaxFilingAdapters().map((adapter) => ({
      code: adapter.code,
      label: adapter.label,
      portalName: adapter.portalName,
      mode: adapter.mode,
      description: adapter.description,
    })),
  };
}

function awaitlessOverviewForTaxType(
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>,
  taxType: TaxType
) {
  return {
    ...overview,
    vatRows: taxType === "VAT" ? overview.vatRows : [],
    whtRows: taxType === "WHT" ? overview.whtRows : [],
    exceptions: overview.exceptions.filter((item) => item.taxType === taxType),
  };
}

export async function getTaxFilingDetail(input: DetailInput): Promise<TaxFilingDetail | null> {
  const draft = await prisma.filingDraft.findFirst({
    where: {
      id: input.filingDraftId,
      workspaceId: input.workspaceId,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          businessProfile: {
            select: {
              businessName: true,
              taxIdentificationNumber: true,
            },
          },
        },
      },
      clientBusiness: {
        select: {
          id: true,
          name: true,
          legalName: true,
          taxIdentificationNumber: true,
          vatRegistrationNumber: true,
        },
      },
      taxPeriod: {
        select: {
          id: true,
          label: true,
          periodType: true,
          startDate: true,
          endDate: true,
          month: true,
          quarter: true,
          year: true,
          currency: true,
        },
      },
      reviewedBy: {
        select: {
          fullName: true,
        },
      },
      items: {
        select: {
          id: true,
          label: true,
          sourceType: true,
          sourceRecordId: true,
          amountMinor: true,
          taxAmountMinor: true,
          status: true,
          flagsPayload: true,
          note: true,
          vatRecordId: true,
          whtRecordId: true,
        },
        orderBy: { createdAt: "asc" },
      },
      submissions: {
        include: {
          actor: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!draft) {
    return null;
  }

  const linkedVatRecordIds = draft.items
    .map((item) => item.vatRecordId)
    .filter((value): value is number => typeof value === "number");
  const linkedWhtRecordIds = draft.items
    .map((item) => item.whtRecordId)
    .filter((value): value is number => typeof value === "number");

  const evidenceRows = await prisma.filingEvidence.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        { filingDraftId: draft.id },
        ...(linkedVatRecordIds.length > 0
          ? [{ vatRecordId: { in: linkedVatRecordIds } }]
          : []),
        ...(linkedWhtRecordIds.length > 0
          ? [{ whtRecordId: { in: linkedWhtRecordIds } }]
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
    },
    orderBy: { createdAt: "desc" },
  });

  const period = buildStoredTaxPeriodState(draft.taxPeriod);
  const overview = await getWorkspaceTaxEngineOverview({
    workspaceId: input.workspaceId,
    clientBusinessId: draft.clientBusinessId,
    period,
    taxType: draft.taxType,
  });

  const summary = getSummarySnapshot({
    taxType: draft.taxType,
    overview,
  });
  const scheduleRows = buildScheduleRows({
    taxType: draft.taxType,
    overview,
    draftItems: draft.items,
  });
  const adapter = getTaxFilingAdapter(draft.adapterCode);
  const allEvidence = Array.from(
    new Map(evidenceRows.map((item) => [item.id, item])).values()
  );
  const checks = buildChecks({
    businessTin:
      draft.businessTinSnapshot ??
      draft.clientBusiness?.taxIdentificationNumber ??
      draft.workspace.businessProfile?.taxIdentificationNumber ??
      null,
    exceptionCount: overview.exceptions.length,
    evidenceCount: allEvidence.length,
    hasPeriod: Boolean(draft.taxPeriod.startDate && draft.taxPeriod.endDate),
    itemCount: draft.items.length,
    totalsConsistent: areTotalsConsistent({
      taxType: draft.taxType,
      scheduleRows,
      summaryTotals: summary.totals,
    }),
    manualSubmissionRequired: adapter.mode === "PREPARE_ONLY",
    portalName: adapter.portalName,
  });
  const pack: FilingAdapterPack = {
    draftId: draft.id,
    reference: draft.reference,
    taxType: draft.taxType,
    status: draft.status,
    currency: draft.taxPeriod.currency,
    period: {
      label: draft.taxPeriod.label,
      startDate: draft.taxPeriod.startDate.toISOString(),
      endDate: draft.taxPeriod.endDate.toISOString(),
      type: draft.taxPeriod.periodType,
    },
    workspace: {
      name: draft.workspace.name,
    },
    business: {
      name:
        draft.clientBusiness?.name ??
        draft.workspace.businessProfile?.businessName ??
        draft.workspace.name,
      legalName: draft.clientBusiness?.legalName ?? null,
      tin:
        draft.businessTinSnapshot ??
        draft.clientBusiness?.taxIdentificationNumber ??
        draft.workspace.businessProfile?.taxIdentificationNumber ??
        null,
      vatRegistrationNumber: draft.clientBusiness?.vatRegistrationNumber ?? null,
      portalUsernameHint: normalizeOptionalText(draft.portalUsernameHint),
    },
    totals: summary.totals,
    scheduleRows,
    exceptions: overview.exceptions.map((item) => ({
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    evidence: allEvidence.map((item) => ({
      label: item.label,
      evidenceKind: item.evidenceKind,
      url: item.url,
      note: item.note,
    })),
  };
  const payloadCandidate = getTaxFilingAdapter(draft.adapterCode).buildPayload(pack);
  const checklist = getTaxFilingAdapter(draft.adapterCode).buildChecklist(pack);

  return {
    draft: {
      id: draft.id,
      taxType: draft.taxType,
      status: draft.status,
      title: draft.title,
      reference: draft.reference,
      reviewNote: draft.reviewNote,
      adapterCode: draft.adapterCode,
      adapterMode: draft.adapterMode,
      businessTinSnapshot:
        draft.businessTinSnapshot ??
        draft.clientBusiness?.taxIdentificationNumber ??
        draft.workspace.businessProfile?.taxIdentificationNumber ??
        null,
      portalUsernameHint: draft.portalUsernameHint,
      submissionReference: draft.submissionReference,
      readyAt: draft.readyAt?.toISOString() ?? null,
      packGeneratedAt: draft.packGeneratedAt?.toISOString() ?? null,
      lastExportedAt: draft.lastExportedAt?.toISOString() ?? null,
      reviewedAt: draft.reviewedAt?.toISOString() ?? null,
      reviewedByName: draft.reviewedBy?.fullName ?? null,
      submittedAt: draft.submittedAt?.toISOString() ?? null,
      exceptionCount: draft.exceptionCount,
    },
    workspace: {
      id: draft.workspace.id,
      name: draft.workspace.name,
      businessName: draft.workspace.businessProfile?.businessName ?? null,
    },
    clientBusiness: {
      id: draft.clientBusiness?.id ?? null,
      name: draft.clientBusiness?.name ?? null,
      legalName: draft.clientBusiness?.legalName ?? null,
      taxIdentificationNumber: draft.clientBusiness?.taxIdentificationNumber ?? null,
      vatRegistrationNumber: draft.clientBusiness?.vatRegistrationNumber ?? null,
    },
    period: {
      id: draft.taxPeriod.id,
      label: draft.taxPeriod.label,
      type: draft.taxPeriod.periodType,
      startDate: draft.taxPeriod.startDate.toISOString(),
      endDate: draft.taxPeriod.endDate.toISOString(),
      currency: draft.taxPeriod.currency,
    },
    summary: {
      currency: draft.taxPeriod.currency,
      totals: summary.totals,
      headlineLabel: summary.headlineLabel,
      headlineAmountMinor: summary.headlineAmountMinor,
      headlineAmountFormatted: formatCurrency(
        summary.headlineAmountMinor,
        draft.taxPeriod.currency
      ),
    },
    checks,
    checklist,
    adapter: {
      code: adapter.code,
      label: adapter.label,
      portalName: adapter.portalName,
      mode: adapter.mode,
      description: adapter.description,
    },
    scheduleRows,
    sourceItems: draft.items.map((item) => ({
      id: item.id,
      label: item.label,
      sourceType: item.sourceType,
      sourceRecordId: item.sourceRecordId,
      amountMinor: item.amountMinor,
      taxAmountMinor: item.taxAmountMinor,
      status: item.status,
      note: item.note,
      flags: parsePayload<string[]>(item.flagsPayload) ?? [],
    })),
    exceptions: overview.exceptions.map((item) => ({
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      reviewed: item.reviewed,
    })),
    evidence: allEvidence.map((item) => ({
      id: item.id,
      label: item.label,
      evidenceKind: item.evidenceKind,
      note: item.note,
      url: item.url,
      uploadedByName: item.uploadedBy?.fullName ?? item.uploadedBy?.email ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    submissionLogs: draft.submissions.map((item) => ({
      id: item.id,
      provider: item.provider,
      action: item.action,
      status: item.status,
      reference: item.reference,
      actorName: item.actor?.fullName ?? item.actor?.email ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    payloadCandidate,
  };
}

async function persistDraftPackSnapshot(input: {
  workspaceId: number;
  filingDraftId: number;
  adapterCode: FilingAdapterCode;
  reviewNote?: string | null;
  portalUsernameHint?: string | null;
}) {
  const detail = await getTaxFilingDetail({
    workspaceId: input.workspaceId,
    filingDraftId: input.filingDraftId,
  });

  if (!detail) {
    throw new Error("Filing draft not found");
  }

  const adapter = getTaxFilingAdapter(input.adapterCode);
  const payloadCandidate = adapter.buildPayload({
    draftId: detail.draft.id,
    reference: detail.draft.reference,
    taxType: detail.draft.taxType,
    status: detail.draft.status,
    currency: detail.period.currency,
    period: {
      label: detail.period.label,
      startDate: detail.period.startDate,
      endDate: detail.period.endDate,
      type: detail.period.type,
    },
    workspace: {
      name: detail.workspace.name,
    },
    business: {
      name: detail.clientBusiness.name ?? detail.workspace.businessName ?? detail.workspace.name,
      legalName: detail.clientBusiness.legalName,
      tin: detail.draft.businessTinSnapshot,
      vatRegistrationNumber: detail.clientBusiness.vatRegistrationNumber,
      portalUsernameHint:
        normalizeOptionalText(input.portalUsernameHint) ??
        normalizeOptionalText(detail.draft.portalUsernameHint),
    },
    totals: detail.summary.totals,
    scheduleRows: detail.scheduleRows,
    exceptions: detail.exceptions.map((item) => ({
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    evidence: detail.evidence.map((item) => ({
      label: item.label,
      evidenceKind: item.evidenceKind,
      url: item.url,
      note: item.note,
    })),
  });
  const checklist = adapter.buildChecklist({
    draftId: detail.draft.id,
    reference: detail.draft.reference,
    taxType: detail.draft.taxType,
    status: detail.draft.status,
    currency: detail.period.currency,
    period: {
      label: detail.period.label,
      startDate: detail.period.startDate,
      endDate: detail.period.endDate,
      type: detail.period.type,
    },
    workspace: {
      name: detail.workspace.name,
    },
    business: {
      name: detail.clientBusiness.name ?? detail.workspace.businessName ?? detail.workspace.name,
      legalName: detail.clientBusiness.legalName,
      tin: detail.draft.businessTinSnapshot,
      vatRegistrationNumber: detail.clientBusiness.vatRegistrationNumber,
      portalUsernameHint:
        normalizeOptionalText(input.portalUsernameHint) ??
        normalizeOptionalText(detail.draft.portalUsernameHint),
    },
    totals: detail.summary.totals,
    scheduleRows: detail.scheduleRows,
    exceptions: detail.exceptions.map((item) => ({
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    evidence: detail.evidence.map((item) => ({
      label: item.label,
      evidenceKind: item.evidenceKind,
      url: item.url,
      note: item.note,
    })),
  });

  return {
    detail,
    adapter,
    payloadCandidate,
    checklist,
    businessTinSnapshot: detail.draft.businessTinSnapshot,
    reviewNote:
      normalizeOptionalText(input.reviewNote) ?? normalizeOptionalText(detail.draft.reviewNote),
    portalUsernameHint:
      normalizeOptionalText(input.portalUsernameHint) ??
      normalizeOptionalText(detail.draft.portalUsernameHint),
  };
}

function requireNoBlockingChecks(checks: FilingCheck[]) {
  const blocking = checks.filter((item) => item.severity === "BLOCKING");
  if (blocking.length > 0) {
    const error = new Error(blocking.map((item) => item.title).join("; "));
    error.name = "FilingCheckError";
    throw error;
  }
}

export async function prepareTaxFilingDraft(input: DraftSeedInput) {
  const overview = await getWorkspaceTaxEngineOverview({
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    period: input.period,
  });
  const draft = overview.filings.find((item) => item.taxType === input.taxType);

  if (!draft) {
    throw new Error("Filing draft could not be generated for the selected scope.");
  }

  return updateTaxFilingDraft({
    workspaceId: input.workspaceId,
    filingDraftId: draft.id,
    actorUserId: input.actorUserId,
    action: "PREPARE_DRAFT",
    reviewNote: input.reviewNote,
    portalUsernameHint: input.portalUsernameHint,
    adapterCode: input.adapterCode,
  });
}

export async function updateTaxFilingDraft(input: DraftActionInput) {
  const existingDraft = await prisma.filingDraft.findFirst({
    where: {
      id: input.filingDraftId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      taxPeriodId: true,
      taxType: true,
      adapterCode: true,
      status: true,
    },
  });

  if (!existingDraft) {
    throw new Error("Filing draft not found.");
  }

  await recomputeStoredTaxPeriod(existingDraft.taxPeriodId);

  const adapterCode = (normalizeOptionalText(input.adapterCode) ??
    existingDraft.adapterCode) as FilingAdapterCode;
  const snapshot = await persistDraftPackSnapshot({
    workspaceId: input.workspaceId,
    filingDraftId: existingDraft.id,
    adapterCode,
    reviewNote: input.reviewNote,
    portalUsernameHint: input.portalUsernameHint,
  });
  const nextStatusByAction: Record<DraftUpdateAction, FilingDraftStatus> = {
    PREPARE_DRAFT: snapshot.detail.sourceItems.length > 0 ? "READY_FOR_REVIEW" : "DRAFT",
    SAVE_METADATA: snapshot.detail.draft.status,
    APPROVE_FOR_SUBMISSION: "APPROVED_FOR_SUBMISSION",
    MARK_SUBMISSION_PENDING: "SUBMISSION_PENDING",
    MARK_SUBMITTED_MANUALLY: "SUBMITTED_MANUALLY",
    MARK_SUBMITTED: "SUBMITTED",
    MARK_FAILED: "FAILED",
    CANCEL: "CANCELLED",
    REOPEN_REVIEW: snapshot.detail.sourceItems.length > 0 ? "READY_FOR_REVIEW" : "DRAFT",
  };

  if (
    input.action === "APPROVE_FOR_SUBMISSION" ||
    input.action === "MARK_SUBMISSION_PENDING" ||
    input.action === "MARK_SUBMITTED_MANUALLY" ||
    input.action === "MARK_SUBMITTED"
  ) {
    requireNoBlockingChecks(snapshot.detail.checks);
  }

  const nextStatus = nextStatusByAction[input.action];
  const now = new Date();
  const nextPayloadCandidate = {
    ...snapshot.payloadCandidate,
    filingStatus: nextStatus,
  };

  await prisma.$transaction(async (tx) => {
    await tx.filingDraft.update({
      where: { id: existingDraft.id },
      data: {
        status: nextStatus,
        reviewNote: snapshot.reviewNote,
        adapterCode,
        adapterMode: snapshot.adapter.mode,
        businessTinSnapshot: snapshot.businessTinSnapshot,
        portalUsernameHint: snapshot.portalUsernameHint,
        submissionReference:
          input.action === "MARK_SUBMITTED_MANUALLY" || input.action === "MARK_SUBMITTED"
            ? normalizeOptionalText(input.submissionReference)
            : existingDraft.status === nextStatus
              ? undefined
              : null,
        payloadCandidate: toPayload(nextPayloadCandidate),
        checklistPayload: toPayload(snapshot.checklist),
        packGeneratedAt: now,
        reviewedAt:
          input.action === "APPROVE_FOR_SUBMISSION"
            ? now
            : input.action === "REOPEN_REVIEW"
              ? null
              : undefined,
        reviewedByUserId:
          input.action === "APPROVE_FOR_SUBMISSION"
            ? input.actorUserId
            : input.action === "REOPEN_REVIEW"
              ? null
              : undefined,
        submittedAt:
          input.action === "MARK_SUBMITTED_MANUALLY" || input.action === "MARK_SUBMITTED"
            ? now
            : input.action === "REOPEN_REVIEW"
              ? null
              : undefined,
      },
    });

    await tx.submissionLog.create({
      data: {
        workspaceId: input.workspaceId,
        filingDraftId: existingDraft.id,
        actorUserId: input.actorUserId,
        provider: adapterCode,
        action: input.action,
        status:
          input.action === "MARK_FAILED"
            ? "FAILED"
            : input.action === "CANCEL"
              ? "CANCELLED"
              : input.action === "MARK_SUBMITTED_MANUALLY" ||
                  input.action === "MARK_SUBMITTED"
                ? "ACCEPTED"
                : "PENDING",
        reference: normalizeOptionalText(input.submissionReference),
        requestPayload: toPayload({
          action: input.action,
          checks: snapshot.detail.checks,
        }),
        responsePayload: toPayload({
          nextStatus,
          payloadCandidate: nextPayloadCandidate,
        }),
      },
    });
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "TAX_FILING_DRAFT_UPDATED",
    metadata: {
      filingDraftId: existingDraft.id,
      taxType: existingDraft.taxType,
      nextStatus,
      adapterCode,
      submissionReference: normalizeOptionalText(input.submissionReference),
    },
  });

  return getTaxFilingDetail({
    workspaceId: input.workspaceId,
    filingDraftId: existingDraft.id,
  });
}

export async function addTaxFilingEvidence(input: {
  workspaceId: number;
  filingDraftId: number;
  actorUserId: number;
  label: string;
  note?: string | null;
  url?: string | null;
  evidenceKind?: FilingEvidenceKind;
}) {
  const draft = await prisma.filingDraft.findFirst({
    where: {
      id: input.filingDraftId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      taxType: true,
    },
  });

  if (!draft) {
    throw new Error("Filing draft not found.");
  }

  const label = normalizeOptionalText(input.label);
  if (!label) {
    throw new Error("Evidence label is required.");
  }

  const evidence = await prisma.filingEvidence.create({
    data: {
      workspaceId: input.workspaceId,
      clientBusinessId: draft.clientBusinessId,
      filingDraftId: draft.id,
      label,
      note: normalizeOptionalText(input.note),
      url: normalizeOptionalText(input.url),
      evidenceKind: input.evidenceKind ?? "OTHER",
      uploadedByUserId: input.actorUserId,
    },
  });

  await appendSubmissionLog({
    workspaceId: input.workspaceId,
    filingDraftId: draft.id,
    actorUserId: input.actorUserId,
    action: "EVIDENCE_ATTACHED",
    requestPayload: {
      evidenceId: evidence.id,
      evidenceKind: evidence.evidenceKind,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "TAX_FILING_EVIDENCE_ATTACHED",
    metadata: {
      filingDraftId: draft.id,
      evidenceId: evidence.id,
      taxType: draft.taxType,
    },
  });

  return getTaxFilingDetail({
    workspaceId: input.workspaceId,
    filingDraftId: draft.id,
  });
}

export async function recordTaxFilingExport(input: {
  workspaceId: number;
  filingDraftId: number;
  actorUserId: number;
  format: string;
}) {
  const draft = await prisma.filingDraft.findFirst({
    where: {
      id: input.filingDraftId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      adapterCode: true,
      taxType: true,
    },
  });

  if (!draft) {
    throw new Error("Filing draft not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.filingDraft.update({
      where: { id: draft.id },
      data: {
        lastExportedAt: new Date(),
      },
    });

    await tx.submissionLog.create({
      data: {
        workspaceId: input.workspaceId,
        filingDraftId: draft.id,
        actorUserId: input.actorUserId,
        provider: draft.adapterCode,
        action: "EXPORTED",
        status: "PENDING",
        reference: input.format,
        requestPayload: toPayload({
          format: input.format,
        }),
      },
    });
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "TAX_FILING_EXPORTED",
    metadata: {
      filingDraftId: draft.id,
      taxType: draft.taxType,
      format: input.format,
    },
  });
}
