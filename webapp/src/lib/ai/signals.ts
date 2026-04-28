import "server-only";

import { db } from "@/lib/db";

export type FinancialSignals = {
  revenue: number;
  expenses: number;
  profit: number;
  expenseRatio: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function computeFinancialSignals(workspaceId: number): Promise<FinancialSignals> {
  const entries = await db.journalEntry.findMany({
    where: {
      status: "POSTED",
      transaction: {
        workspaceId,
      },
    },
    include: {
      account: true,
    },
  });

  let revenue = 0;
  let expenses = 0;

  for (const entry of entries) {
    if (!entry.account) continue;

    if (entry.account.type === "REVENUE") {
      revenue += entry.credit - entry.debit;
    }

    if (entry.account.type === "EXPENSE") {
      expenses += entry.debit - entry.credit;
    }
  }

  const roundedRevenue = roundMoney(revenue);
  const roundedExpenses = roundMoney(expenses);
  const profit = roundMoney(roundedRevenue - roundedExpenses);

  return {
    revenue: roundedRevenue,
    expenses: roundedExpenses,
    profit,
    expenseRatio: roundedRevenue > 0 ? roundedExpenses / roundedRevenue : 0,
  };
}
