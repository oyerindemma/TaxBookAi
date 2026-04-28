import type { FinancialSignals } from "@/lib/ai/signals";

export function generateRecommendations(signals: FinancialSignals): string[] {
  const recommendations: string[] = [];

  if (signals.expenseRatio > 0.8) {
    recommendations.push("Reduce operational expenses immediately.");
  }

  if (signals.profit < 0) {
    recommendations.push("Increase revenue or cut costs urgently.");
  }

  return recommendations;
}
