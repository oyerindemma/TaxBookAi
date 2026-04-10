export const EXPENSE_LEAK_FINDING_TYPES = [
  "RECURRING_SPEND",
  "DUPLICATE_VENDOR_CHARGE",
  "MONTH_OVER_MONTH_SPIKE",
] as const;

export const EXPENSE_LEAK_FINDING_SEVERITIES = [
  "INFO",
  "WARNING",
  "CRITICAL",
] as const;

export const EXPENSE_LEAK_FINDING_STATUSES = [
  "OPEN",
  "DISMISSED",
  "RESOLVED",
] as const;

export type ExpenseLeakFindingType = (typeof EXPENSE_LEAK_FINDING_TYPES)[number];
export type ExpenseLeakFindingSeverity =
  (typeof EXPENSE_LEAK_FINDING_SEVERITIES)[number];
export type ExpenseLeakFindingStatus = (typeof EXPENSE_LEAK_FINDING_STATUSES)[number];

export type ExpenseLeakEvidenceLink = {
  recordType: string;
  recordId: number | null;
  href: string;
  label: string;
  secondaryLabel: string | null;
};

export type ExpenseLeakFindingListItem = {
  id: number;
  type: ExpenseLeakFindingType;
  severity: ExpenseLeakFindingSeverity;
  status: ExpenseLeakFindingStatus;
  title: string;
  summary: string;
  explanation: string | null;
  estimatedSavingsMinor: number;
  currency: string;
  recommendedActionLabel: string | null;
  recommendedActionHref: string | null;
  primaryRecordType: string | null;
  primaryRecordId: number | null;
  primaryRecordHref: string | null;
  recordCount: number;
  evidenceLinks: ExpenseLeakEvidenceLink[];
  metadata: Record<string, unknown> | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  dismissedAt: string | null;
  resolvedAt: string | null;
  lastStatusChangedAt: string | null;
  clientBusiness: {
    id: number;
    name: string;
  } | null;
};

export type ExpenseLeakFindingSummary = {
  totalCount: number;
  openCount: number;
  dismissedCount: number;
  resolvedCount: number;
  criticalOpenCount: number;
  warningOpenCount: number;
  infoOpenCount: number;
  openEstimatedSavingsMinor: number;
  byType: Record<ExpenseLeakFindingType, number>;
  bySeverity: Record<ExpenseLeakFindingSeverity, number>;
};

export type ExpenseLeakCenterResponse = {
  generatedAt: string;
  workspace: {
    id: number;
  };
  summary: ExpenseLeakFindingSummary;
  findings: ExpenseLeakFindingListItem[];
};

export type DashboardExpenseLeakSnapshot = {
  generatedAt: string;
  summary: {
    openCount: number;
    criticalCount: number;
    openEstimatedSavingsMinor: number;
    recurringCount: number;
  };
  topFindings: ExpenseLeakFindingListItem[];
};

export function createExpenseLeakTypeCountMap() {
  return Object.fromEntries(
    EXPENSE_LEAK_FINDING_TYPES.map((type) => [type, 0])
  ) as Record<ExpenseLeakFindingType, number>;
}

export function createExpenseLeakSeverityCountMap() {
  return Object.fromEntries(
    EXPENSE_LEAK_FINDING_SEVERITIES.map((severity) => [severity, 0])
  ) as Record<ExpenseLeakFindingSeverity, number>;
}
