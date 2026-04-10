export const WORKSPACE_ALERT_TYPES = [
  "DUPLICATE_TRANSACTION",
  "UNUSUAL_SPIKE",
  "MISSING_EVIDENCE",
  "TAX_DUE_SOON",
  "UNRESOLVED_REVIEW_ITEMS",
  "FILING_BLOCKER",
] as const;

export const WORKSPACE_ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

export const WORKSPACE_ALERT_STATUSES = ["OPEN", "SNOOZED", "RESOLVED"] as const;

export type WorkspaceAlertType = (typeof WORKSPACE_ALERT_TYPES)[number];
export type WorkspaceAlertSeverity = (typeof WORKSPACE_ALERT_SEVERITIES)[number];
export type WorkspaceAlertStatus = (typeof WORKSPACE_ALERT_STATUSES)[number];

export type WorkspaceAlertRecordLink = {
  recordType: string;
  recordId: number | null;
  href: string;
  label: string;
  secondaryLabel: string | null;
};

export type WorkspaceAlertListItem = {
  id: number;
  type: WorkspaceAlertType;
  severity: WorkspaceAlertSeverity;
  status: WorkspaceAlertStatus;
  title: string;
  message: string;
  explanation: string | null;
  recommendedActionLabel: string | null;
  recommendedActionHref: string | null;
  primaryRecordType: string | null;
  primaryRecordId: number | null;
  primaryRecordHref: string | null;
  recordCount: number;
  sourceRecords: WorkspaceAlertRecordLink[];
  metadata: Record<string, unknown> | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  lastStatusChangedAt: string | null;
  clientBusiness: {
    id: number;
    name: string;
  } | null;
};

export type WorkspaceAlertSummary = {
  totalCount: number;
  activeCount: number;
  openCount: number;
  snoozedCount: number;
  resolvedCount: number;
  criticalOpenCount: number;
  warningOpenCount: number;
  infoOpenCount: number;
  byType: Record<WorkspaceAlertType, number>;
  bySeverity: Record<WorkspaceAlertSeverity, number>;
  overdueTaxCount: number;
};

export type WorkspaceAlertCenterResponse = {
  generatedAt: string;
  workspace: {
    id: number;
  };
  summary: WorkspaceAlertSummary;
  alerts: WorkspaceAlertListItem[];
};

export type WorkspaceAlertDashboardSnapshot = {
  generatedAt: string;
  summary: {
    openCount: number;
    criticalCount: number;
    snoozedCount: number;
    resolvedCount: number;
  };
  topAlerts: WorkspaceAlertListItem[];
};

export function createWorkspaceAlertTypeCountMap() {
  return Object.fromEntries(
    WORKSPACE_ALERT_TYPES.map((type) => [type, 0])
  ) as Record<WorkspaceAlertType, number>;
}

export function createWorkspaceAlertSeverityCountMap() {
  return Object.fromEntries(
    WORKSPACE_ALERT_SEVERITIES.map((severity) => [severity, 0])
  ) as Record<WorkspaceAlertSeverity, number>;
}
