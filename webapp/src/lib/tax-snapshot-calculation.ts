export const DEFAULT_SME_ESTIMATED_TAX_RATE = 0.3;

export type TaxSnapshotCalculationTransaction = {
  id: number;
  amount: number;
  type: string;
  categoryId: number | null;
};

export type TaxSnapshotCalculation = {
  incomeMinor: number;
  expenseMinor: number;
  taxableProfitMinor: number;
  estimatedTaxMinor: number;
  transactionCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  taxRate: number;
  isRoughEstimate: boolean;
  warnings: string[];
  assumptions: string[];
};

export type TaxSnapshotExplainableSummary = {
  income: number;
  expense: number;
  taxableProfit: number;
  estimatedTax: number;
  transactionCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  taxRate: number;
  isRoughEstimate: boolean;
  warnings: string[];
  assumptions: string[];
};

function minorToMajor(amountMinor: number) {
  return Math.round(amountMinor) / 100;
}

function normalizeAmountMinor(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  return Math.abs(Math.round(amount));
}

function isIncomeTransaction(type: string) {
  return type === "CREDIT" || type === "INCOME";
}

function isExpenseTransaction(type: string) {
  return type === "DEBIT" || type === "EXPENSE";
}

export function buildTaxSnapshotCalculation(
  transactions: TaxSnapshotCalculationTransaction[],
  taxRate = DEFAULT_SME_ESTIMATED_TAX_RATE
): TaxSnapshotCalculation {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let categorizedCount = 0;

  for (const transaction of transactions) {
    const amountMinor = normalizeAmountMinor(transaction.amount);
    if (transaction.categoryId) categorizedCount += 1;

    if (isIncomeTransaction(transaction.type)) {
      incomeMinor += amountMinor;
    } else if (isExpenseTransaction(transaction.type)) {
      expenseMinor += amountMinor;
    }
  }

  const transactionCount = transactions.length;
  const uncategorizedCount = Math.max(transactionCount - categorizedCount, 0);
  const taxableProfitMinor = Math.max(incomeMinor - expenseMinor, 0);
  const estimatedTaxMinor = Math.round(taxableProfitMinor * taxRate);
  const isRoughEstimate = uncategorizedCount > 0;
  const assumptions = [
    "Credit transactions are treated as income.",
    "Debit transactions are treated as deductible business expenses.",
    `${Math.round(taxRate * 100)}% SME estimated tax rate is applied to positive taxable profit.`,
    "Taxable profit is never reduced below zero.",
  ];

  if (uncategorizedCount > 0) {
    assumptions.push(
      "Uncategorized transactions are included by money direction so users can still get a first estimate."
    );
  }

  return {
    incomeMinor,
    expenseMinor,
    taxableProfitMinor,
    estimatedTaxMinor,
    transactionCount,
    categorizedCount,
    uncategorizedCount,
    taxRate,
    isRoughEstimate,
    warnings: isRoughEstimate
      ? ["Your tax estimate may be inaccurate until transactions are categorized."]
      : [],
    assumptions,
  };
}

export function buildTaxSnapshotExplainableSummary(input: {
  totalIncome: number;
  totalExpense: number;
  taxableProfit: number;
  estimatedTax: number;
  transactionCount: number;
  categorizedCount: number;
  taxRate?: number;
}): TaxSnapshotExplainableSummary {
  const transactionCount = Math.max(Math.trunc(input.transactionCount), 0);
  const categorizedCount = Math.min(
    Math.max(Math.trunc(input.categorizedCount), 0),
    transactionCount
  );
  const uncategorizedCount = transactionCount - categorizedCount;
  const taxRate = input.taxRate ?? DEFAULT_SME_ESTIMATED_TAX_RATE;
  const isRoughEstimate = uncategorizedCount > 0;
  const assumptions = [
    "Credit transactions are treated as income.",
    "Debit transactions are treated as deductible business expenses.",
    `${Math.round(taxRate * 100)}% SME estimated tax rate is applied to positive taxable profit.`,
    "Taxable profit is never reduced below zero.",
  ];

  if (isRoughEstimate) {
    assumptions.push(
      "Uncategorized transactions were included in this estimate based on money direction."
    );
  }

  return {
    income: input.totalIncome,
    expense: input.totalExpense,
    taxableProfit: input.taxableProfit,
    estimatedTax: input.estimatedTax,
    transactionCount,
    categorizedCount,
    uncategorizedCount,
    taxRate,
    isRoughEstimate,
    warnings: isRoughEstimate
      ? ["Your tax estimate may be inaccurate until transactions are categorized."]
      : [],
    assumptions,
  };
}

export function toMajorTaxSnapshotSummary(
  calculation: TaxSnapshotCalculation
): TaxSnapshotExplainableSummary {
  return buildTaxSnapshotExplainableSummary({
    totalIncome: minorToMajor(calculation.incomeMinor),
    totalExpense: minorToMajor(calculation.expenseMinor),
    taxableProfit: minorToMajor(calculation.taxableProfitMinor),
    estimatedTax: minorToMajor(calculation.estimatedTaxMinor),
    transactionCount: calculation.transactionCount,
    categorizedCount: calculation.categorizedCount,
    taxRate: calculation.taxRate,
  });
}

export function resolveManualRecalcPeriodKeys(
  transactionDates: Date[],
  fallbackPeriodKey: string
) {
  const periodKeys = Array.from(
    new Set(
      transactionDates
        .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
        .map((date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`)
    )
  ).sort();

  return periodKeys.length > 0 ? periodKeys : [fallbackPeriodKey];
}
