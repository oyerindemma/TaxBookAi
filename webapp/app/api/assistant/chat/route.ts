import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthContext, getSessionFromCookies, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  buildAssistantAnswerDraft,
  buildWorkspaceAssistantContext,
} from "@/lib/assistant-context";
import { generateAssistantAnswer } from "@/lib/assistant-provider";
import type { AssistantMessage } from "@/lib/assistant-types";
import { hasOpenAiServerConfig } from "@/lib/env";
import { logInfo, logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parsePositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseHistory(value: unknown) {
  if (!Array.isArray(value)) return [] as AssistantMessage[];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const role =
        "role" in entry && (entry.role === "user" || entry.role === "assistant")
          ? entry.role
          : null;
      const content =
        "content" in entry && typeof entry.content === "string"
          ? entry.content.trim()
          : null;

      if (!role || !content) {
        return null;
      }

      return {
        role,
        content: content.slice(0, 1000),
      } satisfies AssistantMessage;
    })
    .filter(Boolean)
    .slice(-8) as AssistantMessage[];
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authContext = await getAuthContext();
    const workspaceId =
      parsePositiveInteger(body.workspaceId) ?? authContext?.workspaceId ?? null;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (message.length > 600) {
      return NextResponse.json(
        { error: "message must be 600 characters or less" },
        { status: 400 }
      );
    }

    const auth = await requireRoleAtLeast(workspaceId, "VIEWER");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "AI_ASSISTANT");
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

    const history = parseHistory(body.history);
    const workspaceContext = await buildWorkspaceAssistantContext(workspaceId);
    const draft = buildAssistantAnswerDraft({
      context: workspaceContext,
      message,
    });
    const providerResult = await generateAssistantAnswer({
      workspaceContext,
      draft,
      message,
      history,
    });
    const warnings = Array.from(
      new Set(
        [
          ...draft.warnings,
          ...(providerResult.warning ? [providerResult.warning] : []),
        ].filter(Boolean)
      )
    );
    const auditMetadata = {
      workspaceId,
      workspaceName: workspaceContext.workspace.name,
      questionPreview: message.slice(0, 160),
      questionLength: message.length,
      provider: providerResult.provider,
      mode: providerResult.mode,
      incompleteData: providerResult.incompleteData,
      warningCount: warnings.length,
      sectionLabels: draft.sectionLabels,
      citationCount: draft.citations.length,
      actionCount: draft.actions.length,
    };

    await logAudit({
      workspaceId,
      actorUserId: session.userId,
      action: "AI_ASSISTANT_CHAT_ASKED",
      metadata: auditMetadata,
    });

    logInfo("assistant", "answered workspace assistant question", {
      workspaceId,
      userId: session.userId,
      provider: providerResult.provider,
      mode: providerResult.mode,
      incompleteData: providerResult.incompleteData,
      sectionLabels: draft.sectionLabels,
      citationCount: draft.citations.length,
    });

    return NextResponse.json({
      answer: providerResult.answer,
      metrics: draft.metrics,
      citations: draft.citations,
      actions: draft.actions,
      warnings,
      suggestedPrompts: draft.suggestedPrompts,
      provider: providerResult.provider,
      mode: providerResult.mode,
      aiEnabled: hasOpenAiServerConfig(),
      incompleteData: providerResult.incompleteData,
      status: draft.status,
      auditMetadata,
    });
  } catch (error) {
    logRouteError("assistant chat failed", error, {
      userId: session.userId,
    });

    return NextResponse.json(
      { error: "Server error running workspace assistant" },
      { status: 500 }
    );
  }
}
