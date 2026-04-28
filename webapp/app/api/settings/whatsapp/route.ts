import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  createWorkspaceWhatsAppReceiptConnection,
  createWorkspaceWhatsAppReceiptSenderMapping,
  getWorkspaceWhatsAppReceiptSettings,
  updateWorkspaceWhatsAppReceiptConnection,
  updateWorkspaceWhatsAppReceiptSenderMapping,
} from "@/lib/whatsapp-receipt-capture";
import { createRouteLogger } from "@/lib/observability";

export const runtime = "nodejs";

type MutationBody = {
  entity?: "connection" | "senderMapping";
  id?: number;
} & Record<string, unknown>;

function isConflictError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/settings/whatsapp", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const settings = await getWorkspaceWhatsAppReceiptSettings({
    workspaceId: ctx.workspaceId,
    role: auth.context.role,
  });

  logger.info("settings loaded", {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
  });

  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/settings/whatsapp", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as MutationBody;
    const entity = body.entity;

    const mutationResult =
      entity === "senderMapping"
        ? await createWorkspaceWhatsAppReceiptSenderMapping({
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            payload: body,
          })
        : await createWorkspaceWhatsAppReceiptConnection({
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            payload: body,
          });

    if ("error" in mutationResult) {
      return NextResponse.json({ error: mutationResult.error }, { status: 400 });
    }

    const settings = await getWorkspaceWhatsAppReceiptSettings({
      workspaceId: ctx.workspaceId,
      role: auth.context.role,
    });

    logger.info("settings mutation created", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      entity,
    });

    return NextResponse.json(settings, { status: 201 });
  } catch (error) {
    if (isConflictError(error)) {
      return NextResponse.json(
        { error: "This WhatsApp connection or sender mapping already exists." },
        { status: 409 }
      );
    }

    logger.error("settings mutation failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      method: "POST",
    });

    return NextResponse.json(
      { error: "Failed to save WhatsApp settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const logger = createRouteLogger("/api/settings/whatsapp", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as MutationBody;
    const entity = body.entity;
    const id =
      typeof body.id === "number"
        ? body.id
        : typeof body.id === "string"
          ? Number(body.id)
          : NaN;

    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const mutationResult =
      entity === "senderMapping"
        ? await updateWorkspaceWhatsAppReceiptSenderMapping({
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            mappingId: id,
            payload: body,
          })
        : await updateWorkspaceWhatsAppReceiptConnection({
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            connectionId: id,
            payload: body,
          });

    if ("error" in mutationResult) {
      const status =
        mutationResult.error === "Connection not found." ||
        mutationResult.error === "Sender mapping not found."
          ? 404
          : 400;
      return NextResponse.json({ error: mutationResult.error }, { status });
    }

    const settings = await getWorkspaceWhatsAppReceiptSettings({
      workspaceId: ctx.workspaceId,
      role: auth.context.role,
    });

    logger.info("settings mutation updated", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      entity,
      id,
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (isConflictError(error)) {
      return NextResponse.json(
        { error: "This WhatsApp connection or sender mapping already exists." },
        { status: 409 }
      );
    }

    logger.error("settings update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      method: "PATCH",
    });

    return NextResponse.json(
      { error: "Failed to update WhatsApp settings" },
      { status: 500 }
    );
  }
}
