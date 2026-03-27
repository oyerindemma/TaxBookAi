import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  answerFinanceAssistantQuestion,
  type FinanceAssistantMessage,
} from "@/lib/finance-assistant";
import { logInfo, logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseHistory(value: unknown) {
  if (!Array.isArray(value)) return [] as FinanceAssistantMessage[];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role =
        "role" in item && (item.role === "user" || item.role === "assistant")
          ? item.role
          : null;
      const content =
        "content" in item && typeof item.content === "string" ? item.content : null;
      if (!role || !content) return null;
      return {
        role,
        content,
      } satisfies FinanceAssistantMessage;
    })
    .filter(Boolean)
    .slice(-8) as FinanceAssistantMessage[];
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "AI_ASSISTANT");
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    if (question.length > 600) {
      return NextResponse.json(
        { error: "question must be 600 characters or less" },
        { status: 400 }
      );
    }

    const result = await answerFinanceAssistantQuestion({
      workspaceId: ctx.workspaceId,
      role: auth.context.role,
      question,
      history: parseHistory(body.history),
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "AI_FINANCE_ASSISTANT_ASKED",
      metadata: result.auditMetadata,
    });

    logInfo("finance-assistant", "answered workspace question", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      toolsInvoked: result.toolsInvoked,
      sourceCount: result.sources.length,
      actionCount: result.followUpActions.length,
      mode: result.mode,
      incompleteData: result.incompleteData,
      requiresConfirmation: result.requiresConfirmation,
    });

    return NextResponse.json({
      answer: result.answer,
      supportingMetrics: result.supportingMetrics,
      toolsInvoked: result.toolsInvoked,
      sources: result.sources,
      followUpActions: result.followUpActions,
      warnings: result.warnings,
      mode: result.mode,
      aiEnabled: result.aiEnabled,
      requiresConfirmation: result.requiresConfirmation,
      incompleteData: result.incompleteData,
      suggestedPrompts: result.suggestedPrompts,
    });
  } catch (error) {
    logRouteError("ai finance assistant failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error running finance assistant" },
      { status: 500 }
    );
  }
}
