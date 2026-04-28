import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { enforceMemberLimit } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { token } = body as { token?: string };
    if (!token || !token.trim()) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const invite = await prisma.invite.findUnique({
      where: { token: token.trim() },
      include: {
        workspace: {
          select: {
            archivedAt: true,
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: "Invite already accepted" }, { status: 400 });
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    if (invite.workspace.archivedAt) {
      return NextResponse.json(
        { error: "This workspace has been archived" },
        { status: 409 }
      );
    }

    const sessionEmail = session.user.email.trim().toLowerCase();
    if (sessionEmail !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Invite email does not match logged in user" },
        { status: 403 }
      );
    }

    const existing = await prisma.workspaceMember.findFirst({
      where: { workspaceId: invite.workspaceId, userId: session.userId },
    });

    if (!existing) {
      const limitCheck = await enforceMemberLimit(invite.workspaceId, 1, false);
      if (!limitCheck.ok) {
        return NextResponse.json({ error: limitCheck.error }, { status: 402 });
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (!existing) {
        await tx.workspaceMember.create({
          data: {
            workspaceId: invite.workspaceId,
            userId: session.userId,
            role: invite.role,
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: invite.workspaceId,
          actorUserId: session.userId,
          targetUserId: session.userId,
          action: "INVITE_ACCEPTED",
          metadata: JSON.stringify({ inviteId: invite.id }),
        },
      });
    });

    const res = NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
    res.cookies.set(
      WORKSPACE_COOKIE_NAME,
      String(invite.workspaceId),
      buildWorkspaceCookieOptions()
    );
    return res;
  } catch (error) {
    logRouteError("invite accept failed", error, {
      sessionUserId: session.userId,
    });
    return NextResponse.json(
      { error: "Server error accepting invite" },
      { status: 500 }
    );
  }
}
