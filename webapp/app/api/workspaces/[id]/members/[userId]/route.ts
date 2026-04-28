import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoleAtLeast } from "@/lib/auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id?: string; userId?: string }> };

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function DELETE(
  _req: Request,
  context: RouteContext
) {
  const { id, userId } = await context.params;
  const workspaceId = parseId(id);
  const targetUserId = parseId(userId);
  if (!workspaceId || !targetUserId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: targetUserId },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "OWNER") {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "At least one owner is required" },
        { status: 400 }
      );
    }
    if (auth.context.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can remove owners" },
        { status: 403 }
      );
    }
  }

  await prisma.workspaceMember.delete({ where: { id: target.id } });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      actorUserId: auth.context.userId,
      targetUserId: target.userId,
      action: "MEMBER_REMOVED",
      metadata: JSON.stringify({ role: target.role }),
    },
  });

  return NextResponse.json({ ok: true });
}
