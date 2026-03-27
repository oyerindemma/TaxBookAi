"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, LogOut, Menu, Search, User } from "lucide-react";
import WorkspaceSwitcher, {
  type WorkspaceSwitcherOption,
} from "@/app/dashboard/WorkspaceSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  dashboardNavItems,
  isDashboardNavItemActive,
} from "@/app/dashboard/_components/dashboard-nav";

type TopbarProps = {
  user: {
    fullName: string;
    email: string;
  };
  workspace: {
    name: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  } | null;
  workspaceOptions: WorkspaceSwitcherOption[];
  activeWorkspaceId: number | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function Topbar({
  user,
  workspace,
  workspaceOptions,
  activeWorkspaceId,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex h-20 items-center gap-4 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 md:left-72 md:px-6"
      data-print-hide="true"
    >
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-2xl border border-cyan/20 bg-white shadow-sm transition hover:border-cyan/40 hover:text-cyan md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-cyan/20 bg-primary p-0 text-white">
          <div className="flex h-full flex-col">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
                  TB
                </div>
                <div>
                  <div className="text-lg font-semibold tracking-tight text-white">TaxBook</div>
                  <div className="text-xs text-slate-300">Finance operations OS</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                  Mobile nav
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full border-cyan/20 bg-white/5 text-blue"
                >
                  Dashboard
                </Badge>
              </div>
              <div className="mt-5">
                <WorkspaceSwitcher
                  initialWorkspaces={workspaceOptions}
                  activeWorkspaceId={activeWorkspaceId}
                  variant="mobile"
                />
              </div>
            </div>
            <Separator className="bg-white/10" />
            <nav aria-label="Mobile dashboard navigation" className="flex flex-1 flex-col px-3 py-4">
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
          </div>
        </SheetContent>
      </Sheet>

      <div className="grid gap-1">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          Dashboard
        </div>
        {workspace ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-950">{workspace.name}</span>
            <Badge variant="secondary" className="rounded-full bg-cyan/10 text-cyan">
              {workspace.role}
            </Badge>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No workspace selected</div>
        )}
      </div>

      <div className="ml-auto hidden items-center gap-3 lg:flex">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          <Search className="size-4" />
          Search records, invoices, clients
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-2xl border border-cyan/20 bg-white shadow-sm transition hover:border-cyan/40 hover:text-cyan"
          aria-label="Notifications"
        >
          <Bell className="size-4 text-slate-600" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:block">
          <WorkspaceSwitcher
            initialWorkspaces={workspaceOptions}
            activeWorkspaceId={activeWorkspaceId}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Open account menu"
              className="flex items-center gap-2 rounded-2xl border border-cyan/20 bg-white px-2.5 shadow-sm transition hover:border-cyan/40"
            >
              <Avatar size="sm">
                <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-slate-950 md:inline-block">
                {user.fullName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="grid">
                <span className="text-sm font-medium">{user.fullName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile">
                <User className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              disabled={loggingOut}
            >
              <LogOut className="size-4" />
              {loggingOut ? "Logging out..." : "Logout"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
