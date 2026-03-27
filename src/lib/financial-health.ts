import "server-only";

import type { Prisma } from "@prisma/client";
import { getIntegrityAlertSeverity } from "@/lib/integrity-alerts";
import { logError, logWarn } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const OPEN_INTEGRITY_STATUSES = ["OPEN", "MANUAL_REVIEW"] as const;
const WEBHOOK_FAILURE_THRESHOLD = 3;
const RECENT_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_SCAN_THRESHOLD_MS = 10 * 60 * 1000;
const HEALTH_SNAPSHOT_LOG_ACTION = "FINANCIAL_HEALTH_SNAPSHOT_COMPUTED";
const HEALTH_SNAPSHOT_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
const INTEGRITY_SCAN_ACTIONS = [
  "FINANCIAL_INTEGRITY_SWEEP_COMPLETED",
  "FINANCIAL_INTEGRITY_RECHECK_COMPLETED",
] as const;

export type FinancialHealthLabel = "Healthy" | "Stable" | "Risk" | "Critical" | "Stale";
export type FinancialHealthSeverityBucket = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type FinancialHealthTrend = "IMPROVING" | "STABLE" | "DEGRADING";

export type FinancialHealthTopIssue = {
  issueType: string;
  severity: FinancialHealthSeverityBucket;
  count: number;
  lastDetectedAt: string;
};

export type FinancialHealthDeduction = {
  key: string;
  label: string;
  points: number;
  count?: number;
};

export type FinancialHealthSnapshot = {
  scope: {
    workspaceIds: number[];
    selectedWorkspaceId: number | null;
  };
  score: number;
  label: FinancialHealthLabel;
  delta: number;
  trend: FinancialHealthTrend;
  isStale: boolean;
  lastScanAt: string | null;
  issueCountsBySeverity: Record<FinancialHealthSeverityBucket, number>;
  topIssues: FinancialHealthTopIssue[];
  topDeductions: FinancialHealthDeduction[];
  lastComputedAt: string;
};

type IntegrityIssueForHealth = {
  issueType: string;
  severity: string;
  status: string;
  lastDetectedAt: Date;
  metadata: Prisma.JsonValue | null;
};

type AuditLogForHealth = {
  createdAt: Date;
  metadata: string | null;
};

type HealthSnapshotAuditRecord = {
  createdAt: Date;
  workspaceId: number;
  metadata: string | null;
};

type IntegrityIssueDelegateLike = {
  findMany: (args: {
    where: {
      workspaceId: { in: number[] };
      status?: { in: readonly string[] | string[] };
      lastDetectedAt?: { gte: Date };
    };
    select: {
      issueType: true;
      severity: true;
      status: true;
      lastDetectedAt: true;
      metadata: true;
    };
  }) => Promise<IntegrityIssueForHealth[]>;
};

function parseWorkspaceIdList(workspaceIds: number[]) {
  return Array.from(
    new Set(
      workspaceIds.filter(
        (workspaceId) => Number.isFinite(workspaceId) && Number.isInteger(workspaceId) && workspaceId > 0
      )
    )
  );
}

export function buildFinancialHealthFallbackSnapshot(input: {
  workspaceIds: number[];
  selectedWorkspaceId: number | null;
  lastComputedAt?: Date;
  topDeductions?: FinancialHealthDeduction[];
}): FinancialHealthSnapshot {
  return {
    scope: {
      workspaceIds: input.workspaceIds,
      selectedWorkspaceId: input.selectedWorkspaceId,
    },
    score: 100,
    label: "Stale",
    delta: 0,
    trend: "STABLE",
    isStale: true,
    lastScanAt: null,
    issueCountsBySeverity: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
    topIssues: [],
    topDeductions: input.topDeductions ?? [],
    lastComputedAt: (input.lastComputedAt ?? new Date()).toISOString(),
  };
}

function parseIntegrityMetadata(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseAuditMetadata(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function resolveHealthLabel(score: number): FinancialHealthLabel {
  if (score >= 95) return "Healthy";
  if (score >= 70) return "Stable";
  if (score >= 60) return "Risk";
  return "Critical";
}

function resolveTrend(delta: number): FinancialHealthTrend {
  if (delta >= 3) return "IMPROVING";
  if (delta <= -3) return "DEGRADING";
  return "STABLE";
}

function escapeJsonContainsValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildHealthScopeKey(input: {
  scopedWorkspaceIds: number[];
  selectedWorkspaceId: number | null;
}) {
  if (input.selectedWorkspaceId) {
    return `workspace:${input.selectedWorkspaceId}`;
  }

  return `global:${input.scopedWorkspaceIds.join(",")}`;
}

function parseScoreFromMetadata(metadata: Record<string, unknown>) {
  const raw = metadata.score;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampScore(raw);
  }

  return null;
}

function parseLabelFromMetadata(metadata: Record<string, unknown>) {
  const raw = metadata.label;
  if (
    raw === "Healthy" ||
    raw === "Watch" ||
    raw === "Stable" ||
    raw === "Risk" ||
    raw === "Critical" ||
    raw === "Stale"
  ) {
    return raw === "Watch" ? "Stable" : (raw satisfies FinancialHealthLabel);
  }

  return null;
}

function parseBooleanFromMetadata(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  return typeof raw === "boolean" ? raw : null;
}

function parseLastScanAtFromMetadata(metadata: Record<string, unknown>) {
  const raw = metadata.lastScanAt;
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countLowConfidenceManualReviewIssues(issues: IntegrityIssueForHealth[]) {
  return issues.reduce((count, issue) => {
    if (issue.status !== "MANUAL_REVIEW") {
      return count;
    }

    const metadata = parseIntegrityMetadata(issue.metadata);
    return metadata.repairConfidenceLabel === "LOW" ? count + 1 : count;
  }, 0);
}

function getLowConfidenceWeightingDeduction(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 3;
  if (count <= 4) return 6;
  if (count <= 6) return 8;
  return 10;
}

function shouldPersistHealthSnapshot(input: {
  previousSnapshot: HealthSnapshotAuditRecord | null;
  score: number;
  label: FinancialHealthLabel;
  isStale: boolean;
  lastScanAt: Date | null;
}) {
  if (!input.previousSnapshot) {
    return true;
  }

  const previousMetadata = parseAuditMetadata(input.previousSnapshot.metadata);
  const previousScore = previousMetadata ? parseScoreFromMetadata(previousMetadata) : null;
  const previousLabel = previousMetadata ? parseLabelFromMetadata(previousMetadata) : null;
  const previousIsStale = previousMetadata
    ? parseBooleanFromMetadata(previousMetadata, "isStale")
    : null;
  const previousLastScanAt = previousMetadata
    ? parseLastScanAtFromMetadata(previousMetadata)
    : null;

  if (
    previousScore !== input.score ||
    previousLabel !== input.label ||
    previousIsStale !== input.isStale ||
    (previousLastScanAt?.toISOString() ?? null) !== (input.lastScanAt?.toISOString() ?? null)
  ) {
    return true;
  }

  return Date.now() - input.previousSnapshot.createdAt.getTime() >= HEALTH_SNAPSHOT_PERSIST_INTERVAL_MS;
}

function mapIssueSeverity(issue: IntegrityIssueForHealth): FinancialHealthSeverityBucket {
  return getIntegrityAlertSeverity({
    issueType: issue.issueType,
    issueSeverity: issue.severity,
  });
}

function buildTopIssues(issues: IntegrityIssueForHealth[]) {
  const grouped = new Map<
    string,
    {
      issueType: string;
      severity: FinancialHealthSeverityBucket;
      count: number;
      lastDetectedAt: Date;
    }
  >();

  for (const issue of issues) {
    const severity = mapIssueSeverity(issue);
    const existing = grouped.get(issue.issueType);

    if (!existing) {
      grouped.set(issue.issueType, {
        issueType: issue.issueType,
        severity,
        count: 1,
        lastDetectedAt: issue.lastDetectedAt,
      });
      continue;
    }

    existing.count += 1;
    if (issue.lastDetectedAt.getTime() > existing.lastDetectedAt.getTime()) {
      existing.lastDetectedAt = issue.lastDetectedAt;
    }
  }

  const rank = (severity: FinancialHealthSeverityBucket) => {
    switch (severity) {
      case "CRITICAL":
        return 0;
      case "HIGH":
        return 1;
      case "MEDIUM":
        return 2;
      case "LOW":
        return 3;
    }
  };

  return Array.from(grouped.values())
    .sort((left, right) => {
      const severityDiff = rank(left.severity) - rank(right.severity);
      if (severityDiff !== 0) return severityDiff;
      if (left.count !== right.count) return right.count - left.count;
      return right.lastDetectedAt.getTime() - left.lastDetectedAt.getTime();
    })
    .slice(0, 5)
    .map((issue) => ({
      issueType: issue.issueType,
      severity: issue.severity,
      count: issue.count,
      lastDetectedAt: issue.lastDetectedAt.toISOString(),
    }));
}

function hasRepairFailureInLast24Hours(issues: IntegrityIssueForHealth[]) {
  const threshold = Date.now() - RECENT_FAILURE_WINDOW_MS;

  return issues.some((issue) => {
    if (issue.lastDetectedAt.getTime() < threshold) {
      return false;
    }

    const metadata = parseIntegrityMetadata(issue.metadata);
    return metadata.repairAttempted === true && metadata.repairSucceeded === false;
  });
}

function countRecentWebhookVerificationFailures(logs: AuditLogForHealth[]) {
  return logs.reduce((count, log) => {
    const metadata = parseAuditMetadata(log.metadata);
    if (!metadata) return count;

    const status = typeof metadata.status === "string" ? metadata.status : null;
    const source = typeof metadata.source === "string" ? metadata.source : null;

    if (
      source === "paystack_webhook" &&
      (status === "INVALID_SIGNATURE" || status === "MISSING_SIGNATURE")
    ) {
      return count + 1;
    }

    return count;
  }, 0);
}

function getIntegrityIssueDelegate(): IntegrityIssueDelegateLike | null {
  const client = prisma as typeof prisma & {
    integrityIssue?: IntegrityIssueDelegateLike;
  };
  const delegate = client.integrityIssue;

  if (!delegate || typeof delegate.findMany !== "function") {
    return null;
  }

  return delegate;
}

export async function getFinancialHealthSnapshot(input: {
  accessibleWorkspaceIds: number[];
  selectedWorkspaceId?: number | null;
}): Promise<FinancialHealthSnapshot> {
  const accessibleWorkspaceIds = parseWorkspaceIdList(input.accessibleWorkspaceIds);
  const selectedWorkspaceId =
    input.selectedWorkspaceId && accessibleWorkspaceIds.includes(input.selectedWorkspaceId)
      ? input.selectedWorkspaceId
      : null;
  const scopedWorkspaceIds = selectedWorkspaceId
    ? [selectedWorkspaceId]
    : accessibleWorkspaceIds;

  if (scopedWorkspaceIds.length === 0) {
    return buildFinancialHealthFallbackSnapshot({
      workspaceIds: [],
      selectedWorkspaceId: null,
    });
  }

  const integrityIssueDelegate = getIntegrityIssueDelegate();
  if (!integrityIssueDelegate) {
    logWarn("financial-health", "IntegrityIssue delegate is unavailable on the Prisma client", {
      scopedWorkspaceIds,
      selectedWorkspaceId,
      delegateName: "integrityIssue",
    });
    return buildFinancialHealthFallbackSnapshot({
      workspaceIds: scopedWorkspaceIds,
      selectedWorkspaceId,
      topDeductions: [
        {
          key: "health_data_unavailable",
          label: "IntegrityIssue delegate unavailable on Prisma client",
          points: 0,
        },
      ],
    });
  }

  try {
    const since = new Date(Date.now() - RECENT_FAILURE_WINDOW_MS);
    const scopeKey = buildHealthScopeKey({ scopedWorkspaceIds, selectedWorkspaceId });
    const scopeKeyNeedle = `"scopeKey":"${escapeJsonContainsValue(scopeKey)}"`;

    const [openIssues, recentIssues, recentPaymentFailures, lastIntegrityScan, previousSnapshot] =
      await withPrismaRetry(
        () =>
          Promise.all([
            integrityIssueDelegate.findMany({
              where: {
                workspaceId: {
                  in: scopedWorkspaceIds,
                },
                status: {
                  in: [...OPEN_INTEGRITY_STATUSES],
                },
              },
              select: {
                issueType: true,
                severity: true,
                status: true,
                lastDetectedAt: true,
                metadata: true,
              },
            }),
            integrityIssueDelegate.findMany({
              where: {
                workspaceId: {
                  in: scopedWorkspaceIds,
                },
                lastDetectedAt: {
                  gte: since,
                },
              },
              select: {
                issueType: true,
                severity: true,
                status: true,
                lastDetectedAt: true,
                metadata: true,
              },
            }),
            prisma.auditLog.findMany({
              where: {
                workspaceId: {
                  in: scopedWorkspaceIds,
                },
                action: "PAYMENT_FAILED",
                createdAt: {
                  gte: since,
                },
              },
              select: {
                createdAt: true,
                metadata: true,
              },
            }),
            prisma.auditLog.findFirst({
              where: {
                workspaceId: {
                  in: scopedWorkspaceIds,
                },
                action: {
                  in: [...INTEGRITY_SCAN_ACTIONS],
                },
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                createdAt: true,
                metadata: true,
              },
            }),
            prisma.auditLog.findFirst({
              where: {
                workspaceId: {
                  in: scopedWorkspaceIds,
                },
                action: HEALTH_SNAPSHOT_LOG_ACTION,
                metadata: {
                  contains: scopeKeyNeedle,
                },
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                createdAt: true,
                workspaceId: true,
                metadata: true,
              },
            }),
          ]),
        { label: "financialHealth.snapshot" }
      );

    const issueCountsBySeverity: Record<FinancialHealthSeverityBucket, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const issue of openIssues) {
      issueCountsBySeverity[mapIssueSeverity(issue)] += 1;
    }

    const deductions: FinancialHealthDeduction[] = [];

    if (issueCountsBySeverity.CRITICAL > 0) {
      deductions.push({
        key: "critical_open_issues",
        label: "Critical open issues",
        points: issueCountsBySeverity.CRITICAL * 25,
        count: issueCountsBySeverity.CRITICAL,
      });
    }

    if (issueCountsBySeverity.HIGH > 0) {
      deductions.push({
        key: "high_open_issues",
        label: "High open issues",
        points: issueCountsBySeverity.HIGH * 10,
        count: issueCountsBySeverity.HIGH,
      });
    }

    if (issueCountsBySeverity.MEDIUM > 0) {
      deductions.push({
        key: "medium_open_issues",
        label: "Medium open issues",
        points: issueCountsBySeverity.MEDIUM * 5,
        count: issueCountsBySeverity.MEDIUM,
      });
    }

    if (issueCountsBySeverity.LOW > 0) {
      deductions.push({
        key: "low_open_issues",
        label: "Low open issues",
        points: issueCountsBySeverity.LOW,
        count: issueCountsBySeverity.LOW,
      });
    }

    const issueTypes = new Set(openIssues.map((issue) => issue.issueType));

    if (issueTypes.has("DUPLICATE_LEDGER_ROWS")) {
      deductions.push({
        key: "duplicate_ledger_present",
        label: "Duplicate ledger issue present",
        points: 15,
      });
    }

    if (issueTypes.has("AMOUNT_MISMATCH")) {
      deductions.push({
        key: "amount_mismatch_present",
        label: "Amount mismatch present",
        points: 10,
      });
    }

    if (
      issueTypes.has("PAYMENT_LEDGER_SYNC_MISSING") ||
      issueTypes.has("PAID_INVOICE_MISSING_LEDGER")
    ) {
      deductions.push({
        key: "payment_without_ledger_present",
        label: "Payment without ledger present",
        points: 10,
      });
    }

    if (issueTypes.has("PAYMENT_TAX_SYNC_MISSING")) {
      deductions.push({
        key: "payment_without_tax_sync_present",
        label: "Payment without tax sync present",
        points: 8,
      });
    }

    if (hasRepairFailureInLast24Hours(recentIssues)) {
      deductions.push({
        key: "recent_auto_repair_failure",
        label: "Auto-repair failure in the last 24 hours",
        points: 5,
      });
    }

    const recentWebhookFailures = countRecentWebhookVerificationFailures(recentPaymentFailures);
    if (recentWebhookFailures >= WEBHOOK_FAILURE_THRESHOLD) {
      deductions.push({
        key: "repeated_webhook_failures",
        label: "Repeated webhook verification failures above threshold",
        points: 5,
        count: recentWebhookFailures,
      });
    }

    const lowConfidenceManualReviewCount = countLowConfidenceManualReviewIssues(openIssues);
    const lowConfidenceWeightingPoints =
      getLowConfidenceWeightingDeduction(lowConfidenceManualReviewCount);

    if (lowConfidenceWeightingPoints > 0) {
      deductions.push({
        key: "low_confidence_manual_review_weighting",
        label: "Low-confidence issues awaiting manual review",
        points: lowConfidenceWeightingPoints,
        count: lowConfidenceManualReviewCount,
      });
    }

    const totalDeductions = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
    const rawScore = clampScore(100 - totalDeductions);
    let score = rawScore;

    if (issueCountsBySeverity.CRITICAL > 0 && score > 70) {
      deductions.push({
        key: "critical_open_issue_cap",
        label: "Critical open issues cap the maximum score",
        points: score - 70,
      });
      score = 70;
    }

    const lastScanAt = lastIntegrityScan?.createdAt ?? null;
    const isStale =
      !lastScanAt || Date.now() - lastScanAt.getTime() > STALE_SCAN_THRESHOLD_MS;

    const previousMetadata = previousSnapshot
      ? parseAuditMetadata(previousSnapshot.metadata)
      : null;
    const previousScore = previousMetadata ? parseScoreFromMetadata(previousMetadata) : null;
    const delta = previousScore === null ? 0 : score - previousScore;
    const trend = previousScore === null ? "STABLE" : resolveTrend(delta);
    const label = isStale ? "Stale" : resolveHealthLabel(score);
    const topIssues = buildTopIssues(openIssues);

    if (
      shouldPersistHealthSnapshot({
        previousSnapshot,
        score,
        label,
        isStale,
        lastScanAt,
      })
    ) {
      const anchorWorkspaceId = selectedWorkspaceId ?? scopedWorkspaceIds[0];

      await withPrismaRetry(
        () =>
          prisma.auditLog.create({
            data: {
              workspaceId: anchorWorkspaceId,
              actorUserId: null,
              targetUserId: null,
              action: HEALTH_SNAPSHOT_LOG_ACTION,
              metadata: JSON.stringify({
                scopeKey,
                scopeWorkspaceIds: scopedWorkspaceIds,
                selectedWorkspaceId,
                score,
                label,
                delta,
                trend,
                isStale,
                lastScanAt: lastScanAt?.toISOString() ?? null,
                issueCountsBySeverity,
                topIssues,
                topDeductions: deductions
                  .slice()
                  .sort((left, right) => right.points - left.points)
                  .slice(0, 10),
              }),
            },
          }),
        { label: "financialHealth.persistSnapshot" }
      );
    }

    return {
      scope: {
        workspaceIds: scopedWorkspaceIds,
        selectedWorkspaceId,
      },
      score,
      label,
      delta,
      trend,
      isStale,
      lastScanAt: lastScanAt?.toISOString() ?? null,
      issueCountsBySeverity,
      topIssues,
      topDeductions: deductions.sort((left, right) => right.points - left.points),
      lastComputedAt: new Date().toISOString(),
    };
  } catch (error) {
    logError("financial-health", "Financial health snapshot failed", error, {
      scopedWorkspaceIds,
      selectedWorkspaceId,
    });
    return buildFinancialHealthFallbackSnapshot({
      workspaceIds: scopedWorkspaceIds,
      selectedWorkspaceId,
    });
  }
}
