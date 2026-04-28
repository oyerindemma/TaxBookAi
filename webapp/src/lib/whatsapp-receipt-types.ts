import type {
  WhatsAppReceiptConnectionStatus,
  WhatsAppReceiptMediaKind,
  WhatsAppReceiptMessageStatus,
  WhatsAppReceiptProvider,
  WorkspaceRole,
} from "@prisma/client";

export type WhatsAppClientBusinessOption = {
  id: number;
  name: string;
  defaultCurrency: string;
};

export type WhatsAppRuntimeConfigSummary = {
  webhookUrl: string;
  verifyTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  metaAccessTokenConfigured: boolean;
};

export type WhatsAppSenderMappingSummary = {
  id: number;
  connectionId: number;
  clientBusinessId: number;
  clientBusinessName: string;
  senderPhoneNumber: string;
  normalizedSenderPhoneNumber: string;
  label: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppConnectionSummary = {
  id: number;
  provider: WhatsAppReceiptProvider;
  status: WhatsAppReceiptConnectionStatus;
  label: string;
  webhookInboxKey: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  normalizedDisplayPhoneNumber: string | null;
  defaultClientBusinessId: number | null;
  defaultClientBusinessName: string | null;
  autoProcess: boolean;
  senderMappingCount: number;
  activeMappingCount: number;
  messageCount: number;
  lastWebhookAt: string | null;
  lastInboundAt: string | null;
  lastVerificationAt: string | null;
  createdAt: string;
  updatedAt: string;
  senderMappings: WhatsAppSenderMappingSummary[];
};

export type WhatsAppRecentMessageSummary = {
  id: number;
  connectionId: number;
  connectionLabel: string;
  provider: WhatsAppReceiptProvider;
  status: WhatsAppReceiptMessageStatus;
  mediaKind: WhatsAppReceiptMediaKind;
  senderPhoneNumber: string;
  senderName: string | null;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  fileName: string | null;
  fileType: string | null;
  failureReason: string | null;
  bookkeepingUploadId: number | null;
  reviewHref: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export type WhatsAppSettingsState = {
  access: {
    role: WorkspaceRole;
    canManage: boolean;
  };
  runtime: WhatsAppRuntimeConfigSummary;
  metrics: {
    connectionCount: number;
    activeConnectionCount: number;
    mappingCount: number;
    recentMessageCount: number;
    processedMessageCount: number;
    failedMessageCount: number;
  };
  clientBusinesses: WhatsAppClientBusinessOption[];
  connections: WhatsAppConnectionSummary[];
  recentMessages: WhatsAppRecentMessageSummary[];
};
