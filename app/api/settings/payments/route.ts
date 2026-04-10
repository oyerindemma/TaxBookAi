import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { createRouteLogger } from "@/lib/observability";
import {
  getWorkspacePaymentIntegrationSettings,
  upsertWorkspacePaymentProviderConnection,
} from "@/lib/payment-tax-integration";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/settings/payments", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const settings = await getWorkspacePaymentIntegrationSettings({
    workspaceId: ctx.workspaceId,
    role: auth.context.role,
  });

  logger.info("payment settings loaded", {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
  });

  return NextResponse.json(settings);
}

async function mutateSettings(req: Request, method: "POST" | "PATCH") {
  const logger = createRouteLogger("/api/settings/payments", req, { method });
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mutation = await upsertWorkspacePaymentProviderConnection({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      payload: body,
    });

    if ("error" in mutation) {
      return NextResponse.json({ error: mutation.error }, { status: 400 });
    }

    const settings = await getWorkspacePaymentIntegrationSettings({
      workspaceId: ctx.workspaceId,
      role: auth.context.role,
    });

    logger.info("payment settings saved", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      connectionId: mutation.connectionId,
    });

    return NextResponse.json(settings, { status: method === "POST" ? 201 : 200 });
  } catch (error) {
    logger.error("payment settings mutation failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to save payment integration settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return mutateSettings(req, "POST");
}

export async function PATCH(req: Request) {
  return mutateSettings(req, "PATCH");
}
