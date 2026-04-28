import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import {
  getWorkspaceFilingReadiness,
  type FilingReadinessBlocker,
  type FilingReadinessSeverity,
  type FilingReadinessStatus,
} from "@/lib/filing-readiness";
import type { NigerianTaxOutputStatus } from "@/lib/nigeria-tax-rules";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

function getStatusLabel(status: FilingReadinessStatus) {
  if (status === "READY") return "Ready";
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "NEEDS_ATTENTION") return "Needs attention";
  return "Not started";
}

function getStatusBadgeClass(status: FilingReadinessStatus) {
  if (status === "READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "IN_PROGRESS") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  if (status === "NEEDS_ATTENTION") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function getOutputStatusLabel(status: NigerianTaxOutputStatus) {
  if (status === "filing-ready") return "Filing-ready";
  if (status === "review-needed") return "Review needed";
  if (status === "filed") return "Filed";
  return "Estimate";
}

function getSeverityBadgeClass(severity: FilingReadinessSeverity) {
  if (severity === "CRITICAL") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (severity === "HIGH") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (severity === "MEDIUM") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function renderStatusIcon(status: FilingReadinessStatus, className: string) {
  if (status === "READY") return <CheckCircle2 className={className} />;
  if (status === "IN_PROGRESS") return <ClipboardCheck className={className} />;
  if (status === "NEEDS_ATTENTION") return <ShieldAlert className={className} />;
  return <AlertTriangle className={className} />;
}

function ReadinessStatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
    </Card>
  );
}

function BlockerRow({ blocker }: { blocker: FilingReadinessBlocker }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">{blocker.title}</div>
          <p className="text-sm leading-6 text-muted-foreground">{blocker.detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={getSeverityBadgeClass(blocker.severity)}>
            {blocker.severity}
          </Badge>
          <Badge variant="outline">{blocker.count} item(s)</Badge>
        </div>
      </div>

      {blocker.examples.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {blocker.examples.map((example) => (
            <Link
              key={`${blocker.key}-${example.kind}-${example.id}`}
              href={example.href}
              className="rounded-full border border-cyan/20 bg-cyan/5 px-3 py-1.5 text-xs text-slate-700 transition hover:border-cyan/40 hover:text-slate-950"
            >
              {example.label}
              <span className="ml-1 text-slate-500">{example.secondaryLabel}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <Button asChild size="sm" variant="outline">
          <Link href={blocker.href}>{blocker.actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function FilingReadinessPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Filing readiness</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>
              Switch to a workspace to score filing readiness and review blockers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const readiness = await getWorkspaceFilingReadiness({
    workspaceId: membership.workspaceId,
    defaultDateWindowApplied: true,
  });
  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-primary p-6 text-white shadow-glow">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/10 text-cyan">
                Filing readiness
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-white">
                Workspace scoped
              </Badge>
              <Badge variant="outline" className="rounded-full border-cyan/20 bg-white/5 text-cyan">
                {readiness.scope.dateLabel}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Filing Readiness Center</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
                Measure how close the active workspace is to filing, surface the blockers that are
                holding it back, and push the team toward the next highest-impact actions.
              </p>
            </div>
            <p className="text-sm text-white/70">{readiness.narrative}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan">
                {renderStatusIcon(readiness.status, "size-6")}
              </div>
              <div>
                <div className="text-4xl font-semibold">{readiness.score}</div>
                <div className="text-sm text-white/70">Readiness score</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className={getStatusBadgeClass(readiness.status)}>
                {getStatusLabel(readiness.status)}
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/5 text-white">
                {getOutputStatusLabel(readiness.outputStatus)}
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/5 text-white">
                {readiness.blockerCount} blocker{readiness.blockerCount === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReadinessStatCard
          label="Posted ledger entries"
          value={String(readiness.totals.ledgerTransactionsInScope)}
          description="Ledger transactions already posted for the current filing window."
        />
        <ReadinessStatCard
          label="Unposted source activity"
          value={String(readiness.totals.unpostedSourceActivity)}
          description="Imported bank activity still waiting to land in the posted ledger."
        />
        <ReadinessStatCard
          label="Tax engine sources"
          value={String(readiness.totals.taxEngineSourcesInScope)}
          description="Stored VAT and WHT source records currently covered by the tax engine."
        />
        <ReadinessStatCard
          label="Critical or high blockers"
          value={String(
            readiness.totals.blockersBySeverity.CRITICAL +
              readiness.totals.blockersBySeverity.HIGH
          )}
          description="The blockers most likely to stop a filing pack from moving cleanly."
        />
        <ReadinessStatCard
          label="Recommended next actions"
          value={String(readiness.recommendations.length)}
          description="Prioritized steps generated from the current blocker mix."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Blockers by severity</CardTitle>
            <CardDescription>
              These issues are currently lowering the filing readiness score for the active
              workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {readiness.blockers.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-900">
                No active blockers were detected for this workspace in the current filing window.
              </div>
            ) : (
              readiness.blockers.map((blocker) => (
                <BlockerRow key={blocker.key} blocker={blocker} />
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recommended next actions</CardTitle>
              <CardDescription>
                Follow the highest-priority actions first to move the score upward fastest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {readiness.recommendations.map((recommendation) => (
                <div key={recommendation.key} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{recommendation.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {recommendation.detail}
                      </p>
                    </div>
                    <Badge variant="outline">#{recommendation.priority}</Badge>
                  </div>
                  <div className="mt-4">
                    <Button asChild size="sm">
                      <Link href={recommendation.href}>
                        {recommendation.actionLabel}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scoring inputs</CardTitle>
              <CardDescription>
                The score runs from 0 to 100 and is reduced by gaps in posted-ledger coverage,
                evidence quality, and tax-engine freshness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {readiness.metrics.map((metric) => (
                <div key={metric.key} className="rounded-2xl border px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{metric.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {metric.count}/{metric.total}
                    </div>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {metric.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Score impact up to {metric.weight} points</span>
                    <span>Current penalty {metric.penalty}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Next-module ready</CardTitle>
              <CardDescription>
                This engine stays workspace-scoped and can absorb PAYE and CIT blockers later
                without changing the page contract.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">PAYE ready</Badge>
              <Badge variant="outline">CIT ready</Badge>
              <Badge variant="outline">Workspace scoped</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
