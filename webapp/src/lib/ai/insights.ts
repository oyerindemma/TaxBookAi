import type { FinancialSignals } from "@/lib/ai/signals";

export function generateInsights(signals: FinancialSignals): string[] {
  const insights: string[] = [];

  if (signals.revenue === 0) {
    insights.push("No revenue recorded yet.");
  }

  if (signals.expenses > 0 && signals.revenue === 0) {
    insights.push("You are spending without generating income.");
  }

  if (signals.profit > 0) {
    insights.push("Business is profitable.");
  }

  return insights;
}
