import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  buildInvoicePaymentPostingSnapshot,
  confirmInvoicePaymentById,
} from "@/lib/invoice-payments";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id?: string }> };

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parsePaidAt(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
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
    let body: { paidAt?: unknown } = {};
    try {
      body = (await req.json()) as { paidAt?: unknown };
    } catch {
      body = {};
    }

    const paidAt = parsePaidAt(body.paidAt);
    if (paidAt === null) {
      return NextResponse.json({ error: "Invalid paidAt" }, { status: 400 });
    }

    const confirmed = await confirmInvoicePaymentById({
      invoiceId,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      paidAt,
    });

    if ("error" in confirmed) {
      const status =
        confirmed.error === "Invoice not found"
          ? 404
          : confirmed.error === "Payment amount does not match invoice total"
            ? 400
            : 409;
      return NextResponse.json({ error: confirmed.error }, { status });
    }

    const snapshot = await buildInvoicePaymentPostingSnapshot({
      invoiceId,
      workspaceId: ctx.workspaceId,
      alreadyProcessed: confirmed.alreadyProcessed,
      ledgerEntryId: confirmed.ledgerEntryId,
      taxRecordId: confirmed.taxRecordId,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({
      invoice: snapshot.invoice,
      confirmation: snapshot.confirmation,
    });
  } catch (error) {
    logRouteError("invoice mark-paid failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json(
      { error: "Server error confirming invoice payment" },
      { status: 500 }
    );
  }
}
