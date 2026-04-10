import "server-only";

import { Prisma } from "@prisma/client";
import type {
  WorkspaceRole,
  WhatsAppReceiptConnectionStatus,
  WhatsAppReceiptProvider,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { enforceAiScanLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  ingestBookkeepingDocument,
  validateBookkeepingDocument,
} from "@/lib/bookkeeping-ingestion";
import { getAppUrl, getWhatsAppReceiptRuntimeConfig } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import {
  normalizeWhatsAppPhoneNumber,
  resolveWhatsAppInboundMedia,
  type NormalizedWhatsAppInboundItem,
} from "@/lib/whatsapp-receipt-provider";
import type {
  WhatsAppConnectionSummary,
  WhatsAppRecentMessageSummary,
  WhatsAppSettingsState,
  WhatsAppSenderMappingSummary,
} from "@/lib/whatsapp-receipt-types";
import { canManageWorkspace } from "@/lib/workspaces";

const WHATSAPP_RECEIPT_CONNECTION_SUPPORT = {
  tables: [
    "WhatsAppReceiptConnection",
    "WhatsAppReceiptSenderMapping",
    "WhatsAppReceiptMessage",
  ],
  columns: [
    "WhatsAppReceiptConnection.workspaceId",
    "WhatsAppReceiptConnection.status",
    "WhatsAppReceiptConnection.label",
    "WhatsAppReceiptSenderMapping.connectionId",
    "WhatsAppReceiptSenderMapping.active",
    "WhatsAppReceiptMessage.connectionId",
  ],
} as const;

const WHATSAPP_RECEIPT_MESSAGE_SUPPORT = {
  tables: ["WhatsAppReceiptMessage"],
  columns: [
    "WhatsAppReceiptMessage.workspaceId",
    "WhatsAppReceiptMessage.receivedAt",
    "WhatsAppReceiptMessage.connectionId",
  ],
} as const;

const whatsAppReceiptWarningKeys = new Set<string>();

function logWhatsAppReceiptWarningOnce(
  key: string,
  message: string,
  metadata: Record<string, unknown>
) {
  if (whatsAppReceiptWarningKeys.has(key)) {
    return;
  }

  whatsAppReceiptWarningKeys.add(key);
  logWarn("whatsapp-receipt-capture", message, metadata);
}

async function runWhatsAppReceiptSettingsQuerySafely<T>(input: {
  workspaceId: number;
  label: string;
  query: () => Promise<T>;
  fallback: () => T;
  support?: {
    tables?: readonly string[];
    columns?: readonly string[];
  };
}) {
  if (input.support && !(await hasPrismaDatabaseSupport(input.support))) {
    logWhatsAppReceiptWarningOnce(
      `missing-support:${input.label}`,
      `WhatsApp receipt ${input.label} is unavailable in the current database; returning an empty fallback.`,
      {
        workspaceId: input.workspaceId,
        tables: input.support.tables ?? [],
        columns: input.support.columns ?? [],
      }
    );
    return input.fallback();
  }

  try {
    return await input.query();
  } catch (error) {
    if (
      input.support &&
      isPrismaSchemaCompatibilityError(error, {
        tables: input.support.tables ? [...input.support.tables] : [],
        columns: input.support.columns ? [...input.support.columns] : [],
      })
    ) {
      logWhatsAppReceiptWarningOnce(
        `schema-compat:${input.label}`,
        `WhatsApp receipt ${input.label} hit a schema compatibility mismatch; returning an empty fallback.`,
        {
          workspaceId: input.workspaceId,
        }
      );
    } else {
      logError(
        "whatsapp-receipt-capture",
        `WhatsApp receipt ${input.label} failed; using a safe fallback.`,
        error,
        {
          workspaceId: input.workspaceId,
        }
      );
    }

    return input.fallback();
  }
}

function buildEmptyWhatsAppReceiptSettings(input: {
  role: WorkspaceRole;
  clientBusinesses?: WhatsAppSettingsState["clientBusinesses"];
}): WhatsAppSettingsState {
  const runtimeConfig = getWhatsAppReceiptRuntimeConfig();

  return {
    access: {
      role: input.role,
      canManage: canManageWorkspace(input.role),
    },
    runtime: {
      webhookUrl: buildWebhookUrl(),
      verifyTokenConfigured: Boolean(runtimeConfig.verifyToken),
      webhookSecretConfigured: Boolean(runtimeConfig.webhookSecret),
      metaAccessTokenConfigured: Boolean(runtimeConfig.metaAccessToken),
    },
    metrics: {
      connectionCount: 0,
      activeConnectionCount: 0,
      mappingCount: 0,
      recentMessageCount: 0,
      processedMessageCount: 0,
      failedMessageCount: 0,
    },
    clientBusinesses: input.clientBusinesses ?? [],
    connections: [],
    recentMessages: [],
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = readString(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function readOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeConnectionStatus(value: unknown): WhatsAppReceiptConnectionStatus {
  const normalized = readString(value).toUpperCase();
  if (normalized === "PAUSED" || normalized === "DISCONNECTED") {
    return normalized;
  }
  return "ACTIVE";
}

function normalizeProvider(value: unknown): WhatsAppReceiptProvider {
  const normalized = readString(value).toUpperCase();
  if (normalized === "META_CLOUD_API" || normalized === "META") {
    return "META_CLOUD_API";
  }
  return "GENERIC_WEBHOOK";
}

function buildWebhookUrl() {
  return new URL("/api/whatsapp/receipts/webhook", getAppUrl()).toString();
}

function toIsoString(value: Date | null) {
  return value?.toISOString() ?? null;
}

function serializeSenderMapping(
  mapping: {
    id: number;
    connectionId: number;
    clientBusinessId: number;
    senderPhoneNumber: string;
    normalizedSenderPhoneNumber: string;
    label: string | null;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    clientBusiness: {
      name: string;
    };
  }
): WhatsAppSenderMappingSummary {
  return {
    id: mapping.id,
    connectionId: mapping.connectionId,
    clientBusinessId: mapping.clientBusinessId,
    clientBusinessName: mapping.clientBusiness.name,
    senderPhoneNumber: mapping.senderPhoneNumber,
    normalizedSenderPhoneNumber: mapping.normalizedSenderPhoneNumber,
    label: mapping.label,
    notes: mapping.notes,
    active: mapping.active,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

function serializeConnection(
  connection: {
    id: number;
    provider: WhatsAppReceiptProvider;
    status: WhatsAppReceiptConnectionStatus;
    label: string;
    webhookInboxKey: string | null;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
    normalizedDisplayPhoneNumber: string | null;
    defaultClientBusinessId: number | null;
    autoProcess: boolean;
    lastWebhookAt: Date | null;
    lastInboundAt: Date | null;
    lastVerificationAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    defaultClientBusiness: {
      name: string;
    } | null;
    senderMappings: Array<{
      id: number;
      connectionId: number;
      clientBusinessId: number;
      senderPhoneNumber: string;
      normalizedSenderPhoneNumber: string;
      label: string | null;
      notes: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
      clientBusiness: {
        name: string;
      };
    }>;
    _count: {
      senderMappings: number;
      messages: number;
    };
  }
): WhatsAppConnectionSummary {
  const senderMappings = connection.senderMappings.map((mapping) =>
    serializeSenderMapping(mapping)
  );

  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    label: connection.label,
    webhookInboxKey: connection.webhookInboxKey,
    phoneNumberId: connection.phoneNumberId,
    displayPhoneNumber: connection.displayPhoneNumber,
    normalizedDisplayPhoneNumber: connection.normalizedDisplayPhoneNumber,
    defaultClientBusinessId: connection.defaultClientBusinessId,
    defaultClientBusinessName: connection.defaultClientBusiness?.name ?? null,
    autoProcess: connection.autoProcess,
    senderMappingCount: connection._count.senderMappings,
    activeMappingCount: senderMappings.filter((mapping) => mapping.active).length,
    messageCount: connection._count.messages,
    lastWebhookAt: toIsoString(connection.lastWebhookAt),
    lastInboundAt: toIsoString(connection.lastInboundAt),
    lastVerificationAt: toIsoString(connection.lastVerificationAt),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    senderMappings,
  };
}

function serializeRecentMessage(message: {
  id: number;
  connectionId: number;
  provider: WhatsAppReceiptProvider;
  status: "RECEIVED" | "IGNORED" | "PROCESSING" | "PROCESSED" | "FAILED";
  mediaKind: "IMAGE" | "DOCUMENT";
  senderPhoneNumber: string;
  senderName: string | null;
  fileName: string | null;
  fileType: string | null;
  failureReason: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  connection: {
    label: string;
  };
  clientBusiness: {
    id: number;
    name: string;
  } | null;
  bookkeepingUpload: {
    id: number;
  } | null;
}): WhatsAppRecentMessageSummary {
  const bookkeepingUploadId = message.bookkeepingUpload?.id ?? null;

  return {
    id: message.id,
    connectionId: message.connectionId,
    connectionLabel: message.connection.label,
    provider: message.provider,
    status: message.status,
    mediaKind: message.mediaKind,
    senderPhoneNumber: message.senderPhoneNumber,
    senderName: message.senderName,
    clientBusinessId: message.clientBusiness?.id ?? null,
    clientBusinessName: message.clientBusiness?.name ?? null,
    fileName: message.fileName,
    fileType: message.fileType,
    failureReason: message.failureReason,
    bookkeepingUploadId,
    reviewHref: bookkeepingUploadId ? `/dashboard/receipts?upload=${bookkeepingUploadId}` : null,
    receivedAt: message.receivedAt.toISOString(),
    processedAt: message.processedAt?.toISOString() ?? null,
  };
}

async function ensureWorkspaceClientBusiness(
  workspaceId: number,
  clientBusinessId: number | null
) {
  if (!clientBusinessId) return null;

  return prisma.clientBusiness.findFirst({
    where: {
      id: clientBusinessId,
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

function parseConnectionPayload(input: Record<string, unknown>) {
  const label = readString(input.label);
  if (!label) {
    return { error: "Connection label is required." } as const;
  }

  const provider = normalizeProvider(input.provider);
  const webhookInboxKey = readOptionalString(input.webhookInboxKey);
  const phoneNumberId = readOptionalString(input.phoneNumberId);
  const displayPhoneNumber = readOptionalString(input.displayPhoneNumber);
  const normalizedDisplayPhoneNumber = normalizeWhatsAppPhoneNumber(displayPhoneNumber);

  if (!webhookInboxKey && !phoneNumberId && !normalizedDisplayPhoneNumber) {
    return {
      error:
        "Add at least one connection identifier: webhook inbox key, phone number ID, or display phone number.",
    } as const;
  }

  return {
    data: {
      provider,
      status: normalizeConnectionStatus(input.status),
      label,
      webhookInboxKey,
      phoneNumberId,
      displayPhoneNumber,
      normalizedDisplayPhoneNumber,
      defaultClientBusinessId: readOptionalInteger(input.defaultClientBusinessId),
      autoProcess: readBoolean(input.autoProcess, true),
    },
  } as const;
}

function parseSenderMappingPayload(input: Record<string, unknown>) {
  const connectionId = readOptionalInteger(input.connectionId);
  const clientBusinessId = readOptionalInteger(input.clientBusinessId);
  const senderPhoneNumber = readString(input.senderPhoneNumber);
  const normalizedSenderPhoneNumber = normalizeWhatsAppPhoneNumber(senderPhoneNumber);

  if (!connectionId) {
    return { error: "Connection is required." } as const;
  }

  if (!clientBusinessId) {
    return { error: "Client business is required." } as const;
  }

  if (!senderPhoneNumber || !normalizedSenderPhoneNumber) {
    return { error: "Sender phone number is required." } as const;
  }

  return {
    data: {
      connectionId,
      clientBusinessId,
      senderPhoneNumber,
      normalizedSenderPhoneNumber,
      label: readOptionalString(input.label),
      notes: readOptionalString(input.notes),
      active: readBoolean(input.active, true),
    },
  } as const;
}

export async function getWorkspaceWhatsAppReceiptSettings(input: {
  workspaceId: number;
  role: WorkspaceRole;
}): Promise<WhatsAppSettingsState> {
  const runtimeConfig = getWhatsAppReceiptRuntimeConfig();

  const [clientBusinesses, connections, recentMessages] = await Promise.all([
    runWhatsAppReceiptSettingsQuerySafely({
      workspaceId: input.workspaceId,
      label: "client businesses query",
      query: () =>
        prisma.clientBusiness.findMany({
          where: {
            workspaceId: input.workspaceId,
            archivedAt: null,
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            defaultCurrency: true,
          },
        }),
      fallback: () => [],
    }),
    runWhatsAppReceiptSettingsQuerySafely({
      workspaceId: input.workspaceId,
      label: "connections query",
      support: WHATSAPP_RECEIPT_CONNECTION_SUPPORT,
      query: () =>
        prisma.whatsAppReceiptConnection.findMany({
          where: {
            workspaceId: input.workspaceId,
          },
          orderBy: [{ status: "asc" }, { label: "asc" }],
          select: {
            id: true,
            provider: true,
            status: true,
            label: true,
            webhookInboxKey: true,
            phoneNumberId: true,
            displayPhoneNumber: true,
            normalizedDisplayPhoneNumber: true,
            defaultClientBusinessId: true,
            autoProcess: true,
            lastWebhookAt: true,
            lastInboundAt: true,
            lastVerificationAt: true,
            createdAt: true,
            updatedAt: true,
            defaultClientBusiness: {
              select: {
                name: true,
              },
            },
            senderMappings: {
              orderBy: [{ active: "desc" }, { senderPhoneNumber: "asc" }],
              select: {
                id: true,
                connectionId: true,
                clientBusinessId: true,
                senderPhoneNumber: true,
                normalizedSenderPhoneNumber: true,
                label: true,
                notes: true,
                active: true,
                createdAt: true,
                updatedAt: true,
                clientBusiness: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            _count: {
              select: {
                senderMappings: true,
                messages: true,
              },
            },
          },
        }),
      fallback: () => [],
    }),
    runWhatsAppReceiptSettingsQuerySafely({
      workspaceId: input.workspaceId,
      label: "recent messages query",
      support: WHATSAPP_RECEIPT_MESSAGE_SUPPORT,
      query: () =>
        prisma.whatsAppReceiptMessage.findMany({
          where: {
            workspaceId: input.workspaceId,
          },
          orderBy: { receivedAt: "desc" },
          take: 12,
          select: {
            id: true,
            connectionId: true,
            provider: true,
            status: true,
            mediaKind: true,
            senderPhoneNumber: true,
            senderName: true,
            fileName: true,
            fileType: true,
            failureReason: true,
            receivedAt: true,
            processedAt: true,
            connection: {
              select: {
                label: true,
              },
            },
            clientBusiness: {
              select: {
                id: true,
                name: true,
              },
            },
            bookkeepingUpload: {
              select: {
                id: true,
              },
            },
          },
        }),
      fallback: () => [],
    }),
  ]);

  if (connections.length === 0 && recentMessages.length === 0) {
    return buildEmptyWhatsAppReceiptSettings({
      role: input.role,
      clientBusinesses,
    });
  }

  const connectionSummaries = connections.map((connection) => serializeConnection(connection));
  const messageSummaries = recentMessages.map((message) => serializeRecentMessage(message));

  return {
    access: {
      role: input.role,
      canManage: canManageWorkspace(input.role),
    },
    runtime: {
      webhookUrl: buildWebhookUrl(),
      verifyTokenConfigured: Boolean(runtimeConfig.verifyToken),
      webhookSecretConfigured: Boolean(runtimeConfig.webhookSecret),
      metaAccessTokenConfigured: Boolean(runtimeConfig.metaAccessToken),
    },
    metrics: {
      connectionCount: connectionSummaries.length,
      activeConnectionCount: connectionSummaries.filter(
        (connection) => connection.status === "ACTIVE"
      ).length,
      mappingCount: connectionSummaries.reduce(
        (total, connection) => total + connection.senderMappingCount,
        0
      ),
      recentMessageCount: messageSummaries.length,
      processedMessageCount: messageSummaries.filter(
        (message) => message.status === "PROCESSED"
      ).length,
      failedMessageCount: messageSummaries.filter((message) => message.status === "FAILED")
        .length,
    },
    clientBusinesses,
    connections: connectionSummaries,
    recentMessages: messageSummaries,
  };
}

export async function createWorkspaceWhatsAppReceiptConnection(input: {
  workspaceId: number;
  actorUserId: number;
  payload: Record<string, unknown>;
}) {
  const parsed = parseConnectionPayload(input.payload);
  if ("error" in parsed) {
    return parsed;
  }

  const defaultClientBusiness = await ensureWorkspaceClientBusiness(
    input.workspaceId,
    parsed.data.defaultClientBusinessId
  );
  if (parsed.data.defaultClientBusinessId && !defaultClientBusiness) {
    return { error: "Default client business was not found in this workspace." } as const;
  }

  const connection = await prisma.whatsAppReceiptConnection.create({
    data: {
      workspaceId: input.workspaceId,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      ...parsed.data,
    },
    select: {
      id: true,
      label: true,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "WHATSAPP_RECEIPT_CONNECTION_CREATED",
    metadata: {
      connectionId: connection.id,
      label: connection.label,
      provider: parsed.data.provider,
      status: parsed.data.status,
      defaultClientBusinessId: parsed.data.defaultClientBusinessId,
    },
  });

  return { connectionId: connection.id } as const;
}

export async function updateWorkspaceWhatsAppReceiptConnection(input: {
  workspaceId: number;
  actorUserId: number;
  connectionId: number;
  payload: Record<string, unknown>;
}) {
  const parsed = parseConnectionPayload(input.payload);
  if ("error" in parsed) {
    return parsed;
  }

  const existing = await prisma.whatsAppReceiptConnection.findFirst({
    where: {
      id: input.connectionId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      label: true,
    },
  });
  if (!existing) {
    return { error: "Connection not found." } as const;
  }

  const defaultClientBusiness = await ensureWorkspaceClientBusiness(
    input.workspaceId,
    parsed.data.defaultClientBusinessId
  );
  if (parsed.data.defaultClientBusinessId && !defaultClientBusiness) {
    return { error: "Default client business was not found in this workspace." } as const;
  }

  await prisma.whatsAppReceiptConnection.update({
    where: { id: input.connectionId },
    data: {
      ...parsed.data,
      updatedByUserId: input.actorUserId,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "WHATSAPP_RECEIPT_CONNECTION_UPDATED",
    metadata: {
      connectionId: input.connectionId,
      previousLabel: existing.label,
      nextLabel: parsed.data.label,
      provider: parsed.data.provider,
      status: parsed.data.status,
      defaultClientBusinessId: parsed.data.defaultClientBusinessId,
    },
  });

  return { connectionId: input.connectionId } as const;
}

export async function createWorkspaceWhatsAppReceiptSenderMapping(input: {
  workspaceId: number;
  actorUserId: number;
  payload: Record<string, unknown>;
}) {
  const parsed = parseSenderMappingPayload(input.payload);
  if ("error" in parsed) {
    return parsed;
  }

  const [connection, clientBusiness] = await Promise.all([
    prisma.whatsAppReceiptConnection.findFirst({
      where: {
        id: parsed.data.connectionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        label: true,
      },
    }),
    ensureWorkspaceClientBusiness(input.workspaceId, parsed.data.clientBusinessId),
  ]);

  if (!connection) {
    return { error: "Connection not found." } as const;
  }

  if (!clientBusiness) {
    return { error: "Client business not found." } as const;
  }

  const mapping = await prisma.whatsAppReceiptSenderMapping.create({
    data: {
      workspaceId: input.workspaceId,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      ...parsed.data,
    },
    select: {
      id: true,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "WHATSAPP_RECEIPT_SENDER_MAPPING_CREATED",
    metadata: {
      mappingId: mapping.id,
      connectionId: parsed.data.connectionId,
      connectionLabel: connection.label,
      clientBusinessId: parsed.data.clientBusinessId,
      clientBusinessName: clientBusiness.name,
      senderPhoneNumber: parsed.data.senderPhoneNumber,
      normalizedSenderPhoneNumber: parsed.data.normalizedSenderPhoneNumber,
      active: parsed.data.active,
    },
  });

  return { mappingId: mapping.id } as const;
}

export async function updateWorkspaceWhatsAppReceiptSenderMapping(input: {
  workspaceId: number;
  actorUserId: number;
  mappingId: number;
  payload: Record<string, unknown>;
}) {
  const parsed = parseSenderMappingPayload(input.payload);
  if ("error" in parsed) {
    return parsed;
  }

  const existing = await prisma.whatsAppReceiptSenderMapping.findFirst({
    where: {
      id: input.mappingId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      connectionId: true,
      senderPhoneNumber: true,
      clientBusinessId: true,
    },
  });
  if (!existing) {
    return { error: "Sender mapping not found." } as const;
  }

  const [connection, clientBusiness] = await Promise.all([
    prisma.whatsAppReceiptConnection.findFirst({
      where: {
        id: parsed.data.connectionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        label: true,
      },
    }),
    ensureWorkspaceClientBusiness(input.workspaceId, parsed.data.clientBusinessId),
  ]);

  if (!connection) {
    return { error: "Connection not found." } as const;
  }

  if (!clientBusiness) {
    return { error: "Client business not found." } as const;
  }

  await prisma.whatsAppReceiptSenderMapping.update({
    where: { id: input.mappingId },
    data: {
      ...parsed.data,
      updatedByUserId: input.actorUserId,
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "WHATSAPP_RECEIPT_SENDER_MAPPING_UPDATED",
    metadata: {
      mappingId: input.mappingId,
      previousConnectionId: existing.connectionId,
      nextConnectionId: parsed.data.connectionId,
      previousClientBusinessId: existing.clientBusinessId,
      nextClientBusinessId: parsed.data.clientBusinessId,
      previousSenderPhoneNumber: existing.senderPhoneNumber,
      nextSenderPhoneNumber: parsed.data.senderPhoneNumber,
      active: parsed.data.active,
    },
  });

  return { mappingId: input.mappingId } as const;
}

async function findWorkspaceConnectionForInboundItem(item: NormalizedWhatsAppInboundItem) {
  const orConditions: Prisma.WhatsAppReceiptConnectionWhereInput[] = [];

  if (item.recipient.phoneNumberId) {
    orConditions.push({
      provider: item.provider,
      phoneNumberId: item.recipient.phoneNumberId,
    });
  }

  if (item.recipient.webhookInboxKey) {
    orConditions.push({
      provider: item.provider,
      webhookInboxKey: item.recipient.webhookInboxKey,
    });
  }

  for (const candidate of [
    item.recipient.normalizedDisplayPhoneNumber,
    item.recipient.normalizedRecipientPhoneNumber,
  ]) {
    if (!candidate) continue;
    orConditions.push({
      provider: item.provider,
      normalizedDisplayPhoneNumber: candidate,
    });
  }

  if (orConditions.length === 0) {
    return null;
  }

  return prisma.whatsAppReceiptConnection.findFirst({
    where: {
      status: "ACTIVE",
      OR: orConditions,
    },
    select: {
      id: true,
      workspaceId: true,
      label: true,
      provider: true,
      autoProcess: true,
      defaultClientBusinessId: true,
    },
  });
}

async function findSenderMappingForInboundItem(input: {
  connectionId: number;
  normalizedSenderPhoneNumber: string;
}) {
  return prisma.whatsAppReceiptSenderMapping.findFirst({
    where: {
      connectionId: input.connectionId,
      normalizedSenderPhoneNumber: input.normalizedSenderPhoneNumber,
      active: true,
    },
    select: {
      id: true,
      clientBusinessId: true,
    },
  });
}

type WebhookProcessingOutcome = {
  provider: WhatsAppReceiptProvider;
  receivedCount: number;
  processedCount: number;
  ignoredCount: number;
  failedCount: number;
  results: Array<{
    externalMessageId: string;
    dedupeKey: string;
    status: "PROCESSED" | "IGNORED" | "FAILED";
    workspaceId: number | null;
    connectionId: number | null;
    bookkeepingUploadId: number | null;
    reason: string | null;
  }>;
};

export async function processWhatsAppReceiptWebhook(input: {
  provider: WhatsAppReceiptProvider;
  items: NormalizedWhatsAppInboundItem[];
}): Promise<WebhookProcessingOutcome> {
  const results: WebhookProcessingOutcome["results"] = [];

  for (const item of input.items) {
    const connection = await findWorkspaceConnectionForInboundItem(item);

    if (!connection) {
      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "IGNORED",
        workspaceId: null,
        connectionId: null,
        bookkeepingUploadId: null,
        reason: "No active WhatsApp receipt connection matched the recipient identifiers.",
      });
      continue;
    }

    await prisma.whatsAppReceiptConnection.update({
      where: { id: connection.id },
      data: {
        lastWebhookAt: new Date(),
      },
    });

    const senderMapping = await findSenderMappingForInboundItem({
      connectionId: connection.id,
      normalizedSenderPhoneNumber: item.normalizedSenderPhoneNumber,
    });
    const resolvedClientBusinessId =
      senderMapping?.clientBusinessId ?? connection.defaultClientBusinessId ?? null;

    const existingMessage = await prisma.whatsAppReceiptMessage.findUnique({
      where: {
        connectionId_dedupeKey: {
          connectionId: connection.id,
          dedupeKey: item.dedupeKey,
        },
      },
      select: {
        id: true,
        status: true,
        bookkeepingUploadId: true,
      },
    });

    if (existingMessage?.status === "PROCESSED") {
      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "IGNORED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: existingMessage.bookkeepingUploadId,
        reason: "This WhatsApp attachment was already processed.",
      });
      continue;
    }

    const message = existingMessage
      ? await prisma.whatsAppReceiptMessage.update({
          where: { id: existingMessage.id },
          data: {
            clientBusinessId: resolvedClientBusinessId,
            senderMappingId: senderMapping?.id ?? null,
            status: "RECEIVED",
            failureReason: null,
            processingNotes: null,
            metadataPayload: JSON.stringify({
              recipient: item.recipient,
            }),
            rawPayload: JSON.stringify(item.rawPayload),
            senderPhoneNumber: item.senderPhoneNumber,
            normalizedSenderPhoneNumber: item.normalizedSenderPhoneNumber,
            senderName: item.senderName,
            recipientPhoneNumber: item.recipient.recipientPhoneNumber,
            normalizedRecipientPhoneNumber: item.recipient.normalizedRecipientPhoneNumber,
            phoneNumberId: item.recipient.phoneNumberId,
            caption: item.caption,
            textBody: item.textBody,
            fileName: item.media.fileName,
            fileType: item.media.mimeType,
            downloadUrl: item.media.downloadUrl,
            mediaSha256: item.media.sha256,
            receivedAt: item.occurredAt,
          },
        })
      : await prisma.whatsAppReceiptMessage.create({
          data: {
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            clientBusinessId: resolvedClientBusinessId,
            senderMappingId: senderMapping?.id ?? null,
            provider: connection.provider,
            status: "RECEIVED",
            mediaKind: item.media.kind,
            externalEventId: item.externalEventId,
            externalMessageId: item.externalMessageId,
            externalMediaId: item.media.externalMediaId,
            dedupeKey: item.dedupeKey,
            senderPhoneNumber: item.senderPhoneNumber,
            normalizedSenderPhoneNumber: item.normalizedSenderPhoneNumber,
            senderName: item.senderName,
            recipientPhoneNumber: item.recipient.recipientPhoneNumber,
            normalizedRecipientPhoneNumber:
              item.recipient.normalizedRecipientPhoneNumber,
            phoneNumberId: item.recipient.phoneNumberId,
            caption: item.caption,
            textBody: item.textBody,
            fileName: item.media.fileName,
            fileType: item.media.mimeType,
            downloadUrl: item.media.downloadUrl,
            mediaSha256: item.media.sha256,
            metadataPayload: JSON.stringify({
              recipient: item.recipient,
            }),
            rawPayload: JSON.stringify(item.rawPayload),
            receivedAt: item.occurredAt,
          },
        });

    if (!resolvedClientBusinessId) {
      const reason =
        "No sender mapping or default client business is configured for this inbound WhatsApp receipt.";
      await prisma.whatsAppReceiptMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failureReason: reason,
          processedAt: new Date(),
        },
      });

      await logAudit({
        workspaceId: connection.workspaceId,
        action: "WHATSAPP_RECEIPT_PROCESSING_FAILED",
        metadata: {
          connectionId: connection.id,
          messageId: message.id,
          reason,
          senderPhoneNumber: item.senderPhoneNumber,
        },
      });

      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "FAILED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: null,
        reason,
      });
      continue;
    }

    if (!connection.autoProcess) {
      const reason =
        "Auto-processing is disabled for this WhatsApp receipt connection.";
      await prisma.whatsAppReceiptMessage.update({
        where: { id: message.id },
        data: {
          status: "IGNORED",
          processingNotes: reason,
          processedAt: new Date(),
        },
      });

      await logAudit({
        workspaceId: connection.workspaceId,
        action: "WHATSAPP_RECEIPT_IGNORED",
        metadata: {
          connectionId: connection.id,
          messageId: message.id,
          reason,
          senderPhoneNumber: item.senderPhoneNumber,
          clientBusinessId: resolvedClientBusinessId,
        },
      });

      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "IGNORED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: null,
        reason,
      });
      continue;
    }

    const featureAccess = await getWorkspaceFeatureAccess(
      connection.workspaceId,
      "AI_ASSISTANT"
    );
    if (!featureAccess.ok) {
      const reason = featureAccess.error;
      await prisma.whatsAppReceiptMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failureReason: reason,
          processedAt: new Date(),
        },
      });

      await logAudit({
        workspaceId: connection.workspaceId,
        action: "WHATSAPP_RECEIPT_PROCESSING_FAILED",
        metadata: {
          connectionId: connection.id,
          messageId: message.id,
          reason,
          clientBusinessId: resolvedClientBusinessId,
        },
      });

      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "FAILED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: null,
        reason,
      });
      continue;
    }

    try {
      const media = await resolveWhatsAppInboundMedia({ item });
      const validation = validateBookkeepingDocument({
        fileType: media.fileType,
        fileSizeBytes: media.sizeBytes,
      });

      if (!validation.ok) {
        await prisma.whatsAppReceiptMessage.update({
          where: { id: message.id },
          data: {
            status: "IGNORED",
            processingNotes: validation.error,
            processedAt: new Date(),
          },
        });

        await logAudit({
          workspaceId: connection.workspaceId,
          action: "WHATSAPP_RECEIPT_IGNORED",
          metadata: {
            connectionId: connection.id,
            messageId: message.id,
            reason: validation.error,
            fileType: media.fileType,
            fileName: media.fileName,
            clientBusinessId: resolvedClientBusinessId,
          },
        });

        results.push({
          externalMessageId: item.externalMessageId,
          dedupeKey: item.dedupeKey,
          status: "IGNORED",
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          bookkeepingUploadId: null,
          reason: validation.error,
        });
        continue;
      }

      const aiScanLimit = await enforceAiScanLimit(connection.workspaceId, 1);
      if (!aiScanLimit.ok) {
        await prisma.whatsAppReceiptMessage.update({
          where: { id: message.id },
          data: {
            status: "FAILED",
            failureReason: aiScanLimit.error,
            processedAt: new Date(),
          },
        });

        await logAudit({
          workspaceId: connection.workspaceId,
          action: "WHATSAPP_RECEIPT_PROCESSING_FAILED",
          metadata: {
            connectionId: connection.id,
            messageId: message.id,
            reason: aiScanLimit.error,
            clientBusinessId: resolvedClientBusinessId,
          },
        });

        results.push({
          externalMessageId: item.externalMessageId,
          dedupeKey: item.dedupeKey,
          status: "FAILED",
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          bookkeepingUploadId: null,
          reason: aiScanLimit.error,
        });
        continue;
      }

      await prisma.whatsAppReceiptMessage.update({
        where: { id: message.id },
        data: {
          status: "PROCESSING",
        },
      });

      const ingestion = await ingestBookkeepingDocument({
        workspaceId: connection.workspaceId,
        clientBusinessId: resolvedClientBusinessId,
        actorUserId: null,
        fileName: media.fileName,
        fileType: media.fileType,
        fileSizeBytes: media.sizeBytes,
        buffer: media.buffer,
        ingestionChannel: "WHATSAPP",
      });

      await prisma.$transaction(async (tx) => {
        await tx.whatsAppReceiptMessage.update({
          where: { id: message.id },
          data: {
            status: "PROCESSED",
            bookkeepingUploadId: ingestion.uploadId,
            processedAt: new Date(),
            failureReason: null,
            processingNotes: null,
          },
        });

        await tx.whatsAppReceiptConnection.update({
          where: { id: connection.id },
          data: {
            lastInboundAt: new Date(),
          },
        });
      });

      await logAudit({
        workspaceId: connection.workspaceId,
        action: "WHATSAPP_RECEIPT_INGESTED",
        metadata: {
          connectionId: connection.id,
          messageId: message.id,
          uploadId: ingestion.uploadId,
          senderPhoneNumber: item.senderPhoneNumber,
          clientBusinessId: resolvedClientBusinessId,
          provider: connection.provider,
          documentType: ingestion.documentType,
          duplicateOfUploadId: ingestion.duplicateOfUploadId,
        },
      });

      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "PROCESSED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: ingestion.uploadId,
        reason: null,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "WhatsApp receipt processing failed";

      await prisma.whatsAppReceiptMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failureReason: reason,
          processedAt: new Date(),
        },
      });

      await logAudit({
        workspaceId: connection.workspaceId,
        action: "WHATSAPP_RECEIPT_PROCESSING_FAILED",
        metadata: {
          connectionId: connection.id,
          messageId: message.id,
          reason,
          senderPhoneNumber: item.senderPhoneNumber,
          clientBusinessId: resolvedClientBusinessId,
        },
      });

      results.push({
        externalMessageId: item.externalMessageId,
        dedupeKey: item.dedupeKey,
        status: "FAILED",
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        bookkeepingUploadId: null,
        reason,
      });
    }
  }

  return {
    provider: input.provider,
    receivedCount: input.items.length,
    processedCount: results.filter((result) => result.status === "PROCESSED").length,
    ignoredCount: results.filter((result) => result.status === "IGNORED").length,
    failedCount: results.filter((result) => result.status === "FAILED").length,
    results,
  };
}
