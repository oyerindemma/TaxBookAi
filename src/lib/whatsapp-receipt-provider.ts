import "server-only";

import crypto from "node:crypto";
import type { WhatsAppReceiptProvider } from "@prisma/client";
import { getWhatsAppReceiptRuntimeConfig } from "@/lib/env";

export type NormalizedWhatsAppRecipient = {
  webhookInboxKey: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  normalizedDisplayPhoneNumber: string | null;
  recipientPhoneNumber: string | null;
  normalizedRecipientPhoneNumber: string | null;
};

export type NormalizedWhatsAppInboundMedia = {
  kind: "IMAGE" | "DOCUMENT";
  externalMediaId: string | null;
  mimeType: string | null;
  fileName: string | null;
  downloadUrl: string | null;
  base64Data: string | null;
  sha256: string | null;
};

export type NormalizedWhatsAppInboundItem = {
  provider: WhatsAppReceiptProvider;
  externalEventId: string | null;
  externalMessageId: string;
  dedupeKey: string;
  senderPhoneNumber: string;
  normalizedSenderPhoneNumber: string;
  senderName: string | null;
  caption: string | null;
  textBody: string | null;
  occurredAt: Date;
  recipient: NormalizedWhatsAppRecipient;
  media: NormalizedWhatsAppInboundMedia;
  rawPayload: unknown;
};

export type WhatsAppVerificationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  const raw = readString(value);
  if (!raw) return new Date();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return new Date(raw.length > 10 ? numeric : numeric * 1000);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeBase64(value: string | null) {
  if (!value) return null;
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value);
  const base64 = (match?.[1] ?? value).replace(/\s+/g, "");
  return base64 || null;
}

function inferExtension(mimeType: string | null) {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function safeFileName(baseName: string) {
  return baseName.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function buildDedupeKey(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => readString(part))
    .filter(Boolean)
    .join(":");
}

export function normalizeWhatsAppPhoneNumber(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const withoutPrefix = raw.toLowerCase().startsWith("wa:")
    ? raw.slice(3)
    : raw;
  const digits = withoutPrefix.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

function normalizeGenericAttachmentKind(value: unknown) {
  const normalized = readString(value).toLowerCase();
  if (normalized === "image") return "IMAGE" as const;
  return "DOCUMENT" as const;
}

function parseMetaCloudApiPayload(payload: Record<string, unknown>) {
  const items: NormalizedWhatsAppInboundItem[] = [];

  for (const entry of readArray(payload.entry)) {
    const entryRecord = readRecord(entry);
    if (!entryRecord) continue;

    for (const change of readArray(entryRecord.changes)) {
      const changeRecord = readRecord(change);
      const value = readRecord(changeRecord?.value);
      if (!value) continue;

      const metadata = readRecord(value.metadata);
      const phoneNumberId = readOptionalString(metadata?.phone_number_id);
      const displayPhoneNumber = readOptionalString(metadata?.display_phone_number);
      const normalizedDisplayPhoneNumber = normalizeWhatsAppPhoneNumber(displayPhoneNumber);
      const contacts = new Map<string, string | null>();

      for (const contact of readArray(value.contacts)) {
        const contactRecord = readRecord(contact);
        if (!contactRecord) continue;
        const waId = normalizeWhatsAppPhoneNumber(readOptionalString(contactRecord.wa_id));
        if (!waId) continue;
        const profile = readRecord(contactRecord.profile);
        contacts.set(waId, readOptionalString(profile?.name));
      }

      for (const message of readArray(value.messages)) {
        const messageRecord = readRecord(message);
        if (!messageRecord) continue;

        const type = readString(messageRecord.type).toLowerCase();
        if (type !== "image" && type !== "document") continue;

        const mediaRecord = readRecord(messageRecord[type]);
        const senderPhoneNumber = readOptionalString(messageRecord.from);
        const normalizedSenderPhoneNumber = normalizeWhatsAppPhoneNumber(senderPhoneNumber);
        const externalMessageId = readOptionalString(messageRecord.id);

        if (!normalizedSenderPhoneNumber || !senderPhoneNumber || !externalMessageId) {
          continue;
        }

        items.push({
          provider: "META_CLOUD_API",
          externalEventId: readOptionalString(entryRecord.id),
          externalMessageId,
          dedupeKey:
            buildDedupeKey([
              externalMessageId,
              readOptionalString(mediaRecord?.id),
              phoneNumberId,
            ]) || externalMessageId,
          senderPhoneNumber,
          normalizedSenderPhoneNumber,
          senderName:
            contacts.get(normalizedSenderPhoneNumber) ??
            readOptionalString(readRecord(messageRecord.profile)?.name),
          caption:
            readOptionalString(mediaRecord?.caption) ?? readOptionalString(messageRecord.caption),
          textBody: readOptionalString(readRecord(messageRecord.text)?.body),
          occurredAt: parseDate(messageRecord.timestamp),
          recipient: {
            webhookInboxKey: phoneNumberId,
            phoneNumberId,
            displayPhoneNumber,
            normalizedDisplayPhoneNumber,
            recipientPhoneNumber: displayPhoneNumber,
            normalizedRecipientPhoneNumber: normalizedDisplayPhoneNumber,
          },
          media: {
            kind: type === "image" ? "IMAGE" : "DOCUMENT",
            externalMediaId: readOptionalString(mediaRecord?.id),
            mimeType: readOptionalString(mediaRecord?.mime_type),
            fileName: readOptionalString(mediaRecord?.filename),
            downloadUrl: null,
            base64Data: null,
            sha256: readOptionalString(mediaRecord?.sha256),
          },
          rawPayload: messageRecord,
        });
      }
    }
  }

  return items;
}

function parseGenericWebhookPayload(payload: Record<string, unknown>) {
  const items: NormalizedWhatsAppInboundItem[] = [];
  const messageRecords = [
    ...readArray(payload.messages),
    ...(readRecord(payload.message) ? [payload.message] : []),
  ];
  const externalEventId =
    readOptionalString(payload.eventId) ??
    readOptionalString(payload.id) ??
    readOptionalString(payload.webhookEventId);

  for (const message of messageRecords) {
    const messageRecord = readRecord(message);
    if (!messageRecord) continue;

    const senderPhoneNumber =
      readOptionalString(messageRecord.from) ??
      readOptionalString(messageRecord.senderPhoneNumber) ??
      readOptionalString(messageRecord.sender);
    const normalizedSenderPhoneNumber = normalizeWhatsAppPhoneNumber(senderPhoneNumber);
    const externalMessageId =
      readOptionalString(messageRecord.id) ??
      readOptionalString(messageRecord.messageId) ??
      readOptionalString(messageRecord.externalMessageId);

    if (!normalizedSenderPhoneNumber || !senderPhoneNumber || !externalMessageId) {
      continue;
    }

    const singleAttachment = readRecord(messageRecord.attachment);
    const imageAttachment = readRecord(messageRecord.image);
    const documentAttachment = readRecord(messageRecord.document);
    const attachments = [
      ...readArray(messageRecord.attachments),
      ...(singleAttachment ? [singleAttachment] : []),
      ...(imageAttachment ? [{ ...imageAttachment, type: "image" }] : []),
      ...(documentAttachment ? [{ ...documentAttachment, type: "document" }] : []),
    ];

    for (const attachment of attachments) {
      const attachmentRecord = readRecord(attachment);
      if (!attachmentRecord) continue;

      const fileName =
        readOptionalString(attachmentRecord.fileName) ??
        readOptionalString(attachmentRecord.filename);
      const mimeType =
        readOptionalString(attachmentRecord.mimeType) ??
        readOptionalString(attachmentRecord.mime_type) ??
        readOptionalString(attachmentRecord.contentType);
      const externalMediaId =
        readOptionalString(attachmentRecord.id) ??
        readOptionalString(attachmentRecord.mediaId);

      items.push({
        provider: "GENERIC_WEBHOOK",
        externalEventId,
        externalMessageId,
        dedupeKey:
          buildDedupeKey([
            externalMessageId,
            externalMediaId,
            fileName,
            mimeType,
          ]) || externalMessageId,
        senderPhoneNumber,
        normalizedSenderPhoneNumber,
        senderName:
          readOptionalString(messageRecord.senderName) ??
          readOptionalString(messageRecord.fromName),
        caption:
          readOptionalString(attachmentRecord.caption) ??
          readOptionalString(messageRecord.caption),
        textBody:
          readOptionalString(messageRecord.text) ??
          readOptionalString(readRecord(messageRecord.textPayload)?.body),
        occurredAt: parseDate(messageRecord.timestamp ?? messageRecord.receivedAt),
        recipient: {
          webhookInboxKey:
            readOptionalString(messageRecord.webhookInboxKey) ??
            readOptionalString(payload.webhookInboxKey),
          phoneNumberId:
            readOptionalString(messageRecord.phoneNumberId) ??
            readOptionalString(payload.phoneNumberId),
          displayPhoneNumber:
            readOptionalString(messageRecord.displayPhoneNumber) ??
            readOptionalString(payload.displayPhoneNumber),
          normalizedDisplayPhoneNumber: normalizeWhatsAppPhoneNumber(
            readOptionalString(messageRecord.displayPhoneNumber) ??
              readOptionalString(payload.displayPhoneNumber)
          ),
          recipientPhoneNumber:
            readOptionalString(messageRecord.to) ??
            readOptionalString(messageRecord.recipientPhoneNumber) ??
            readOptionalString(payload.recipientPhoneNumber),
          normalizedRecipientPhoneNumber: normalizeWhatsAppPhoneNumber(
            readOptionalString(messageRecord.to) ??
              readOptionalString(messageRecord.recipientPhoneNumber) ??
              readOptionalString(payload.recipientPhoneNumber)
          ),
        },
        media: {
          kind: normalizeGenericAttachmentKind(attachmentRecord.type),
          externalMediaId,
          mimeType,
          fileName,
          downloadUrl: readOptionalString(attachmentRecord.url),
          base64Data: normalizeBase64(
            readOptionalString(attachmentRecord.base64) ??
              readOptionalString(attachmentRecord.data)
          ),
          sha256:
            readOptionalString(attachmentRecord.sha256) ??
            readOptionalString(attachmentRecord.hash),
        },
        rawPayload: {
          message: messageRecord,
          attachment: attachmentRecord,
        },
      });
    }
  }

  return items;
}

export function detectWhatsAppReceiptProvider(
  req: Request,
  payload: Record<string, unknown> | null
): WhatsAppReceiptProvider {
  const url = new URL(req.url);
  const explicitProvider = readString(url.searchParams.get("provider")).toUpperCase();

  if (explicitProvider === "META_CLOUD_API" || explicitProvider === "META") {
    return "META_CLOUD_API";
  }

  if (
    explicitProvider === "GENERIC_WEBHOOK" ||
    explicitProvider === "GENERIC" ||
    explicitProvider === "CUSTOM"
  ) {
    return "GENERIC_WEBHOOK";
  }

  if (payload?.object === "whatsapp_business_account") {
    return "META_CLOUD_API";
  }

  if (Array.isArray(payload?.entry)) {
    return "META_CLOUD_API";
  }

  return "GENERIC_WEBHOOK";
}

export function verifyWhatsAppReceiptWebhookRequest(input: {
  provider: WhatsAppReceiptProvider;
  req: Request;
  rawBody?: string;
}): WhatsAppVerificationResult {
  const config = getWhatsAppReceiptRuntimeConfig();
  const url = new URL(input.req.url);

  if (input.req.method === "GET") {
    if (input.provider !== "META_CLOUD_API") {
      return { ok: true };
    }

    const mode = readString(url.searchParams.get("hub.mode"));
    const verifyToken = readString(url.searchParams.get("hub.verify_token"));
    if (mode !== "subscribe") {
      return {
        ok: false,
        status: 400,
        error: "Unsupported verification mode",
      };
    }
    if (config.verifyToken && !timingSafeEqual(verifyToken, config.verifyToken)) {
      return {
        ok: false,
        status: 403,
        error: "Verification token mismatch",
      };
    }
    return { ok: true };
  }

  if (!config.webhookSecret) {
    return { ok: true };
  }

  if (input.provider === "META_CLOUD_API") {
    const signature = readString(input.req.headers.get("x-hub-signature-256"));
    if (!signature || !input.rawBody) {
      return {
        ok: false,
        status: 401,
        error: "Missing Meta webhook signature",
      };
    }

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", config.webhookSecret)
      .update(input.rawBody)
      .digest("hex")}`;

    return timingSafeEqual(signature, expectedSignature)
      ? { ok: true }
      : {
          ok: false,
          status: 401,
          error: "Invalid Meta webhook signature",
        };
  }

  const headerSecret =
    readString(input.req.headers.get("x-whatsapp-webhook-secret")) ||
    readString(input.req.headers.get("x-webhook-secret"));
  const bearerSecret = readString(input.req.headers.get("authorization")).replace(
    /^bearer\s+/i,
    ""
  );
  const candidate = headerSecret || bearerSecret;

  return candidate && timingSafeEqual(candidate, config.webhookSecret)
    ? { ok: true }
    : {
        ok: false,
        status: 401,
        error: "Invalid WhatsApp webhook secret",
      };
}

export function parseWhatsAppWebhookPayload(input: {
  provider: WhatsAppReceiptProvider;
  payload: Record<string, unknown>;
}) {
  return input.provider === "META_CLOUD_API"
    ? parseMetaCloudApiPayload(input.payload)
    : parseGenericWebhookPayload(input.payload);
}

export async function resolveWhatsAppInboundMedia(input: {
  item: NormalizedWhatsAppInboundItem;
}) {
  const mimeType = input.item.media.mimeType?.trim() || "application/octet-stream";
  const fileName =
    input.item.media.fileName?.trim() ||
    `${safeFileName(input.item.externalMessageId)}.${inferExtension(mimeType)}`;

  if (input.item.media.base64Data) {
    return {
      fileName,
      fileType: mimeType,
      sizeBytes: Buffer.byteLength(input.item.media.base64Data, "base64"),
      buffer: Buffer.from(input.item.media.base64Data, "base64"),
    };
  }

  let downloadUrl = input.item.media.downloadUrl;
  let resolvedMimeType = mimeType;

  if (input.item.provider === "META_CLOUD_API" && input.item.media.externalMediaId) {
    const config = getWhatsAppReceiptRuntimeConfig();
    if (!config.metaAccessToken) {
      throw new Error("WHATSAPP_META_ACCESS_TOKEN is not configured");
    }

    const metadataRes = await fetch(
      `https://graph.facebook.com/${config.metaApiVersion}/${input.item.media.externalMediaId}`,
      {
        headers: {
          Authorization: `Bearer ${config.metaAccessToken}`,
        },
        cache: "no-store",
      }
    );
    if (!metadataRes.ok) {
      throw new Error(`Meta media lookup failed with ${metadataRes.status}`);
    }

    const metadata = (await metadataRes.json()) as {
      url?: string;
      mime_type?: string;
    };
    downloadUrl = metadata.url ?? downloadUrl;
    resolvedMimeType = metadata.mime_type?.trim() || resolvedMimeType;
  }

  if (!downloadUrl) {
    throw new Error("No downloadable media URL was supplied");
  }

  const config = getWhatsAppReceiptRuntimeConfig();
  const mediaRes = await fetch(downloadUrl, {
    headers:
      input.item.provider === "META_CLOUD_API" && config.metaAccessToken
        ? {
            Authorization: `Bearer ${config.metaAccessToken}`,
          }
        : undefined,
    cache: "no-store",
  });

  if (!mediaRes.ok) {
    throw new Error(`Media download failed with ${mediaRes.status}`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  return {
    fileName,
    fileType: mediaRes.headers.get("content-type")?.trim() || resolvedMimeType,
    sizeBytes: arrayBuffer.byteLength,
    buffer: Buffer.from(arrayBuffer),
  };
}
