import "server-only";

import type { WorkspaceRole } from "@prisma/client";
import { bulkSuggestWorkspaceBankTransactionAutoBookkeeping } from "@/lib/bank-transaction-auto-bookkeeping";
import { getDashboardExpenseLeakSnapshot } from "@/lib/expense-leaks";
import { buildExplainMyNumbersHomeState } from "@/lib/explain-my-numbers-assistant";
import { getDashboardFilingReadinessSnapshot } from "@/lib/filing-readiness";
import { logError } from "@/lib/logger";
import { getDashboardTaxCardSnapshot } from "@/lib/transaction-tax";
import { getDashboardWorkspaceAlertSnapshot } from "@/lib/workspace-alerts";

export type WorkspaceProductAutomationSnapshot = {
  autoBookkeeping: {
    processedCount: number;
    updatedCount: number;
    skippedCount: number;
  } | null;
  taxCards: {
    totalDueMinor: number;
    vatDueMinor: number;
    whtDueMinor: number;
    dateLabel: string;
  } | null;
  filingReadiness: {
    score: number;
    status: string;
    blockerCount: number;
  } | null;
  alerts: {
    openCount: number;
    criticalCount: number;
    topAlertCount: number;
  } | null;
  expenseLeaks: {
    openCount: number;
    criticalCount: number;
    topFindingCount: number;
    openEstimatedSavingsMinor: number;
  } | null;
  assistant: {
    summary: string;
    quickInsightCount: number;
    aiEnabled: boolean;
  } | null;
};

async function runAutomationStepSafely<T>(input: {
  label: string;
  workspaceId: number;
  query: Promise<T>;
}): Promise<T | null> {
  try {
    return await input.query;
  } catch (error) {
    logError(
      "workspace-product-automation",
      `Workspace product automation step "${input.label}" failed; continuing with the remaining steps.`,
      error,
      {
        workspaceId: input.workspaceId,
      }
    );
    return null;
  }
}

export async function runWorkspaceProductAutomation(input: {
  workspaceId: number;
  actorUserId: number;
  role: WorkspaceRole;
}): Promise<WorkspaceProductAutomationSnapshot> {
  const autoBookkeeping = await runAutomationStepSafely({
    workspaceId: input.workspaceId,
    label: "auto bookkeeping suggestions",
    query: bulkSuggestWorkspaceBankTransactionAutoBookkeeping({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      limit: 200,
    }),
  });

  const [taxCards, filingReadiness, alerts, expenseLeaks, assistant] = await Promise.all([
    runAutomationStepSafely({
      workspaceId: input.workspaceId,
      label: "dashboard tax cards",
      query: getDashboardTaxCardSnapshot(input.workspaceId),
    }),
    runAutomationStepSafely({
      workspaceId: input.workspaceId,
      label: "filing readiness snapshot",
      query: getDashboardFilingReadinessSnapshot(input.workspaceId),
    }),
    runAutomationStepSafely({
      workspaceId: input.workspaceId,
      label: "workspace alerts snapshot",
      query: getDashboardWorkspaceAlertSnapshot(input.workspaceId),
    }),
    runAutomationStepSafely({
      workspaceId: input.workspaceId,
      label: "expense leak snapshot",
      query: getDashboardExpenseLeakSnapshot(input.workspaceId),
    }),
    runAutomationStepSafely({
      workspaceId: input.workspaceId,
      label: "explain-my-numbers home state",
      query: buildExplainMyNumbersHomeState({
        workspaceId: input.workspaceId,
        role: input.role,
      }),
    }),
  ]);

  return {
    autoBookkeeping,
    taxCards: taxCards
      ? {
          totalDueMinor: taxCards.totalDueMinor,
          vatDueMinor: taxCards.vatDueMinor,
          whtDueMinor: taxCards.whtDueMinor,
          dateLabel: taxCards.dateLabel,
        }
      : null,
    filingReadiness: filingReadiness
      ? {
          score: filingReadiness.score,
          status: filingReadiness.status,
          blockerCount: filingReadiness.blockerCount,
        }
      : null,
    alerts: alerts
      ? {
          openCount: alerts.summary.openCount,
          criticalCount: alerts.summary.criticalCount,
          topAlertCount: alerts.topAlerts.length,
        }
      : null,
    expenseLeaks: expenseLeaks
      ? {
          openCount: expenseLeaks.summary.openCount,
          criticalCount: expenseLeaks.summary.criticalCount,
          topFindingCount: expenseLeaks.topFindings.length,
          openEstimatedSavingsMinor: expenseLeaks.summary.openEstimatedSavingsMinor,
        }
      : null,
    assistant: assistant
      ? {
          summary: assistant.summary,
          quickInsightCount: assistant.quickInsights.length,
          aiEnabled: assistant.aiEnabled,
        }
      : null,
  };
}
