export const dashboardNavItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/workspaces", label: "Workspaces" },
  { href: "/dashboard/client-businesses", label: "Client businesses" },
  { href: "/dashboard/receipts", label: "Receipts" },
  { href: "/dashboard/bookkeeping/review", label: "Bookkeeping review" },
  { href: "/dashboard/tax", label: "Tax engine" },
  { href: "/dashboard/tax-summary", label: "Tax summary" },
  { href: "/dashboard/tax-records", label: "Tax records" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/invoices/recurring", label: "Recurring invoices" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/banking", label: "Banking" },
  { href: "/dashboard/system-monitor", label: "System monitor" },
  { href: "/dashboard/integrity", label: "Integrity control" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/settings/categories", label: "Categories" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/assistant", label: "Assistant" },
  { href: "/dashboard/tax-filing", label: "Tax filing" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/audit", label: "Audit log" },
  { href: "/dashboard/team", label: "Team" },
];

export function isDashboardNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
