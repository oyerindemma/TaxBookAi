export const LEGAL_VERSION = "2026-04-09";
export const DPA_VERSION = "2026-04-09";

export const COOKIE_CONSENT_STORAGE_KEY = "tb_cookie_consent";
export const COOKIE_CONSENT_COOKIE_NAME = "tb_cookie_consent";
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type CookieConsentStatus = "accepted" | "rejected";
export type ComplianceWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type ComplianceAccessTier = "admin" | "accountant" | "viewer";

export function resolveComplianceAccessTier(
  role: ComplianceWorkspaceRole | null | undefined
): ComplianceAccessTier | null {
  if (!role) return null;
  if (role === "OWNER" || role === "ADMIN") return "admin";
  if (role === "MEMBER") return "accountant";
  return "viewer";
}

export function getComplianceAccessTierCopy(
  tier: ComplianceAccessTier | null
): {
  label: string;
  description: string;
} {
  switch (tier) {
    case "admin":
      return {
        label: "Admin",
        description:
          "Can manage workspace configuration, exports, team controls, and sensitive compliance actions.",
      };
    case "accountant":
      return {
        label: "Accountant",
        description:
          "Can work through transaction review, categorization, bookkeeping, and tax operations within the assigned workspace.",
      };
    case "viewer":
      return {
        label: "Viewer",
        description:
          "Can view workspace information and reports but cannot perform operational or destructive changes.",
      };
    default:
      return {
        label: "No workspace role",
        description:
          "Select or join a workspace before using workspace-scoped compliance tools.",
      };
  }
}
