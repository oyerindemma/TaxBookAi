import { NextResponse } from "next/server";
import { requireRoleAtLeast } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveFinancialIntegrityIssueById } from "@/lib/financial-integrity";

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

export async function POST(req: Request, context: RouteContext) {
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
    let body: { mode?: unknown } = {};
    try {
      body = (await req.json()) as { mode?: unknown };
    } catch {
      body = {};
    }

    const mode = body.mode === "ignore" ? "ignore" : "resolve";
    const result = await resolveFinancialIntegrityIssueById({
      issueId,
      actorUserId: auth.context.userId,
      mode,
    });

    return NextResponse.json(result);
  } catch (error) {
    logRouteError("financial integrity resolve failed", error, {
      issueId,
      workspaceId: issue.workspaceId,
      userId: auth.context.userId,
    });
    return NextResponse.json(
      { error: "Unable to update this integrity issue right now." },
      { status: 500 }
    );
  }
}
