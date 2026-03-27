import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  buildInvoicePortalAccessUrl,
  createInvoicePortalToken,
  getInvoicePortalExpiry,
} from "@/lib/invoice-portal";
import { createStubInvoicePaymentLink } from "@/lib/invoice-payments";
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
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        workspaceId: ctx.workspaceId,
      },
      select: {
        id: true,
        workspaceId: true,
        invoiceNumber: true,
        status: true,
        dueDate: true,
        paymentReference: true,
        paymentUrl: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "DRAFT") {
      return NextResponse.json(
        { error: "Draft invoices are not ready for client portal sharing." },
        { status: 409 }
      );
    }

    let paymentReference = invoice.paymentReference;
    let paymentUrl = invoice.paymentUrl;

    if (invoice.status !== "PAID" && (!paymentReference || !paymentUrl)) {
      const paymentLink = createStubInvoicePaymentLink({
        invoiceId: invoice.id,
        requestUrl: req.url,
      });

      const updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          paymentReference: paymentLink.paymentReference,
          paymentUrl: paymentLink.paymentUrl,
        },
        select: {
          paymentReference: true,
          paymentUrl: true,
        },
      });

      paymentReference = updated.paymentReference;
      paymentUrl = updated.paymentUrl;

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "INVOICE_PAYMENT_LINK_CREATED",
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentReference,
          paymentUrl,
          provider: "stub",
          source: "portal_link",
        },
      });
    }

    const { token, expiresAt } = createInvoicePortalToken({
      invoiceId: invoice.id,
      expiresAt: getInvoicePortalExpiry(invoice.dueDate),
    });
    const portalUrl = buildInvoicePortalAccessUrl(req.url, token);

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "INVOICE_PORTAL_LINK_CREATED",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentReference,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      portalUrl,
      expiresAt: expiresAt.toISOString(),
      paymentReference,
      paymentUrl,
    });
  } catch (error) {
    logRouteError("invoice portal link create failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json(
      { error: "Server error creating client portal link" },
      { status: 500 }
    );
  }
}
