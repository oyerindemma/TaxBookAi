export type AccountantWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type AccountantWorkspaceKind = "STANDARD" | "ACCOUNTANT";

export type AccountantFilingReadinessStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY"
  | "NEEDS_ATTENTION";

export type ClientPortfolioActivityType =
  | "CLIENT_PROFILE"
  | "TRANSACTION"
  | "UPLOAD";

export type AccountantWorkspaceAccess = {
  role: AccountantWorkspaceRole;
  canViewClientBusinesses: boolean;
  canCreateClientBusinesses: boolean;
  canManageClientBusinesses: boolean;
  canManageWorkspace: boolean;
  canSeeBilling: boolean;
  canSeeAudit: boolean;
  canRunOperations: boolean;
  isReadOnly: boolean;
};

export type ClientBusinessPortfolioTaxSummary = {
  currency: string;
  dateLabel: string;
  vatNetMinor: number;
  whtPayableMinor: number;
  whtReceivableMinor: number;
  estimatedTaxExposureMinor: number;
};

export type ClientBusinessReviewStatusBreakdown = {
  importedCount: number;
  pendingReviewCount: number;
  reviewedCount: number;
  postedCount: number;
  flaggedCount: number;
};

export type ClientBusinessPortfolioSummary = {
  id: number;
  name: string;
  legalName: string | null;
  industry: string | null;
  country: string;
  state: string | null;
  taxIdentificationNumber: string | null;
  vatRegistrationNumber: string | null;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  vendorCount: number;
  categoryCount: number;
  ledgerTransactionCount: number;
  transactionCount: number;
  uploadCount: number;
  reviewQueueCount: number;
  reviewStatusBreakdown: ClientBusinessReviewStatusBreakdown;
  taxExposure: ClientBusinessPortfolioTaxSummary;
  lastActivityAt: string | null;
  lastActivityType: ClientPortfolioActivityType | null;
  filingReadinessStatus: AccountantFilingReadinessStatus | null;
  openAlertCount: number;
};

export type AccountantWorkspacePortfolioSummary = {
  workspaceId: number;
  workspaceName: string;
  workspaceKind: AccountantWorkspaceKind;
  clientBusinessCount: number;
  activeClientBusinessCount: number;
  archivedClientBusinessCount: number;
  transactionCount: number;
  reviewQueueCount: number;
  estimatedTaxExposureMinor: number;
  currency: string;
  taxExposureDateLabel: string;
  lastActivityAt: string | null;
  filingReadinessStatus: AccountantFilingReadinessStatus | null;
  openAlertCount: number;
};

export type AccountantWorkspacePortfolioResponse = {
  workspace: AccountantWorkspacePortfolioSummary;
  access: AccountantWorkspaceAccess;
  clientBusinesses: ClientBusinessPortfolioSummary[];
};

export function resolveAccountantWorkspaceKind(
  clientBusinessCount: number
): AccountantWorkspaceKind {
  return clientBusinessCount > 1 ? "ACCOUNTANT" : "STANDARD";
}

export function getAccountantWorkspaceAccess(
  role: AccountantWorkspaceRole
): AccountantWorkspaceAccess {
  const canManageWorkspace = role === "OWNER" || role === "ADMIN";
  const canManageClientBusinesses =
    role === "OWNER" || role === "ADMIN" || role === "MEMBER";

  return {
    role,
    canViewClientBusinesses: true,
    canCreateClientBusinesses: canManageClientBusinesses,
    canManageClientBusinesses,
    canManageWorkspace,
    canSeeBilling: canManageWorkspace,
    canSeeAudit: canManageWorkspace,
    canRunOperations: canManageWorkspace,
    isReadOnly: role === "VIEWER",
  };
}
