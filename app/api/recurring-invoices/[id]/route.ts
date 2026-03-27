import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  generateRecurringInvoiceNow,
  getWorkspaceRecurringInvoice,
  parseRecurringInvoicePayload,
} from "@/lib/recurring-invoices";
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
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const recurringInvoiceId = parseId(id);
  if (!recurringInvoiceId) {
    return NextResponse.json({ error: "Invalid recurring invoice id" }, { status: 400 });
  }

  const recurringInvoice = await getWorkspaceRecurringInvoice(
    ctx.workspaceId,
    recurringInvoiceId
  );
  if (!recurringInvoice) {
    return NextResponse.json({ error: "Recurring invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ recurringInvoice });
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
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const recurringInvoiceId = parseId(id);
  if (!recurringInvoiceId) {
    return NextResponse.json({ error: "Invalid recurring invoice id" }, { status: 400 });
  }

  try {
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: recurringInvoiceId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Recurring invoice not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = parseRecurringInvoicePayload(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await prisma.recurringInvoice.update({
      where: { id: recurringInvoiceId },
      data: parsed.data,
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "RECURRING_INVOICE_UPDATED",
      metadata: {
        recurringInvoiceId,
        clientId: parsed.data.clientId,
        frequency: parsed.data.frequency,
        wasActive: existing.active,
        active: parsed.data.active,
      },
    });

    const recurringInvoice = await getWorkspaceRecurringInvoice(
      ctx.workspaceId,
      recurringInvoiceId
    );
    return NextResponse.json({ recurringInvoice });
  } catch (error) {
    logRouteError("recurring invoice update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recurringInvoiceId,
    });
    return NextResponse.json(
      { error: "Server error updating recurring invoice" },
      { status: 500 }
    );
  }
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const recurringInvoiceId = parseId(id);
  if (!recurringInvoiceId) {
    return NextResponse.json({ error: "Invalid recurring invoice id" }, { status: 400 });
  }

  try {
    const generated = await generateRecurringInvoiceNow({
      workspaceId: ctx.workspaceId,
      recurringInvoiceId,
      actorUserId: ctx.userId,
    });

    if ("error" in generated) {
      return NextResponse.json({ error: generated.error }, { status: 404 });
    }

    return NextResponse.json(generated);
  } catch (error) {
    logRouteError("recurring invoice generate failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recurringInvoiceId,
    });
    return NextResponse.json(
      { error: "Server error generating recurring invoice" },
      { status: 500 }
    );
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
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const recurringInvoiceId = parseId(id);
  if (!recurringInvoiceId) {
    return NextResponse.json({ error: "Invalid recurring invoice id" }, { status: 400 });
  }

  try {
    const existing = await prisma.recurringInvoice.findFirst({
      where: { id: recurringInvoiceId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Recurring invoice not found" }, { status: 404 });
    }

    await prisma.recurringInvoice.delete({ where: { id: recurringInvoiceId } });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "RECURRING_INVOICE_DELETED",
      metadata: {
        recurringInvoiceId,
        clientId: existing.clientId,
        frequency: existing.frequency,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("recurring invoice delete failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recurringInvoiceId,
    });
    return NextResponse.json(
      { error: "Server error deleting recurring invoice" },
      { status: 500 }
    );
  }
}
