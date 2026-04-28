export type DashboardNavRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type DashboardNavItem = {
  href: string;
  label: string;
  minRole?: DashboardNavRole;
};

const ROLE_ORDER: DashboardNavRole[] = ["VIEWER", "MEMBER", "ADMIN", "OWNER"];

const ALL_DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/import", label: "Import" },
  { href: "/dashboard/review", label: "Review" },
  { href: "/dashboard/categorize", label: "Categorize" },
  { href: "/dashboard/tax", label: "Tax" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/client-businesses", label: "Client businesses" },
  { href: "/dashboard/banking/review", label: "Transaction review" },
  { href: "/dashboard/expense-leaks", label: "Expense leaks" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/tax-center", label: "Tax center" },
  { href: "/dashboard/filing-readiness", label: "Filing readiness" },
  { href: "/dashboard/assistant", label: "Assistant" },
  { href: "/dashboard/workspaces", label: "Workspaces" },
  { href: "/dashboard/receipts", label: "Receipts" },
  { href: "/dashboard/bookkeeping/review", label: "Bookkeeping review" },
  { href: "/dashboard/tax-summary", label: "Tax summary" },
  { href: "/dashboard/cit", label: "CIT workflow" },
  { href: "/dashboard/tax-records", label: "Tax records" },
  { href: "/dashboard/tax-filing", label: "Tax filing" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/invoices/recurring", label: "Recurring invoices" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/banking", label: "Banking" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/settings/categories", label: "Categories", minRole: "MEMBER" },
  { href: "/dashboard/settings/payments", label: "Payment integrations", minRole: "ADMIN" },
  { href: "/dashboard/settings/whatsapp", label: "WhatsApp capture", minRole: "ADMIN" },
  { href: "/dashboard/system-monitor", label: "System monitor", minRole: "ADMIN" },
  { href: "/dashboard/integrity", label: "Integrity control", minRole: "ADMIN" },
  { href: "/dashboard/billing", label: "Billing", minRole: "ADMIN" },
  { href: "/dashboard/audit", label: "Audit log", minRole: "ADMIN" },
  { href: "/dashboard/team", label: "Team", minRole: "ADMIN" },
];

function isRoleAtLeast(role: DashboardNavRole, minimum: DashboardNavRole) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

export function getDashboardNavItems(
  role?: DashboardNavRole | null,
  preferredFirstHrefs: string[] = []
) {
  const resolvedRole = role ?? "VIEWER";
  const preferredOrder = new Map(
    preferredFirstHrefs.map((href, index) => [href, index] as const)
  );

  const visibleItems = ALL_DASHBOARD_NAV_ITEMS.filter((item) =>
    item.minRole ? isRoleAtLeast(resolvedRole, item.minRole) : true
  );

  if (preferredOrder.size === 0) {
    return visibleItems;
  }

  return [...visibleItems].sort((left, right) => {
    const leftOrder = preferredOrder.get(left.href);
    const rightOrder = preferredOrder.get(right.href);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;

    return (
      ALL_DASHBOARD_NAV_ITEMS.findIndex((item) => item.href === left.href) -
      ALL_DASHBOARD_NAV_ITEMS.findIndex((item) => item.href === right.href)
    );
  });
}

export const dashboardNavItems = ALL_DASHBOARD_NAV_ITEMS;

export function isDashboardNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
