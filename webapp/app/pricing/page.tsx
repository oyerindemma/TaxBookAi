import Link from "next/link";
import type { Metadata } from "next";
import {
  ensureWorkspaceSubscription,
  formatAiScanLimit,
  formatAnnualSavings,
  formatLimit,
  formatPlanPricePerInterval,
  getPlanConfig,
  isPlanAtLeast,
  PLAN_ORDER,
  type BillingInterval,
} from "@/lib/billing";
import { getUserFromSession } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarketingCTAGroup } from "@/components/marketing/marketing-cta-group";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingGrid } from "@/components/marketing/pricing-grid";
import { SectionHeading } from "@/components/marketing/section-heading";
import {
  PLAN_DECISION_GUIDE,
  PRICING_FAQ,
  PRICING_INCLUSIONS,
} from "@/components/marketing/site-content";

type SearchParams = {
  interval?: string | string[];
};

type PlanKey = (typeof PLAN_ORDER)[number];
type ComparisonRow = {
  label: string;
  getValue: (plan: PlanKey, interval: BillingInterval) => string;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveInterval(value: string | string[] | undefined): BillingInterval {
  return getSingleValue(value)?.toLowerCase() === "annual" ? "ANNUAL" : "MONTHLY";
}

const comparisonRows: ComparisonRow[] = [
  {
    label: "Subscription",
    getValue: (plan: PlanKey, interval: BillingInterval) =>
      formatPlanPricePerInterval(plan, interval),
  },
  {
    label: "Client businesses",
    getValue: (plan: PlanKey) => formatLimit(getPlanConfig(plan).maxBusinesses),
  },
  {
    label: "Workspace users",
    getValue: (plan: PlanKey) => formatLimit(getPlanConfig(plan).maxUsers),
  },
  {
    label: "AI scans / month",
    getValue: (plan: PlanKey) => formatAiScanLimit(getPlanConfig(plan).aiScansPerMonth),
  },
  {
    label: "Manual bookkeeping and reporting",
    getValue: () => "Included",
  },
  {
    label: "AI receipt scanning and bookkeeping review",
    getValue: (plan: PlanKey) => (isPlanAtLeast(plan, "GROWTH") ? "Included" : "Locked"),
  },
  {
    label: "Invoices and recurring billing",
    getValue: (plan: PlanKey) => (isPlanAtLeast(plan, "GROWTH") ? "Included" : "Locked"),
  },
  {
    label: "Bank reconciliation",
    getValue: (plan: PlanKey) => (isPlanAtLeast(plan, "PROFESSIONAL") ? "Included" : "Locked"),
  },
  {
    label: "Audit logs, team workflows, filing-ready tax workflows",
    getValue: (plan: PlanKey) => (isPlanAtLeast(plan, "PROFESSIONAL") ? "Included" : "Locked"),
  },
  {
    label: "Integrations and priority support",
    getValue: (plan: PlanKey) => (plan === "ENTERPRISE" ? "Included" : "Locked"),
  },
  {
    label: "Annual savings",
    getValue: (plan: PlanKey) => formatAnnualSavings(plan) ?? "Included already",
  },
];

export const metadata: Metadata = buildMarketingMetadata({
  title: "Pricing for AI Accounting Software in Nigeria",
  description:
    "See TaxBook AI pricing for Starter, Growth, Professional, and Enterprise, with monthly and annual billing for Nigerian businesses and accounting firms.",
  path: "/pricing",
  keywords: [
    "AI accounting software pricing Nigeria",
    "bookkeeping software for accounting firms",
    "VAT and WHT automation pricing",
  ],
});

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const interval = resolveInterval(resolvedParams?.interval);
  const user = await getUserFromSession();
  const membership = user ? await getActiveWorkspaceMembership(user.id) : null;
  const subscription = membership
    ? await ensureWorkspaceSubscription(membership.workspaceId)
    : null;

  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center">
        <div className="space-y-5">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Pricing
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Start free, then unlock AI capture and reconciliation as the workload grows.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            TaxBook AI pricing is built for Nigerian businesses and accounting firms that need a
            path from manual bookkeeping into AI-assisted capture, bank reconciliation, filing-ready
            tax workflows, and stronger finance controls.
          </p>
          <p className="max-w-2xl text-base leading-7 text-white/60">
            {membership
              ? `Active workspace: ${membership.workspace.name}. Current plan: ${getPlanConfig(
                  subscription?.plan ?? "STARTER"
                ).name}.`
              : "Starter covers manual bookkeeping and reporting. Growth unlocks AI receipt scanning. Professional unlocks bank reconciliation, audit-friendly review, and team workflows."}
          </p>
          <p className="max-w-2xl text-sm leading-7 text-white/45">
            Enterprise remains contact-sales only for larger rollouts, integrations, and priority
            onboarding support.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              variant={interval === "MONTHLY" ? "default" : "outline"}
              className={
                interval === "MONTHLY"
                  ? "border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              }
            >
              <Link href="/pricing?interval=monthly">Monthly</Link>
            </Button>
            <Button
              asChild
              variant={interval === "ANNUAL" ? "default" : "outline"}
              className={
                interval === "ANNUAL"
                  ? "border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              }
            >
              <Link href="/pricing?interval=annual">Annual</Link>
            </Button>
            <Badge className="rounded-full border border-white/10 bg-white/5 text-white/72 hover:bg-white/5">
              Annual pricing already reflects a 20% discount
            </Badge>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Every workspace starts from the same operating foundation</CardTitle>
            <CardDescription className="text-white/60">
              The difference between plans is not whether the system is usable. It is how much
              automation, control, and scale you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-white/65">
            {PRICING_INCLUSIONS.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Workspace plans"
          title="Pick the plan that matches your control level today."
          description="Monthly and annual pricing mirror the current billing logic. Enterprise remains contact-sales only."
        />
        <div className="mt-10">
          <PricingGrid
            interactive
            interval={interval}
            currentPlan={subscription?.plan ?? null}
            loggedIn={Boolean(user)}
            hasActiveWorkspace={Boolean(membership)}
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Upgrade guide"
          title="The simplest way to think about plan fit."
          description="These are the moments teams usually feel the need to upgrade."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {PLAN_DECISION_GUIDE.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
                <CardHeader className="space-y-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">{item.title}</CardTitle>
                    <CardDescription className="leading-6 text-white/60">{item.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white hover:bg-white/5">
                    {item.cta}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Plan comparison"
          title="See the exact capacity and workflow unlocks on each plan."
          description="This table mirrors the pricing logic already used inside the billing flow."
        />
        <Card className="mt-10 border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl">
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/55">
                  <th className="px-6 py-4 font-medium">Capability</th>
                  {PLAN_ORDER.map((plan) => (
                    <th key={plan} className="px-4 py-4 font-medium">
                      {getPlanConfig(plan).name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-white/10 last:border-b-0">
                    <td className="px-6 py-4 font-medium">{row.label}</td>
                    {PLAN_ORDER.map((plan) => (
                      <td key={`${row.label}-${plan}`} className="px-4 py-4 text-white/65">
                        {row.getValue(plan, interval)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-white/10 last:border-b-0">
                  <td className="px-6 py-4 font-medium">Best fit</td>
                  {PLAN_ORDER.map((plan) => (
                    <td key={`best-fit-${plan}`} className="px-4 py-4 text-white/65">
                      {getPlanConfig(plan).target}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="FAQ"
          title="Answers to the questions teams ask before subscribing."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {PRICING_FAQ.map((item) => (
            <Card key={item.question} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">{item.question}</CardTitle>
                <CardDescription className="mt-2 leading-6 text-white/60">{item.answer}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardContent className="flex flex-col gap-6 p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
                Need help choosing?
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-white">
                Start with Starter, or talk through the right rollout for your team.
              </h2>
              <p className="max-w-2xl text-white/60">
                Pricing is built around real workflow unlocks, so a quick conversation can save a
                slow rollout later.
              </p>
            </div>
            <MarketingCTAGroup compact />
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
