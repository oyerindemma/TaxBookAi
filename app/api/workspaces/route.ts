import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  buildWorkspaceCookieOptions,
  getActiveWorkspaceMembership,
  getUserWorkspaceSummary,
  listUserWorkspaceSummaries,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [workspaceSummaries, activeMembership] = await Promise.all([
    listUserWorkspaceSummaries(session.userId),
    getActiveWorkspaceMembership(session.userId),
  ]);
  const activeWorkspaces = workspaceSummaries.filter((workspace) => !workspace.archivedAt);

  return NextResponse.json({
    activeWorkspaceId: activeMembership?.workspaceId ?? null,
    archivedWorkspacesCount: workspaceSummaries.length - activeWorkspaces.length,
    totalWorkspaceCount: workspaceSummaries.length,
    workspaces: activeWorkspaces,
  });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = body as { name?: string };
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const workspace = await prisma.$transaction(async (tx) => {
      const createdWorkspace = await tx.workspace.create({
        data: {
          name: trimmedName,
          members: {
            create: {
              userId: session.userId,
              role: "OWNER",
            },
          },
          subscription: {
            create: {
              plan: "STARTER",
              status: "free",
            },
          },
        },
      });

      await seedDefaultExpenseCategories(tx, createdWorkspace.id);

      return createdWorkspace;
    });

    await logAudit({
      workspaceId: workspace.id,
      actorUserId: session.userId,
      action: "WORKSPACE_CREATED",
      metadata: { name: workspace.name },
    });

    const workspaceSummary = await getUserWorkspaceSummary(session.userId, workspace.id);
    const res = NextResponse.json({
      workspace:
        workspaceSummary ?? {
          id: workspace.id,
          name: workspace.name,
          role: "OWNER",
          archivedAt: null,
          createdAt: workspace.createdAt,
          businessName: null,
          onboardingComplete: false,
          membersCount: 1,
          invoicesCount: 0,
          taxRecordsCount: 0,
          clientBusinessCount: 0,
          workspaceKind: "STANDARD",
          transactionCount: 0,
          plan: "STARTER",
          subscriptionLabel: "Starter",
        },
    });
    res.cookies.set(
      WORKSPACE_COOKIE_NAME,
      String(workspace.id),
      buildWorkspaceCookieOptions()
    );
    return res;
  } catch (error) {
    logRouteError("workspace create failed", error, {
      sessionUserId: session.userId,
    });
    return NextResponse.json(
      { error: "Server error creating workspace" },
      { status: 500 }
    );
  }
}
