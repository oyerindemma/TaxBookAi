import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { parseBankTransactionReviewStatus } from "@/lib/bank-transaction-review-validation";
import {
  formatDateInputValue,
  getDefaultTransactionTaxDateRange,
  getTransactionTaxPeriodPresetRange,
  getWorkspaceTransactionTaxSummary,
  type TransactionTaxPeriodPreset,
} from "@/lib/transaction-tax";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import TransactionTaxCenterClient, {
  type TransactionTaxCenterFilters,
} from "./_components/TransactionTaxCenterClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  query?: string | string[];
  reviewStatus?: string | string[];
  clientBusinessId?: string | string[];
  bankAccountId?: string | string[];
  categoryId?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  periodPreset?: string | string[];
};

type TaxCenterPageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOptionalId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseDateParam(raw?: string, endOfDay = false) {
  if (!raw) return null;

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!exactDate) {
    return null;
  }

  const parsed = new Date(
    Date.UTC(
      Number(exactDate[1]),
      Number(exactDate[2]) - 1,
      Number(exactDate[3]),
      endOfDay ? 23 : 12,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    )
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePeriodPreset(raw?: string): TransactionTaxPeriodPreset | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized === "CURRENT_MONTH" ||
    normalized === "PREVIOUS_MONTH" ||
    normalized === "LAST_30_DAYS" ||
    normalized === "CURRENT_QUARTER" ||
    normalized === "YEAR_TO_DATE" ||
    normalized === "CUSTOM"
    ? normalized
    : null;
}

export default async function TaxCenterPage({
  searchParams,
}: TaxCenterPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tax center</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to compute VAT and WHT summaries from transactions.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const query = firstValue(resolvedSearchParams.query) ?? "";
  const reviewStatus = firstValue(resolvedSearchParams.reviewStatus) ?? "";
  const clientBusinessId = firstValue(resolvedSearchParams.clientBusinessId) ?? "";
  const bankAccountId = firstValue(resolvedSearchParams.bankAccountId) ?? "";
  const categoryId = firstValue(resolvedSearchParams.categoryId) ?? "";
  const periodPreset = parsePeriodPreset(firstValue(resolvedSearchParams.periodPreset)) ?? "CURRENT_MONTH";
  const rawDateFrom = parseDateParam(firstValue(resolvedSearchParams.dateFrom));
  const rawDateTo = parseDateParam(firstValue(resolvedSearchParams.dateTo), true);
  const defaultRange = getDefaultTransactionTaxDateRange();
  const presetRange =
    periodPreset !== "CUSTOM" ? getTransactionTaxPeriodPresetRange(periodPreset) : null;
  const defaultDateWindowApplied =
    !rawDateFrom && !rawDateTo && periodPreset === "CURRENT_MONTH";
  const dateFrom = rawDateFrom ?? presetRange?.dateFrom ?? defaultRange.dateFrom;
  const dateTo = rawDateTo ?? presetRange?.dateTo ?? defaultRange.dateTo;

  const initialFilters: TransactionTaxCenterFilters = {
    query,
    reviewStatus,
    clientBusinessId,
    bankAccountId,
    categoryId,
    periodPreset,
    dateFrom: dateFrom ? formatDateInputValue(dateFrom) : "",
    dateTo: dateTo ? formatDateInputValue(dateTo) : "",
  };

  const initialSummary = await getWorkspaceTransactionTaxSummary({
    workspaceId: membership.workspaceId,
    query,
    reviewStatus: parseBankTransactionReviewStatus(reviewStatus),
    clientBusinessId: parseOptionalId(clientBusinessId),
    bankAccountId: parseOptionalId(bankAccountId),
    categoryId: parseOptionalId(categoryId),
    dateFrom,
    dateTo,
    periodPreset,
    defaultDateWindowApplied,
  });

  return (
    <TransactionTaxCenterClient
      workspaceName={membership.workspace.name}
      initialSummary={initialSummary}
      initialFilters={initialFilters}
    />
  );
}
