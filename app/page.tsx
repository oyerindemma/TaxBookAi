import Link from "next/link";
import type { Metadata } from "next";
import { PricingGrid } from "@/components/marketing/pricing-grid";
import { PreviewCardStack } from "@/components/marketing/preview-card-stack";
import { SectionHeading } from "@/components/marketing/section-heading";
import { MarketingCTAGroup } from "@/components/marketing/marketing-cta-group";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BillingInterval } from "@/lib/billing";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";
import {
  HERO_STATS,
  HOME_FEATURE_BLOCKS,
  HOME_WORKFLOW_STEPS,
  MARKETING_HEADLINE,
  MARKETING_SUBHEADLINE,
  VALUE_STRIP,
  WHO_IT_IS_FOR,
} from "@/components/marketing/site-content";

type SearchParams = {
  interval?: string | string[];
};

export const metadata: Metadata = buildMarketingMetadata({
  title: "AI Accounting Software for Nigerian Businesses",
  description:
    "TaxBook AI helps Nigerian businesses, finance teams, and accounting firms handle AI receipt scanning, bookkeeping review, bank reconciliation, VAT and WHT summaries, and multi-business workspaces.",
  path: "/",
  keywords: [
    "AI accounting software Nigeria",
    "Nigerian bookkeeping software",
    "VAT and WHT automation Nigeria",
  ],
});

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveInterval(value: string | string[] | undefined): BillingInterval {
  return getSingleValue(value)?.toLowerCase() === "annual" ? "ANNUAL" : "MONTHLY";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const interval = resolveInterval(resolvedParams?.interval);

  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center">
        <div className="space-y-7">
          <div className="space-y-4">
            <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
              Nigeria-first finance operating layer
            </Badge>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance text-white sm:text-6xl">
              {MARKETING_HEADLINE}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-white/65 sm:text-xl">
              {MARKETING_SUBHEADLINE}
            </p>
            <p className="max-w-2xl text-base leading-7 text-white/60">
              Built for businesses, finance teams, and accounting firms that want faster month-end
              work without giving up review control, workspace structure, or audit visibility.
            </p>
          </div>

          <MarketingCTAGroup />

          <div className="flex flex-wrap gap-2">
            {[
              "AI receipt scanning",
              "Bookkeeping review",
              "Bank reconciliation",
              "VAT and WHT summaries",
              "Audit-friendly workflows",
            ].map((item) => (
              <Badge
                key={item}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/5"
              >
                {item}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {HERO_STATS.map((item) => (
              <Card
                key={item.label}
                className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl"
              >
                <CardContent className="space-y-2 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">
                    {item.label}
                  </div>
                  <div className="text-lg font-semibold leading-7 text-white">{item.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <PreviewCardStack />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 lg:grid-cols-5">
          {VALUE_STRIP.map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.title}
                className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl"
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-white/60">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="How it works"
          title="From upload to filing-ready output, the workflow stays in one system."
          description="TaxBook AI is designed to help accountants and finance operators move from source documents into reviewed books, reconciled cash activity, tax summaries, and filing-ready outputs without stitching multiple tools together."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {HOME_WORKFLOW_STEPS.map((item) => (
            <Card
              key={item.step}
              className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl"
            >
              <CardHeader>
                <Badge className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/5">
                  Step {item.step}
                </Badge>
                <CardTitle className="pt-4 text-2xl text-white">{item.title}</CardTitle>
                <CardDescription className="leading-6 text-white/60">
                  {item.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Core modules"
          title="The public story now matches what the product actually does."
          description="These modules map directly to the product experience inside TaxBook AI today: AI capture, review, banking, tax visibility, filing workflows, client-business management, and grounded assistant support."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {HOME_FEATURE_BLOCKS.map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.title}
                className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl"
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                      <Icon className="size-5" />
                    </div>
                    <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white hover:bg-white/5">
                      {item.badge}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl leading-8 text-white">{item.title}</CardTitle>
                    <CardDescription className="leading-6 text-white/60">
                      {item.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/65">
                  {item.points.map((point) => (
                    <div
                      key={point}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 leading-6"
                    >
                      {point}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Who it is for"
          title="Built for the teams that live with the numbers every week."
          description="TaxBook AI is positioned for Nigerian SMEs, finance operators, and accounting firms that need stronger bookkeeping and tax control without extra operational sprawl."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {WHO_IT_IS_FOR.map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.title}
                className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl"
              >
                <CardHeader className="space-y-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl text-white">{item.title}</CardTitle>
                    <CardDescription className="leading-6 text-white/60">
                      {item.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/65">
                  {item.outcomes.map((outcome) => (
                    <div
                      key={outcome}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 leading-6"
                    >
                      {outcome}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Pricing preview"
          title="Start on Starter, then unlock AI and reconciliation when the workload grows."
          description="Growth unlocks AI receipt scanning and bookkeeping automation. Professional unlocks bank reconciliation, audit-friendly review, and filing-ready tax workflows. Enterprise is sales-led."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant={interval === "MONTHLY" ? "default" : "outline"}
                className={
                  interval === "MONTHLY"
                    ? "border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                    : "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                }
              >
                <Link href="/?interval=monthly">Monthly</Link>
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
                <Link href="/?interval=annual">Annual</Link>
              </Button>
            </div>
          }
        />
        <div className="mt-10">
          <PricingGrid compact interval={interval} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="overflow-hidden border-white/10 bg-slate-950 text-slate-50 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <CardContent className="flex flex-col gap-8 p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Badge className="w-fit rounded-full bg-white/10 text-slate-50 hover:bg-white/10">
                Launch-ready public site
              </Badge>
              <div className="space-y-3">
                <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Give your team one operating layer for receipts, banking, tax visibility, and
                  filing-ready close workflows.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-slate-300">
                  Start on Starter for free, move into Growth for AI-assisted capture, or upgrade
                  to Professional when reconciliation, review control, and filing workflows become
                  critical.
                </p>
              </div>
            </div>
            <MarketingCTAGroup compact showLogin={false} tone="inverse" />
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
