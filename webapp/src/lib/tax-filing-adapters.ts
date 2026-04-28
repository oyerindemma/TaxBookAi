import "server-only";

import type { TaxType } from "@prisma/client";

export type FilingAdapterCode = "TAXPRO_MAX" | "NRS_MBS";
export type FilingAdapterMode = "PREPARE_ONLY";

export type FilingChecklistItem = {
  code: string;
  label: string;
  detail: string;
  required: boolean;
};

export type FilingAdapterPack = {
  draftId: number;
  reference: string | null;
  taxType: TaxType;
  status: string;
  currency: string;
  period: {
    label: string;
    startDate: string;
    endDate: string;
    type: string;
  };
  workspace: {
    name: string;
  };
  business: {
    name: string;
    legalName: string | null;
    tin: string | null;
    vatRegistrationNumber: string | null;
    portalUsernameHint: string | null;
  };
  totals: Record<string, number>;
  scheduleRows: Array<Record<string, unknown>>;
  exceptions: Array<{
    severity: string;
    title: string;
    detail: string;
  }>;
  evidence: Array<{
    label: string;
    evidenceKind: string;
    url: string | null;
    note: string | null;
  }>;
};

export type FilingAdapter = {
  code: FilingAdapterCode;
  label: string;
  portalName: string;
  mode: FilingAdapterMode;
  description: string;
  buildPayload(pack: FilingAdapterPack): Record<string, unknown>;
  buildChecklist(pack: FilingAdapterPack): FilingChecklistItem[];
};

function buildChecklist(pack: FilingAdapterPack, portalName: string): FilingChecklistItem[] {
  return [
    {
      code: "TIN",
      label: "Confirm taxpayer identity",
      detail: pack.business.tin
        ? `Use TIN ${pack.business.tin} when opening ${portalName}.`
        : `Add the client or workspace TIN before preparing the ${portalName} filing.`,
      required: true,
    },
    {
      code: "PERIOD",
      label: "Check filing period",
      detail: `Confirm ${pack.period.label} in ${portalName} matches the TaxBook filing period.`,
      required: true,
    },
    {
      code: "EXCEPTIONS",
      label: "Resolve open exceptions",
      detail:
        pack.exceptions.length > 0
          ? `${pack.exceptions.length} unresolved filing exception(s) still need accountant review.`
          : "No unresolved filing exceptions were detected in this pack.",
      required: pack.exceptions.length > 0,
    },
    {
      code: "EVIDENCE",
      label: "Attach support documents",
      detail:
        pack.evidence.length > 0
          ? `${pack.evidence.length} support document or note item(s) are attached to this filing pack.`
          : "Attach invoices, withholding certificates, or support notes before final submission.",
      required: false,
    },
    {
      code: "SUBMIT",
      label: "Manual submission required",
      detail: `${portalName} remains in prepare-only mode. Export this pack from TaxBook AI and complete submission manually in the government portal.`,
      required: true,
    },
  ];
}

export const taxProMaxAdapter: FilingAdapter = {
  code: "TAXPRO_MAX",
  label: "TaxPro Max",
  portalName: "TaxPro Max",
  mode: "PREPARE_ONLY",
  description:
    "Prepare filing-ready VAT and WHT payloads for manual upload and submission through the FIRS TaxPro Max portal.",
  buildPayload(pack) {
    return {
      provider: "TAXPRO_MAX",
      mode: "PREPARE_ONLY",
      manualSubmissionRequired: true,
      filingDraftId: pack.draftId,
      filingIdentifier: pack.reference,
      taxType: pack.taxType,
      filingStatus: pack.status,
      period: pack.period,
      workspace: pack.workspace,
      taxpayer: {
        businessName: pack.business.name,
        legalName: pack.business.legalName,
        tin: pack.business.tin,
        vatRegistrationNumber: pack.business.vatRegistrationNumber,
        portalUsernameHint: pack.business.portalUsernameHint,
      },
      totals: pack.totals,
      schedules: pack.scheduleRows,
      exceptions: pack.exceptions,
      evidence: pack.evidence,
      notes: [
        "Direct government submission is not implemented in TaxBook AI.",
        "Use this payload to prepare a manual filing in TaxPro Max.",
      ],
    };
  },
  buildChecklist(pack) {
    return buildChecklist(pack, "TaxPro Max");
  },
};

export const nrsMbsAdapter: FilingAdapter = {
  code: "NRS_MBS",
  label: "NRS MBS",
  portalName: "NRS MBS",
  mode: "PREPARE_ONLY",
  description:
    "Placeholder adapter for future prepare-only filing exports where a state or agency workflow needs a structured payload pack.",
  buildPayload(pack) {
    return {
      provider: "NRS_MBS",
      mode: "PREPARE_ONLY",
      manualSubmissionRequired: true,
      filingDraftId: pack.draftId,
      filingIdentifier: pack.reference,
      taxType: pack.taxType,
      filingStatus: pack.status,
      period: pack.period,
      taxpayer: {
        businessName: pack.business.name,
        tin: pack.business.tin,
        portalUsernameHint: pack.business.portalUsernameHint,
      },
      totals: pack.totals,
      schedules: pack.scheduleRows,
      exceptions: pack.exceptions,
      evidence: pack.evidence,
      notes: [
        "This adapter is a prepare-only placeholder.",
        "Complete submission outside TaxBook AI until a supported direct integration exists.",
      ],
    };
  },
  buildChecklist(pack) {
    return buildChecklist(pack, "NRS MBS");
  },
};

const ADAPTERS: Record<FilingAdapterCode, FilingAdapter> = {
  TAXPRO_MAX: taxProMaxAdapter,
  NRS_MBS: nrsMbsAdapter,
};

export function getTaxFilingAdapter(code?: string | null): FilingAdapter {
  if (!code) return ADAPTERS.TAXPRO_MAX;
  const normalized = code.trim().toUpperCase();
  if (normalized === "NRS_MBS") return ADAPTERS.NRS_MBS;
  return ADAPTERS.TAXPRO_MAX;
}

export function listTaxFilingAdapters() {
  return [taxProMaxAdapter, nrsMbsAdapter];
}
