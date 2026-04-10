import type { Metadata } from "next";
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
import { ContactInquiryForm } from "@/components/marketing/contact-inquiry-form";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import {
  CONTACT_CHECKLIST,
  CONTACT_EXPECTATIONS,
  CONTACT_PATHS,
  MARKETING_SUBHEADLINE,
} from "@/components/marketing/site-content";
import { phoneHref, phoneNumber, supportEmail, supportEmailHref } from "@/lib/config/contact";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Contact TaxBook AI in Lagos, Nigeria",
  description:
    "Contact TaxBook AI for demos, pricing conversations, and rollout support for Nigerian businesses, finance teams, and accounting firms.",
  path: "/contact",
  keywords: [
    "AI accounting software Nigeria contact",
    "bookkeeping software for accounting firms demo",
    "Lagos accounting software",
  ],
});

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center">
        <div className="space-y-5">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Lagos, Nigeria
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Book a demo, ask a pricing question, or plan your rollout with the team.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            {MARKETING_SUBHEADLINE}
          </p>
          <p className="max-w-2xl text-base leading-7 text-white/60">
            Whether you are evaluating TaxBook AI for one business, a finance team, or a client
            portfolio, we can walk through workflow fit, plan structure, tax workflow expectations,
            and the cleanest next rollout step.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <a href={`${supportEmailHref}?subject=Book%20a%20TaxBook%20Demo`}>
                Book Demo
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <a href={`${supportEmailHref}?subject=TaxBook%20Sales%20Inquiry`}>
                Email Sales
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-white/72 hover:bg-white/10 hover:text-white"
            >
              <a href={phoneHref}>Call Lagos Team</a>
            </Button>
          </div>
        </div>

        <ContactInquiryForm />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          badge="Talk to us about"
          title="Choose the conversation that matches your next step."
          description="These are the most common public paths into TaxBook AI."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {CONTACT_PATHS.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl">
                <CardHeader>
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle className="pt-4 text-xl text-white">{item.title}</CardTitle>
                  <CardDescription className="leading-6 text-white/60">{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90">
                    <a href={item.href}>{item.cta}</a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <Card className="border-white/10 bg-slate-950 text-slate-50 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
            <CardContent className="grid gap-6 p-8">
              <div className="space-y-4">
                <Badge className="w-fit rounded-full bg-white/10 text-slate-50 hover:bg-white/10">
                  What to expect
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight">
                  The best conversations stay anchored to your current finance workflow.
                </h2>
                <p className="text-slate-300">
                  We usually start by understanding how you handle bookkeeping review, bank
                  reconciliation, invoicing, and tax visibility today.
                </p>
              </div>
              <div className="grid gap-3">
                {CONTACT_EXPECTATIONS.map((item) => (
                  <div key={item} className="rounded-2xl bg-white/8 px-4 py-4 text-sm">
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">What to send us</CardTitle>
              <CardDescription className="text-white/60">
                A little context helps us make the demo or pricing conversation useful.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {CONTACT_CHECKLIST.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan">
                        <Icon className="size-4" />
                      </div>
                      <div className="space-y-1">
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
                  Prefer to explore first?
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-white">
                Start on Starter, review pricing, then come back when you want rollout help.
              </h2>
              <p className="max-w-2xl text-white/60">
                You can self-serve into the product, compare plans, or log in if your workspace is
                already set up.
              </p>
            </div>
            <MarketingCTAGroup compact showContactSales={false} />
            </CardContent>
          </Card>
        </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Contact details</CardTitle>
            <CardDescription className="text-white/60">
              Reach TaxBook AI directly through the support inbox or by phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-white/72 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-white">Support email</p>
              <a href={supportEmailHref} className="break-all transition hover:text-white">
                {supportEmail}
              </a>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-white">Phone</p>
              <a href={phoneHref} className="transition hover:text-white">
                {phoneNumber}
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
