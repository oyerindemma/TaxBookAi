import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createStubInvoicePaymentLink } from "@/lib/invoice-payments";
import { getWorkspaceInvoiceDetail } from "@/lib/invoice-records";
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

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const invoiceId = parseId(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  try {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId: ctx.workspaceId },
      include: { client: true, items: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (existing.status === "PAID") {
      return NextResponse.json(
        { error: "Paid invoices do not need a payment link" },
        { status: 400 }
      );
    }

    if (existing.paymentReference && existing.paymentUrl) {
      const detail = await getWorkspaceInvoiceDetail(ctx.workspaceId, existing.id);
      return NextResponse.json({
        invoice: detail ?? existing,
        paymentReference: existing.paymentReference,
        paymentUrl: existing.paymentUrl,
        created: false,
      });
    }

    const paymentLink = createStubInvoicePaymentLink({
      invoiceId: existing.id,
      requestUrl: req.url,
    });

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        paymentReference: paymentLink.paymentReference,
        paymentUrl: paymentLink.paymentUrl,
      },
      include: { client: true, items: true },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "INVOICE_PAYMENT_LINK_CREATED",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentReference: paymentLink.paymentReference,
        paymentUrl: paymentLink.paymentUrl,
        provider: paymentLink.provider,
      },
    });

    const detail = await getWorkspaceInvoiceDetail(ctx.workspaceId, invoice.id);

    return NextResponse.json({
      invoice: detail ?? invoice,
      paymentReference: paymentLink.paymentReference,
      paymentUrl: paymentLink.paymentUrl,
      created: true,
    });
  } catch (error) {
    logRouteError("invoice payment link create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json(
      { error: "Server error creating payment link" },
      { status: 500 }
    );
  }
}
