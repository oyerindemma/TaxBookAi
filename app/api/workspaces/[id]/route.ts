import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildWorkspaceCookieOptions,
  findFallbackWorkspaceId,
  getUserWorkspaceSummary,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const name =
      typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
    const archive = body?.archive === true;

    if (!name && !archive) {
      return NextResponse.json(
        { error: "name or archive action is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        archivedAt: true,
      },
    });

    if (!existing || existing.archivedAt) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const updateData: {
      name?: string;
      archivedAt?: Date;
    } = {};

    if (name && name !== existing.name) {
      updateData.name = name;
    }

    if (archive) {
      updateData.archivedAt = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      const workspace = await getUserWorkspaceSummary(auth.context.userId, workspaceId);
      return NextResponse.json({ workspace });
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    if (updateData.name) {
      await logAudit({
        workspaceId,
        actorUserId: auth.context.userId,
        action: "WORKSPACE_RENAMED",
        metadata: {
          previousName: existing.name,
          name: updateData.name,
        },
      });
    }

    let nextActiveWorkspaceId: number | null = null;
    if (archive) {
      await logAudit({
        workspaceId,
        actorUserId: auth.context.userId,
        action: "WORKSPACE_ARCHIVED",
        metadata: {
          name: updateData.name ?? existing.name,
        },
      });
    }

    const workspace = await getUserWorkspaceSummary(auth.context.userId, workspaceId);
    if (archive) {
      const cookieStore = await cookies();
      const currentWorkspaceId = Number(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);
      if (currentWorkspaceId === workspaceId) {
        nextActiveWorkspaceId = await findFallbackWorkspaceId(
          auth.context.userId,
          workspaceId
        );
        const response = NextResponse.json({
          workspace,
          activeWorkspaceId: nextActiveWorkspaceId,
        });
        if (nextActiveWorkspaceId) {
          response.cookies.set(
            WORKSPACE_COOKIE_NAME,
            String(nextActiveWorkspaceId),
            buildWorkspaceCookieOptions()
          );
        } else {
          response.cookies.set(WORKSPACE_COOKIE_NAME, "", {
            ...buildWorkspaceCookieOptions(),
            maxAge: 0,
          });
        }
        return response;
      }
    }

    return NextResponse.json({
      workspace,
      activeWorkspaceId: nextActiveWorkspaceId,
    });
  } catch (error) {
    logRouteError("workspace update failed", error, {
      workspaceId,
      actorUserId: auth.context.userId,
    });
    return NextResponse.json(
      { error: "Server error updating workspace" },
      { status: 500 }
    );
  }
}
