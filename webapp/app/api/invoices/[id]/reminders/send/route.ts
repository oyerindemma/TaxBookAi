import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  getInvoiceReminderSummary,
  sendInvoiceReminder,
} from "@/lib/invoice-reminders";
import { logRouteError } from "@/lib/logger";
import type { NotificationChannel } from "@/lib/notification-channel";
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

function parseChannels(value: unknown) {
  if (!Array.isArray(value)) return ["EMAIL"] as NotificationChannel[];
  const channels = value
    .map((item) => String(item ?? "").trim().toUpperCase())
    .filter((item) => item === "EMAIL" || item === "WHATSAPP");

  return channels.length > 0
    ? (channels as NotificationChannel[])
    : (["EMAIL"] as NotificationChannel[]);
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

  const existing = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      workspaceId: ctx.workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { channels?: unknown };
    const result = await sendInvoiceReminder({
      workspaceId: ctx.workspaceId,
      invoiceId,
      reminderType: "MANUAL",
      initiatedByUserId: ctx.userId,
      channels: parseChannels(body.channels),
      mode: "MANUAL",
    });
    const summary = await getInvoiceReminderSummary(ctx.workspaceId, invoiceId);

    const message =
      result.attempts.find((attempt) => attempt.status === "SENT")?.provider === "preview"
        ? "Reminder preview generated for local development."
        : result.attempts.some((attempt) => attempt.status === "SENT")
          ? "Reminder sent."
          : result.attempts[0]?.error ?? "Reminder could not be sent.";

    return NextResponse.json({
      ok: result.attempts.some((attempt) => attempt.status === "SENT"),
      result,
      summary,
      message,
    });
  } catch (error) {
    logRouteError("invoice reminder send failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send reminder.",
      },
      { status: 500 }
    );
  }
}
