import type {
  PaymentGatewayEventStatus,
  PaymentGatewayEventType,
  PaymentIntegrationProvider,
  PaymentProviderConnectionStatus,
  PaymentSettlementStatus,
  PaymentTaxSuggestionSource,
  PaymentTransactionCandidateKind,
  PaymentTransactionCandidateStatus,
  VatTreatment,
  WhtTreatment,
  WorkspaceRole,
} from "@prisma/client";

export type PaymentIntegrationClientBusinessOption = {
  id: number;
  name: string;
  defaultCurrency: string;
};

export type PaymentIntegrationRuntimeSummary = {
  webhookUrl: string;
  paystackSecretConfigured: boolean;
  paystackWebhookSecretConfigured: boolean;
  syncEnabled: boolean;
};

export type PaymentProviderConnectionSummary = {
  id: number;
  provider: PaymentIntegrationProvider;
  status: PaymentProviderConnectionStatus;
  label: string;
  defaultClientBusinessId: number | null;
  defaultClientBusinessName: string | null;
  webhookEnabled: boolean;
  autoSyncEnabled: boolean;
  autoCreateCandidates: boolean;
  settlementSyncWindowDays: number;
  notes: string | null;
  lastWebhookAt: string | null;
  lastEventAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSettlementSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentProviderEventSummary = {
  id: number;
  provider: PaymentIntegrationProvider;
  eventType: PaymentGatewayEventType;
  status: PaymentGatewayEventStatus;
  reference: string | null;
  amountMinor: number | null;
  feesAmountMinor: number | null;
  netAmountMinor: number | null;
  currency: string;
  occurredAt: string;
  invoiceId: number | null;
  paymentId: number | null;
  processingError: string | null;
};

export type PaymentSettlementSummary = {
  id: number;
  provider: PaymentIntegrationProvider;
  externalSettlementId: string;
  status: PaymentSettlementStatus;
  settlementDate: string | null;
  currency: string;
  grossAmountMinor: number;
  feesAmountMinor: number;
  netAmountMinor: number;
  transactionCount: number;
  bankCode: string | null;
  bankAccountName: string | null;
  bankAccountNumberMasked: string | null;
};

export type PaymentTransactionCandidateSummary = {
  id: number;
  kind: PaymentTransactionCandidateKind;
  status: PaymentTransactionCandidateStatus;
  externalReference: string | null;
  description: string;
  counterpartyName: string | null;
  amountMinor: number;
  feesAmountMinor: number;
  netAmountMinor: number;
  currency: string;
  occurredAt: string;
  confidenceScore: number;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  taxSuggestionSource: PaymentTaxSuggestionSource;
  taxSuggestionReason: string | null;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  suggestedInvoiceId: number | null;
  suggestedInvoiceNumber: string | null;
  invoiceMatchScore: number | null;
  bankTransactionId: number | null;
  bankTransactionDescription: string | null;
  suggestedBankTransactionId: number | null;
  suggestedBankTransactionDescription: string | null;
  bankMatchScore: number | null;
  reconciliationReason: string | null;
  reviewNotes: string | null;
};

export type PaymentIntegrationSettingsState = {
  access: {
    role: WorkspaceRole;
    canManage: boolean;
  };
  runtime: PaymentIntegrationRuntimeSummary;
  metrics: {
    connectionConfigured: boolean;
    eventCount: number;
    settlementCount: number;
    candidateCount: number;
    pendingCandidateCount: number;
    reconciledCandidateCount: number;
  };
  clientBusinesses: PaymentIntegrationClientBusinessOption[];
  connection: PaymentProviderConnectionSummary | null;
  recentEvents: PaymentProviderEventSummary[];
  recentSettlements: PaymentSettlementSummary[];
  recentCandidates: PaymentTransactionCandidateSummary[];
};
