import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { seedPhase2DevWorkspace } from "@/lib/dev-workspace-seed";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { runWorkspaceProductAutomation } from "@/lib/workspace-product-automation";

export const runtime = "nodejs";

type SeedWorkspaceBody = {
  resetExisting?: unknown;
  runAutomation?: unknown;
};

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

async function readBody(req: Request): Promise<SeedWorkspaceBody> {
  try {
    return (await req.json()) as SeedWorkspaceBody;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "Dev workspace seeding is disabled in production.",
      },
      { status: 403 }
    );
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await readBody(req);
    const url = new URL(req.url);
    const resetExisting =
      parseBoolean(url.searchParams.get("reset")) ??
      parseBoolean(body.resetExisting) ??
      false;
    const runAutomation =
      parseBoolean(url.searchParams.get("runAutomation")) ??
      parseBoolean(body.runAutomation) ??
      true;

    const seed = await seedPhase2DevWorkspace(prisma, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      resetExisting,
    });

    const automation = runAutomation
      ? await runWorkspaceProductAutomation({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          role: auth.context.role,
        })
      : null;

    return NextResponse.json(
      {
        ok: true,
        message: "Phase 2 dev data seeded for the active workspace.",
        seed,
        automation,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logRouteError("/api/system/dev/seed-workspace", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      {
        error: "Unable to seed the active workspace right now.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
