import "server-only";

import { detectFinancialAnomalies } from "@/lib/ai/anomaly";
import { generateInsights } from "@/lib/ai/insights";
import { generateRecommendations } from "@/lib/ai/recommendations";
import { computeFinancialSignals, type FinancialSignals } from "@/lib/ai/signals";

export type FinancialIntelligenceResult = {
  signals: FinancialSignals;
  anomalies: ReturnType<typeof detectFinancialAnomalies>;
  insights: string[];
  recommendations: string[];
};

export function buildEmptyFinancialIntelligence(): FinancialIntelligenceResult {
  return {
    signals: {
      revenue: 0,
      expenses: 0,
      profit: 0,
      expenseRatio: 0,
    },
    anomalies: [],
    insights: ["No revenue recorded yet."],
    recommendations: [],
  };
}

export async function runFinancialIntelligence(
  workspaceId: number
): Promise<FinancialIntelligenceResult> {
  const signals = await computeFinancialSignals(workspaceId);

  const anomalies = detectFinancialAnomalies(signals);
  const insights = generateInsights(signals);
  const recommendations = generateRecommendations(signals);

  return {
    signals,
    anomalies,
    insights,
    recommendations,
  };
}
