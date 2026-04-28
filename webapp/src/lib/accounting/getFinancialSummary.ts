import "server-only";

import { db } from "@/lib/db";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getFinancialSummary(workspaceId: number) {
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

  return {
    revenue: roundMoney(revenue),
    expenses: roundMoney(expenses),
    profit: roundMoney(revenue - expenses),
  };
}
