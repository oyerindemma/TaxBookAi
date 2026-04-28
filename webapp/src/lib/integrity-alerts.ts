import "server-only";

import nodemailer from "nodemailer";
import { logAudit } from "@/lib/audit";
import { getDeploymentStage, getIntegrityAlertRuntimeConfig } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export type IntegrityAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type IntegrityAlertInput = {
  issueType: string;
  severity: IntegrityAlertSeverity;
  invoiceId: number | null;
  workspaceId: number | null;
  workspaceName?: string | null;
  reference: string | null;
  autoRepairable: boolean;
  repairAttempted: boolean;
  repairSucceeded: boolean | null;
  createdAt: string;
  summary?: string | null;
  detailLines?: string[];
  dedupeKey?: string | null;
  alertStateKey?: string | null;
  metadata?: Record<string, unknown>;
};

type IntegrityAlertDeliveryResult = {
  channel: "slack" | "email";
  attempted: boolean;
  success: boolean;
  skippedReason?: string | null;
  error?: string | null;
};

const REALTIME_ALERT_SEVERITIES = new Set<IntegrityAlertSeverity>(["CRITICAL", "HIGH"]);
const ALERT_LOOKBACK_DAYS = 30;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getSmtpConfig() {
  const host = readEnv("SMTP_HOST");
  const port = readEnv("SMTP_PORT");
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from = getIntegrityAlertRuntimeConfig().alertEmailFrom;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port: Number(port),
    secure: readEnv("SMTP_SECURE") === "true" || Number(port) === 465,
    auth: {
      user,
      pass,
    },
    from,
    replyTo: readEnv("EMAIL_REPLY_TO") || undefined,
  };
}

function parseRecipients(raw: string | null) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveWorkspaceOwnerRecipients(workspaceId: number | null) {
  if (!workspaceId) {
    return [] as string[];
  }

  const owners = await withPrismaRetry(
    () =>
      prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          role: "OWNER",
        },
        select: {
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
    { label: "integrityAlerts.resolveWorkspaceOwnerRecipients" }
  );

  return owners
    .map((owner) => owner.user.email?.trim())
    .filter((email): email is string => Boolean(email));
}

async function resolveAlertRecipients(workspaceId: number | null) {
  const configuredRecipients = parseRecipients(
    getIntegrityAlertRuntimeConfig().alertEmailTo
  );
  const workspaceOwnerRecipients = await resolveWorkspaceOwnerRecipients(workspaceId);

  return Array.from(new Set([...configuredRecipients, ...workspaceOwnerRecipients]));
}

function subtractDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() - days);
  return next;
}

function escapeJsonContainsValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildAlertText(input: IntegrityAlertInput) {
  const header = [
    `TaxBook financial integrity alert`,
    `Issue: ${input.issueType}`,
    `Severity: ${input.severity}`,
    `Workspace: ${input.workspaceId ?? "unknown"}${input.workspaceName ? ` (${input.workspaceName})` : ""}`,
    `Invoice: ${input.invoiceId ?? "n/a"}`,
    `Reference: ${input.reference ?? "n/a"}`,
    `Auto-repairable: ${input.autoRepairable ? "yes" : "no"}`,
    `Repair attempted: ${input.repairAttempted ? "yes" : "no"}`,
    `Repair succeeded: ${
      input.repairSucceeded === null ? "n/a" : input.repairSucceeded ? "yes" : "no"
    }`,
    `Created at: ${input.createdAt}`,
  ];

  if (input.summary?.trim()) {
    header.push("", input.summary.trim());
  }

  if (input.detailLines && input.detailLines.length > 0) {
    header.push("", ...input.detailLines.map((line) => `- ${line}`));
  }

  return header.join("\n");
}

function buildAlertHtml(input: IntegrityAlertInput) {
  const detailItems = (input.detailLines ?? [])
    .map((line) => `<li>${line}</li>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px">TaxBook Financial Integrity Alert</h2>
      <p><strong>Issue:</strong> ${input.issueType}</p>
      <p><strong>Severity:</strong> ${input.severity}</p>
      <p><strong>Workspace:</strong> ${input.workspaceId ?? "unknown"}${
        input.workspaceName ? ` (${input.workspaceName})` : ""
      }</p>
      <p><strong>Invoice:</strong> ${input.invoiceId ?? "n/a"}</p>
      <p><strong>Reference:</strong> ${input.reference ?? "n/a"}</p>
      <p><strong>Auto-repairable:</strong> ${input.autoRepairable ? "yes" : "no"}</p>
      <p><strong>Repair attempted:</strong> ${input.repairAttempted ? "yes" : "no"}</p>
      <p><strong>Repair succeeded:</strong> ${
        input.repairSucceeded === null ? "n/a" : input.repairSucceeded ? "yes" : "no"
      }</p>
      <p><strong>Created at:</strong> ${input.createdAt}</p>
      ${input.summary ? `<p>${input.summary}</p>` : ""}
      ${detailItems ? `<ul>${detailItems}</ul>` : ""}
    </div>
  `;
}

async function wasIntegrityAlertAlreadySent(input: {
  workspaceId: number | null;
  dedupeKey?: string | null;
  alertStateKey?: string | null;
}) {
  const workspaceId = input.workspaceId;
  if (!workspaceId || !input.dedupeKey || !input.alertStateKey) {
    return false;
  }

  const metadataContainsDedupe = `"dedupeKey":"${escapeJsonContainsValue(input.dedupeKey)}"`;
  const metadataContainsState = `"alertStateKey":"${escapeJsonContainsValue(input.alertStateKey)}"`;

  const existing = await withPrismaRetry(
    () =>
      prisma.auditLog.findFirst({
        where: {
          workspaceId,
          action: {
            in: ["FINANCIAL_INTEGRITY_ALERT_SENT", "FINANCIAL_INTEGRITY_ALERT_FAILED"],
          },
          createdAt: {
            gte: subtractDays(new Date(), ALERT_LOOKBACK_DAYS),
          },
          AND: [
            {
              metadata: {
                contains: metadataContainsDedupe,
              },
            },
            {
              metadata: {
                contains: metadataContainsState,
              },
            },
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
        select: { id: true },
      }),
    { label: "integrityAlerts.wasAlertAlreadySent" }
  );

  return Boolean(existing);
}

async function sendSlackIntegrityAlert(
  input: IntegrityAlertInput
): Promise<IntegrityAlertDeliveryResult> {
  const config = getIntegrityAlertRuntimeConfig();
  if (!config.slackWebhookUrl) {
    return {
      channel: "slack",
      attempted: false,
      success: false,
      skippedReason: "missing_slack_webhook",
    };
  }

  const response = await fetch(config.slackWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `[${input.severity}] ${input.issueType}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*TaxBook financial integrity alert*\n*Issue:* ${input.issueType}\n*Severity:* ${input.severity}\n*Workspace:* ${
              input.workspaceId ?? "unknown"
            }\n*Invoice:* ${input.invoiceId ?? "n/a"}\n*Reference:* ${
              input.reference ?? "n/a"
            }\n*Repair attempted:* ${input.repairAttempted ? "yes" : "no"}\n*Repair succeeded:* ${
              input.repairSucceeded === null
                ? "n/a"
                : input.repairSucceeded
                  ? "yes"
                  : "no"
            }\n*Created at:* ${input.createdAt}`,
          },
        },
        ...(input.summary
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: input.summary,
                },
              },
            ]
          : []),
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      channel: "slack",
      attempted: true,
      success: false,
      error: `Slack webhook returned ${response.status}.`,
    };
  }

  return {
    channel: "slack",
    attempted: true,
    success: true,
  };
}

async function sendEmailIntegrityAlert(
  input: IntegrityAlertInput
): Promise<IntegrityAlertDeliveryResult> {
  const recipients = await resolveAlertRecipients(input.workspaceId);
  const smtpConfig = getSmtpConfig();

  if (recipients.length === 0) {
    return {
      channel: "email",
      attempted: false,
      success: false,
      skippedReason: "missing_alert_email_to",
    };
  }

  if (!smtpConfig) {
    if (getDeploymentStage() !== "production") {
      logInfo("integrity-alerts", "Integrity alert email preview generated", {
        recipients,
        issueType: input.issueType,
        severity: input.severity,
      });
      return {
        channel: "email",
        attempted: true,
        success: true,
        skippedReason: "preview_only",
      };
    }

    return {
      channel: "email",
      attempted: true,
      success: false,
      error: "SMTP or alert email configuration is missing.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    to: recipients.join(", "),
    replyTo: smtpConfig.replyTo,
    subject: `[TaxBook][${input.severity}] ${input.issueType}`,
    text: buildAlertText(input),
    html: buildAlertHtml(input),
  });

  return {
    channel: "email",
    attempted: true,
    success: true,
  };
}

export function getIntegrityAlertSeverity(input: {
  issueType: string;
  issueSeverity?: string | null;
  repeatedAutoRepairFailure?: boolean;
}): IntegrityAlertSeverity {
  if (input.repeatedAutoRepairFailure) {
    return "HIGH";
  }

  switch (input.issueType) {
    case "SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID":
    case "AMOUNT_MISMATCH":
    case "PAYMENT_WEBHOOK_VERIFICATION_FAILED":
    case "PAYMENT_VERIFICATION_FAILED":
      return "CRITICAL";
    case "PAID_INVOICE_MISSING_PAYMENT":
    case "PAID_INVOICE_MISSING_LEDGER":
    case "PAYMENT_LEDGER_SYNC_MISSING":
    case "PAYMENT_TAX_SYNC_MISSING":
    case "LEDGER_INVOICE_NOT_PAID":
    case "DUPLICATE_LEDGER_ROWS":
      return input.issueSeverity === "critical" ? "CRITICAL" : "HIGH";
    case "STALE_SENT_INVOICE_VERIFIED_PAYMENT":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

export async function sendIntegrityAlert(input: IntegrityAlertInput) {
  if (!REALTIME_ALERT_SEVERITIES.has(input.severity)) {
    return {
      sent: false,
      duplicate: false,
      deliveries: [] as IntegrityAlertDeliveryResult[],
      skippedReason: "severity_below_threshold",
    };
  }

  const duplicate = await wasIntegrityAlertAlreadySent({
    workspaceId: input.workspaceId,
    dedupeKey: input.dedupeKey ?? null,
    alertStateKey: input.alertStateKey ?? null,
  });

  if (duplicate) {
    if (input.workspaceId) {
      await logAudit({
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "FINANCIAL_INTEGRITY_ALERT_SKIPPED",
        metadata: {
          issueType: input.issueType,
          severity: input.severity,
          dedupeKey: input.dedupeKey ?? null,
          alertStateKey: input.alertStateKey ?? null,
          reason: "duplicate_state",
        },
      });
    }

    return {
      sent: false,
      duplicate: true,
      deliveries: [] as IntegrityAlertDeliveryResult[],
      skippedReason: "duplicate_state",
    };
  }

  logWarn("integrity-alerts", "Financial integrity alert triggered", {
    issueType: input.issueType,
    severity: input.severity,
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId,
    reference: input.reference,
    autoRepairable: input.autoRepairable,
    repairAttempted: input.repairAttempted,
    repairSucceeded: input.repairSucceeded,
    createdAt: input.createdAt,
  });

  const deliveries = await Promise.allSettled([
    sendSlackIntegrityAlert(input),
    sendEmailIntegrityAlert(input),
  ]);

  const normalizedDeliveries = deliveries.map((delivery, index) => {
    const channel = index === 0 ? "slack" : "email";
    if (delivery.status === "fulfilled") {
      return delivery.value;
    }

    logError("integrity-alerts", `Integrity ${channel} alert failed`, delivery.reason, {
      issueType: input.issueType,
      severity: input.severity,
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
    });

    return {
      channel,
      attempted: true,
      success: false,
      error:
        delivery.reason instanceof Error
          ? delivery.reason.message
          : `Integrity ${channel} alert failed`,
    } satisfies IntegrityAlertDeliveryResult;
  });

  const sent = normalizedDeliveries.some(
    (delivery) => delivery.success || delivery.skippedReason === "preview_only"
  );

  if (input.workspaceId) {
    await logAudit({
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: sent ? "FINANCIAL_INTEGRITY_ALERT_SENT" : "FINANCIAL_INTEGRITY_ALERT_FAILED",
      metadata: {
        issueType: input.issueType,
        severity: input.severity,
        invoiceId: input.invoiceId,
        reference: input.reference,
        autoRepairable: input.autoRepairable,
        repairAttempted: input.repairAttempted,
        repairSucceeded: input.repairSucceeded,
        createdAt: input.createdAt,
        dedupeKey: input.dedupeKey ?? null,
        alertStateKey: input.alertStateKey ?? null,
        deliveries: normalizedDeliveries,
        ...(input.metadata ?? {}),
      },
    });
  }

  return {
    sent,
    duplicate: false,
    deliveries: normalizedDeliveries,
  };
}

export async function sendWebhookVerificationFailureAlert(input: {
  reference: string | null;
  workspaceId: number | null;
  invoiceId: number | null;
  createdAt?: Date;
  reason: "MISSING_SIGNATURE" | "INVALID_SIGNATURE";
}) {
  const createdAt = (input.createdAt ?? new Date()).toISOString();

  return sendIntegrityAlert({
    issueType: "PAYMENT_WEBHOOK_VERIFICATION_FAILED",
    severity: "CRITICAL",
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId,
    reference: input.reference,
    autoRepairable: false,
    repairAttempted: false,
    repairSucceeded: false,
    createdAt,
    summary: `Paystack webhook verification failed: ${input.reason}.`,
    detailLines: [
      `The payment webhook was rejected with reason ${input.reason}.`,
      "No payment confirmation was processed from this delivery.",
    ],
    dedupeKey: `PAYMENT_WEBHOOK_VERIFICATION_FAILED:${input.reference ?? "no-reference"}`,
    alertStateKey: `PAYMENT_WEBHOOK_VERIFICATION_FAILED:${input.reason}`,
    metadata: {
      source: "paystack_webhook",
      reason: input.reason,
    },
  });
}

export async function sendPaymentFailureAlert(input: {
  invoiceId: number | null;
  workspaceId: number | null;
  workspaceName?: string | null;
  reference: string | null;
  source: string;
  status: string;
  summary: string;
  detailLines?: string[];
  createdAt?: Date;
  severity?: IntegrityAlertSeverity;
  metadata?: Record<string, unknown>;
}) {
  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const severity =
    input.severity ??
    getIntegrityAlertSeverity({
      issueType: "PAYMENT_VERIFICATION_FAILED",
    });

  try {
    return await sendIntegrityAlert({
      issueType: "PAYMENT_VERIFICATION_FAILED",
      severity,
      invoiceId: input.invoiceId,
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName ?? null,
      reference: input.reference,
      autoRepairable: false,
      repairAttempted: false,
      repairSucceeded: false,
      createdAt,
      summary: input.summary,
      detailLines: input.detailLines ?? [
        `Payment flow reported ${input.status} from ${input.source}.`,
      ],
      dedupeKey: `PAYMENT_VERIFICATION_FAILED:${input.source}:${input.reference ?? input.invoiceId ?? "unknown"}`,
      alertStateKey: `PAYMENT_VERIFICATION_FAILED:${input.source}:${input.status}`,
      metadata: {
        source: input.source,
        status: input.status,
        ...(input.metadata ?? {}),
      },
    });
  } catch (error) {
    logError("integrity-alerts", "Payment failure alert dispatch failed", error, {
      invoiceId: input.invoiceId,
      workspaceId: input.workspaceId,
      reference: input.reference,
      source: input.source,
      status: input.status,
    });

    return {
      sent: false,
      duplicate: false,
      deliveries: [] as IntegrityAlertDeliveryResult[],
      skippedReason: "alert_dispatch_failed",
    };
  }
}
