import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  getClientDisplayName,
  getWorkspaceClientDetail,
  parseClientPayload,
} from "@/lib/clients";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientId = parseId(id);
  if (!clientId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const client = await getWorkspaceClientDetail(ctx.workspaceId, clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({ client });
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientId = parseId(id);
  if (!clientId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  try {
    const existing = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = parseClientPayload(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: parsed.data,
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "CLIENT_UPDATED",
      metadata: {
        clientId: updated.id,
        beforeDisplayName: getClientDisplayName(existing),
        displayName: getClientDisplayName(updated),
        email: updated.email,
        taxId: updated.taxId,
      },
    });

    const client = await getWorkspaceClientDetail(ctx.workspaceId, clientId);
    return NextResponse.json({ client: client ?? updated });
  } catch (error) {
    logRouteError("client update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      clientId,
    });
    return NextResponse.json({ error: "Server error updating client" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientId = parseId(id);
  if (!clientId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  try {
    const existing = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: ctx.workspaceId },
      include: {
        invoices: {
          select: { id: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (existing.invoices.length > 0) {
      return NextResponse.json(
        {
          error:
            "This client has invoice history and cannot be deleted. Update the record instead.",
        },
        { status: 409 }
      );
    }

    await prisma.client.delete({
      where: { id: clientId },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "CLIENT_DELETED",
      metadata: {
        clientId,
        displayName: getClientDisplayName(existing),
        email: existing.email,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("client delete failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      clientId,
    });
    return NextResponse.json({ error: "Server error deleting client" }, { status: 500 });
  }
}
