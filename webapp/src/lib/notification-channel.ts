import "server-only";

import nodemailer from "nodemailer";
import { getInvoiceReminderRuntimeConfig } from "@/lib/env";
import { logInfo } from "@/lib/logger";

export type NotificationChannel = "EMAIL" | "WHATSAPP";

export type NotificationSendResult = {
  channel: NotificationChannel;
  attempted: boolean;
  success: boolean;
  delivered: boolean;
  provider: "smtp" | "preview" | "webhook" | "unavailable";
  externalMessageId?: string | null;
  error?: string | null;
};

type EmailMessageInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type WhatsAppMessageInput = {
  to: string;
  text: string;
  metadata?: Record<string, unknown>;
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getSmtpConfig() {
  const host = readEnv("SMTP_HOST");
  const port = readEnv("SMTP_PORT");
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from = readEnv("EMAIL_FROM");
  const replyTo = readEnv("EMAIL_REPLY_TO");

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
    replyTo: replyTo || undefined,
  };
}

export function hasEmailNotificationConfig() {
  return Boolean(getSmtpConfig());
}

export function hasWhatsAppNotificationConfig() {
  return Boolean(getInvoiceReminderRuntimeConfig().whatsappWebhookUrl);
}

export async function sendEmailNotification(
  input: EmailMessageInput
): Promise<NotificationSendResult> {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    if (process.env.NODE_ENV !== "production") {
      logInfo("notifications", "Invoice reminder email preview generated", {
        to: input.to,
        subject: input.subject,
      });

      return {
        channel: "EMAIL",
        attempted: true,
        success: true,
        delivered: false,
        provider: "preview",
      };
    }

    return {
      channel: "EMAIL",
      attempted: true,
      success: false,
      delivered: false,
      provider: "smtp",
      error: "SMTP configuration is missing for invoice reminder delivery.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  const response = await transporter.sendMail({
    from: smtpConfig.from,
    to: input.to,
    replyTo: smtpConfig.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return {
    channel: "EMAIL",
    attempted: true,
    success: true,
    delivered: true,
    provider: "smtp",
    externalMessageId: response.messageId ?? null,
  };
}

export async function sendWhatsAppNotification(
  input: WhatsAppMessageInput
): Promise<NotificationSendResult> {
  const config = getInvoiceReminderRuntimeConfig();
  if (!config.whatsappWebhookUrl) {
    return {
      channel: "WHATSAPP",
      attempted: false,
      success: false,
      delivered: false,
      provider: "unavailable",
      error: "WhatsApp reminder delivery is not configured yet.",
    };
  }

  const response = await fetch(config.whatsappWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.whatsappWebhookSecret
        ? {
            Authorization: `Bearer ${config.whatsappWebhookSecret}`,
          }
        : {}),
    },
    body: JSON.stringify({
      to: input.to,
      text: input.text,
      metadata: input.metadata ?? {},
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      channel: "WHATSAPP",
      attempted: true,
      success: false,
      delivered: false,
      provider: "webhook",
      error: `WhatsApp webhook returned ${response.status}.`,
    };
  }

  return {
    channel: "WHATSAPP",
    attempted: true,
    success: true,
    delivered: true,
    provider: "webhook",
  };
}
