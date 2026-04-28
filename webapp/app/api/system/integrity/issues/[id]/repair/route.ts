import { NextResponse } from "next/server";
import { requireRoleAtLeast } from "@/lib/auth";
import { repairFinancialIntegrityIssueById } from "@/lib/financial-integrity";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id?: string }> };

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const issueId = parseId(id);

  if (!issueId) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }

  const issue = await prisma.integrityIssue.findUnique({
    where: { id: issueId },
    select: { id: true, workspaceId: true },
  });

  if (!issue) {
    return NextResponse.json({ error: "Integrity issue not found" }, { status: 404 });
  }

  const auth = await requireRoleAtLeast(issue.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await repairFinancialIntegrityIssueById({
      issueId,
      actorUserId: auth.context.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    logRouteError("financial integrity repair failed", error, {
      issueId,
      workspaceId: issue.workspaceId,
      userId: auth.context.userId,
    });
    return NextResponse.json(
      { error: "Unable to repair this integrity issue right now." },
      { status: 500 }
    );
  }
}
