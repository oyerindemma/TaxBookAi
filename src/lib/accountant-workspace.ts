import "server-only";

import type { Prisma, WorkspaceRole } from "@prisma/client";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import {
  getDefaultTransactionTaxDateRange,
  resolveBankTransactionTax,
} from "@/lib/transaction-tax";
import {
  getAccountantWorkspaceAccess,
  resolveAccountantWorkspaceKind,
  type AccountantWorkspacePortfolioResponse,
  type ClientBusinessPortfolioSummary,
  type ClientBusinessPortfolioTaxSummary,
  type ClientBusinessReviewStatusBreakdown,
  type ClientPortfolioActivityType,
} from "@/lib/accountant-workspace-types";

const clientBusinessPortfolioSelect = {
  id: true,
  name: true,
  legalName: true,
  industry: true,
  country: true,
  state: true,
  taxIdentificationNumber: true,
  vatRegistrationNumber: true,
  defaultCurrency: true,
  fiscalYearStartMonth: true,
  status: true,
  archivedAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      vendors: true,
      categories: true,
      transactions: true,
      bookkeepingUploads: true,
      bankTransactions: true,
    },
  },
} satisfies Prisma.ClientBusinessSelect;

const taxExposureTransactionSelect = {
  clientBusinessId: true,
  amount: true,
  currency: true,
  description: true,
  reference: true,
  vatTreatment: true,
  whtTreatment: true,
  vatRate: true,
  whtRate: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  taxTreatmentSource: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
} satisfies Prisma.BankTransactionSelect;

type TaxExposureTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof taxExposureTransactionSelect;
}>;

type ReviewStatusAggregateRow = {
  clientBusinessId: number;
  reviewStatus: "IMPORTED" | "PENDING_REVIEW" | "REVIEWED" | "POSTED" | "FLAGGED";
  count: number;
};

const ACCOUNTANT_PORTFOLIO_SCHEMA_TABLES = [
  "Workspace",
  "ClientBusiness",
  "Vendor",
  "TransactionCategory",
  "LedgerTransaction",
  "BankTransaction",
  "BookkeepingUpload",
] as const;
const ACCOUNTANT_PORTFOLIO_SCHEMA_COLUMNS = [
  "Workspace.",
  "ClientBusiness.",
  "BankTransaction.",
  "BookkeepingUpload.",
] as const;
const ACCOUNTANT_PORTFOLIO_REVIEW_COUNT_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.clientBusinessId",
    "BankTransaction.reviewStatus",
  ],
} as const;
const ACCOUNTANT_PORTFOLIO_TAX_EXPOSURE_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.clientBusinessId",
    "BankTransaction.vatTreatment",
    "BankTransaction.whtTreatment",
    "BankTransaction.vatRate",
    "BankTransaction.whtRate",
    "BankTransaction.vatAmountMinor",
    "BankTransaction.whtAmountMinor",
    "BankTransaction.taxTreatmentSource",
    "BankTransaction.suggestedVatTreatment",
    "BankTransaction.suggestedWhtTreatment",
  ],
} as const;

function isAccountantPortfolioSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...ACCOUNTANT_PORTFOLIO_SCHEMA_TABLES],
    columns: [...ACCOUNTANT_PORTFOLIO_SCHEMA_COLUMNS],
  });
}

function buildEmptyWorkspacePortfolioResponse(input: {
  workspaceId: number;
  workspaceName: string;
  role: WorkspaceRole;
  taxExposureDateLabel: string;
}): AccountantWorkspacePortfolioResponse {
  return {
    workspace: {
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
      workspaceKind: resolveAccountantWorkspaceKind(0),
      clientBusinessCount: 0,
      activeClientBusinessCount: 0,
      archivedClientBusinessCount: 0,
      transactionCount: 0,
      reviewQueueCount: 0,
      estimatedTaxExposureMinor: 0,
      currency: "NGN",
      taxExposureDateLabel: input.taxExposureDateLabel,
      lastActivityAt: null,
      filingReadinessStatus: null,
      openAlertCount: 0,
    },
    access: getAccountantWorkspaceAccess(input.role),
    clientBusinesses: [],
  };
}

async function runAccountantPortfolioQuerySafely<T>(input: {
  workspaceId: number;
  label: string;
  query: Promise<T>;
  fallback: () => T;
  support?: {
    tables?: readonly string[];
    columns?: readonly string[];
  };
}) {
  if (input.support && !(await hasPrismaDatabaseSupport(input.support))) {
    return input.fallback();
  }

  try {
    return await input.query;
  } catch (error) {
    logError(
      "accountant-workspace",
      `Accountant portfolio ${input.label} failed; using an empty fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isAccountantPortfolioSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function getPortfolioDateLabel(now = new Date()) {
  return now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function pickLatestDate(
  ...values: Array<Date | string | null | undefined>
) {
  let latest: Date | null = null;

  for (const value of values) {
    if (!value) continue;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }

  return latest;
}

function resolveActivityType(input: {
  businessUpdatedAt: Date;
  transactionUpdatedAt?: Date | null;
  uploadUpdatedAt?: Date | null;
}): ClientPortfolioActivityType {
  const latest = pickLatestDate(
    input.businessUpdatedAt,
    input.transactionUpdatedAt,
    input.uploadUpdatedAt
  );

  if (!latest) return "CLIENT_PROFILE";
  if (input.transactionUpdatedAt && latest.getTime() === input.transactionUpdatedAt.getTime()) {
    return "TRANSACTION";
  }
  if (input.uploadUpdatedAt && latest.getTime() === input.uploadUpdatedAt.getTime()) {
    return "UPLOAD";
  }

  return "CLIENT_PROFILE";
}

function buildEmptyReviewStatusBreakdown(): ClientBusinessReviewStatusBreakdown {
  return {
    importedCount: 0,
    pendingReviewCount: 0,
    reviewedCount: 0,
    postedCount: 0,
    flaggedCount: 0,
  };
}

function buildReviewStatusBreakdownMap(rows: ReviewStatusAggregateRow[]) {
  const countsByBusiness = new Map<number, ClientBusinessReviewStatusBreakdown>();

  for (const row of rows) {
    const counts =
      countsByBusiness.get(row.clientBusinessId) ?? buildEmptyReviewStatusBreakdown();

    switch (row.reviewStatus) {
      case "IMPORTED":
        counts.importedCount += row.count;
        break;
      case "PENDING_REVIEW":
        counts.pendingReviewCount += row.count;
        break;
      case "REVIEWED":
        counts.reviewedCount += row.count;
        break;
      case "POSTED":
        counts.postedCount += row.count;
        break;
      case "FLAGGED":
        counts.flaggedCount += row.count;
        break;
    }

    countsByBusiness.set(row.clientBusinessId, counts);
  }

  return countsByBusiness;
}

function buildTaxExposureMap(
  records: TaxExposureTransactionRecord[],
  defaultCurrencyByBusiness: Map<number, string>,
  dateLabel: string
) {
  const summaries = new Map<
    number,
    {
      outputVatMinor: number;
      inputVatMinor: number;
      whtPayableMinor: number;
      whtReceivableMinor: number;
      currencies: Set<string>;
    }
  >();

  for (const record of records) {
    if (!record.clientBusinessId) continue;

    const bucket = summaries.get(record.clientBusinessId) ?? {
      outputVatMinor: 0,
      inputVatMinor: 0,
      whtPayableMinor: 0,
      whtReceivableMinor: 0,
      currencies: new Set<string>(),
    };

    bucket.currencies.add(record.currency);

    const tax = resolveBankTransactionTax({
      amountMinor: record.amount,
      description: record.description,
      reference: record.reference,
      vatTreatment: record.vatTreatment,
      whtTreatment: record.whtTreatment,
      vatRate: record.vatRate,
      whtRate: record.whtRate,
      vatAmountMinor: record.vatAmountMinor,
      whtAmountMinor: record.whtAmountMinor,
      taxTreatmentSource: record.taxTreatmentSource,
      suggestedVatTreatment: record.suggestedVatTreatment,
      suggestedWhtTreatment: record.suggestedWhtTreatment,
    });

    if (tax.vatTreatment === "OUTPUT") {
      bucket.outputVatMinor += tax.vatAmountMinor;
    }
    if (tax.vatTreatment === "INPUT") {
      bucket.inputVatMinor += tax.vatAmountMinor;
    }
    if (tax.whtTreatment === "PAYABLE") {
      bucket.whtPayableMinor += tax.whtAmountMinor;
    }
    if (tax.whtTreatment === "RECEIVABLE") {
      bucket.whtReceivableMinor += tax.whtAmountMinor;
    }

    summaries.set(record.clientBusinessId, bucket);
  }

  return new Map<number, ClientBusinessPortfolioTaxSummary>(
    Array.from(summaries.entries()).map(([clientBusinessId, bucket]) => {
      const vatNetMinor = bucket.outputVatMinor - bucket.inputVatMinor;
      const resolvedCurrency =
        bucket.currencies.size === 1
          ? Array.from(bucket.currencies)[0]
          : defaultCurrencyByBusiness.get(clientBusinessId) ?? "NGN";

      return [
        clientBusinessId,
        {
          currency: resolvedCurrency,
          dateLabel,
          vatNetMinor,
          whtPayableMinor: bucket.whtPayableMinor,
          whtReceivableMinor: bucket.whtReceivableMinor,
          estimatedTaxExposureMinor: Math.max(vatNetMinor, 0) + bucket.whtPayableMinor,
        },
      ];
    })
  );
}

function buildEmptyTaxExposure(
  currency: string,
  dateLabel: string
): ClientBusinessPortfolioTaxSummary {
  return {
    currency,
    dateLabel,
    vatNetMinor: 0,
    whtPayableMinor: 0,
    whtReceivableMinor: 0,
    estimatedTaxExposureMinor: 0,
  };
}

function sortClientBusinesses(items: ClientBusinessPortfolioSummary[]) {
  return [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "ACTIVE" ? -1 : 1;
    }

    if (left.taxExposure.estimatedTaxExposureMinor !== right.taxExposure.estimatedTaxExposureMinor) {
      return right.taxExposure.estimatedTaxExposureMinor - left.taxExposure.estimatedTaxExposureMinor;
    }

    if (left.lastActivityAt !== right.lastActivityAt) {
      return new Date(right.lastActivityAt ?? 0).getTime() - new Date(left.lastActivityAt ?? 0).getTime();
    }

    return left.name.localeCompare(right.name);
  });
}

export async function getWorkspaceClientBusinessPortfolio(input: {
  workspaceId: number;
  workspaceName?: string;
  role: WorkspaceRole;
}): Promise<AccountantWorkspacePortfolioResponse> {
  const { dateFrom, dateTo } = getDefaultTransactionTaxDateRange();
  const taxExposureDateLabel = getPortfolioDateLabel(dateFrom);
  const emptyPortfolio = buildEmptyWorkspacePortfolioResponse({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName ?? "Workspace",
    role: input.role,
    taxExposureDateLabel,
  });

  try {
    const [businesses, reviewCountsRaw, latestBankActivityRaw, latestUploadActivityRaw, taxRows] =
      await Promise.all([
        runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "client businesses query",
          query: prisma.clientBusiness.findMany({
            where: {
              workspaceId: input.workspaceId,
            },
            select: clientBusinessPortfolioSelect,
            orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
          }),
          fallback: () => [],
        }),
        runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "review counts query",
          support: ACCOUNTANT_PORTFOLIO_REVIEW_COUNT_SUPPORT,
          query: prisma.bankTransaction.groupBy({
            by: ["clientBusinessId", "reviewStatus"],
            where: {
              workspaceId: input.workspaceId,
              clientBusinessId: {
                not: null,
              },
            },
            _count: {
              _all: true,
            },
          }),
          fallback: () => [],
        }),
        runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "latest bank activity query",
          query: prisma.bankTransaction.groupBy({
            by: ["clientBusinessId"],
            where: {
              workspaceId: input.workspaceId,
              clientBusinessId: {
                not: null,
              },
            },
            _max: {
              updatedAt: true,
            },
          }),
          fallback: () => [],
        }),
        runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "latest upload activity query",
          query: prisma.bookkeepingUpload.groupBy({
            by: ["clientBusinessId"],
            where: {
              clientBusiness: {
                workspaceId: input.workspaceId,
              },
            },
            _max: {
              updatedAt: true,
            },
          }),
          fallback: () => [],
        }),
        runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "tax exposure query",
          support: ACCOUNTANT_PORTFOLIO_TAX_EXPOSURE_SUPPORT,
          query: prisma.bankTransaction.findMany({
            where: {
              workspaceId: input.workspaceId,
              clientBusinessId: {
                not: null,
              },
              transactionDate: {
                gte: dateFrom,
                lte: dateTo,
              },
            },
            select: taxExposureTransactionSelect,
            orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          }),
          fallback: () => [],
        }),
      ]);

    const reviewCounts = buildReviewStatusBreakdownMap(
      reviewCountsRaw
        .filter(
          (
            row
          ): row is typeof row & {
            clientBusinessId: number;
          } => typeof row.clientBusinessId === "number"
        )
        .map((row) => ({
          clientBusinessId: row.clientBusinessId,
          reviewStatus: row.reviewStatus,
          count: row._count._all,
        }))
    );
    const latestBankActivity = new Map(
      latestBankActivityRaw
        .filter(
          (
            row
          ): row is typeof row & {
            clientBusinessId: number;
          } => typeof row.clientBusinessId === "number"
        )
        .map((row) => [row.clientBusinessId, row._max.updatedAt ?? null])
    );
    const latestUploadActivity = new Map(
      latestUploadActivityRaw.map((row) => [row.clientBusinessId, row._max.updatedAt ?? null])
    );
    const defaultCurrencyByBusiness = new Map(
      businesses.map((business) => [business.id, business.defaultCurrency])
    );
    const taxExposureByBusiness = buildTaxExposureMap(
      taxRows,
      defaultCurrencyByBusiness,
      taxExposureDateLabel
    );

    const items = sortClientBusinesses(
      businesses.map((business) => {
        const reviewStatusBreakdown =
          reviewCounts.get(business.id) ?? buildEmptyReviewStatusBreakdown();
        const taxExposure =
          taxExposureByBusiness.get(business.id) ??
          buildEmptyTaxExposure(business.defaultCurrency, taxExposureDateLabel);
        const transactionUpdatedAt = latestBankActivity.get(business.id) ?? null;
        const uploadUpdatedAt = latestUploadActivity.get(business.id) ?? null;
        const lastActivityAt = pickLatestDate(
          business.updatedAt,
          transactionUpdatedAt,
          uploadUpdatedAt
        );

        return {
          id: business.id,
          name: business.name,
          legalName: business.legalName,
          industry: business.industry,
          country: business.country,
          state: business.state,
          taxIdentificationNumber: business.taxIdentificationNumber,
          vatRegistrationNumber: business.vatRegistrationNumber,
          defaultCurrency: business.defaultCurrency,
          fiscalYearStartMonth: business.fiscalYearStartMonth,
          status: business.status,
          archivedAt: business.archivedAt?.toISOString() ?? null,
          notes: business.notes,
          createdAt: business.createdAt.toISOString(),
          updatedAt: business.updatedAt.toISOString(),
          vendorCount: business._count.vendors,
          categoryCount: business._count.categories,
          ledgerTransactionCount: business._count.transactions,
          transactionCount: business._count.bankTransactions,
          uploadCount: business._count.bookkeepingUploads,
          reviewQueueCount:
            reviewStatusBreakdown.importedCount +
            reviewStatusBreakdown.pendingReviewCount +
            reviewStatusBreakdown.flaggedCount,
          reviewStatusBreakdown,
          taxExposure,
          lastActivityAt: lastActivityAt?.toISOString() ?? null,
          lastActivityType: resolveActivityType({
            businessUpdatedAt: business.updatedAt,
            transactionUpdatedAt,
            uploadUpdatedAt,
          }),
          filingReadinessStatus: null,
          openAlertCount: 0,
        } satisfies ClientBusinessPortfolioSummary;
      })
    );

    const activeClientBusinessCount = items.filter((item) => item.status === "ACTIVE").length;
    const lastActivityAt = items.reduce<Date | null>((latest, item) => {
      const candidate = item.lastActivityAt ? new Date(item.lastActivityAt) : null;
      if (!candidate || Number.isNaN(candidate.getTime())) return latest;
      if (!latest || candidate.getTime() > latest.getTime()) {
        return candidate;
      }
      return latest;
    }, null);
    const totalExposureMinor = items.reduce(
      (sum, item) => sum + item.taxExposure.estimatedTaxExposureMinor,
      0
    );
    const transactionCount = items.reduce((sum, item) => sum + item.transactionCount, 0);
    const reviewQueueCount = items.reduce((sum, item) => sum + item.reviewQueueCount, 0);
    const currencies = new Set(items.map((item) => item.taxExposure.currency).filter(Boolean));

    const resolvedWorkspaceName =
      input.workspaceName ??
      (
        await runAccountantPortfolioQuerySafely({
          workspaceId: input.workspaceId,
          label: "workspace name query",
          query: prisma.workspace.findUnique({
            where: { id: input.workspaceId },
            select: { name: true },
          }),
          fallback: () => null,
        })
      )?.name ??
      emptyPortfolio.workspace.workspaceName;

    return {
      workspace: {
        workspaceId: input.workspaceId,
        workspaceName: resolvedWorkspaceName,
        workspaceKind: resolveAccountantWorkspaceKind(activeClientBusinessCount),
        clientBusinessCount: items.length,
        activeClientBusinessCount,
        archivedClientBusinessCount: items.length - activeClientBusinessCount,
        transactionCount,
        reviewQueueCount,
        estimatedTaxExposureMinor: totalExposureMinor,
        currency: currencies.size === 1 ? Array.from(currencies)[0] : "NGN",
        taxExposureDateLabel: taxExposureDateLabel,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
        filingReadinessStatus: null,
        openAlertCount: 0,
      },
      access: getAccountantWorkspaceAccess(input.role),
      clientBusinesses: items,
    };
  } catch (error) {
    logError(
      "accountant-workspace",
      "Failed to build accountant portfolio; returning an empty portfolio.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return emptyPortfolio;
  }
}

export async function getWorkspaceClientBusinessPortfolioItem(input: {
  workspaceId: number;
  workspaceName?: string;
  role: WorkspaceRole;
  clientBusinessId: number;
}) {
  const portfolio = await getWorkspaceClientBusinessPortfolio(input);
  return portfolio.clientBusinesses.find((item) => item.id === input.clientBusinessId) ?? null;
}
