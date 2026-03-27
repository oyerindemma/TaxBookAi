import "server-only";

import type { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { formatCurrencyNGN, formatDashboardDate } from "@/lib/dashboard-formatting";
import { getAppUrl } from "@/lib/env";
import {
  buildInvoicePaymentReference,
  buildInvoicePaymentUrl,
} from "@/lib/invoice-payments";
import {
  buildInvoicePortalAccessUrl,
  createInvoicePortalToken,
  getInvoicePortalExpiry,
} from "@/lib/invoice-portal";
import { startOfToday } from "@/lib/invoices";
import { logError, logInfo } from "@/lib/logger";
import {
  type NotificationChannel,
  type NotificationSendResult,
  sendEmailNotification,
  sendWhatsAppNotification,
} from "@/lib/notification-channel";
import { prisma } from "@/lib/prisma";

export type InvoiceReminderType =
  | "INVOICE_SENT"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE_3"
  | "OVERDUE_7"
  | "MANUAL";

export type InvoiceReminderAttemptStatus = "SENT" | "FAILED" | "SKIPPED";

export type InvoiceReminderHistoryEntry = {
  createdAt: string;
  type: InvoiceReminderType;
  typeLabel: string;
  channel: NotificationChannel;
  status: InvoiceReminderAttemptStatus;
  delivered: boolean;
  provider: string;
  recipient: string | null;
  error: string | null;
};

export type InvoiceReminderSummary = {
  lastSentAt: string | null;
  lastSentLabel: string | null;
  lastSentChannel: NotificationChannel | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: InvoiceReminderAttemptStatus | null;
  lastFailureMessage: string | null;
  nextReminderAt: string | null;
  nextReminderLabel: string | null;
  history: InvoiceReminderHistoryEntry[];
};

export type InvoiceReminderDispatchResult = {
  invoiceId: number;
  invoiceNumber: string;
  reminderType: InvoiceReminderType;
  attempts: InvoiceReminderHistoryEntry[];
};

type ReminderAuditAction =
  | "INVOICE_REMINDER_SENT"
  | "INVOICE_REMINDER_FAILED"
  | "INVOICE_REMINDER_SKIPPED";

type ReminderAuditMetadata = {
  invoiceId?: number;
  invoiceNumber?: string;
  reminderType?: InvoiceReminderType;
  channel?: NotificationChannel;
  recipient?: string | null;
  delivered?: boolean;
  provider?: string | null;
  error?: string | null;
  scheduledFor?: string | null;
  mode?: "AUTO" | "MANUAL";
};

type ReminderInvoice = Prisma.InvoiceGetPayload<{
  select: typeof reminderInvoiceSelect;
}>;

const reminderInvoiceSelect = {
  id: true,
  workspaceId: true,
  invoiceNumber: true,
  status: true,
  paymentReference: true,
  paymentUrl: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
  client: {
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  workspace: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const REMINDER_AUDIT_ACTIONS: ReminderAuditAction[] = [
  "INVOICE_REMINDER_SENT",
  "INVOICE_REMINDER_FAILED",
  "INVOICE_REMINDER_SKIPPED",
];

const SCHEDULED_REMINDER_RULES: Array<{
  type: Exclude<InvoiceReminderType, "MANUAL">;
  label: string;
  offsetDays: number | null;
}> = [
  { type: "INVOICE_SENT", label: "Invoice sent", offsetDays: null },
  { type: "DUE_SOON", label: "Due in 3 days", offsetDays: -3 },
  { type: "DUE_TODAY", label: "Due today", offsetDays: 0 },
  { type: "OVERDUE_3", label: "3 days overdue", offsetDays: 3 },
  { type: "OVERDUE_7", label: "7 days overdue", offsetDays: 7 },
];

function normalizeToDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function readReminderLabel(type: InvoiceReminderType) {
  if (type === "MANUAL") return "Manual reminder";
  return SCHEDULED_REMINDER_RULES.find((rule) => rule.type === type)?.label ?? type;
}

function safeParseMetadata(metadata: string | null): ReminderAuditMetadata | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as ReminderAuditMetadata;
  } catch {
    return null;
  }
}

function isReminderStatus(value: string): value is InvoiceReminderAttemptStatus {
  return value === "SENT" || value === "FAILED" || value === "SKIPPED";
}

function getScheduledDate(invoice: ReminderInvoice, type: Exclude<InvoiceReminderType, "MANUAL">) {
  if (type === "INVOICE_SENT") {
    return normalizeToDay(invoice.issueDate);
  }

  const offsetDays = SCHEDULED_REMINDER_RULES.find((rule) => rule.type === type)?.offsetDays ?? 0;
  return normalizeToDay(addDays(invoice.dueDate, offsetDays ?? 0));
}

function toReminderHistoryEntry(
  log: { createdAt: Date; action: string; metadata: string | null },
  metadata: ReminderAuditMetadata
): InvoiceReminderHistoryEntry | null {
  if (
    !metadata.invoiceId ||
    !metadata.reminderType ||
    !metadata.channel ||
    !isReminderStatus(log.action.replace("INVOICE_REMINDER_", ""))
  ) {
    return null;
  }

  return {
    createdAt: log.createdAt.toISOString(),
    type: metadata.reminderType,
    typeLabel: readReminderLabel(metadata.reminderType),
    channel: metadata.channel,
    status: log.action.replace("INVOICE_REMINDER_", "") as InvoiceReminderAttemptStatus,
    delivered: Boolean(metadata.delivered),
    provider: metadata.provider ?? "unknown",
    recipient: metadata.recipient ?? null,
    error: metadata.error ?? null,
  };
}

async function listReminderHistoryForWorkspace(
  workspaceId: number,
  invoiceIds?: number[]
): Promise<Map<number, InvoiceReminderHistoryEntry[]>> {
  const lookbackStart = addDays(startOfToday(), -365);
  const logs = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: {
        in: REMINDER_AUDIT_ACTIONS,
      },
      createdAt: {
        gte: lookbackStart,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
    select: {
      createdAt: true,
      action: true,
      metadata: true,
    },
  });

  const index = new Map<number, InvoiceReminderHistoryEntry[]>();

  for (const log of logs) {
    const metadata = safeParseMetadata(log.metadata);
    if (!metadata?.invoiceId) continue;
    if (invoiceIds && !invoiceIds.includes(metadata.invoiceId)) continue;

    const entry = toReminderHistoryEntry(log, metadata);
    if (!entry) continue;

    const existing = index.get(metadata.invoiceId) ?? [];
    existing.push(entry);
    index.set(metadata.invoiceId, existing);
  }

  index.forEach((entries, key) => {
    index.set(
      key,
      entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    );
  });

  return index;
}

async function getReminderInvoice(workspaceId: number, invoiceId: number) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      workspaceId,
    },
    select: reminderInvoiceSelect,
  });
}

async function ensureReminderLinks(invoice: ReminderInvoice) {
  if (invoice.status === "PAID") {
    const portal = createInvoicePortalToken({
      invoiceId: invoice.id,
      expiresAt: getInvoicePortalExpiry(invoice.dueDate),
    });

    return {
      paymentReference: invoice.paymentReference,
      paymentUrl: invoice.paymentUrl,
      portalUrl: buildInvoicePortalAccessUrl(getAppUrl(), portal.token),
      portalExpiresAt: portal.expiresAt,
    };
  }

  let paymentReference = invoice.paymentReference;
  let paymentUrl = invoice.paymentUrl;

  if (!paymentReference) {
    paymentReference = buildInvoicePaymentReference(invoice.id);
  }

  if (!paymentUrl && paymentReference) {
    paymentUrl = buildInvoicePaymentUrl(getAppUrl(), paymentReference);
  }

  if (
    paymentReference !== invoice.paymentReference ||
    paymentUrl !== invoice.paymentUrl
  ) {
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paymentReference,
        paymentUrl,
      },
      select: {
        paymentReference: true,
        paymentUrl: true,
      },
    });

    paymentReference = updated.paymentReference;
    paymentUrl = updated.paymentUrl;
  }

  const portal = createInvoicePortalToken({
    invoiceId: invoice.id,
    expiresAt: getInvoicePortalExpiry(invoice.dueDate),
  });

  return {
    paymentReference,
    paymentUrl,
    portalUrl: buildInvoicePortalAccessUrl(getAppUrl(), portal.token),
    portalExpiresAt: portal.expiresAt,
  };
}

function hasSuccessfulReminder(
  history: InvoiceReminderHistoryEntry[],
  type: InvoiceReminderType,
  channel: NotificationChannel
) {
  return history.some(
    (entry) => entry.type === type && entry.channel === channel && entry.status === "SENT"
  );
}

function getOutstandingScheduledReminders(
  invoice: ReminderInvoice,
  history: InvoiceReminderHistoryEntry[]
) {
  if (invoice.status === "PAID" || invoice.status === "DRAFT") return [];

  return SCHEDULED_REMINDER_RULES.filter(
    (rule) => !hasSuccessfulReminder(history, rule.type, "EMAIL")
  ).map((rule) => ({
    type: rule.type,
    label: rule.label,
    scheduledAt: getScheduledDate(invoice, rule.type),
  }));
}

function getDueReminderCandidate(
  invoice: ReminderInvoice,
  history: InvoiceReminderHistoryEntry[],
  now = new Date()
) {
  const today = normalizeToDay(now).getTime();
  const due = getOutstandingScheduledReminders(invoice, history)
    .filter((rule) => rule.scheduledAt.getTime() <= today)
    .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime());

  return due[0] ?? null;
}

function getNextReminderDue(
  invoice: ReminderInvoice,
  history: InvoiceReminderHistoryEntry[],
  now = new Date()
) {
  const dueCandidate = getDueReminderCandidate(invoice, history, now);
  if (dueCandidate) return dueCandidate;

  const today = normalizeToDay(now).getTime();
  return (
    getOutstandingScheduledReminders(invoice, history)
      .filter((rule) => rule.scheduledAt.getTime() > today)
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0] ?? null
  );
}

function buildReminderMessage(
  invoice: ReminderInvoice,
  reminderType: InvoiceReminderType,
  portalUrl: string
) {
  const businessName = invoice.clientBusiness?.name ?? invoice.workspace.name ?? "TaxBook AI";
  const clientName = invoice.client.companyName?.trim() || invoice.client.name;
  const amount = formatCurrencyNGN(invoice.totalAmount);
  const dueDate = formatDashboardDate(invoice.dueDate);
  const invoiceLabel = `invoice ${invoice.invoiceNumber}`;

  let subject = `${businessName}: ${invoice.invoiceNumber}`;
  let opening = `Hello ${clientName},`;
  let intro = `A reminder from ${businessName} about ${invoiceLabel}.`;

  switch (reminderType) {
    case "INVOICE_SENT":
      subject = `${businessName}: ${invoice.invoiceNumber} is ready`;
      intro = `Your ${invoiceLabel} is ready for review and payment.`;
      break;
    case "DUE_SOON":
      subject = `Reminder: ${invoice.invoiceNumber} is due in 3 days`;
      intro = `Your ${invoiceLabel} is due on ${dueDate}.`;
      break;
    case "DUE_TODAY":
      subject = `Reminder: ${invoice.invoiceNumber} is due today`;
      intro = `Your ${invoiceLabel} is due today.`;
      break;
    case "OVERDUE_3":
      subject = `Overdue reminder: ${invoice.invoiceNumber}`;
      intro = `Your ${invoiceLabel} is now 3 days overdue.`;
      break;
    case "OVERDUE_7":
      subject = `Final reminder: ${invoice.invoiceNumber} remains unpaid`;
      intro = `Your ${invoiceLabel} is now 7 days overdue.`;
      break;
    case "MANUAL":
      subject = `Reminder: ${invoice.invoiceNumber} from ${businessName}`;
      intro = `A manual reminder has been sent for ${invoiceLabel}.`;
      break;
  }

  const text = [
    opening,
    "",
    intro,
    `Total amount: ${amount}`,
    `Due date: ${dueDate}`,
    "",
    `View and pay securely: ${portalUrl}`,
    "",
    "If payment has already been made, you can ignore this reminder.",
    "",
    `Regards,`,
    businessName,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
      <p>${opening}</p>
      <p>${intro}</p>
      <div style="padding:16px;border:1px solid rgba(15,23,42,0.08);border-radius:16px;background:#f8fafc">
        <p style="margin:0 0 8px"><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
        <p style="margin:0 0 8px"><strong>Total:</strong> ${amount}</p>
        <p style="margin:0"><strong>Due date:</strong> ${dueDate}</p>
      </div>
      <p style="margin-top:20px">
        <a
          href="${portalUrl}"
          style="display:inline-block;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#3B82F6,#22D3EE);color:#ffffff;text-decoration:none;font-weight:600"
        >
          View invoice and pay
        </a>
      </p>
      <p>If payment has already been made, you can ignore this reminder.</p>
      <p>Regards,<br />${businessName}</p>
    </div>
  `;

  const whatsappText = `${intro}\nAmount: ${amount}\nDue date: ${dueDate}\nView invoice: ${portalUrl}`;

  return {
    subject,
    text,
    html,
    whatsappText,
  };
}

async function recordReminderAttempt(input: {
  invoice: ReminderInvoice;
  reminderType: InvoiceReminderType;
  mode: "AUTO" | "MANUAL";
  channel: NotificationChannel;
  result: NotificationSendResult;
}) {
  const action: ReminderAuditAction = input.result.success
    ? "INVOICE_REMINDER_SENT"
    : input.result.attempted
      ? "INVOICE_REMINDER_FAILED"
      : "INVOICE_REMINDER_SKIPPED";

  await logAudit({
    workspaceId: input.invoice.workspaceId,
    actorUserId: null,
    action,
    metadata: {
      invoiceId: input.invoice.id,
      invoiceNumber: input.invoice.invoiceNumber,
      reminderType: input.reminderType,
      channel: input.channel,
      recipient:
        input.channel === "EMAIL"
          ? input.invoice.client.email
          : input.invoice.client.phone ?? null,
      delivered: input.result.delivered,
      provider: input.result.provider,
      error: input.result.error ?? null,
      scheduledFor:
        input.reminderType === "MANUAL"
          ? null
          : getScheduledDate(input.invoice, input.reminderType).toISOString(),
      mode: input.mode,
    },
  });
}

export async function sendInvoiceReminder(input: {
  workspaceId: number;
  invoiceId: number;
  reminderType: InvoiceReminderType;
  initiatedByUserId?: number | null;
  channels?: NotificationChannel[];
  mode?: "AUTO" | "MANUAL";
}) {
  const invoice = await getReminderInvoice(input.workspaceId, input.invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.status === "PAID") {
    throw new Error("Paid invoices do not need reminders");
  }

  if (invoice.status === "DRAFT") {
    throw new Error("Draft invoices cannot be reminded yet");
  }

  const channels: NotificationChannel[] = input.channels?.length
    ? [...input.channels]
    : ["EMAIL"];
  const links = await ensureReminderLinks(invoice);
  const template = buildReminderMessage(invoice, input.reminderType, links.portalUrl);
  const attempts: InvoiceReminderHistoryEntry[] = [];

  for (const channel of channels) {
    let result: NotificationSendResult;

    if (channel === "EMAIL") {
      if (!invoice.client.email?.trim()) {
        result = {
          channel,
          attempted: true,
          success: false,
          delivered: false,
          provider: "smtp",
          error: "Client email is missing on this invoice.",
        };
      } else {
        result = await sendEmailNotification({
          to: invoice.client.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
      }
    } else {
      if (!invoice.client.phone?.trim()) {
        result = {
          channel,
          attempted: false,
          success: false,
          delivered: false,
          provider: "unavailable",
          error: "Client phone number is missing for WhatsApp reminders.",
        };
      } else {
        result = await sendWhatsAppNotification({
          to: invoice.client.phone,
          text: template.whatsappText,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            reminderType: input.reminderType,
          },
        });
      }
    }

    await recordReminderAttempt({
      invoice,
      reminderType: input.reminderType,
      mode: input.mode ?? "AUTO",
      channel,
      result,
    });

    attempts.push({
      createdAt: new Date().toISOString(),
      type: input.reminderType,
      typeLabel: readReminderLabel(input.reminderType),
      channel,
      status: result.success ? "SENT" : result.attempted ? "FAILED" : "SKIPPED",
      delivered: result.delivered,
      provider: result.provider,
      recipient: channel === "EMAIL" ? invoice.client.email : invoice.client.phone ?? null,
      error: result.error ?? null,
    });
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    reminderType: input.reminderType,
    attempts,
  } satisfies InvoiceReminderDispatchResult;
}

export async function sendInvoiceSentReminder(input: {
  workspaceId: number;
  invoiceId: number;
  initiatedByUserId?: number | null;
}) {
  const historyIndex = await listReminderHistoryForWorkspace(input.workspaceId, [input.invoiceId]);
  const history = historyIndex.get(input.invoiceId) ?? [];
  if (hasSuccessfulReminder(history, "INVOICE_SENT", "EMAIL")) {
    return null;
  }

  return sendInvoiceReminder({
    workspaceId: input.workspaceId,
    invoiceId: input.invoiceId,
    reminderType: "INVOICE_SENT",
    initiatedByUserId: input.initiatedByUserId,
    channels: ["EMAIL"],
    mode: "AUTO",
  });
}

export async function getInvoiceReminderSummary(workspaceId: number, invoiceId: number) {
  const invoice = await getReminderInvoice(workspaceId, invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const historyIndex = await listReminderHistoryForWorkspace(workspaceId, [invoiceId]);
  const history = (historyIndex.get(invoiceId) ?? []).slice(0, 5);
  const lastSent = history.find((entry) => entry.status === "SENT") ?? null;
  const lastAttempt = history[0] ?? null;
  const nextReminder = getNextReminderDue(invoice, history);

  return {
    lastSentAt: lastSent?.createdAt ?? null,
    lastSentLabel: lastSent?.typeLabel ?? null,
    lastSentChannel: lastSent?.channel ?? null,
    lastAttemptAt: lastAttempt?.createdAt ?? null,
    lastAttemptStatus: lastAttempt?.status ?? null,
    lastFailureMessage: history.find((entry) => entry.status === "FAILED")?.error ?? null,
    nextReminderAt: nextReminder?.scheduledAt.toISOString() ?? null,
    nextReminderLabel: nextReminder?.label ?? null,
    history,
  } satisfies InvoiceReminderSummary;
}

export async function runInvoiceReminderSweep(input: {
  workspaceId?: number;
  initiatedByUserId?: number | null;
}) {
  const today = startOfToday();

  await prisma.invoice.updateMany({
    where: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      status: "SENT",
      dueDate: { lt: today },
    },
    data: {
      status: "OVERDUE",
    },
  });

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      status: {
        in: ["SENT", "OVERDUE"],
      },
    },
    orderBy: {
      dueDate: "asc",
    },
    select: reminderInvoiceSelect,
  });

  const historyIndex = new Map<number, InvoiceReminderHistoryEntry[]>();
  const invoiceIdsByWorkspace = new Map<number, number[]>();

  for (const invoice of invoices) {
    const existing = invoiceIdsByWorkspace.get(invoice.workspaceId) ?? [];
    existing.push(invoice.id);
    invoiceIdsByWorkspace.set(invoice.workspaceId, existing);
  }

  for (const [workspaceId, invoiceIds] of invoiceIdsByWorkspace.entries()) {
    const workspaceHistory = await listReminderHistoryForWorkspace(workspaceId, invoiceIds);
    workspaceHistory.forEach((entries, invoiceId) => {
      historyIndex.set(invoiceId, entries);
    });
  }

  const results: InvoiceReminderDispatchResult[] = [];

  for (const invoice of invoices) {
    const history = historyIndex.get(invoice.id) ?? [];
    const nextDue = getDueReminderCandidate(invoice, history);
    if (!nextDue) continue;

    try {
      const result = await sendInvoiceReminder({
        workspaceId: invoice.workspaceId,
        invoiceId: invoice.id,
        reminderType: nextDue.type,
        initiatedByUserId: input.initiatedByUserId,
        channels: ["EMAIL"],
        mode: "AUTO",
      });
      results.push(result);
    } catch (error) {
      logError("invoice-reminders", "Automatic reminder dispatch failed", error, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        reminderType: nextDue.type,
      });
    }
  }

  const sent = results.reduce(
    (count, result) => count + result.attempts.filter((attempt) => attempt.status === "SENT").length,
    0
  );
  const failed = results.reduce(
    (count, result) =>
      count + result.attempts.filter((attempt) => attempt.status === "FAILED").length,
    0
  );
  const skipped = results.reduce(
    (count, result) =>
      count + result.attempts.filter((attempt) => attempt.status === "SKIPPED").length,
    0
  );

  logInfo("invoice-reminders", "Reminder sweep completed", {
    workspaceId: input.workspaceId ?? null,
    scanned: invoices.length,
    dispatched: results.length,
    sent,
    failed,
    skipped,
  });

  return {
    scanned: invoices.length,
    dispatched: results.length,
    sent,
    failed,
    skipped,
    results,
  };
}
