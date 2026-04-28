"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  PlayCircle,
  RefreshCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { FinancialHealthSnapshot } from "@/lib/financial-health";
import type {
  FinancialIntegrityAdminIssueRow,
  FinancialIntegrityIssuesSnapshot,
} from "@/lib/financial-integrity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WorkspaceOption = {
  id: number;
  name: string;
};

type DemoRunImpact = {
  mode: "scan" | "repair" | "issue";
  actionLabel: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  issuesFound: number;
  autoRepaired: number;
  manualReview: number;
  recordedAt: string;
};

type ActivityEvent = {
  key: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "critical" | "warning" | "positive" | "neutral";
};

function formatDateTime(value: string | null) {
  if (!value) return "Not available";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value: string | null, referenceTime: string | null) {
  if (!value) {
    return "No integrity scan recorded yet";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Integrity scan timestamp unavailable";
  }

  const referenceTimestamp = referenceTime ? new Date(referenceTime) : null;
  if (!referenceTimestamp || Number.isNaN(referenceTimestamp.getTime())) {
    return formatDateTime(value);
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

function formatConfidence(score: number | null) {
  if (score === null || !Number.isFinite(score)) {
    return "Unknown";
  }

  return `${Math.round(score * 100)}%`;
}

function formatHealthDelta(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getHealthDeltaClass(value: number) {
  if (value > 0) {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }

  if (value < 0) {
    return "border-rose-400/25 bg-rose-500/10 text-rose-100";
  }

  return "border-white/15 bg-white/10 text-white/75";
}

function getHealthLabelClass(label: FinancialHealthSnapshot["label"]) {
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
      return "border-white/15 bg-white/10 text-white/80";
  }
}

function getSeverityClass(value: string) {
  return value === "critical"
    ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
    : "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function getStatusClass(value: string) {
  if (value === "AUTO_REPAIRED") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }

  if (value === "RESOLVED") {
    return "border-cyan/25 bg-cyan/10 text-cyan";
  }

  if (value === "IGNORED") {
    return "border-white/15 bg-white/10 text-white/75";
  }

  if (value === "MANUAL_REVIEW") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }

  return "border-rose-400/25 bg-rose-500/10 text-rose-100";
}

function getConfidenceClass(label: FinancialIntegrityAdminIssueRow["repairConfidenceLabel"]) {
  switch (label) {
    case "HIGH":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MEDIUM":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "LOW":
      return "border-rose-400/25 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/15 bg-white/10 text-white/75";
  }
}

function getRecommendationClass(
  value: FinancialIntegrityAdminIssueRow["repairRecommendation"]
) {
  switch (value) {
    case "AUTO_FIX":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "REVIEW_AND_FIX":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "MANUAL_ONLY":
      return "border-rose-400/25 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/15 bg-white/10 text-white/75";
  }
}

function formatRecommendation(
  value: FinancialIntegrityAdminIssueRow["repairRecommendation"]
) {
  if (!value) return "UNKNOWN";
  return value.replaceAll("_", " ");
}

function getRepairState(input: {
  repairAttempted: boolean;
  repairSucceeded: boolean | null;
}) {
  if (!input.repairAttempted) {
    return {
      label: "Not attempted",
      className: "border-white/15 bg-white/10 text-white/75",
    };
  }

  if (input.repairSucceeded) {
    return {
      label: "Succeeded",
      className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    };
  }

  return {
    label: "Failed",
    className: "border-rose-400/25 bg-rose-500/10 text-rose-100",
  };
}

function SummaryCard(input: {
  label: string;
  value: number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = input.icon;

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-slate-300">{input.label}</CardDescription>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-white/5 text-cyan">
            <Icon className="size-4" />
          </div>
        </div>
        <CardTitle className="text-3xl text-white">{input.value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-300">{input.detail}</CardContent>
    </Card>
  );
}

function buildQuery(input: {
  workspaceId: string;
  issueType: string;
  severity: string;
  status: string;
  autoRepairable: string;
}) {
  const params = new URLSearchParams();

  if (input.workspaceId) params.set("workspaceId", input.workspaceId);
  if (input.issueType) params.set("issueType", input.issueType);
  if (input.severity) params.set("severity", input.severity);
  if (input.status) params.set("status", input.status);
  if (input.autoRepairable) params.set("autoRepairable", input.autoRepairable);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildWorkspaceHealthQuery(workspaceId: string) {
  if (!workspaceId || workspaceId === "all") {
    return "";
  }

  return `?workspaceId=${encodeURIComponent(workspaceId)}`;
}

function collectUniqueValues(
  issues: FinancialIntegrityAdminIssueRow[],
  key: "issueType" | "severity" | "status"
) {
  return Array.from(new Set(issues.map((issue) => issue[key]).filter(Boolean))).sort();
}

function buildActivityEvents(input: {
  snapshot: FinancialIntegrityIssuesSnapshot;
  healthSnapshot: FinancialHealthSnapshot;
  lastRunImpact: DemoRunImpact | null;
}) {
  const events: ActivityEvent[] = [];

  if (input.lastRunImpact) {
    events.push({
      key: `session-impact-${input.lastRunImpact.recordedAt}`,
      title: input.lastRunImpact.actionLabel,
      detail: `Health moved from ${input.lastRunImpact.beforeScore} to ${input.lastRunImpact.afterScore}.`,
      timestamp: input.lastRunImpact.recordedAt,
      tone:
        input.lastRunImpact.delta > 0
          ? "positive"
          : input.lastRunImpact.delta < 0
            ? "critical"
            : "neutral",
    });
  }

  if (input.healthSnapshot.lastScanAt) {
    events.push({
      key: `health-scan-${input.healthSnapshot.lastScanAt}`,
      title: "Integrity scan recorded",
      detail: "The latest integrity run updated the financial control layer.",
      timestamp: input.healthSnapshot.lastScanAt,
      tone: input.healthSnapshot.isStale ? "warning" : "positive",
    });
  }

  events.push({
    key: `health-computed-${input.healthSnapshot.lastComputedAt}`,
    title: "Health score updated",
    detail: `Financial Health is currently ${input.healthSnapshot.score} (${input.healthSnapshot.label}).`,
    timestamp: input.healthSnapshot.lastComputedAt,
    tone:
      input.healthSnapshot.label === "Healthy" || input.healthSnapshot.label === "Stable"
        ? "positive"
        : input.healthSnapshot.label === "Stale"
          ? "warning"
          : "critical",
  });

  for (const issue of input.snapshot.issues) {
    events.push({
      key: `detected-${issue.id}-${issue.lastDetectedAt}`,
      title: `Issue detected: ${issue.issueType}`,
      detail: issue.summary,
      timestamp: issue.lastDetectedAt,
      tone: issue.severity === "critical" ? "critical" : "warning",
    });

    if (issue.autoRepairedAt) {
      events.push({
        key: `repaired-${issue.id}-${issue.autoRepairedAt}`,
        title: `Repair succeeded: ${issue.issueType}`,
        detail: issue.suggestedFix ?? "Automatic repair completed successfully.",
        timestamp: issue.autoRepairedAt,
        tone: "positive",
      });
    } else if (issue.repairAttempted && issue.repairSucceeded === false) {
      events.push({
        key: `repair-failed-${issue.id}-${issue.updatedAt}`,
        title: `Repair failed: ${issue.issueType}`,
        detail: issue.summary,
        timestamp: issue.updatedAt,
        tone: "critical",
      });
    }
  }

  return events
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 8);
}

function getActivityToneClass(tone: ActivityEvent["tone"]) {
  switch (tone) {
    case "positive":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "critical":
      return "border-rose-400/25 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/15 bg-white/10 text-white/75";
  }
}

export function IntegrityAdminClient({
  initialSnapshot,
  initialHealthSnapshot,
  workspaceOptions,
  initialError = null,
}: {
  initialSnapshot: FinancialIntegrityIssuesSnapshot;
  initialHealthSnapshot: FinancialHealthSnapshot;
  workspaceOptions: WorkspaceOption[];
  initialError?: string | null;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [healthSnapshot, setHealthSnapshot] = useState(initialHealthSnapshot);
  const [workspaceId, setWorkspaceId] = useState(
    initialSnapshot.scope.selectedWorkspaceId
      ? String(initialSnapshot.scope.selectedWorkspaceId)
      : "all"
  );
  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [autoRepairable, setAutoRepairable] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningMode, setRunningMode] = useState<"scan" | "repair" | null>(null);
  const [activeActionId, setActiveActionId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [lastRunImpact, setLastRunImpact] = useState<DemoRunImpact | null>(null);
  const [referenceTime, setReferenceTime] = useState(initialSnapshot.generatedAt);

  useEffect(() => {
    function refreshReferenceTime() {
      setReferenceTime(new Date().toISOString());
    }

    refreshReferenceTime();
    const intervalId = window.setInterval(refreshReferenceTime, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const filterOptions = useMemo(
    () => ({
      issueTypes: collectUniqueValues(snapshot.issues, "issueType"),
      severities: collectUniqueValues(snapshot.issues, "severity"),
      statuses: collectUniqueValues(snapshot.issues, "status"),
    }),
    [snapshot.issues]
  );

  const averageConfidence = useMemo(() => {
    const scoredIssues = snapshot.issues.filter(
      (issue) => issue.confidenceScore !== null && Number.isFinite(issue.confidenceScore)
    );

    if (scoredIssues.length === 0) {
      return null;
    }

    return (
      scoredIssues.reduce((sum, issue) => sum + (issue.confidenceScore ?? 0), 0) /
      scoredIssues.length
    );
  }, [snapshot.issues]);

  const autoFixReadyCount = useMemo(
    () =>
      snapshot.issues.filter(
        (issue) =>
          issue.status === "OPEN" &&
          issue.repairRecommendation === "AUTO_FIX" &&
          issue.autoRepairable
      ).length,
    [snapshot.issues]
  );

  const activityEvents = useMemo(
    () =>
      buildActivityEvents({
        snapshot,
        healthSnapshot,
        lastRunImpact,
      }),
    [snapshot, healthSnapshot, lastRunImpact]
  );

  async function refreshIssues(options?: { silent?: boolean }) {
    const response = await fetch(
      `/api/system/integrity/issues${buildQuery({
        workspaceId,
        issueType,
        severity,
        status,
        autoRepairable,
      })}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Unable to load integrity issues.");
    }

    const nextSnapshot = (await response.json()) as FinancialIntegrityIssuesSnapshot;
    setSnapshot(nextSnapshot);

    if (!options?.silent) {
      setError(null);
    }

    return nextSnapshot;
  }

  async function refreshHealth(options?: { silent?: boolean }) {
    const response = await fetch(
      `/api/system/integrity/health${buildWorkspaceHealthQuery(workspaceId)}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Unable to load financial health.");
    }

    const nextHealthSnapshot = (await response.json()) as FinancialHealthSnapshot;
    setHealthSnapshot(nextHealthSnapshot);

    if (!options?.silent) {
      setError(null);
    }

    return nextHealthSnapshot;
  }

  async function refreshAll(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsRefreshing(true);
      setNotice(null);
    }

    try {
      const issuesSnapshot = await refreshIssues({ silent: true });
      const health = await refreshHealth({ silent: true });
      setError(null);
      return { issuesSnapshot, health };
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the integrity control center."
      );
      return { issuesSnapshot: snapshot, health: healthSnapshot };
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }

  async function runIssueAction(
    issueId: number,
    url: string,
    body?: Record<string, unknown>,
    successMessage?: string
  ) {
    setActiveActionId(issueId);
    setNotice(null);
    setError(null);
    const beforeScore = healthSnapshot.score;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "The integrity action failed.");
      }

      const refreshed = await refreshAll({ silent: true });
      const afterScore = refreshed.health.score;
      const delta = afterScore - beforeScore;

      setLastRunImpact({
        mode: "issue",
        actionLabel: "Issue action completed",
        beforeScore,
        afterScore,
        delta,
        issuesFound: refreshed.issuesSnapshot.summary.openIssues,
        autoRepaired: refreshed.issuesSnapshot.summary.autoRepairedToday,
        manualReview: refreshed.issuesSnapshot.summary.manualReviewRequired,
        recordedAt: new Date().toISOString(),
      });
      setNotice(
        `${payload.message ?? successMessage ?? "Integrity action completed."} Health ${formatHealthDelta(
          delta
        )} to ${afterScore}.`
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The integrity action failed."
      );
    } finally {
      setActiveActionId(null);
    }
  }

  async function runIntegrityEngine(mode: "scan" | "repair") {
    setRunningMode(mode);
    setNotice(null);
    setError(null);
    const beforeScore = healthSnapshot.score;

    try {
      const response = await fetch(`/api/system/integrity/run?mode=${mode}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        issuesFound?: number;
        autoRepaired?: number;
        manualReview?: number;
        healthScoreAfterRun?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to run the integrity scan right now.");
      }

      const refreshed = await refreshAll({ silent: true });
      const afterScore = payload.healthScoreAfterRun ?? refreshed.health.score;
      const delta = afterScore - beforeScore;
      const actionLabel =
        mode === "repair" ? "Safe auto-fix sweep completed" : "Integrity detection scan completed";

      setLastRunImpact({
        mode,
        actionLabel,
        beforeScore,
        afterScore,
        delta,
        issuesFound: payload.issuesFound ?? 0,
        autoRepaired: payload.autoRepaired ?? 0,
        manualReview: payload.manualReview ?? 0,
        recordedAt: new Date().toISOString(),
      });
      setNotice(
        `${actionLabel}: ${payload.issuesFound ?? 0} issues checked, ${
          payload.autoRepaired ?? 0
        } auto-repaired, ${payload.manualReview ?? 0} review items. Health ${formatHealthDelta(
          delta
        )} to ${afterScore}.`
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Unable to run the integrity scan right now."
      );
    } finally {
      setRunningMode(null);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshIssues({ silent: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId, issueType, severity, status, autoRepairable]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshHealth({ silent: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshAll({ silent: true });
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [workspaceId, issueType, severity, status, autoRepairable]);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
        <div className="rounded-3xl border border-cyan/20 bg-primary p-6 text-white shadow-glow">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan">
                Integrity control center
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-4xl font-semibold text-white">
                  {healthSnapshot.score}
                </div>
                <Badge
                  className={`rounded-full border px-3 py-1 ${getHealthLabelClass(
                    healthSnapshot.label
                  )}`}
                >
                  {healthSnapshot.label}
                </Badge>
              </div>
              <p className="max-w-xl text-sm text-slate-300">
                {formatRelativeTime(healthSnapshot.lastScanAt, referenceTime)}
                {healthSnapshot.isStale ? " and the latest integrity signal is stale." : "."}
              </p>
            </div>

            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
              {healthSnapshot.label === "Healthy" || healthSnapshot.label === "Stable" ? (
                <ShieldCheck className="size-5 text-cyan" />
              ) : (
                <AlertTriangle className="size-5 text-amber-200" />
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              ["Critical", healthSnapshot.issueCountsBySeverity.CRITICAL],
              ["High", healthSnapshot.issueCountsBySeverity.HIGH],
              ["Medium", healthSnapshot.issueCountsBySeverity.MEDIUM],
              ["Low", healthSnapshot.issueCountsBySeverity.LOW],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl bg-white/8 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                  {label}
                </div>
                <div className="mt-2 text-xl font-semibold text-white">{count}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                  Last visible score impact
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  {lastRunImpact
                    ? `${lastRunImpact.actionLabel} moved health from ${lastRunImpact.beforeScore} to ${lastRunImpact.afterScore}.`
                    : "Run a scan or repair action to capture a before / after health story for the demo."}
                </div>
              </div>
              <Badge
                variant="outline"
                className={`rounded-full px-3 py-1 ${getHealthDeltaClass(
                  lastRunImpact?.delta ?? 0
                )}`}
              >
                {lastRunImpact ? formatHealthDelta(lastRunImpact.delta) : "No delta yet"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Open issues"
            value={snapshot.summary.openIssues}
            detail="Unresolved integrity issues that still need attention."
            icon={Activity}
          />
          <SummaryCard
            label="Critical issues"
            value={snapshot.summary.criticalIssues}
            detail="Highest-risk inconsistencies requiring rapid operator attention."
            icon={AlertTriangle}
          />
          <SummaryCard
            label="Auto-repaired today"
            value={snapshot.summary.autoRepairedToday}
            detail="Issues the engine repaired safely within the current day."
            icon={Wrench}
          />
          <SummaryCard
            label="Manual review count"
            value={snapshot.summary.manualReviewRequired}
            detail="Cases still waiting on a human decision or data correction."
            icon={Sparkles}
          />
          <SummaryCard
            label="Average confidence"
            value={Math.round((averageConfidence ?? 0) * 100)}
            detail="Average confidence across the visible issue queue."
            icon={BarChart3}
          />
        </div>
      </div>

      <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-white">
              Demo actions
            </CardTitle>
            <CardDescription className="text-slate-300">
              Show detection first, then auto-fix only the safe high-confidence issues.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                void runIntegrityEngine("scan");
              }}
              disabled={runningMode !== null}
              className="rounded-xl border-cyan/30 bg-white/5 text-cyan hover:bg-white/10 hover:text-cyan"
            >
              <ScanSearch className="mr-2 size-4" />
              {runningMode === "scan" ? "Running scan..." : "Run integrity scan"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void runIntegrityEngine("repair");
              }}
              disabled={runningMode !== null}
              className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <Wrench className="mr-2 size-4" />
              {runningMode === "repair" ? "Auto-fixing..." : "Auto-fix safe issues"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void refreshAll();
              }}
              disabled={isRefreshing}
              className="rounded-xl border-cyan/30 bg-white/5 text-cyan hover:bg-white/10 hover:text-cyan"
            >
              <RefreshCcw className="mr-2 size-4" />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                Auto-fix ready
              </div>
              <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white">
                {autoFixReadyCount}
                <CheckCircle2 className="size-5 text-emerald-300" />
              </div>
              <div className="mt-1 text-xs text-slate-300">
                High-confidence issues currently recommended for safe repair.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                Last run impact
              </div>
              <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white">
                {lastRunImpact ? formatHealthDelta(lastRunImpact.delta) : "—"}
                <TrendingUp className="size-5 text-cyan" />
              </div>
              <div className="mt-1 text-xs text-slate-300">
                {lastRunImpact
                  ? `${lastRunImpact.beforeScore} -> ${lastRunImpact.afterScore}`
                  : "Run a scan in-session to capture before / after health movement."}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                Demo mode
              </div>
              <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white">
                3 min
                <PlayCircle className="size-5 text-cyan" />
              </div>
              <div className="mt-1 text-xs text-slate-300">
                Detect, score, repair, and show the score improving in one short walkthrough.
              </div>
            </div>
          </div>
          {notice ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-emerald-100">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-rose-100">
              {error}
            </div>
          ) : null}
          {!notice && !error ? (
            <p className="text-slate-300">
              {formatRelativeTime(snapshot.generatedAt, referenceTime)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">Filters</CardTitle>
          <CardDescription className="text-slate-300">
            Narrow the queue by workspace, issue type, severity, status, or auto-repair safety.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Workspace</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan/40"
              value={workspaceId}
              onChange={(event) => {
                setWorkspaceId(event.target.value);
              }}
            >
              <option value="all" className="bg-slate-950 text-white">
                All admin workspaces
              </option>
              {workspaceOptions.map((workspace) => (
                <option
                  key={workspace.id}
                  value={workspace.id}
                  className="bg-slate-950 text-white"
                >
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Issue type</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan/40"
              value={issueType}
              onChange={(event) => {
                setIssueType(event.target.value);
              }}
            >
              <option value="" className="bg-slate-950 text-white">
                All issue types
              </option>
              {filterOptions.issueTypes.map((value) => (
                <option key={value} value={value} className="bg-slate-950 text-white">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Severity</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan/40"
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
              }}
            >
              <option value="" className="bg-slate-950 text-white">
                All severities
              </option>
              {filterOptions.severities.map((value) => (
                <option key={value} value={value} className="bg-slate-950 text-white">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Status</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan/40"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
              }}
            >
              <option value="" className="bg-slate-950 text-white">
                All statuses
              </option>
              {filterOptions.statuses.map((value) => (
                <option key={value} value={value} className="bg-slate-950 text-white">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Auto-repairable</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition focus:border-cyan/40"
              value={autoRepairable}
              onChange={(event) => {
                setAutoRepairable(event.target.value);
              }}
            >
              <option value="" className="bg-slate-950 text-white">
                All issues
              </option>
              <option value="true" className="bg-slate-950 text-white">
                Auto-repairable
              </option>
              <option value="false" className="bg-slate-950 text-white">
                Manual only
              </option>
            </select>
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)]">
        <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">
              Demo helper
            </CardTitle>
            <CardDescription className="text-slate-300">
              Use this sequence for a clean investor walkthrough.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                Seed command
              </div>
              <div className="mt-2 font-mono text-xs text-cyan">npm run seed:integrity</div>
            </div>
            <div className="space-y-3">
              {[
                "Open /dashboard and point out the Financial Health card.",
                "Open /dashboard/integrity and show the HIGH, MEDIUM, and LOW confidence badges.",
                "Click Run integrity scan to prove the system detects and scores live issues.",
                "Click Auto-fix safe issues to repair only the high-confidence cases.",
                "Close on the remaining manual-only mismatch and the improved health score.",
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs font-semibold text-cyan">
                    {index + 1}
                  </div>
                  <div>{step}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">
              Live activity timeline
            </CardTitle>
            <CardDescription className="text-slate-300">
              Recent detection, scoring, repair, and health events across the visible queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activityEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cyan/20 bg-white/5 px-4 py-10 text-center text-sm text-slate-300">
                No recent activity yet. Seed demo issues or run a scan to populate the timeline.
              </div>
            ) : (
              <div className="space-y-3">
                {activityEvents.map((event) => (
                  <div
                    key={event.key}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium text-white">{event.title}</div>
                        <div className="text-sm text-slate-300">{event.detail}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getActivityToneClass(event.tone)}
                        >
                          {event.tone}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock3 className="size-3" />
                          {formatDateTime(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-cyan/15 bg-primary text-white shadow-sm shadow-cyan/15">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">
            Integrity issues
          </CardTitle>
          <CardDescription className="text-slate-300">
            Inspect mismatches, confidence levels, and repair state before taking action.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {snapshot.issues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan/20 bg-white/5 px-4 py-12 text-center text-sm text-slate-300">
              <div className="space-y-2">
                <div className="text-base font-medium text-white">
                  No integrity issues match the current filters.
                </div>
                <div>
                  The control center is stable right now. For demo data, run{" "}
                  <span className="font-mono text-cyan">npm run seed:integrity</span> and refresh
                  this page.
                </div>
              </div>
            </div>
          ) : (
            <table className="min-w-full text-left text-sm" role="table">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-3 py-3">Issue type</th>
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Invoice ID</th>
                  <th className="px-3 py-3">Confidence</th>
                  <th className="px-3 py-3">Repair state</th>
                  <th className="px-3 py-3">Created at</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.issues.map((issue) => {
                  const isBusy = activeActionId === issue.id;
                  const canAutoRepair =
                    issue.autoRepairable &&
                    issue.status !== "RESOLVED" &&
                    issue.status !== "IGNORED";
                  const repairState = getRepairState({
                    repairAttempted: issue.repairAttempted,
                    repairSucceeded: issue.repairSucceeded,
                  });

                  return (
                    <tr
                      key={issue.id}
                      className="border-b border-white/10 align-top transition-colors hover:bg-white/5"
                    >
                      <td className="px-3 py-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-white">{issue.issueType}</div>
                            {issue.demoLabel ? (
                              <Badge
                                variant="outline"
                                className="border-cyan/25 bg-cyan/10 text-cyan"
                              >
                                {issue.demoLabel}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="max-w-sm text-xs text-slate-300">{issue.summary}</p>
                          <div className="text-xs text-slate-400">
                            Workspace #{issue.workspaceId} · {issue.workspaceName}
                          </div>
                          {issue.suggestedFix ? (
                            <div className="rounded-2xl border border-cyan/15 bg-white/5 px-3 py-2 text-xs text-cyan/90">
                              Suggested fix: {issue.suggestedFix}
                            </div>
                          ) : null}
                          {issue.repairReasoning.length > 0 ? (
                            <details className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                              <summary className="cursor-pointer list-none font-medium text-white/85">
                                Why this score
                              </summary>
                              <div className="mt-2 space-y-1">
                                {issue.repairReasoning.map((line, index) => (
                                  <div key={`${issue.id}-reason-${index}`}>{line}</div>
                                ))}
                                {issue.lastConfidenceComputedAt ? (
                                  <div className="pt-1 text-[11px] text-slate-400">
                                    Confidence computed {formatDateTime(issue.lastConfidenceComputedAt)}
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <Badge variant="outline" className={getSeverityClass(issue.severity)}>
                          {issue.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-4">
                        <Badge variant="outline" className={getStatusClass(issue.status)}>
                          {issue.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-4">
                        <span className="font-mono text-xs text-slate-200">
                          {issue.reference ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-200">
                        {issue.invoiceId ? `#${issue.invoiceId}` : "—"}
                      </td>
                      <td className="px-3 py-4">
                        <div className="space-y-2">
                          <Badge
                            variant="outline"
                            className={getConfidenceClass(issue.repairConfidenceLabel)}
                          >
                            {issue.repairConfidenceLabel ?? "UNKNOWN"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getRecommendationClass(issue.repairRecommendation)}
                          >
                            {formatRecommendation(issue.repairRecommendation)}
                          </Badge>
                          <div className="text-xs text-slate-300">
                            {formatConfidence(issue.confidenceScore)}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="space-y-2">
                          <Badge variant="outline" className={repairState.className}>
                            {repairState.label}
                          </Badge>
                          <div className="text-xs text-slate-300">
                            {issue.repairRecommendation === "AUTO_FIX"
                              ? "Safe auto-fix path available"
                              : issue.repairRecommendation === "REVIEW_AND_FIX"
                                ? "Admin review recommended before fixing"
                                : "Manual investigation required"}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-xs text-slate-300">
                        {formatDateTime(issue.createdAt)}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex min-w-[20rem] flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            className="rounded-xl border-cyan/30 bg-white/5 text-cyan hover:bg-white/10 hover:text-cyan"
                            onClick={() => {
                              void runIssueAction(
                                issue.id,
                                `/api/system/integrity/issues/${issue.id}/recheck`,
                                undefined,
                                "Integrity issue rechecked."
                              );
                            }}
                          >
                            Recheck
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canAutoRepair || isBusy}
                            className="rounded-xl border-0 bg-gradient-primary text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                            onClick={() => {
                              void runIssueAction(
                                issue.id,
                                `/api/system/integrity/issues/${issue.id}/repair`,
                                undefined,
                                "Auto-fix completed."
                              );
                            }}
                          >
                            Auto-fix
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              isBusy ||
                              issue.status === "RESOLVED" ||
                              issue.status === "IGNORED"
                            }
                            className="rounded-xl border-cyan/30 bg-white/5 text-cyan hover:bg-white/10 hover:text-cyan"
                            onClick={() => {
                              void runIssueAction(
                                issue.id,
                                `/api/system/integrity/issues/${issue.id}/resolve`,
                                { mode: "resolve" },
                                "Issue marked resolved."
                              );
                            }}
                          >
                            Mark resolved
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isBusy || issue.status === "IGNORED"}
                            className="rounded-xl border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                            onClick={() => {
                              void runIssueAction(
                                issue.id,
                                `/api/system/integrity/issues/${issue.id}/resolve`,
                                { mode: "ignore" },
                                "Issue ignored."
                              );
                            }}
                          >
                            Ignore
                          </Button>
                          {issue.invoiceHref ? (
                            <Button
                              asChild
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-xl text-cyan hover:bg-white/10 hover:text-cyan"
                            >
                              <Link href={issue.invoiceHref}>Open invoice</Link>
                            </Button>
                          ) : null}
                          {issue.paymentHref ? (
                            <Button
                              asChild
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-xl text-cyan hover:bg-white/10 hover:text-cyan"
                            >
                              <Link href={issue.paymentHref}>Open payment</Link>
                            </Button>
                          ) : null}
                          {issue.ledgerHref ? (
                            <Button
                              asChild
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-xl text-cyan hover:bg-white/10 hover:text-cyan"
                            >
                              <Link href={issue.ledgerHref}>Open ledger</Link>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
