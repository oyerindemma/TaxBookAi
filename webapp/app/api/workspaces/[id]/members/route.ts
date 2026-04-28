import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
type WorkspaceRole = (typeof ROLES)[number];
type RouteContext = { params: Promise<{ id?: string }> };

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(
  _req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "TEAM_COLLABORATION");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((member) => ({
      userId: member.userId,
      fullName: member.user.fullName,
      email: member.user.email,
      role: member.role,
      joinedAt: member.createdAt,
    })),
  });
}

export async function PATCH(
  req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "TEAM_COLLABORATION");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  try {
    const body = await req.json();
    const { userId, role } = body as { userId?: number; role?: WorkspaceRole };
    if (!userId || !Number.isInteger(userId)) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!role || !ROLES.includes(role)) {
      return NextResponse.json({ error: "role is invalid" }, { status: 400 });
    }

    const target = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (role === "OWNER" && auth.context.role !== "OWNER") {
      return NextResponse.json({ error: "Only owners can assign owner" }, { status: 403 });
    }
    if (target.role === "OWNER" && role !== "OWNER" && auth.context.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can change owner role" },
        { status: 403 }
      );
    }

    if (target.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "At least one owner is required" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: auth.context.userId,
        targetUserId: updated.userId,
        action: "MEMBER_ROLE_UPDATED",
        metadata: JSON.stringify({ role }),
      },
    });

    return NextResponse.json({
      member: { userId: updated.userId, role: updated.role },
    });
  } catch (error) {
    logRouteError("workspace member role update failed", error, {
      workspaceId,
      actorUserId: auth.context.userId,
    });
    return NextResponse.json(
      { error: "Server error updating member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "TEAM_COLLABORATION");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  let body: { userId?: number } | undefined;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }

  const userId = body?.userId;
  if (!userId || !Number.isInteger(userId)) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const target = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
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
