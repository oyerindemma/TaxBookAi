import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  getClientDisplayName,
  getWorkspaceClientDetail,
  listWorkspaceClients,
  parseClientPayload,
} from "@/lib/clients";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clients = await listWorkspaceClients(ctx.workspaceId);
  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const parsed = parseClientPayload(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const client = await prisma.client.create({
      data: {
        workspaceId: ctx.workspaceId,
        ...parsed.data,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "CLIENT_CREATED",
      metadata: {
        clientId: client.id,
        displayName: getClientDisplayName(client),
        email: client.email,
        taxId: client.taxId,
      },
    });

    const hydratedClient = await getWorkspaceClientDetail(ctx.workspaceId, client.id);

    return NextResponse.json({ client: hydratedClient ?? client }, { status: 201 });
  } catch (error) {
    logRouteError("client create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Server error creating client" }, { status: 500 });
  }
}
