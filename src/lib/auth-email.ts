import "server-only";

import nodemailer from "nodemailer";
import { logInfo } from "@/lib/logger";

type PasswordResetEmailInput = {
  email: string;
  fullName: string;
  resetUrl: string;
  expiresAt: Date;
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

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    if (process.env.NODE_ENV !== "production") {
      logInfo("auth", "Password reset link generated for local development", {
        email: input.email,
        resetUrl: input.resetUrl,
        expiresAt: input.expiresAt.toISOString(),
      });

      return {
        delivered: false,
        previewUrl: input.resetUrl,
      };
    }

    throw new Error("SMTP configuration is missing for password reset email delivery");
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    to: input.email,
    replyTo: smtpConfig.replyTo,
    subject: "Reset your TaxBook password",
    text: [
      `Hello ${input.fullName},`,
      "",
      "We received a request to reset your TaxBook password.",
      `Use this link to choose a new password: ${input.resetUrl}`,
      "",
      `This link expires at ${input.expiresAt.toUTCString()}.`,
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
        <p>Hello ${input.fullName},</p>
        <p>We received a request to reset your TaxBook password.</p>
        <p>
          <a
            href="${input.resetUrl}"
            style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600"
          >
            Reset your password
          </a>
        </p>
        <p>This link expires at ${input.expiresAt.toUTCString()}.</p>
        <p>If you did not request this reset, you can ignore this email.</p>
      </div>
    `,
  });

  return {
    delivered: true,
  };
}
