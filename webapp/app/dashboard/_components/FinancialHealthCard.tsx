"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import DashboardPanel from "@/app/dashboard/_components/DashboardPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FinancialHealthCardProps = {
  snapshot: {
    score: number;
    label: "Healthy" | "Stable" | "Risk" | "Critical" | "Stale";
    isStale: boolean;
    lastScanAt: string | null;
    issueCountsBySeverity: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
    };
    topIssues: Array<{
      issueType: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      count: number;
      lastDetectedAt: string;
    }>;
  };
  canRunIntegrityScan: boolean;
  referenceTime: string;
};

function formatRelativeTime(value: string | null, referenceTime: string) {
  if (!value) {
    return "No integrity scan recorded yet";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Integrity scan timestamp unavailable";
  }

  const referenceTimestamp = new Date(referenceTime);
  if (Number.isNaN(referenceTimestamp.getTime())) {
    return "Integrity scan timing unavailable";
  }

  const diffMinutes = Math.max(
    0,
    Math.round((referenceTimestamp.getTime() - timestamp.getTime()) / (60 * 1000))
  );

  if (diffMinutes < 1) return "Last checked just now";
  if (diffMinutes === 1) return "Last checked 1 minute ago";
  if (diffMinutes < 60) return `Last checked ${diffMinutes} minutes ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) return "Last checked 1 hour ago";
  if (diffHours < 24) return `Last checked ${diffHours} hours ago`;

  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1
    ? "Last checked 1 day ago"
    : `Last checked ${diffDays} days ago`;
}

function getLabelBadgeClassName(label: FinancialHealthCardProps["snapshot"]["label"]) {
  switch (label) {
    case "Healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Stable":
      return "border-cyan/20 bg-cyan/10 text-cyan";
    case "Risk":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Critical":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "Stale":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getSeverityClassName(
  severity: FinancialHealthCardProps["snapshot"]["topIssues"][number]["severity"]
) {
  switch (severity) {
    case "CRITICAL":
      return "text-rose-900";
    case "HIGH":
      return "text-amber-900";
    case "MEDIUM":
      return "text-sky-900";
    case "LOW":
      return "text-slate-700";
  }
}

export default function FinancialHealthCard({
  snapshot,
  canRunIntegrityScan,
  referenceTime,
}: FinancialHealthCardProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleRunIntegrityScan() {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/system/integrity/run?mode=repair", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        issuesFound?: number;
        autoRepaired?: number;
        manualReview?: number;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to run the integrity scan right now.");
        return;
      }

      setMessage(
        `Integrity scan completed: ${payload.issuesFound ?? 0} issues checked, ${payload.autoRepaired ?? 0} auto-repaired, ${payload.manualReview ?? 0} sent to manual review.`
      );
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Unable to run the integrity scan right now.");
    }
  }

  return (
    <DashboardPanel
      className="h-full"
      eyebrow="Executive signal"
      title="Financial health"
      description="Integrity coverage across the active workspace so month-end issues surface earlier."
      icon={snapshot.label === "Healthy" || snapshot.label === "Stable" ? ShieldCheck : Sparkles}
      iconClassName={
        snapshot.label === "Healthy" || snapshot.label === "Stable"
          ? "border-cyan/20 bg-cyan/50 text-cyan"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }
      headerAction={
        <Badge className={`rounded-full border px-3 py-1 ${getLabelBadgeClassName(snapshot.label)}`}>
          {snapshot.label}
        </Badge>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="text-4xl font-semibold tracking-tight text-slate-950">
              {snapshot.score}
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              {formatRelativeTime(snapshot.lastScanAt, referenceTime)}
              {snapshot.isStale ? " and the signal is currently stale." : "."}
            </p>
          </div>

          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-4 lg:max-w-[30rem]">
            {[
              ["Critical", snapshot.issueCountsBySeverity.CRITICAL],
              ["High", snapshot.issueCountsBySeverity.HIGH],
              ["Medium", snapshot.issueCountsBySeverity.MEDIUM],
              ["Low", snapshot.issueCountsBySeverity.LOW],
            ].map(([label, count]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </div>
                <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>

        {snapshot.topIssues.length > 0 ? (
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Top open issues
            </div>
            <div className="space-y-3">
              {snapshot.topIssues.slice(0, 3).map((issue) => (
                <div
                  key={`${issue.issueType}-${issue.lastDetectedAt}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium ${getSeverityClassName(issue.severity)}`}
                      >
                        {issue.issueType}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {issue.count} open issue{issue.count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Badge className="rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-white">
                      {issue.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            No material integrity issues are currently surfacing for this workspace.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {canRunIntegrityScan ? (
            <Button
              type="button"
              onClick={handleRunIntegrityScan}
              disabled={isPending}
              className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <RefreshCcw className="mr-2 size-4" />
              {isPending ? "Running integrity scan..." : "Run integrity scan"}
            </Button>
          ) : (
            <Badge className="rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
              Admin scan controls only
            </Badge>
          )}

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </div>
    </DashboardPanel>
  );
}
