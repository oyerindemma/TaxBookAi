"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
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
};

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "No integrity scan recorded yet";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Integrity scan timestamp unavailable";
  }

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - timestamp.getTime()) / (60 * 1000))
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
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "Stable":
      return "border-cyan/25 bg-cyan/10 text-cyan";
    case "Risk":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "Critical":
      return "border-rose-400/25 bg-rose-500/10 text-rose-100";
    case "Stale":
      return "border-white/15 bg-white/8 text-white/80";
  }
}

function getSeverityClassName(
  severity: FinancialHealthCardProps["snapshot"]["topIssues"][number]["severity"]
) {
  switch (severity) {
    case "CRITICAL":
      return "text-rose-200";
    case "HIGH":
      return "text-amber-200";
    case "MEDIUM":
      return "text-cyan";
    case "LOW":
      return "text-white/70";
  }
}

export default function FinancialHealthCard({
  snapshot,
  canRunIntegrityScan,
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan">
            Financial health
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-4xl font-semibold">{snapshot.score}</div>
            <Badge className={`rounded-full border px-3 py-1 ${getLabelBadgeClassName(snapshot.label)}`}>
              {snapshot.label}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            {formatRelativeTime(snapshot.lastScanAt)}
            {snapshot.isStale ? " and the signal is currently stale." : "."}
          </p>
        </div>
        <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
          {snapshot.label === "Healthy" || snapshot.label === "Stable" ? (
            <ShieldCheck className="size-5 text-cyan" />
          ) : (
            <Sparkles className="size-5 text-amber-200" />
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Critical", snapshot.issueCountsBySeverity.CRITICAL],
          ["High", snapshot.issueCountsBySeverity.HIGH],
          ["Medium", snapshot.issueCountsBySeverity.MEDIUM],
          ["Low", snapshot.issueCountsBySeverity.LOW],
        ].map(([label, count]) => (
          <div key={label} className="rounded-2xl bg-white/8 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/55">{label}</div>
            <div className="mt-2 text-xl font-semibold text-white">{count}</div>
          </div>
        ))}
      </div>

      {snapshot.topIssues.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div className="text-xs uppercase tracking-[0.18em] text-white/55">
            Top open issues
          </div>
          {snapshot.topIssues.slice(0, 3).map((issue) => (
            <div
              key={`${issue.issueType}-${issue.lastDetectedAt}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${getSeverityClassName(issue.severity)}`}>
                    {issue.issueType}
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    {issue.count} open issue{issue.count === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge className="rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/5">
                  {issue.severity}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
          <Badge className="rounded-full border border-white/10 bg-white/5 text-white/75 hover:bg-white/5">
            Admin scan controls only
          </Badge>
        )}

        {message ? <p className="text-sm text-emerald-200">{message}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
