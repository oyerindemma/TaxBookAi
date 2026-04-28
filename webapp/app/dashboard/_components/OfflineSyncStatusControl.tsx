"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CloudOff,
  Cloudy,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useOfflineSync } from "@/app/dashboard/_components/OfflineSyncProvider";

function formatDateTime(value: string | null) {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString();
}

function getStateMeta(state: "ONLINE" | "OFFLINE" | "SYNCING" | "CONFLICT") {
  if (state === "CONFLICT") {
    return {
      label: "Conflict",
      className: "border-amber-200 bg-amber-50 text-amber-900",
      icon: AlertTriangle,
    };
  }

  if (state === "SYNCING") {
    return {
      label: "Syncing",
      className: "border-sky-200 bg-sky-50 text-sky-900",
      icon: RefreshCcw,
    };
  }

  if (state === "OFFLINE") {
    return {
      label: "Offline",
      className: "border-slate-200 bg-slate-50 text-slate-700",
      icon: CloudOff,
    };
  }

  return {
    label: "Online",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: ShieldCheck,
  };
}

export default function OfflineSyncStatusControl() {
  const {
    snapshot,
    queuedActions,
    conflicts,
    syncNow,
    dismissConflict,
    retryConflict,
  } = useOfflineSync();
  const stateMeta = getStateMeta(snapshot.connectionState);
  const StateIcon = stateMeta.icon;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="rounded-2xl border border-cyan/20 bg-white px-3 shadow-sm transition hover:border-cyan/40"
          aria-label="Open offline sync center"
        >
          <StateIcon
            className={`size-4 ${snapshot.connectionState === "SYNCING" ? "animate-spin" : ""}`}
          />
          <Badge variant="outline" className={stateMeta.className}>
            {stateMeta.label}
          </Badge>
          {(snapshot.queuedCount > 0 || snapshot.conflictCount > 0) && (
            <span className="text-xs text-slate-500">
              {snapshot.conflictCount > 0
                ? `${snapshot.conflictCount} conflict${snapshot.conflictCount === 1 ? "" : "s"}`
                : `${snapshot.queuedCount} queued`}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto border-cyan/10 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Offline sync</SheetTitle>
          <SheetDescription>
            TaxBook keeps key workspace views cached and replays queued workflow updates after the
            connection comes back.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">State</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{stateMeta.label}</div>
            </div>
            <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Last synced</div>
              <div className="mt-1 text-sm font-medium text-slate-950">
                {formatDateTime(snapshot.lastSyncedAt)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-950">Queued changes</div>
                <div className="text-xs text-slate-500">
                  {snapshot.queuedCount} waiting to sync
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void syncNow()}
                disabled={!snapshot.isOnline || snapshot.queuedCount === 0}
              >
                <RefreshCcw
                  className={`size-4 ${snapshot.connectionState === "SYNCING" ? "animate-spin" : ""}`}
                />
                Sync now
              </Button>
            </div>

            {queuedActions.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-cyan/20 bg-white px-4 py-3 text-sm text-slate-500">
                No queued changes right now.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {queuedActions.map((action) => (
                  <div
                    key={action.id}
                    className="rounded-xl border border-cyan/10 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-950">
                          {action.actionLabel}
                        </div>
                        <div className="text-xs text-slate-500">{action.target.label}</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(action.createdAt)}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{action.queuedMessage}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-cyan/10 bg-slate-50 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-slate-950">Conflicts</div>
              <div className="text-xs text-slate-500">
                Conflicts happen when a record changes before a queued action syncs.
              </div>
            </div>

            {conflicts.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-cyan/20 bg-white px-4 py-3 text-sm text-slate-500">
                No sync conflicts detected.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {conflicts.map((conflict) => (
                  <div
                    key={conflict.id}
                    className="rounded-xl border border-amber-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-950">
                          {conflict.action.actionLabel}
                        </div>
                        <div className="text-xs text-slate-500">
                          {conflict.current?.label ?? conflict.action.target.label}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-900"
                      >
                        Conflict
                      </Badge>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{conflict.message}</p>

                    {conflict.current?.status ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Current server state: {conflict.current.status}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void retryConflict(conflict.id)}
                        disabled={!snapshot.isOnline}
                      >
                        Retry against latest
                      </Button>
                      {conflict.current?.href ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={conflict.current.href}>Open record</Link>
                        </Button>
                      ) : conflict.action.target.href ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={conflict.action.target.href}>Open record</Link>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissConflict(conflict.id)}
                      >
                        Dismiss conflict
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-cyan/10 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-950">
              <Cloudy className="size-4 text-cyan" />
              Offline coverage in this rollout
            </div>
            <p className="mt-2 leading-6">
              The overview dashboard, transaction review page, notification center, and expense
              leak analysis views are cached for limited read access. Lightweight workflow status
              changes sync back when you reconnect.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
