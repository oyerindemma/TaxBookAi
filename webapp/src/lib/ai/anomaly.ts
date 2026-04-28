import type { FinancialSignals } from "@/lib/ai/signals";

export type FinancialIntelligenceAnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FinancialIntelligenceAnomaly = {
  type: "HIGH_EXPENSE_RATIO" | "NEGATIVE_PROFIT";
  severity: FinancialIntelligenceAnomalySeverity;
  title: string;
  description: string;
};

export function detectFinancialAnomalies(
  signals: FinancialSignals
): FinancialIntelligenceAnomaly[] {
  const anomalies: FinancialIntelligenceAnomaly[] = [];

  if (signals.expenseRatio > 0.8) {
    anomalies.push({
      type: "HIGH_EXPENSE_RATIO",
      severity: "HIGH",
      title: "Expenses too high",
      description: "Expenses exceed 80% of revenue.",
    });
  }

  if (signals.profit < 0) {
    anomalies.push({
      type: "NEGATIVE_PROFIT",
      severity: "CRITICAL",
      title: "Business is losing money",
      description: "Expenses exceed revenue.",
    });
  }

  return anomalies;
}
