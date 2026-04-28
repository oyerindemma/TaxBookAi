import type { FilingEvidenceKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { addCitWorkflowEvidence } from "@/lib/cit-workflow";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const EVIDENCE_KINDS = new Set<FilingEvidenceKind>([
  "SOURCE_DOCUMENT",
  "NOTE",
  "SUPPORT_SCHEDULE",
  "BANK_PROOF",
  "OTHER",
]);

function parseId(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseEvidenceKind(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return EVIDENCE_KINDS.has(normalized as FilingEvidenceKind)
    ? (normalized as FilingEvidenceKind)
    : "OTHER";
}

export async function POST(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "TAX_FILING_ASSISTANT"
    );
    if (!featureAccess.ok) {
      return NextResponse.json({ error: featureAccess.error }, { status: 402 });
    }

    const { id } = await context.params;
    const citPeriodId = parseId(id);
    if (!citPeriodId) {
      return NextResponse.json({ error: "Invalid CIT period id." }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const detail = await addCitWorkflowEvidence({
      workspaceId: ctx.workspaceId,
      citPeriodId,
      actorUserId: ctx.userId,
      label: typeof body.label === "string" ? body.label : "",
      evidenceKind: parseEvidenceKind(body.evidenceKind),
      note: typeof body.note === "string" ? body.note : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      taxAdjustmentId:
        typeof body.taxAdjustmentId === "number" && Number.isInteger(body.taxAdjustmentId)
          ? body.taxAdjustmentId
          : typeof body.taxAdjustmentId === "string"
            ? parseId(body.taxAdjustmentId)
            : undefined,
    });

    return NextResponse.json({ detail });
  } catch (error) {
    logRouteError("cit evidence attach failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to attach CIT evidence." },
      { status: 400 }
    );
  }
}
