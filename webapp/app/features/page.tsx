import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarketingCTAGroup } from "@/components/marketing/marketing-cta-group";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PreviewCardStack } from "@/components/marketing/preview-card-stack";
import { SectionHeading } from "@/components/marketing/section-heading";
import {
  FEATURE_PILLARS,
  FEATURE_WORKFLOWS,
  GOVERNANCE_FEATURES,
  HOME_FEATURE_BLOCKS,
  HOME_WORKFLOW_STEPS,
  MARKETING_SUBHEADLINE,
  WHO_IT_IS_FOR,
} from "@/components/marketing/site-content";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Features for Bookkeeping, Reconciliation, VAT and WHT",
  description:
    "Explore TaxBook AI features for AI receipt scanning, bookkeeping review, bank reconciliation, VAT and WHT summaries, recurring invoices, and multi-business finance operations.",
  path: "/features",
  keywords: [
    "bookkeeping software for accounting firms",
    "bank reconciliation software Nigeria",
    "VAT and WHT automation",
  ],
});

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center">
        <div className="space-y-5">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Product tour
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Finance workflows that feel launch-ready, not stitched together from separate tools.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            {MARKETING_SUBHEADLINE}
          </p>
          <p className="max-w-2xl text-base leading-7 text-white/60">
            The product is structured around what teams actually need to do: collect documents,
            review entries, reconcile cash activity, understand tax position, prepare filing-ready
            outputs, and keep a clean workspace across one or many businesses.
          </p>
          <MarketingCTAGroup />
        </div>

        <PreviewCardStack compact />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Workflow"
          title="See the accounting loop from source document to filing-ready output."
          description="The product story is clearest when you follow the work in order: upload, review, reconcile, and close."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {HOME_WORKFLOW_STEPS.map((item) => (
            <Card key={item.step} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader>
                <Badge className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/5">
                  Step {item.step}
                </Badge>
                <CardTitle className="pt-4 text-2xl text-white">{item.title}</CardTitle>
                <CardDescription className="leading-6 text-white/60">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Feature detail"
          title="Core modules mapped to the finance outcomes they support."
          description="This is how TaxBook AI shows up in day-to-day work for SMEs, finance teams, and accounting firms handling bookkeeping, reconciliation, reporting, and filing prep."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {HOME_FEATURE_BLOCKS.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl">
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
                    <CardDescription className="leading-6 text-white/60">{item.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/65">
                  {item.points.map((point) => (
                    <div key={point} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 leading-6">
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
          badge="Why teams buy"
          title="The product is grouped around the outcomes finance teams want faster."
          description="Each pillar lines up with a concrete business use case instead of abstract software categories."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {FEATURE_PILLARS.map((column) => (
            <Card key={column.title} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">{column.title}</CardTitle>
                <CardDescription className="text-white/60">{column.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/65">
                {column.items.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 leading-6">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="In practice"
          title="Features are easiest to understand in the order teams use them."
          description="These are the moments customers actually care about in a week or month of finance work."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {FEATURE_WORKFLOWS.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                <CardHeader className="space-y-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">{item.title}</CardTitle>
                    <CardDescription className="mt-2 leading-6 text-white/60">
                      {item.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="border-white/10 bg-slate-950 text-slate-50 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
            <CardHeader className="space-y-4">
              <Badge className="w-fit rounded-full bg-white/10 text-slate-50 hover:bg-white/10">
                Control layer
              </Badge>
              <CardTitle className="text-3xl">
                Credible finance work needs governance, not just automation.
              </CardTitle>
              <CardDescription className="max-w-2xl leading-7 text-slate-300">
                Workspace roles, reviewable changes, and entity separation are part of the product
                because trust breaks quickly when they are treated as afterthoughts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {GOVERNANCE_FEATURES.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title} className="rounded-2xl bg-white/8 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-slate-50">
                        <Icon className="size-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm leading-6 text-slate-300">{item.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Built for three buying motions</CardTitle>
              <CardDescription className="text-white/60">
                The product fits differently for firms, SMEs, and operators, but the workflow
                foundation stays the same.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {WHO_IT_IS_FOR.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                        <Icon className="size-4" />
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-sm leading-6 text-white/60">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardContent className="flex flex-col gap-6 p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
                Ready to explore the product?
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-white">
                Start with Starter, or book a walkthrough of the finance workflow that matters most.
              </h2>
              <p className="max-w-2xl text-white/60">
                The fastest path is to start free, then upgrade when AI capture, reconciliation, or
                multi-user review becomes important.
              </p>
            </div>
            <MarketingCTAGroup compact />
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
