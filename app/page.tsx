import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";
import { TryDemoButton } from "@/components/marketing/try-demo-button";
import {
  COMPANY_DETAILS,
  MARKETING_NAME,
  MARKETING_SUBHEADLINE,
  MARKETING_TAGLINE,
} from "@/components/marketing/site-content";

export const metadata: Metadata = buildMarketingMetadata({
  title: "AI Accounting Software for Nigerian Businesses",
  description:
    "TaxBook AI helps Nigerian businesses automate bookkeeping review, invoices, payments, reconciliation, ledger visibility, and VAT and WHT workflows in one premium workspace.",
  path: "/",
  keywords: [
    "AI accounting software Nigeria",
    "bookkeeping automation Nigeria",
    "invoice payment tax software Nigeria",
  ],
});

const navItems = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

const trustItems = [
  "AI-powered bookkeeping",
  "Secure payment workflows",
  "VAT/WHT tax automation",
  "Workspace-based accounting",
  "Real-time financial visibility",
] as const;

const featureCards = [
  {
    icon: Sparkles,
    title: "AI Bookkeeping",
    description:
      "Capture receipts and supporting documents into a review-first workflow instead of manual re-entry.",
  },
  {
    icon: Calculator,
    title: "Tax Engine",
    description:
      "Track VAT and WHT exposure from live accounting activity with filing-ready visibility.",
  },
  {
    icon: ReceiptText,
    title: "Invoices",
    description:
      "Create, send, repeat, and monitor invoices in the same workspace that closes the books.",
  },
  {
    icon: CreditCard,
    title: "Payments",
    description:
      "Confirm Paystack-powered invoice payments into the same paid, ledger, and tax flow.",
  },
  {
    icon: Landmark,
    title: "Reconciliation",
    description:
      "Import statements, surface likely matches, and keep unresolved bank activity in review.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    description:
      "See revenue, expenses, tax sync, and financial health from one connected operating layer.",
  },
] as const;

const pricingCards = [
  {
    name: "Starter",
    price: "Free",
    description: "For teams getting started with bookkeeping visibility and tax-ready workflows.",
    points: [
      "Core finance workspace",
      "Manual bookkeeping and reporting",
      "Tax visibility and operational control",
    ],
    href: "/signup",
    cta: "Start Free",
    featured: false,
  },
  {
    name: "Growth",
    price: "Built to scale",
    description: "For businesses ready to automate capture, invoicing, and day-to-day collections.",
    points: [
      "AI bookkeeping and review queue",
      "Invoices, reminders, and recurring billing",
      "Payment-linked operational visibility",
    ],
    href: "/pricing",
    cta: "View Growth",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For firms and finance teams needing tighter rollout support and larger operating scope.",
    points: [
      "Portfolio and multi-entity fit",
      "Operational controls and monitoring",
      "Sales-led rollout and support",
    ],
    href: "/contact",
    cta: "Talk to Sales",
    featured: false,
  },
] as const;

const revenueCards = [
  {
    label: "Revenue",
    value: "NGN 12.4m",
    detail: "+18% from faster invoice collection",
  },
  {
    label: "Invoices",
    value: "34 open",
    detail: "8 clients with live payment links",
  },
  {
    label: "Ledger status",
    value: "Healthy",
    detail: "Invoice, payment, and ledger chain aligned",
  },
  {
    label: "Tax sync",
    value: "VAT/WHT ready",
    detail: "Live summaries tied to source records",
  },
  {
    label: "Reconciliation",
    value: "9 unmatched",
    detail: "Suggested matches waiting in review",
  },
  {
    label: "Integrity score",
    value: "96 / 100",
    detail: "Monitored financial control layer",
  },
] as const;

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
              TB
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold tracking-tight text-white">{MARKETING_NAME}</p>
              <p className="text-xs text-white/60">{MARKETING_TAGLINE}</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm text-white/72 transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="text-sm text-white/72 transition hover:text-white">
              Login
            </Link>
            <Button
              asChild
              className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </nav>

          <div className="flex items-center gap-3 lg:hidden">
            <Link href="/login" className="text-sm text-white/72 transition hover:text-white">
              Login
            </Link>
            <Button
              asChild
              className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm text-white/65 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#070b13]">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
              TB
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{MARKETING_NAME}</p>
              <p className="text-sm text-white/60">{MARKETING_TAGLINE}</p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/62">
            {MARKETING_SUBHEADLINE}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Product</p>
          <div className="grid gap-2 text-sm text-white/62">
            <Link href="#features" className="transition hover:text-white">
              Features
            </Link>
            <Link href="#pricing" className="transition hover:text-white">
              Pricing
            </Link>
            <Link href="/features" className="transition hover:text-white">
              Product Tour
            </Link>
            <Link href="/pricing" className="transition hover:text-white">
              Full Pricing
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Company</p>
          <div className="grid gap-2 text-sm text-white/62">
            <Link href="/contact" className="transition hover:text-white">
              Contact
            </Link>
            <Link href="/login" className="transition hover:text-white">
              Login
            </Link>
            <Link href="/signup" className="transition hover:text-white">
              Start Free Trial
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Legal</p>
          <div className="grid gap-2 text-sm text-white/62">
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <a href={`mailto:${COMPANY_DETAILS.email}`} className="transition hover:text-white">
              {COMPANY_DETAILS.email}
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Built for Nigerian businesses, finance teams, and accounting firms.</p>
          <p>© 2026 TaxBook AI. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const showDemoCta = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-primary text-white">
      <Header />

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(34,211,238,0.16),transparent_20%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.12),transparent_26%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,0.98fr)] md:items-center lg:py-28">
            <div className="space-y-8">
              <div className="space-y-5">
                <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
                  Premium AI finance operations for Nigeria
                </Badge>
                <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-tight text-balance sm:text-6xl">
                  Automate bookkeeping and tax compliance with AI.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
                  Manage invoices, expenses, payments, ledger activity, and tax workflows faster
                  with TaxBook AI.
                </p>
                <p className="max-w-2xl text-base leading-7 text-white/60">
                  Built for businesses, finance teams, and accounting firms that want one premium
                  workspace for AI bookkeeping, invoice collections, reconciliation, ledger
                  visibility, and VAT/WHT control.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Button
                  asChild
                  size="lg"
                  className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                >
                  <Link href="/signup">
                    Start Free Trial
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/contact">Book Demo</Link>
                </Button>
                {showDemoCta ? (
                  <TryDemoButton className="border border-white/15 bg-white/5 text-white shadow-none hover:bg-white/10" />
                ) : null}
              </div>

              {showDemoCta ? (
                <p className="text-sm leading-6 text-white/55">
                  Try Demo creates a seeded beta workspace with invoices, payments, ledger data,
                  tax records, and sample integrity issues.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="rounded-2xl border border-white/10 bg-white/5 py-0 text-white shadow-glow backdrop-blur">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Capture</p>
                    <p className="text-sm font-medium leading-6 text-white/90">
                      Receipts and invoices move into a review-first queue.
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border border-white/10 bg-white/5 py-0 text-white shadow-glow backdrop-blur">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Collect</p>
                    <p className="text-sm font-medium leading-6 text-white/90">
                      Payments, reminders, and invoice links stay connected.
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border border-white/10 bg-white/5 py-0 text-white shadow-glow backdrop-blur">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Control</p>
                    <p className="text-sm font-medium leading-6 text-white/90">
                      Ledger, tax sync, and integrity checks stay visible.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-6 top-12 h-40 w-40 rounded-full bg-cyan/20 blur-3xl" />
              <div className="absolute -right-8 bottom-0 h-52 w-52 rounded-full bg-blue/20 blur-3xl" />
              <Card className="relative overflow-hidden rounded-[30px] border border-cyan/20 bg-white/6 py-0 text-white shadow-glow backdrop-blur">
                <div className="border-b border-white/10 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.24em] text-cyan/80">
                        Product Preview
                      </p>
                      <h2 className="text-2xl font-semibold">
                        One operating layer for books, cash, and tax.
                      </h2>
                    </div>
                    <Badge className="border border-white/10 bg-white/8 text-white hover:bg-white/8">
                      Live workspace
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-primary p-5">
                      <p className="text-sm text-white/60">Collected revenue</p>
                      <p className="mt-2 text-3xl font-semibold">NGN 12.4m</p>
                      <p className="mt-2 text-sm text-cyan/80">
                        Faster collections from invoice + payment flow
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-primary p-5">
                      <p className="text-sm text-white/60">Tax sync status</p>
                      <p className="mt-2 text-3xl font-semibold">Healthy</p>
                      <p className="mt-2 text-sm text-cyan/80">
                        Ledger and tax checks monitored in real time
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {revenueCards.map((item) => (
                      <div
                        key={item.label}
                        className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="text-sm text-white/55">{item.label}</p>
                          <p className="mt-1 text-sm leading-6 text-white/72">{item.detail}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-6 py-5">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {trustItems.map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/72"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-center">
            <div className="space-y-6">
              <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
                Product screenshot
              </Badge>
              <h2 className="text-4xl font-semibold tracking-tight text-balance">
                A product preview that looks like the real TaxBook AI operating flow.
              </h2>
              <p className="text-base leading-7 text-white/62">
                The same visual language now runs from homepage to dashboard: premium dark
                surfaces, glowing action states, and finance blocks that feel like the actual
                product rather than generic SaaS decoration.
              </p>

              <div className="grid gap-3">
                {[
                  "Revenue, invoices, and payments stay connected to ledger outcomes.",
                  "Tax sync and integrity checks are visible alongside operational activity.",
                  "Reconciliation status stays part of the same finance narrative.",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/72"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <Card className="overflow-hidden rounded-[30px] border border-cyan/20 bg-primary py-0 text-white shadow-glow">
              <div className="border-b border-white/10 px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full bg-rose-400/80" />
                  <div className="size-3 rounded-full bg-amber-300/80" />
                  <div className="size-3 rounded-full bg-emerald-400/80" />
                  <div className="ml-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                    workspace://taxbook-ai/finance-overview
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-6">
                <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-white/55">Revenue pipeline</p>
                        <p className="mt-1 text-2xl font-semibold">NGN 18.8m billed</p>
                      </div>
                      <div className="rounded-full bg-gradient-primary px-3 py-1 text-xs font-medium text-white shadow-glow">
                        Live
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3">
                      <div className="h-3 rounded-full bg-white/10">
                        <div className="h-3 w-[72%] rounded-full bg-gradient-primary shadow-glow" />
                      </div>
                      <div className="flex items-center justify-between text-sm text-white/60">
                        <span>Collected</span>
                        <span>72%</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm text-white/55">Invoice status</p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-white/10 bg-primary px-4 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Sent</span>
                          <span className="text-white/80">14</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-primary px-4 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Paid</span>
                          <span className="text-cyan">20</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-primary px-4 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Needs review</span>
                          <span className="text-amber-300">3</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <WalletCards className="size-5 text-cyan" />
                      <p className="font-medium">Ledger status</p>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/62">
                      1:1 invoice-to-ledger posting chain confirmed for successful collections.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <Calculator className="size-5 text-cyan" />
                      <p className="font-medium">Tax sync</p>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/62">
                      VAT and WHT status tied to the same operational records and period views.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="size-5 text-cyan" />
                      <p className="font-medium">Reconciliation</p>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/62">
                      Suggested bank matches and manual review tools stay inside the workflow.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
              Core capabilities
            </Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-balance">
              Real product modules, not generic SaaS feature filler.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60 sm:text-lg">
              TaxBook AI already supports the workflows below across its live product stack.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((item) => {
              const Icon = item.icon;

              return (
                <Card
                  key={item.title}
                  className="rounded-3xl border border-white/10 bg-white/5 py-0 text-white shadow-glow transition hover:-translate-y-1 hover:border-cyan/30"
                >
                  <CardHeader className="space-y-4 px-6 py-6">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow">
                      <Icon className="size-5" />
                    </div>
                    <div className="space-y-3">
                      <CardTitle className="text-2xl leading-8 text-white">{item.title}</CardTitle>
                      <CardDescription className="leading-6 text-white/62">
                        {item.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
              Pricing teaser
            </Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-balance">
              Start simple, then unlock more automation as the workload grows.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60 sm:text-lg">
              This is a marketing preview of plan positioning only. Full billing details stay on the
              pricing page.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {pricingCards.map((plan) => (
              <Card
                key={plan.name}
                className={[
                  "rounded-3xl py-0 text-white",
                  plan.featured
                    ? "border-cyan/30 bg-white/8 shadow-glow"
                    : "border-white/10 bg-white/5",
                ].join(" ")}
              >
                <CardHeader className="space-y-4 px-6 py-6">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-2xl text-white">{plan.name}</CardTitle>
                    {plan.featured ? (
                      <Badge className="border border-cyan/20 bg-gradient-primary text-white shadow-glow hover:bg-gradient-primary">
                        Most popular
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-3xl font-semibold">{plan.price}</p>
                    <CardDescription className="leading-6 text-white/62">
                      {plan.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 px-6 pb-6">
                  {plan.points.map((point) => (
                    <div
                      key={point}
                      className="rounded-2xl border border-white/10 bg-primary px-4 py-3 text-sm leading-6 text-white/76"
                    >
                      {point}
                    </div>
                  ))}
                  <Button
                    asChild
                    className={[
                      "mt-3 text-white transition",
                      plan.featured
                        ? "border-0 bg-gradient-primary shadow-glow hover:opacity-90"
                        : "border border-white/10 bg-white/8 hover:bg-white/12",
                    ].join(" ")}
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="overflow-hidden rounded-[32px] border border-cyan/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 shadow-glow sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-5">
                <Badge className="rounded-full border border-white/10 bg-white/8 px-4 py-1.5 text-white hover:bg-white/8">
                  Ready to modernize the finance workflow?
                </Badge>
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance">
                  Start with AI bookkeeping and invoicing, then grow into payments, reconciliation,
                  tax, and financial controls.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-white/68">
                  TaxBook AI is designed to feel consistent from the first marketing touchpoint to
                  the actual finance workspace your team logs into every week.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
                <Button
                  asChild
                  size="lg"
                  className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                >
                  <Link href="/signup">
                    Start Free Trial
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/contact">Book Demo</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
