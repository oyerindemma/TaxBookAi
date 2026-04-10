"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDashboardNavItems,
  isDashboardNavItemActive,
} from "@/app/dashboard/_components/dashboard-nav";

type SidebarProps = {
  workspace: {
    id: number;
    name: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    workspaceKind: "STANDARD" | "ACCOUNTANT";
    clientBusinessCount: number;
    transactionCount: number;
  } | null;
  preferredModuleHrefs?: string[];
};

export default function Sidebar({
  workspace,
  preferredModuleHrefs = [],
}: SidebarProps) {
  const pathname = usePathname();
  const navItems = getDashboardNavItems(workspace?.role, preferredModuleHrefs);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,1)_0%,rgba(13,27,46,0.985)_36%,rgba(8,21,35,1)_100%)] px-5 py-6 text-white md:flex"
      data-print-hide="true"
    >
      <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_60px_rgba(15,23,42,0.38)] backdrop-blur-md">
        <div className="flex items-center gap-2 px-1">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
            TB
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">
              TaxBook
            </div>
            <div className="text-xs text-slate-300">Finance operations OS</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 px-1">
          <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
            TaxBook AI
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-cyan/20 bg-white/5 text-blue"
          >
            Dashboard
          </Badge>
        </div>
      </div>

      <div className="px-2 pb-3 pt-6 text-xs font-medium uppercase tracking-[0.22em] text-cyan/70">
        Workspace
      </div>
      {workspace?.workspaceKind === "ACCOUNTANT" ? (
        <div className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.06] p-4 text-white backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
              Accountant
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-cyan/20 bg-white/5 text-blue"
            >
              Portfolio
            </Badge>
          </div>
          <div className="mt-3 text-sm font-medium text-white">{workspace.name}</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {workspace.clientBusinessCount} client
            {workspace.clientBusinessCount === 1 ? "" : "s"} · {workspace.transactionCount} tracked
            transactions in the active workspace.
          </p>
        </div>
      ) : null}
      <nav
        aria-label="Dashboard navigation"
        className="flex flex-1 flex-col overflow-y-auto pr-1"
      >
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = isDashboardNavItemActive(pathname, item.href);

            return (
              <li key={item.href}>
                <Button
                  asChild
                  variant="ghost"
                  className={`h-10 w-full justify-start rounded-2xl px-3 text-left transition focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:ring-offset-0 ${
                    isActive
                      ? "bg-white/10 text-cyan shadow-[0_10px_24px_rgba(34,211,238,0.12)] hover:bg-white/10 hover:text-cyan"
                      : "text-slate-300 hover:bg-white/[0.07] hover:text-cyan"
                  }`}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={`Open ${item.label}`}
                  >
                    {item.label}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
