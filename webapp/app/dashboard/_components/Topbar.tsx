"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Bell, Bot, LifeBuoy, LogOut, Menu, Search, Settings, User } from "lucide-react";
import WorkspaceSwitcher, {
  type WorkspaceSwitcherOption,
} from "@/app/dashboard/WorkspaceSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  getDashboardNavItems,
  isDashboardNavItemActive,
} from "@/app/dashboard/_components/dashboard-nav";
import OfflineSyncStatusControl from "@/app/dashboard/_components/OfflineSyncStatusControl";
import { useOfflineSync } from "@/app/dashboard/_components/OfflineSyncProvider";
import { supportEmail, supportEmailHref } from "@/lib/config/contact";

type TopbarProps = {
  user: {
    fullName: string;
    email: string;
  };
  workspace: {
    name: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    workspaceKind: "STANDARD" | "ACCOUNTANT";
    clientBusinessCount: number;
    onboardingComplete: boolean;
  } | null;
  workspaceOptions: WorkspaceSwitcherOption[];
  activeWorkspaceId: number | null;
  preferredModuleHrefs?: string[];
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
  preferredModuleHrefs = [],
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navItems = getDashboardNavItems(workspace?.role, preferredModuleHrefs);
  const { clearPrivateData } = useOfflineSync();

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      clearPrivateData();
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/login");
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    router.push(
      query
        ? `/dashboard/banking?query=${encodeURIComponent(query)}`
        : "/dashboard/banking"
    );
  }

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex min-h-16 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_10px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/76 sm:gap-3 sm:px-4 md:left-72 md:h-20 md:px-6 md:py-0"
      data-print-hide="true"
    >
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-2xl border border-cyan/20 bg-white shadow-sm transition hover:border-cyan/40 hover:text-cyan md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(86vw,18rem)] border-cyan/20 bg-primary p-0 text-white">
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
                {navItems.map((item) => {
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

      <div className="grid min-w-0 flex-1 gap-0.5 md:flex-none md:gap-1">
        <div className="hidden text-xs font-medium uppercase tracking-[0.2em] text-slate-400 sm:block">
          Dashboard
        </div>
        {workspace ? (
          <div className="flex min-w-0 items-center gap-2 text-sm sm:flex-wrap">
            <span className="min-w-0 truncate font-medium text-slate-950">{workspace.name}</span>
            <Badge variant="secondary" className="hidden rounded-full bg-cyan/10 text-cyan sm:inline-flex">
              {workspace.role}
            </Badge>
            {workspace.workspaceKind === "ACCOUNTANT" ? (
              <Badge variant="outline" className="hidden rounded-full border-cyan/20 bg-white text-cyan lg:inline-flex">
                {workspace.clientBusinessCount} client
                {workspace.clientBusinessCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {!workspace.onboardingComplete ? (
              <Button asChild variant="outline" size="sm" className="hidden rounded-full sm:inline-flex">
                <Link href="/onboarding">Resume setup</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No workspace selected</div>
        )}
      </div>

      <div className="ml-auto hidden min-w-0 items-center gap-3 xl:flex">
        <form
          onSubmit={handleSearchSubmit}
          className="flex min-w-[320px] max-w-[520px] flex-1 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm"
          role="search"
          aria-label="Workspace search"
        >
          <Search className="size-4 shrink-0 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search transactions, businesses, or records"
            className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="rounded-xl px-3 text-slate-600 hover:text-slate-950"
          >
            Search
          </Button>
        </form>
        <OfflineSyncStatusControl />
        <Button
          asChild
          variant="ghost"
          className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition hover:border-cyan/30 hover:text-cyan"
        >
          <a href={supportEmailHref}>
            <LifeBuoy className="size-4" />
            Need help?
          </a>
        </Button>
        <Button asChild variant="ghost" className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition hover:border-cyan/30 hover:text-cyan">
          <Link href="/dashboard/assistant">
            <Bot className="size-4" />
            Assistant
          </Link>
        </Button>
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan/30 hover:text-cyan"
          aria-label="Notifications"
        >
          <Link href="/dashboard/notifications">
            <Bell className="size-4 text-slate-600" />
          </Link>
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
        <div className="hidden lg:hidden sm:block">
          <OfflineSyncStatusControl />
        </div>
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon"
          className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan/30 hover:text-cyan sm:inline-flex xl:hidden"
          aria-label={`Email ${supportEmail}`}
        >
          <a href={supportEmailHref}>
            <LifeBuoy className="size-4 text-slate-600" />
          </a>
        </Button>
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon"
          className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan/30 hover:text-cyan sm:inline-flex xl:hidden"
          aria-label="Open assistant"
        >
          <Link href="/dashboard/assistant">
            <Bot className="size-4 text-slate-600" />
          </Link>
        </Button>
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan/30 hover:text-cyan xl:hidden"
          aria-label="Notifications"
        >
          <Link href="/dashboard/notifications">
            <Bell className="size-4 text-slate-600" />
          </Link>
        </Button>
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
              className="flex items-center gap-2 rounded-2xl border border-cyan/20 bg-white px-2 shadow-sm transition hover:border-cyan/40 sm:px-2.5"
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
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={supportEmailHref}>
                <LifeBuoy className="size-4" />
                Need help?
              </a>
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
