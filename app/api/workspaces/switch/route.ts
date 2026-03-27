import { NextResponse } from "next/server";
import { requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
      action: "WORKSPACE_SWITCHED",
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      WORKSPACE_COOKIE_NAME,
      String(parsedId),
      buildWorkspaceCookieOptions()
    );
    return res;
  } catch (error) {
    logRouteError("workspace switch failed", error);
    return NextResponse.json(
      { error: "Server error switching workspace" },
      { status: 500 }
    );
  }
}
