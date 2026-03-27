export type SystemMonitorHealth = "healthy" | "warning" | "critical";
export type SystemMonitorIssueLevel = "critical" | "warning";
export type SystemMonitorEventLevel = "info" | "warning" | "critical";

export type SystemMonitorIssue = {
  id: string;
  code: string;
  level: SystemMonitorIssueLevel;
  title: string;
  detail: string;
  invoiceId: number | null;
  reference: string | null;
  createdAt: string | null;
};

export type SystemMonitorPaymentRow = {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  reference: string;
  createdAt: string;
};

export type SystemMonitorTaxRow = {
  invoiceId: number;
  invoiceNumber: string;
  totalAmountMinor: number;
  paidAt: string | null;
  taxRecordId: number | null;
  taxRecordedAt: string | null;
};

export type SystemMonitorEventRow = {
  id: number;
  action: string;
  level: SystemMonitorEventLevel;
  status: string | null;
  actorLabel: string;
  createdAt: string;
  summary: string;
  invoiceId: number | null;
  reference: string | null;
};

export type SystemMonitorSnapshot = {
  generatedAt: string;
  workspace: {
    id: number;
    name: string;
  };
  payments: {
    health: SystemMonitorHealth;
    total: number;
    pending: number;
    success: number;
    failed: number;
    last24HoursSuccess: number;
    recent: SystemMonitorPaymentRow[];
  };
  ledgerIntegrity: {
    health: SystemMonitorHealth;
    checkedPayments: number;
    matchedCount: number;
    missingLedgerCount: number;
    orphanLedgerCount: number;
    duplicateLedgerCount: number;
    issues: SystemMonitorIssue[];
  };
  taxSync: {
    health: SystemMonitorHealth;
    checkedPayments: number;
    syncedCount: number;
    missingTaxCount: number;
    recent: SystemMonitorTaxRow[];
    issues: SystemMonitorIssue[];
  };
  alerts: {
    health: SystemMonitorHealth;
    total: number;
    items: SystemMonitorIssue[];
  };
  events: SystemMonitorEventRow[];
};
