"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dashboardNavItems,
  isDashboardNavItemActive,
} from "@/app/dashboard/_components/dashboard-nav";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-cyan/15 bg-primary px-5 py-6 text-white md:flex"
      data-print-hide="true"
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow">
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
      <nav
        aria-label="Dashboard navigation"
        className="flex flex-1 flex-col overflow-y-auto pr-1"
      >
        <ul className="space-y-1">
          {dashboardNavItems.map((item) => {
            const isActive = isDashboardNavItemActive(pathname, item.href);

            return (
              <li key={item.href}>
                <Button
                  asChild
                  variant="ghost"
                  className={`h-10 w-full justify-start rounded-xl px-3 text-left transition focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:ring-offset-0 ${
                    isActive
                      ? "bg-white/10 text-cyan shadow-glow hover:bg-white/10 hover:text-cyan"
                      : "text-slate-300 hover:bg-white/10 hover:text-cyan"
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
