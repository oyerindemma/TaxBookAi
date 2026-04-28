import "server-only";

import type { Prisma } from "@prisma/client";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getWorkspacePeriodComparison,
  type ComparablePeriodRange,
  type PeriodComparisonMode,
  type WorkspacePeriodComparison,
} from "@/lib/accounting/period-compare";

const LOOKBACK_DAYS = 180;
const DUPLICATE_WINDOW_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PENDING_REVIEW_STATUSES = new Set(["IMPORTED", "PENDING_REVIEW", "FLAGGED"]);

export type FinancialAnomalyType =
  | "unusual_expense_spike"
  | "duplicate_charge_suspicion"
  | "revenue_drop_signal"
  | "expense_concentration_risk"
  | "cashflow_stress_signal"
  | "tax_risk_signal";

export type FinancialAnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FinancialAnomaly = {
  id: string;
  dedupeKey: string;
  type: FinancialAnomalyType;
  severity: FinancialAnomalySeverity;
  title: string;
  description: string;
  relatedTransactionIds: number[];
  confidence: number;
  suggestedAction: string;
};

export type WorkspaceAnomalySnapshot = {
  generatedAt: string;
  workspace: {
    id: number;
  };
  period: {
    mode: PeriodComparisonMode;
    currentLabel: string;
    previousLabel: string;
  };
  summary: {
    totalCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topAnomalyTitle: string | null;
  };
  anomalies: FinancialAnomaly[];
};

export type AnomalyDetectionTransaction = {
  id: number;
  transactionDate: Date | string;
  description: string;
  reference: string | null;
  amountMinor: number;
  type: "CREDIT" | "DEBIT";
  currency: string;
  normalizedDescription: string | null;
  vendorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryType: string | null;
  taxTreatmentSource: string | null;
  vatTreatment: string | null;
  whtTreatment: string | null;
  vatAmountMinor: number;
  whtAmountMinor: number;
  reviewStatus: string | null;
  clientBusinessId: number | null;
};

type AnomalyDetectionInput = {
  comparison: WorkspacePeriodComparison;
  currentPeriodTransactions: AnomalyDetectionTransaction[];
  previousPeriodTransactions: AnomalyDetectionTransaction[];
  lookbackTransactions: AnomalyDetectionTransaction[];
};

const anomalyTransactionSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  currency: true,
  normalizedDescription: true,
  normalizedMerchantName: true,
  suggestedCounterparty: true,
  categoryId: true,
  reviewStatus: true,
  taxTreatmentSource: true,
  vatTreatment: true,
  whtTreatment: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  clientBusinessId: true,
  category: {
    select: {
      name: true,
      type: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type AnomalyTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof anomalyTransactionSelect;
}>;

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value
    ?.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function shiftUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_IN_MS);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function severityRank(severity: FinancialAnomalySeverity) {
  if (severity === "CRITICAL") return 0;
  if (severity === "HIGH") return 1;
  if (severity === "MEDIUM") return 2;
  return 3;
}

function pickVendorName(transaction: AnomalyDetectionTransaction | AnomalyTransactionRecord) {
  const merchantName =
    "normalizedMerchantName" in transaction
      ? transaction.normalizedMerchantName
      : transaction.vendorName;

  return (
    merchantName?.trim() ??
    ("suggestedCounterparty" in transaction
      ? transaction.suggestedCounterparty?.trim() ?? null
      : null) ??
    null
  );
}

function serializeTransaction(record: AnomalyTransactionRecord): AnomalyDetectionTransaction {
  return {
    id: record.id,
    transactionDate: record.transactionDate,
    description: record.description,
    reference: record.reference,
    amountMinor: record.amount,
    type: record.type,
    currency: record.currency,
    normalizedDescription: record.normalizedDescription,
    vendorName: pickVendorName(record),
    categoryId: record.categoryId,
    categoryName: record.category?.name ?? null,
    categoryType: record.category?.type ?? null,
    taxTreatmentSource: record.taxTreatmentSource,
    vatTreatment: record.vatTreatment,
    whtTreatment: record.whtTreatment,
    vatAmountMinor: record.vatAmountMinor,
    whtAmountMinor: record.whtAmountMinor,
    reviewStatus: record.reviewStatus,
    clientBusinessId: record.clientBusinessId,
  };
}

function isExpense(transaction: AnomalyDetectionTransaction) {
  return transaction.type === "DEBIT";
}

function isRevenue(transaction: AnomalyDetectionTransaction) {
  return transaction.type === "CREDIT";
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle] ?? 0;
}

function uniqueIds(values: number[], limit = values.length) {
  const seen = new Set<number>();
  const ids: number[] = [];

  for (const value of values) {
    if (!Number.isInteger(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    ids.push(value);
    if (ids.length >= limit) {
      break;
    }
  }

  return ids;
}

function buildExpenseGroupKey(transaction: AnomalyDetectionTransaction) {
  const vendorKey = normalizeKey(transaction.vendorName);
  if (vendorKey) {
    return `vendor:${transaction.clientBusinessId ?? 0}:${vendorKey}`;
  }

  if (transaction.categoryId) {
    return `category:${transaction.clientBusinessId ?? 0}:${transaction.categoryId}`;
  }

  return null;
}

function buildDescriptionKey(transaction: AnomalyDetectionTransaction) {
  return (
    normalizeKey(transaction.normalizedDescription) ??
    normalizeKey(transaction.description) ??
    normalizeKey(transaction.reference) ??
    null
  );
}

function descriptionsLookSimilar(left: AnomalyDetectionTransaction, right: AnomalyDetectionTransaction) {
  const leftKey = buildDescriptionKey(left);
  const rightKey = buildDescriptionKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey === rightKey) {
    return true;
  }

  if (leftKey.length < 8 || rightKey.length < 8) {
    return false;
  }

  return leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function amountsLookSimilar(leftAmount: number, rightAmount: number) {
  const difference = Math.abs(leftAmount - rightAmount);
  const tolerance = Math.max(100, Math.round(Math.max(leftAmount, rightAmount) * 0.02));
  return difference <= tolerance;
}

function categorizeSeverityByRatio(
  ratio: number,
  thresholds: { critical: number; high: number; medium: number }
): FinancialAnomalySeverity {
  if (ratio >= thresholds.critical) return "CRITICAL";
  if (ratio >= thresholds.high) return "HIGH";
  if (ratio >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

function findLargestDeltaGroup(
  currentTransactions: AnomalyDetectionTransaction[],
  previousTransactions: AnomalyDetectionTransaction[],
  selector: (transaction: AnomalyDetectionTransaction) => { key: string; label: string } | null
) {
  const grouped = new Map<
    string,
    {
      label: string;
      currentAmountMinor: number;
      previousAmountMinor: number;
      currentIds: number[];
      previousIds: number[];
    }
  >();

  for (const transaction of currentTransactions) {
    const key = selector(transaction);
    if (!key) continue;
    const bucket = grouped.get(key.key) ?? {
      label: key.label,
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentIds: [],
      previousIds: [],
    };
    bucket.currentAmountMinor += transaction.amountMinor;
    bucket.currentIds.push(transaction.id);
    grouped.set(key.key, bucket);
  }

  for (const transaction of previousTransactions) {
    const key = selector(transaction);
    if (!key) continue;
    const bucket = grouped.get(key.key) ?? {
      label: key.label,
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentIds: [],
      previousIds: [],
    };
    bucket.previousAmountMinor += transaction.amountMinor;
    bucket.previousIds.push(transaction.id);
    grouped.set(key.key, bucket);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      deltaMinor: group.currentAmountMinor - group.previousAmountMinor,
    }))
    .sort((left, right) => left.deltaMinor - right.deltaMinor)[0] ?? null;
}

function buildGroupShareMap(
  transactions: AnomalyDetectionTransaction[],
  selector: (transaction: AnomalyDetectionTransaction) => { key: string; label: string } | null
) {
  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      totalAmountMinor: number;
      ids: number[];
    }
  >();

  for (const transaction of transactions) {
    const selected = selector(transaction);
    if (!selected) continue;
    const bucket = grouped.get(selected.key) ?? {
      key: selected.key,
      label: selected.label,
      totalAmountMinor: 0,
      ids: [],
    };
    bucket.totalAmountMinor += transaction.amountMinor;
    bucket.ids.push(transaction.id);
    grouped.set(selected.key, bucket);
  }

  return grouped;
}

function buildEmptyAnomalySnapshot(
  workspaceId: number,
  mode: PeriodComparisonMode = "CURRENT_MONTH"
): WorkspaceAnomalySnapshot {
  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspaceId,
    },
    period: {
      mode,
      currentLabel: "Current period",
      previousLabel: "Previous period",
    },
    summary: {
      totalCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      topAnomalyTitle: null,
    },
    anomalies: [],
  };
}

function summarizeAnomalies(anomalies: FinancialAnomaly[]) {
  return anomalies.reduce(
    (summary, anomaly, index) => {
      summary.totalCount += 1;
      if (anomaly.severity === "CRITICAL") summary.criticalCount += 1;
      if (anomaly.severity === "HIGH") summary.highCount += 1;
      if (anomaly.severity === "MEDIUM") summary.mediumCount += 1;
      if (anomaly.severity === "LOW") summary.lowCount += 1;
      if (index === 0) summary.topAnomalyTitle = anomaly.title;
      return summary;
    },
    {
      totalCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      topAnomalyTitle: null as string | null,
    }
  );
}

function detectUnusualExpenseSpikes(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const currentExpenses = input.currentPeriodTransactions.filter(isExpense).sort((left, right) => {
    return toDate(left.transactionDate).getTime() - toDate(right.transactionDate).getTime();
  });

  const lookbackExpenses = input.lookbackTransactions.filter(isExpense);
  const anomalies: FinancialAnomaly[] = [];

  for (const transaction of currentExpenses) {
    const groupKey = buildExpenseGroupKey(transaction);
    if (!groupKey || transaction.amountMinor < 250_000) {
      continue;
    }

    const transactionTime = toDate(transaction.transactionDate).getTime();
    const baseline = lookbackExpenses
      .filter((candidate) => {
        if (candidate.id === transaction.id) return false;
        if (buildExpenseGroupKey(candidate) !== groupKey) return false;
        return toDate(candidate.transactionDate).getTime() < transactionTime;
      })
      .sort((left, right) => toDate(right.transactionDate).getTime() - toDate(left.transactionDate).getTime())
      .slice(0, 8);

    if (baseline.length < 3) {
      continue;
    }

    const baselineMedian = median(baseline.map((candidate) => candidate.amountMinor));
    if (baselineMedian <= 0) {
      continue;
    }

    const ratio = transaction.amountMinor / baselineMedian;
    const deltaMinor = transaction.amountMinor - baselineMedian;

    if (ratio < 2.5 || deltaMinor < Math.max(100_000, Math.round(baselineMedian * 0.4))) {
      continue;
    }

    const subject = transaction.vendorName ?? transaction.categoryName ?? "Expense activity";
    anomalies.push({
      id: `expense-spike-${transaction.id}`,
      dedupeKey: `unusual_expense_spike:${transaction.id}`,
      type: "unusual_expense_spike",
      severity: categorizeSeverityByRatio(ratio, {
        critical: 6,
        high: 4,
        medium: 3,
      }),
      title: "Unusual expense spike detected",
      description: `${subject} posted ${formatMoney(
        transaction.amountMinor,
        transaction.currency
      )}, about ${ratio.toFixed(1)}x the recent baseline of ${formatMoney(
        baselineMedian,
        transaction.currency
      )}.`,
      relatedTransactionIds: uniqueIds([transaction.id, ...baseline.map((candidate) => candidate.id)], 4),
      confidence: clamp(0.58 + ratio * 0.08 + baseline.length * 0.02, 0.62, 0.98),
      suggestedAction: "Review the charge, confirm the category, and check whether it should be split or approved.",
    });
  }

  return anomalies;
}

function detectDuplicateCharges(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const expenses = input.lookbackTransactions
    .filter(isExpense)
    .sort((left, right) => toDate(left.transactionDate).getTime() - toDate(right.transactionDate).getTime());
  const seen = new Set<string>();
  const anomalies: FinancialAnomaly[] = [];

  for (let index = 0; index < expenses.length; index += 1) {
    const transaction = expenses[index];
    const transactionDate = toDate(transaction.transactionDate);

    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = expenses[candidateIndex];
      const candidateDate = toDate(candidate.transactionDate);
      const dayDelta = (transactionDate.getTime() - candidateDate.getTime()) / DAY_IN_MS;

      if (dayDelta > DUPLICATE_WINDOW_DAYS) {
        break;
      }

      const sameVendor =
        Boolean(normalizeKey(transaction.vendorName)) &&
        Boolean(normalizeKey(candidate.vendorName)) &&
        normalizeKey(transaction.vendorName) === normalizeKey(candidate.vendorName);

      if (
        !amountsLookSimilar(transaction.amountMinor, candidate.amountMinor) ||
        (!sameVendor && !descriptionsLookSimilar(transaction, candidate))
      ) {
        continue;
      }

      const ids = [transaction.id, candidate.id].sort((left, right) => left - right);
      const dedupeKey = `duplicate_charge_suspicion:${ids[0]}:${ids[1]}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const exactAmount = transaction.amountMinor === candidate.amountMinor;
      const exactDescription = buildDescriptionKey(transaction) === buildDescriptionKey(candidate);
      const severity: FinancialAnomalySeverity =
        dayDelta <= 1 && exactAmount && (sameVendor || exactDescription)
          ? "CRITICAL"
          : exactAmount && (sameVendor || exactDescription)
            ? "HIGH"
            : "MEDIUM";

      const subject = transaction.vendorName ?? transaction.categoryName ?? "Two charges";
      anomalies.push({
        id: `duplicate-charge-${ids.join("-")}`,
        dedupeKey,
        type: "duplicate_charge_suspicion",
        severity,
        title: "Possible duplicate charge detected",
        description: `${subject} contains at least two very similar charges within ${Math.max(
          1,
          Math.round(dayDelta)
        )} day${Math.round(dayDelta) === 1 ? "" : "s"}, including ${formatMoney(
          transaction.amountMinor,
          transaction.currency
        )}.`,
        relatedTransactionIds: ids,
        confidence: clamp(
          0.7 +
            (exactAmount ? 0.1 : 0) +
            (exactDescription ? 0.08 : 0) +
            (sameVendor ? 0.07 : 0) +
            (dayDelta <= 1 ? 0.05 : 0),
          0.72,
          0.98
        ),
        suggestedAction: "Check whether one charge should be voided, refunded, or matched to an existing payment.",
      });
    }
  }

  return anomalies;
}

function detectRevenueDrop(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const revenueDelta = input.comparison.metrics.revenue;

  if (!input.comparison.comparable || revenueDelta.previous <= 0 || revenueDelta.change >= 0) {
    return [];
  }

  const dropPercent = Math.abs(revenueDelta.change / revenueDelta.previous) * 100;
  if (dropPercent < 15) {
    return [];
  }

  const currentRevenueTransactions = input.currentPeriodTransactions.filter(isRevenue);
  const previousRevenueTransactions = input.previousPeriodTransactions.filter(isRevenue);
  const currency =
    currentRevenueTransactions[0]?.currency ?? previousRevenueTransactions[0]?.currency ?? "NGN";
  const driver =
    findLargestDeltaGroup(
      currentRevenueTransactions,
      previousRevenueTransactions,
      (transaction) =>
        transaction.categoryName
          ? {
              key: `category:${transaction.categoryId ?? transaction.categoryName}`,
              label: transaction.categoryName,
            }
          : transaction.vendorName
            ? {
                key: `vendor:${transaction.vendorName}`,
                label: transaction.vendorName,
              }
            : null
    ) ?? null;

  const driverLine =
    driver && driver.deltaMinor < 0
      ? ` The largest drop came from ${driver.label}, which fell by ${formatMoney(
          Math.abs(driver.deltaMinor),
          currency
        )}.`
      : "";

  return [
    {
      id: `revenue-drop-${input.comparison.currentPeriod.from}`,
      dedupeKey: `revenue_drop_signal:${input.comparison.currentPeriod.from}`,
      type: "revenue_drop_signal",
      severity: categorizeSeverityByRatio(dropPercent, {
        critical: 50,
        high: 30,
        medium: 20,
      }),
      title: "Revenue is materially lower this period",
      description: `Revenue dropped from ${formatMoney(
        revenueDelta.previous,
        currency
      )} to ${formatMoney(revenueDelta.current, currency)} (${formatPercent(dropPercent)} down).${driverLine}`,
      relatedTransactionIds: uniqueIds(
        [
          ...(driver?.currentIds ?? []),
          ...(driver?.previousIds ?? []),
        ],
        6
      ),
      confidence: clamp(0.68 + dropPercent / 120, 0.7, 0.97),
      suggestedAction: "Inspect the revenue mix, overdue collections, and client activity in the affected category before forecasting the rest of the period.",
    },
  ];
}

function detectExpenseConcentration(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const currentExpenses = input.currentPeriodTransactions.filter(isExpense);
  const previousExpenses = input.previousPeriodTransactions.filter(isExpense);
  const currentTotal = currentExpenses.reduce((sum, transaction) => sum + transaction.amountMinor, 0);
  const previousTotal = previousExpenses.reduce((sum, transaction) => sum + transaction.amountMinor, 0);

  if (currentTotal <= 0) {
    return [];
  }

  const selectors = [
    (transaction: AnomalyDetectionTransaction) =>
      transaction.vendorName
        ? { key: `vendor:${transaction.vendorName}`, label: transaction.vendorName }
        : null,
    (transaction: AnomalyDetectionTransaction) =>
      transaction.categoryName
        ? {
            key: `category:${transaction.categoryId ?? transaction.categoryName}`,
            label: transaction.categoryName,
          }
        : null,
  ];

  const candidates = selectors
    .map((selector) => {
      const currentGroups = buildGroupShareMap(currentExpenses, selector);
      const previousGroups = buildGroupShareMap(previousExpenses, selector);

      return Array.from(currentGroups.values())
        .map((group) => {
          const previousAmountMinor = previousGroups.get(group.key)?.totalAmountMinor ?? 0;
          const currentShare = group.totalAmountMinor / currentTotal;
          const previousShare = previousTotal > 0 ? previousAmountMinor / previousTotal : 0;

          return {
            ...group,
            currentShare,
            previousShare,
          };
        })
        .sort((left, right) => right.currentShare - left.currentShare)[0] ?? null;
    })
    .filter(Boolean)
    .sort((left, right) => (right?.currentShare ?? 0) - (left?.currentShare ?? 0));

  const dominant = candidates[0];

  if (
    !dominant ||
    dominant.currentShare < 0.45 ||
    (dominant.previousShare > 0 && dominant.currentShare - dominant.previousShare < 0.15 && dominant.currentShare < 0.65)
  ) {
    return [];
  }

  return [
    {
      id: `expense-concentration-${dominant.key}`,
      dedupeKey: `expense_concentration_risk:${dominant.key}:${input.comparison.currentPeriod.from}`,
      type: "expense_concentration_risk",
      severity:
        dominant.currentShare >= 0.75
          ? "CRITICAL"
          : dominant.currentShare >= 0.6
            ? "HIGH"
            : "MEDIUM",
      title: "Expense concentration risk is rising",
      description: `${dominant.label} accounts for ${formatPercent(
        dominant.currentShare * 100
      )} of current-period spend, up from ${formatPercent(dominant.previousShare * 100)} in the comparison period.`,
      relatedTransactionIds: uniqueIds(dominant.ids, 5),
      confidence: clamp(0.66 + dominant.currentShare * 0.4, 0.68, 0.95),
      suggestedAction: "Check whether this spend cluster is intentional, budgeted, and correctly categorized before it distorts cash planning.",
    },
  ];
}

function detectCashflowStress(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const { cashIn, cashOut, cashflow } = input.comparison.current;
  if (cashIn <= 0 || cashOut <= cashIn * 1.15 || cashflow >= 0) {
    return [];
  }

  const ratio = cashOut / cashIn;
  const currentExpenses = input.currentPeriodTransactions
    .filter(isExpense)
    .sort((left, right) => right.amountMinor - left.amountMinor);
  const currency =
    input.currentPeriodTransactions[0]?.currency ??
    input.previousPeriodTransactions[0]?.currency ??
    "NGN";

  return [
    {
      id: `cashflow-stress-${input.comparison.currentPeriod.from}`,
      dedupeKey: `cashflow_stress_signal:${input.comparison.currentPeriod.from}`,
      type: "cashflow_stress_signal",
      severity: categorizeSeverityByRatio(ratio, {
        critical: 2,
        high: 1.6,
        medium: 1.3,
      }),
      title: "Current cashflow shows stress",
      description: `Outflows of ${formatMoney(cashOut, currency)} are running ahead of inflows of ${formatMoney(
        cashIn,
        currency
      )}, leaving net cashflow at ${formatMoney(cashflow, currency)}.`,
      relatedTransactionIds: uniqueIds(currentExpenses.map((transaction) => transaction.id), 5),
      confidence: clamp(0.7 + Math.min(ratio, 2.5) * 0.08, 0.72, 0.96),
      suggestedAction: "Review the largest outflows, expected collections, and short-term cash commitments before approving more spend.",
    },
  ];
}

function detectTaxRisk(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const taxDelta = input.comparison.metrics.taxDue;
  const currentTransactions = input.currentPeriodTransactions;
  const currency =
    currentTransactions[0]?.currency ??
    input.previousPeriodTransactions[0]?.currency ??
    "NGN";
  const unknownTransactions = currentTransactions.filter((transaction) => {
    const treatmentUnset = transaction.taxTreatmentSource === "UNSET";
    const pendingReview = transaction.reviewStatus ? PENDING_REVIEW_STATUSES.has(transaction.reviewStatus) : false;
    return treatmentUnset || pendingReview;
  });

  const currentTaxableTransactions = currentTransactions.filter(
    (transaction) =>
      transaction.vatAmountMinor > 0 ||
      transaction.whtAmountMinor > 0 ||
      transaction.vatTreatment === "INPUT" ||
      transaction.vatTreatment === "OUTPUT" ||
      transaction.whtTreatment === "PAYABLE" ||
      transaction.whtTreatment === "RECEIVABLE"
  );

  const hasTaxJump =
    taxDelta.current > 0 &&
    ((taxDelta.previous > 0 &&
      taxDelta.change > 0 &&
      Math.abs(taxDelta.change / taxDelta.previous) >= 0.25) ||
      (taxDelta.previous === 0 && taxDelta.current >= 100_000));
  const hasUnknowns =
    unknownTransactions.length >= 5 ||
    (currentTransactions.length > 0 && unknownTransactions.length / currentTransactions.length >= 0.25);

  if (!hasTaxJump && !hasUnknowns) {
    return [];
  }

  const severity: FinancialAnomalySeverity =
    hasTaxJump && hasUnknowns
      ? "CRITICAL"
      : hasTaxJump
        ? taxDelta.previous > 0 && Math.abs(taxDelta.change / taxDelta.previous) >= 0.5
          ? "HIGH"
          : "MEDIUM"
        : unknownTransactions.length >= 8
          ? "HIGH"
          : "MEDIUM";

  const parts: string[] = [];
  if (hasTaxJump) {
    parts.push(
      `Tax due moved from ${formatMoney(taxDelta.previous, currency)} to ${formatMoney(
        taxDelta.current,
        currency
      )}.`
    );
  }
  if (currentTaxableTransactions.length > 0) {
    parts.push(`${currentTaxableTransactions.length} current-period transaction${currentTaxableTransactions.length === 1 ? "" : "s"} are carrying VAT or WHT impact.`);
  }
  if (hasUnknowns) {
    parts.push(`${unknownTransactions.length} transaction${unknownTransactions.length === 1 ? "" : "s"} still have unset or provisional tax treatment.`);
  }

  return [
    {
      id: `tax-risk-${input.comparison.currentPeriod.from}`,
      dedupeKey: `tax_risk_signal:${input.comparison.currentPeriod.from}`,
      type: "tax_risk_signal",
      severity,
      title: "Tax exposure needs attention",
      description: parts.join(" "),
      relatedTransactionIds: uniqueIds(
        [
          ...unknownTransactions.map((transaction) => transaction.id),
          ...currentTaxableTransactions.map((transaction) => transaction.id),
        ],
        6
      ),
      confidence: clamp(
        0.68 +
          (hasTaxJump ? 0.12 : 0) +
          Math.min(unknownTransactions.length, 8) * 0.02,
        0.72,
        0.97
      ),
      suggestedAction: "Open the tax center, review unsettled tax treatment, and confirm the transactions driving the higher VAT or WHT position.",
    },
  ];
}

export function detectFinancialAnomalies(input: AnomalyDetectionInput): FinancialAnomaly[] {
  const anomalies = [
    ...detectUnusualExpenseSpikes(input),
    ...detectDuplicateCharges(input),
    ...detectRevenueDrop(input),
    ...detectExpenseConcentration(input),
    ...detectCashflowStress(input),
    ...detectTaxRisk(input),
  ];

  return anomalies.sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return right.confidence - left.confidence;
  });
}

function filterTransactionsForRange(
  transactions: AnomalyDetectionTransaction[],
  range: ComparablePeriodRange
) {
  return transactions.filter((transaction) => {
    const timestamp = toDate(transaction.transactionDate).getTime();
    return timestamp >= range.fromDate.getTime() && timestamp <= range.toDate.getTime();
  });
}

export async function getWorkspaceAnomalySnapshot(input: {
  workspaceId: number;
  mode?: PeriodComparisonMode;
  from?: Date | string | null;
  to?: Date | string | null;
}): Promise<WorkspaceAnomalySnapshot> {
  if (!input.workspaceId || input.workspaceId <= 0) {
    return buildEmptyAnomalySnapshot(input.workspaceId, input.mode);
  }

  try {
    const comparison = await getWorkspacePeriodComparison({
      workspaceId: input.workspaceId,
      mode: input.mode,
      from: input.from,
      to: input.to,
    });
    const lookbackStart = shiftUtcDays(comparison.currentPeriod.fromDate, -LOOKBACK_DAYS);
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        transactionDate: {
          gte: minDate(lookbackStart, comparison.previousPeriod.fromDate),
          lte: comparison.currentPeriod.toDate,
        },
      },
      orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
      select: anomalyTransactionSelect,
    });

    const serialized = transactions.map(serializeTransaction);
    const currentPeriodTransactions = filterTransactionsForRange(serialized, comparison.currentPeriod);
    const previousPeriodTransactions = filterTransactionsForRange(serialized, comparison.previousPeriod);

    if (serialized.length === 0) {
      return {
        ...buildEmptyAnomalySnapshot(input.workspaceId, comparison.mode),
        period: {
          mode: comparison.mode,
          currentLabel: comparison.currentPeriod.label,
          previousLabel: comparison.previousPeriod.label,
        },
      };
    }

    const anomalies = detectFinancialAnomalies({
      comparison,
      currentPeriodTransactions,
      previousPeriodTransactions,
      lookbackTransactions: serialized,
    });

    return {
      generatedAt: new Date().toISOString(),
      workspace: {
        id: input.workspaceId,
      },
      period: {
        mode: comparison.mode,
        currentLabel: comparison.currentPeriod.label,
        previousLabel: comparison.previousPeriod.label,
      },
      summary: summarizeAnomalies(anomalies),
      anomalies,
    };
  } catch (error) {
    logError(
      "ai-anomaly-detection",
      "Failed to build workspace anomaly snapshot; returning an empty result.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyAnomalySnapshot(input.workspaceId, input.mode);
  }
}

export function buildEmptyWorkspaceAnomalySnapshot(
  workspaceId: number,
  mode?: PeriodComparisonMode
) {
  return buildEmptyAnomalySnapshot(workspaceId, mode);
}
