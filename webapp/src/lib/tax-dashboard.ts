import "server-only";

import { buildStoredTaxPeriodState, buildTaxEngineExportQuery } from "@/lib/tax-engine";
import { prisma } from "@/lib/prisma";

function safeJsonParse<T>(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getOccurredOn(input: {
  invoiceDate?: Date | null;
  ledgerDate?: Date | null;
  draftProposedDate?: Date | null;
  draftApprovedAt?: Date | null;
  draftCreatedAt?: Date | null;
  taxRecordOccurredOn?: Date | null;
}) {
  return (
    input.invoiceDate ??
    input.ledgerDate ??
    input.draftProposedDate ??
    input.draftApprovedAt ??
    input.draftCreatedAt ??
    input.taxRecordOccurredOn ??
    null
  );
}

function getPeriodQueryString(period: {
  label: string;
  periodType: string;
  startDate: Date;
  endDate: Date;
  month: number | null;
  quarter: number | null;
  year: number;
  clientBusinessId: number | null;
}) {
  return buildTaxEngineExportQuery({
    period: buildStoredTaxPeriodState(period),
    clientBusinessId: period.clientBusinessId,
  });
}

function mapPeriodSummary(
  period: Awaited<ReturnType<typeof loadRecentPeriods>>[number]
) {
  const vat = period.computations.find((item) => item.taxType === "VAT");
  const wht = period.computations.find((item) => item.taxType === "WHT");
  const lastComputedAt = [vat?.computedAt, wht?.computedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return {
    id: period.id,
    label: period.label,
    periodKey: period.periodKey,
    periodType: period.periodType,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    currency: period.currency,
    status: period.status,
    clientBusinessId: period.clientBusinessId,
    clientBusinessName: period.clientBusiness?.name ?? "Workspace-level",
    vat: {
      status: vat?.status ?? "DRAFT",
      sourceCount: vat?.sourceCount ?? 0,
      exceptionCount: vat?.exceptionCount ?? 0,
      outputVatMinor: vat?.outputVatMinor ?? 0,
      inputVatMinor: vat?.inputVatMinor ?? 0,
      netVatMinor: vat?.netVatMinor ?? 0,
      computedAt: vat?.computedAt.toISOString() ?? null,
      rulesVersion: vat?.rulesVersion ?? null,
    },
    wht: {
      status: wht?.status ?? "DRAFT",
      sourceCount: wht?.sourceCount ?? 0,
      exceptionCount: wht?.exceptionCount ?? 0,
      whtDeductedMinor: wht?.whtDeductedMinor ?? 0,
      whtSufferedMinor: wht?.whtSufferedMinor ?? 0,
      computedAt: wht?.computedAt.toISOString() ?? null,
      rulesVersion: wht?.rulesVersion ?? null,
    },
    exceptionCount: (vat?.exceptionCount ?? 0) + (wht?.exceptionCount ?? 0),
    lastComputedAt: lastComputedAt?.toISOString() ?? null,
    queryString: getPeriodQueryString({
      label: period.label,
      periodType: period.periodType,
      startDate: period.startDate,
      endDate: period.endDate,
      month: period.month,
      quarter: period.quarter,
      year: period.year,
      clientBusinessId: period.clientBusinessId,
    }),
  };
}

async function loadRecentPeriods(workspaceId: number) {
  return prisma.taxPeriod.findMany({
    where: {
      workspaceId,
    },
    include: {
      clientBusiness: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
        },
      },
      computations: {
        where: {
          taxType: {
            in: ["VAT", "WHT"],
          },
        },
        select: {
          id: true,
          taxType: true,
          status: true,
          sourceCount: true,
          exceptionCount: true,
          outputVatMinor: true,
          inputVatMinor: true,
          netVatMinor: true,
          whtDeductedMinor: true,
          whtSufferedMinor: true,
          rulesVersion: true,
          computedAt: true,
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: 18,
  });
}

export async function getWorkspaceTaxDashboardSnapshot(workspaceId: number) {
  const [clientBusinesses, periodsRaw] = await Promise.all([
    prisma.clientBusiness.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    loadRecentPeriods(workspaceId),
  ]);

  const recentPeriods = periodsRaw.map((period) => mapPeriodSummary(period));
  const openPeriods = recentPeriods.filter((period) =>
    ["OPEN", "IN_REVIEW", "READY"].includes(period.status)
  );
  const focusPeriods = openPeriods.length > 0 ? openPeriods : recentPeriods.slice(0, 1);
  const currency = focusPeriods[0]?.currency ?? clientBusinesses[0]?.defaultCurrency ?? "NGN";

  return {
    currency,
    clientBusinesses,
    openPeriods,
    recentPeriods,
    totalsScopeLabel: openPeriods.length > 0 ? "Open periods" : "Most recent period",
    totals: focusPeriods.reduce(
      (totals, period) => ({
        outputVatMinor: totals.outputVatMinor + period.vat.outputVatMinor,
        inputVatMinor: totals.inputVatMinor + period.vat.inputVatMinor,
        netVatMinor: totals.netVatMinor + period.vat.netVatMinor,
        whtDeductedMinor: totals.whtDeductedMinor + period.wht.whtDeductedMinor,
        whtSufferedMinor: totals.whtSufferedMinor + period.wht.whtSufferedMinor,
        periodCount: totals.periodCount + 1,
      }),
      {
        outputVatMinor: 0,
        inputVatMinor: 0,
        netVatMinor: 0,
        whtDeductedMinor: 0,
        whtSufferedMinor: 0,
        periodCount: 0,
      }
    ),
  };
}

export async function getWorkspaceTaxPeriodDetail(workspaceId: number, periodId: number) {
  const period = await prisma.taxPeriod.findFirst({
    where: {
      id: periodId,
      workspaceId,
    },
    include: {
      clientBusiness: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
        },
      },
      reviewedBy: {
        select: {
          fullName: true,
          email: true,
        },
      },
      computations: {
        orderBy: {
          taxType: "asc",
        },
      },
      adjustments: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          taxType: true,
          direction: true,
          label: true,
          amountMinor: true,
          reason: true,
          note: true,
          sourceReference: true,
          createdAt: true,
        },
      },
      filingDrafts: {
        select: {
          id: true,
          taxType: true,
          status: true,
          reference: true,
          exceptionCount: true,
          readyAt: true,
          submittedAt: true,
        },
        orderBy: {
          taxType: "asc",
        },
      },
      vatRecords: {
        include: {
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
          invoice: {
            select: {
              issueDate: true,
            },
          },
          ledgerTransaction: {
            select: {
              transactionDate: true,
            },
          },
          bookkeepingDraft: {
            select: {
              proposedDate: true,
              approvedAt: true,
              createdAt: true,
            },
          },
          taxRecord: {
            select: {
              occurredOn: true,
            },
          },
          evidence: {
            select: {
              id: true,
            },
          },
          reviewedBy: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: [{ direction: "asc" }, { createdAt: "desc" }],
      },
      whtRecords: {
        include: {
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
          invoice: {
            select: {
              issueDate: true,
            },
          },
          ledgerTransaction: {
            select: {
              transactionDate: true,
            },
          },
          bookkeepingDraft: {
            select: {
              proposedDate: true,
              approvedAt: true,
              createdAt: true,
            },
          },
          taxRecord: {
            select: {
              occurredOn: true,
            },
          },
          evidence: {
            select: {
              id: true,
            },
          },
          reviewedBy: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: [{ direction: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!period) return null;

  const vatComputation = period.computations.find((item) => item.taxType === "VAT") ?? null;
  const whtComputation = period.computations.find((item) => item.taxType === "WHT") ?? null;
  const rulesVersion =
    vatComputation?.rulesVersion ?? whtComputation?.rulesVersion ?? null;
  const computedAt = [vatComputation?.computedAt, whtComputation?.computedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const vatRows = period.vatRecords.map((row) => ({
    id: row.id,
    occurredOn:
      getOccurredOn({
        invoiceDate: row.invoice?.issueDate,
        ledgerDate: row.ledgerTransaction?.transactionDate,
        draftProposedDate: row.bookkeepingDraft?.proposedDate,
        draftApprovedAt: row.bookkeepingDraft?.approvedAt,
        draftCreatedAt: row.bookkeepingDraft?.createdAt,
        taxRecordOccurredOn: row.taxRecord?.occurredOn,
      })?.toISOString() ?? null,
    sourceType: row.sourceType,
    sourceRecordId: row.sourceRecordId,
    clientBusinessName: row.clientBusiness?.name ?? period.clientBusiness?.name ?? "Workspace-level",
    sourceDocumentNumber: row.sourceDocumentNumber,
    counterpartyName: row.counterpartyName,
    taxCategory: row.taxCategory,
    direction: row.direction,
    vatTreatment: row.vatTreatment,
    basisAmountMinor: row.basisAmountMinor,
    vatAmountMinor: row.vatAmountMinor,
    totalAmountMinor: row.totalAmountMinor,
    currency: row.currency,
    confidence: row.confidence,
    reviewed: row.reviewed,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy?.fullName ?? null,
    reviewNote: row.reviewNote,
    evidenceCount: row.evidence.length,
    flags: safeJsonParse<string[]>(row.flagsPayload) ?? [],
  }));

  const whtRows = period.whtRecords.map((row) => ({
    id: row.id,
    occurredOn:
      getOccurredOn({
        invoiceDate: row.invoice?.issueDate,
        ledgerDate: row.ledgerTransaction?.transactionDate,
        draftProposedDate: row.bookkeepingDraft?.proposedDate,
        draftApprovedAt: row.bookkeepingDraft?.approvedAt,
        draftCreatedAt: row.bookkeepingDraft?.createdAt,
        taxRecordOccurredOn: row.taxRecord?.occurredOn,
      })?.toISOString() ?? null,
    sourceType: row.sourceType,
    sourceRecordId: row.sourceRecordId,
    clientBusinessName: row.clientBusiness?.name ?? period.clientBusiness?.name ?? "Workspace-level",
    sourceDocumentNumber: row.sourceDocumentNumber,
    counterpartyName: row.counterpartyName,
    counterpartyTaxId: row.counterpartyTaxId,
    taxCategory: row.taxCategory,
    direction: row.direction,
    whtTreatment: row.whtTreatment,
    basisAmountMinor: row.basisAmountMinor,
    whtRate: row.whtRate,
    whtAmountMinor: row.whtAmountMinor,
    currency: row.currency,
    confidence: row.confidence,
    reviewed: row.reviewed,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy?.fullName ?? null,
    reviewNote: row.reviewNote,
    evidenceCount: row.evidence.length,
    flags: safeJsonParse<string[]>(row.flagsPayload) ?? [],
  }));

  return {
    period: {
      id: period.id,
      label: period.label,
      periodKey: period.periodKey,
      periodType: period.periodType,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      currency: period.currency,
      status: period.status,
      year: period.year,
      month: period.month,
      quarter: period.quarter,
      notes: period.notes,
      reviewedAt: period.reviewedAt?.toISOString() ?? null,
      reviewedByName: period.reviewedBy?.fullName ?? null,
      reviewedByEmail: period.reviewedBy?.email ?? null,
      queryString: getPeriodQueryString({
        label: period.label,
        periodType: period.periodType,
        startDate: period.startDate,
        endDate: period.endDate,
        month: period.month,
        quarter: period.quarter,
        year: period.year,
        clientBusinessId: period.clientBusinessId,
      }),
    },
    clientBusiness: period.clientBusiness
      ? {
          id: period.clientBusiness.id,
          name: period.clientBusiness.name,
          defaultCurrency: period.clientBusiness.defaultCurrency,
        }
      : null,
    rulesVersion,
    computedAt: computedAt?.toISOString() ?? null,
    vatComputation: vatComputation
      ? {
          status: vatComputation.status,
          sourceCount: vatComputation.sourceCount,
          exceptionCount: vatComputation.exceptionCount,
          outputVatMinor: vatComputation.outputVatMinor,
          inputVatMinor: vatComputation.inputVatMinor,
          netVatMinor: vatComputation.netVatMinor,
          computedAt: vatComputation.computedAt.toISOString(),
        }
      : null,
    whtComputation: whtComputation
      ? {
          status: whtComputation.status,
          sourceCount: whtComputation.sourceCount,
          exceptionCount: whtComputation.exceptionCount,
          whtDeductedMinor: whtComputation.whtDeductedMinor,
          whtSufferedMinor: whtComputation.whtSufferedMinor,
          computedAt: whtComputation.computedAt.toISOString(),
        }
      : null,
    adjustments: period.adjustments.map((adjustment) => ({
      id: adjustment.id,
      taxType: adjustment.taxType,
      direction: adjustment.direction,
      label: adjustment.label,
      amountMinor: adjustment.amountMinor,
      reason: adjustment.reason,
      note: adjustment.note,
      sourceReference: adjustment.sourceReference,
      createdAt: adjustment.createdAt.toISOString(),
    })),
    filingDrafts: period.filingDrafts.map((draft) => ({
      id: draft.id,
      taxType: draft.taxType,
      status: draft.status,
      reference: draft.reference,
      exceptionCount: draft.exceptionCount,
      readyAt: draft.readyAt?.toISOString() ?? null,
      submittedAt: draft.submittedAt?.toISOString() ?? null,
    })),
    vatRows,
    whtRows,
    totals: {
      outputVatMinor: vatComputation?.outputVatMinor ?? 0,
      inputVatMinor: vatComputation?.inputVatMinor ?? 0,
      netVatMinor: vatComputation?.netVatMinor ?? 0,
      whtDeductedMinor: whtComputation?.whtDeductedMinor ?? 0,
      whtSufferedMinor: whtComputation?.whtSufferedMinor ?? 0,
      exceptionCount:
        (vatComputation?.exceptionCount ?? 0) + (whtComputation?.exceptionCount ?? 0),
    },
  };
}
