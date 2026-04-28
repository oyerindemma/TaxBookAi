import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaxSnapshotCalculation,
  buildTaxSnapshotExplainableSummary,
  resolveManualRecalcPeriodKeys,
  toMajorTaxSnapshotSummary,
} from "./tax-snapshot-calculation";

test("tax snapshot calculation includes uncategorized transactions in rough estimates", () => {
  const calculation = buildTaxSnapshotCalculation([
    {
      id: 1,
      amount: 1_000_000,
      type: "CREDIT",
      categoryId: null,
    },
    {
      id: 2,
      amount: 250_000,
      type: "DEBIT",
      categoryId: 10,
    },
  ]);

  assert.equal(calculation.incomeMinor, 1_000_000);
  assert.equal(calculation.expenseMinor, 250_000);
  assert.equal(calculation.taxableProfitMinor, 750_000);
  assert.equal(calculation.estimatedTaxMinor, 225_000);
  assert.equal(calculation.transactionCount, 2);
  assert.equal(calculation.categorizedCount, 1);
  assert.equal(calculation.uncategorizedCount, 1);
  assert.equal(calculation.isRoughEstimate, true);
  assert.match(calculation.warnings[0], /may be inaccurate/i);
  assert.ok(
    calculation.assumptions.some((assumption) =>
      /Uncategorized transactions are included/i.test(assumption)
    )
  );
});

test("tax snapshot calculation never lets expenses create negative taxable profit", () => {
  const calculation = buildTaxSnapshotCalculation([
    {
      id: 1,
      amount: 100_000,
      type: "CREDIT",
      categoryId: 1,
    },
    {
      id: 2,
      amount: 500_000,
      type: "DEBIT",
      categoryId: 2,
    },
  ]);

  assert.equal(calculation.taxableProfitMinor, 0);
  assert.equal(calculation.estimatedTaxMinor, 0);
  assert.equal(calculation.isRoughEstimate, false);
});

test("tax snapshot explainability exposes income, expense, taxable profit, assumptions, and uncategorized count", () => {
  const summary = buildTaxSnapshotExplainableSummary({
    totalIncome: 10_000,
    totalExpense: 2_500,
    taxableProfit: 7_500,
    estimatedTax: 2_250,
    transactionCount: 4,
    categorizedCount: 2,
  });

  assert.deepEqual(
    {
      income: summary.income,
      expense: summary.expense,
      taxableProfit: summary.taxableProfit,
      estimatedTax: summary.estimatedTax,
      uncategorizedCount: summary.uncategorizedCount,
      isRoughEstimate: summary.isRoughEstimate,
    },
    {
      income: 10_000,
      expense: 2_500,
      taxableProfit: 7_500,
      estimatedTax: 2_250,
      uncategorizedCount: 2,
      isRoughEstimate: true,
    }
  );
  assert.ok(summary.assumptions.length >= 4);
  assert.match(summary.warnings[0], /categorized/i);
});

test("major summary matches persisted tax snapshot values", () => {
  const summary = toMajorTaxSnapshotSummary(
    buildTaxSnapshotCalculation([
      {
        id: 1,
        amount: 1_250_000,
        type: "INCOME",
        categoryId: 1,
      },
      {
        id: 2,
        amount: 180_000,
        type: "EXPENSE",
        categoryId: null,
      },
    ])
  );

  assert.equal(summary.income, 12_500);
  assert.equal(summary.expense, 1_800);
  assert.equal(summary.taxableProfit, 10_700);
  assert.equal(summary.estimatedTax, 3_210);
  assert.equal(summary.uncategorizedCount, 1);
  assert.equal(summary.isRoughEstimate, true);
});

test("manual recalc targets transaction periods instead of only the current month", () => {
  const periods = resolveManualRecalcPeriodKeys(
    [
      new Date(Date.UTC(2026, 0, 12)),
      new Date(Date.UTC(2026, 3, 15)),
      new Date(Date.UTC(2026, 0, 28)),
    ],
    "2026-05"
  );

  assert.deepEqual(periods, ["2026-01", "2026-04"]);
});

test("manual recalc falls back to current period when no transactions exist", () => {
  assert.deepEqual(resolveManualRecalcPeriodKeys([], "2026-05"), ["2026-05"]);
});
