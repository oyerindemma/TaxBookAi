import { NextResponse } from "next/server";
import { getSessionFromCookies, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  buildWorkspaceCookieOptions,
  getUserWorkspaceSummary,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { workspaceId } = body as { workspaceId?: number | string };
    const parsedId = Number(workspaceId);
    if (!Number.isFinite(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const auth = await requireRoleAtLeast(parsedId, "VIEWER");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await logAudit({
      workspaceId: parsedId,
      actorUserId: auth.context.userId,
      action: "WORKSPACE_SELECTED",
    });
    const workspaceSummary = await getUserWorkspaceSummary(auth.context.userId, parsedId);

    const res = NextResponse.json({
      ok: true,
      redirectTo: workspaceSummary?.onboardingComplete ? "/dashboard" : "/onboarding",
    });
    res.cookies.set(
      WORKSPACE_COOKIE_NAME,
      String(parsedId),
      buildWorkspaceCookieOptions()
    );
    return res;
  } catch (error) {
    logRouteError("workspace select failed", error, {
      sessionUserId: session.userId,
    });
    return NextResponse.json(
      { error: "Server error selecting workspace" },
      { status: 500 }
    );
  }
}
