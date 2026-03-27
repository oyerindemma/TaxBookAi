"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SubscriptionPlan } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type WorkspaceSwitcherOption = {
  id: number;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  membersCount: number;
  invoicesCount: number;
  taxRecordsCount: number;
  plan: SubscriptionPlan | null;
  subscriptionLabel: string;
};

type WorkspaceSwitcherProps = {
  initialWorkspaces: WorkspaceSwitcherOption[];
  activeWorkspaceId: number | null;
  variant?: "default" | "mobile";
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
};

function canManageBilling(role: WorkspaceSwitcherOption["role"]) {
  return role === "OWNER" || role === "ADMIN";
}

function getPlanLabel(plan: SubscriptionPlan | null) {
  return plan ? PLAN_LABELS[plan] : PLAN_LABELS.STARTER;
}

export default function WorkspaceSwitcher({
  initialWorkspaces,
  activeWorkspaceId: initialActiveWorkspaceId,
  variant = "default",
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSwitcherOption[]>(initialWorkspaces);
  const [current, setCurrent] = useState<number | null>(initialActiveWorkspaceId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaces(initialWorkspaces);
    setCurrent(initialActiveWorkspaceId);
    setError(null);
  }, [initialActiveWorkspaceId, initialWorkspaces]);

  async function onChange(nextIdRaw: string) {
    const nextId = Number(nextIdRaw);
    if (!Number.isFinite(nextId) || nextId === current) return;

    const previousId = current;
    setCurrent(nextId);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: nextId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCurrent(previousId);
        setError(data?.error ?? "Unable to switch workspace");
        return;
      }

      router.refresh();
    } catch {
      setCurrent(previousId);
      setError("Network error switching workspace");
    } finally {
      setLoading(false);
    }
  }

  const currentWorkspace = workspaces.find((workspace) => workspace.id === current) ?? null;
  const billingLabel =
    currentWorkspace && canManageBilling(currentWorkspace.role)
      ? currentWorkspace.plan === "STARTER"
        ? "Upgrade"
        : "Billing"
      : null;
  const isMobile = variant === "mobile";
  const labelClassName = isMobile ? "text-xs text-slate-300" : "text-xs text-slate-500";
  const linkClassName = isMobile
    ? "h-auto px-0 text-xs text-cyan hover:text-cyan"
    : "h-auto px-0 text-xs text-cyan";
  const emptyCardClassName = isMobile
    ? "rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90"
    : "rounded-2xl border border-cyan/15 bg-white/80 px-3 py-2 text-sm shadow-sm";
  const selectClassName = isMobile
    ? "h-10 w-full min-w-[200px] rounded-2xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-cyan/30"
    : "h-10 w-full min-w-[220px] rounded-2xl border border-cyan/20 bg-white/90 px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan/30";
  const detailCardClassName = isMobile
    ? "rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
    : "rounded-2xl border border-cyan/15 bg-white/80 px-3 py-2 shadow-sm";
  const primaryTextClassName = isMobile ? "text-sm font-medium text-white" : "text-sm font-medium text-slate-950";
  const secondaryTextClassName = isMobile ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500";

  if (workspaces.length === 0) {
    return (
      <div className="grid min-w-[220px] gap-1">
        <div className="flex items-center justify-between gap-2">
          <Label className={labelClassName}>Workspace</Label>
          <Button asChild variant="ghost" size="sm" className={linkClassName}>
            <Link href="/dashboard/workspaces">Manage</Link>
          </Button>
        </div>
        <div className={emptyCardClassName}>
          <p className={primaryTextClassName}>No active workspaces</p>
          <p className={secondaryTextClassName}>
            Create a workspace to begin tracking a business.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-[240px] gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label className={labelClassName}>Workspace</Label>
        <div className="flex items-center gap-2">
          {billingLabel ? (
            <Button asChild variant="ghost" size="sm" className={linkClassName}>
              <Link href="/dashboard/billing">{billingLabel}</Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm" className={linkClassName}>
            <Link href="/dashboard/workspaces">Manage</Link>
          </Button>
        </div>
      </div>
      <select
        value={current ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || workspaces.length === 1}
        className={selectClassName}
        aria-label="Switch active workspace"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} ({workspace.role})
          </option>
        ))}
      </select>
      {currentWorkspace ? (
        <div className={detailCardClassName}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={primaryTextClassName}>{currentWorkspace.name}</span>
            <Badge variant="secondary" className="rounded-full bg-cyan/10 text-cyan">
              {currentWorkspace.role}
            </Badge>
            <Badge
              variant="outline"
              className={
                isMobile
                  ? "rounded-full border-cyan/20 bg-white/5 text-blue"
                  : "rounded-full border-cyan/20 bg-white text-blue"
              }
            >
              {getPlanLabel(currentWorkspace.plan)}
            </Badge>
          </div>
          <p className={secondaryTextClassName}>
            {currentWorkspace.subscriptionLabel} · {currentWorkspace.membersCount} member
            {currentWorkspace.membersCount === 1 ? "" : "s"} ·{" "}
            {currentWorkspace.invoicesCount} invoices · {currentWorkspace.taxRecordsCount} tax
            records
          </p>
        </div>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
