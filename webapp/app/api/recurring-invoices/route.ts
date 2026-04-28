import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  getWorkspaceRecurringInvoice,
  listWorkspaceRecurringInvoices,
  parseRecurringInvoicePayload,
} from "@/lib/recurring-invoices";
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
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const recurringInvoices = await listWorkspaceRecurringInvoices(ctx.workspaceId);
  return NextResponse.json({ recurringInvoices });
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
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "RECURRING_INVOICES");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  try {
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

    const recurringInvoice = await prisma.recurringInvoice.create({
      data: {
        workspaceId: ctx.workspaceId,
        ...parsed.data,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "RECURRING_INVOICE_CREATED",
      metadata: {
        recurringInvoiceId: recurringInvoice.id,
        clientId: recurringInvoice.clientId,
        frequency: recurringInvoice.frequency,
      },
    });

    const hydrated = await getWorkspaceRecurringInvoice(ctx.workspaceId, recurringInvoice.id);
    return NextResponse.json(
      { recurringInvoice: hydrated ?? recurringInvoice },
      { status: 201 }
    );
  } catch (error) {
    logRouteError("recurring invoice create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error creating recurring invoice" },
      { status: 500 }
    );
  }
}
