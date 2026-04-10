import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileSearch,
  Landmark,
  Layers3,
  MessageSquareMore,
  ReceiptText,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { MarketingCTAGroup } from "@/components/marketing/marketing-cta-group";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ValueStripItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type PainPointItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type WorkflowStep = {
  step: string;
  title: string;
  description: string;
};

type FeatureSpotlight = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  accent: string;
  featured?: boolean;
};

type SecondaryFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type ComparisonRow = {
  label: string;
  generic: string;
  taxOnly: string;
  taxbook: string;
};

type AudienceCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  highlights: string[];
};

type PricingTeaser = {
  name: string;
  description: string;
  positioning: string;
  bullets: string[];
  highlighted?: boolean;
};

const SURFACE_CARD_CLASSNAME =
  "border-white/10 bg-white/[0.055] text-white shadow-[0_28px_90px_rgba(2,8,23,0.28)] backdrop-blur-2xl";

const PANEL_CLASSNAME =
  "rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.96),rgba(10,18,30,0.88))] shadow-[0_34px_140px_rgba(2,8,23,0.52)]";

const INNER_PANEL_CLASSNAME =
  "rounded-3xl border border-white/10 bg-primary/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

const VALUE_STRIP: ValueStripItem[] = [
  {
    icon: Layers3,
    title: "Transaction engine",
    description:
      "Move from imported activity into reviewable records, not spreadsheet clean-up.",
  },
  {
    icon: Sparkles,
    title: "AI bookkeeping",
    description:
      "Draft categories, tax treatment, and review routing while humans keep approval control.",
  },
  {
    icon: Landmark,
    title: "Nigeria-first tax engine",
    description:
      "Track VAT and WHT payable from the records driving them, not from separate tax guesswork.",
  },
  {
    icon: FileCheck2,
    title: "Filing readiness",
    description:
      "See blockers, evidence gaps, and unresolved items before filing week turns chaotic.",
  },
];

const PAIN_POINTS: PainPointItem[] = [
  {
    icon: ReceiptText,
    title: "Manual bookkeeping drains time from finance teams",
    description:
      "Transactions still need manual cleanup, category fixes, and late tax interpretation before the month can close cleanly.",
  },
  {
    icon: ScanSearch,
    title: "Receipts and evidence remain scattered",
    description:
      "Files live in email, WhatsApp, shared drives, and phones, which slows review and weakens audit confidence.",
  },
  {
    icon: CircleAlert,
    title: "VAT and WHT become visible too late",
    description:
      "Many teams only understand tax exposure near deadlines, after the underlying transaction issues have piled up.",
  },
  {
    icon: ShieldCheck,
    title: "Control is hard to enforce in disconnected tools",
    description:
      "Approval trails, notes, conflicts, and reviewer accountability disappear when work is spread across multiple systems.",
  },
  {
    icon: Users,
    title: "Finance operators and accountants work without one shared flow",
    description:
      "The daily workflow between business teams and external accountants is often fragmented, slow, and hard to prioritize.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Multi-business oversight breaks down fast",
    description:
      "Firms and portfolio teams need one clean workspace model per business, not a patchwork of exports and status chasing.",
  },
];

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: "01",
    title: "Import transaction activity",
    description:
      "Pull in bank activity, payment events, and source evidence into the correct workspace boundary.",
  },
  {
    step: "02",
    title: "Run AI bookkeeping review",
    description:
      "Get category, tax, and treatment suggestions with confidence scoring before anything is approved.",
  },
  {
    step: "03",
    title: "Resolve reconciliation exceptions",
    description:
      "Match transactions, detect duplicates, and clear suspicious patterns while the work is still actionable.",
  },
  {
    step: "04",
    title: "Track live VAT and WHT exposure",
    description:
      "Keep tax position connected to real transaction behavior, not disconnected month-end summaries.",
  },
  {
    step: "05",
    title: "Prepare filing readiness",
    description:
      "Surface blockers, missing evidence, and unresolved treatment gaps before filing pressure starts.",
  },
  {
    step: "06",
    title: "Collaborate across workspaces",
    description:
      "Give SMEs, finance teams, and firms one role-aware workflow from transaction to readiness.",
  },
];

const FEATURE_SPOTLIGHTS: FeatureSpotlight[] = [
  {
    icon: Layers3,
    eyebrow: "Transaction engine",
    title: "Start with a transaction system, not a loose bookkeeping inbox.",
    description:
      "TaxBook AI turns imported activity into structured workflow units with statuses, notes, confidence, review routing, and posting readiness.",
    bullets: [
      "Workspace-scoped review queue",
      "Bulk actions and audit-safe updates",
      "Duplicate and suspicious-pattern visibility",
    ],
    accent: "from-blue/20 via-blue/6 to-transparent",
    featured: true,
  },
  {
    icon: Bot,
    eyebrow: "AI bookkeeping",
    title: "Use AI to accelerate review, not to hide decisions.",
    description:
      "Category suggestions, tax treatment drafts, confidence scores, and reviewer feedback sit inside a human-controlled approval flow.",
    bullets: [
      "Category and tax treatment suggestions together",
      "Manual override and approval workflows",
      "Feedback structure for future learning",
    ],
    accent: "from-cyan/20 via-cyan/6 to-transparent",
  },
  {
    icon: Landmark,
    eyebrow: "VAT / WHT tax engine",
    title: "See tax liabilities as live operational data.",
    description:
      "VAT and WHT payable are traceable back to source transactions, period filters, and movement drivers, so teams can act earlier.",
    bullets: [
      "Liability drill-down to source records",
      "Explanation support for changes",
      "Nigeria-first VAT and WHT workflow",
    ],
    accent: "from-emerald-200/14 via-cyan/8 to-transparent",
  },
  {
    icon: FileCheck2,
    eyebrow: "Filing readiness",
    title: "Turn filing prep into a monitored operating state.",
    description:
      "Readiness scoring highlights uncategorized items, missing evidence, flagged transactions, and unreconciled blockers before deadlines get tight.",
    bullets: [
      "0 to 100 readiness scoring",
      "Severity-ranked blockers",
      "Recommended next actions",
    ],
    accent: "from-amber-200/16 via-amber-100/6 to-transparent",
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: "Accountant workspace",
    title: "Manage multiple businesses without losing context or control.",
    description:
      "Accountants and portfolio teams can switch workspaces, monitor client readiness, and keep each entity operationally clean.",
    bullets: [
      "Client health and tax exposure summaries",
      "Role-aware workspace switching",
      "Portfolio-first dashboard visibility",
    ],
    accent: "from-violet-200/12 via-blue/6 to-transparent",
  },
];

const SECONDARY_FEATURES: SecondaryFeature[] = [
  {
    icon: FileSearch,
    title: "Reconciliation queue",
    description:
      "Resolve unmatched items, duplicate charges, and suspicious patterns without leaving the workflow.",
  },
  {
    icon: ReceiptText,
    title: "Receipt capture",
    description:
      "Feed invoices, receipts, and supporting documents into extraction, review, and evidence handling.",
  },
  {
    icon: BrainCircuit,
    title: "Explain-my-numbers layer",
    description:
      "Answer grounded questions about tax movement, category shifts, vendor drivers, and filing blockers.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Transaction-to-tax continuity",
    generic: "Books are handled in one tool, then tax visibility is rebuilt somewhere else.",
    taxOnly: "Tax review starts after accounting work is already fragmented.",
    taxbook:
      "Transactions move from import to AI review, reconciliation, tax treatment, and readiness inside one operating layer.",
  },
  {
    label: "Nigeria-first VAT and WHT workflow",
    generic: "Usually depends on manual spreadsheets and custom internal process.",
    taxOnly: "Tax forms may exist, but transaction context is often too thin for real operations.",
    taxbook:
      "VAT and WHT stay tied to live source records, payable movement, and workspace-specific review flow.",
  },
  {
    label: "Human review and audit control",
    generic: "Status, accountability, and evidence are difficult to trace consistently.",
    taxOnly: "The focus is filing preparation, not day-to-day review governance.",
    taxbook:
      "Statuses, confidence, notes, blockers, and exact record traceability stay visible throughout the lifecycle.",
  },
  {
    label: "Multi-business and accountant collaboration",
    generic: "Entity separation and portfolio oversight are usually weak.",
    taxOnly: "Not designed for daily collaboration between teams and accountants.",
    taxbook:
      "Role-aware workspaces support SMEs, finance teams, and firms operating across one business or many.",
  },
  {
    label: "Platform headroom",
    generic: "Hard to extend into AI workflows, receipt capture, or modern finance operations.",
    taxOnly: "Good for a narrow compliance lane, but limited as an operating system.",
    taxbook:
      "Built to expand into payment sync, receipt capture, assistants, alerts, and close intelligence without breaking workflow continuity.",
  },
];

const AUDIENCES: AudienceCard[] = [
  {
    icon: Building2,
    title: "For SME owners",
    description:
      "Get clearer books, live tax visibility, and a calmer finance workflow without building a complex stack.",
    highlights: [
      "See revenue, expenses, profit, and tax due from one surface",
      "Keep bookkeeping and evidence in one controlled flow",
      "Understand what is blocking filing before deadlines",
    ],
  },
  {
    icon: WalletCards,
    title: "For finance teams",
    description:
      "Give operators and reviewers a disciplined engine for transaction review, reconciliation, and tax follow-through.",
    highlights: [
      "Prioritize transaction queues faster",
      "Track liability changes from real source records",
      "Keep speed and control in the same system",
    ],
  },
  {
    icon: Users,
    title: "For accountants and firms",
    description:
      "Operate multiple client businesses with cleaner workflow visibility, readiness scoring, and tax oversight.",
    highlights: [
      "Switch client workspaces cleanly",
      "Monitor client readiness and tax exposure in one place",
      "Maintain review and audit clarity across teams",
    ],
  },
];

const PRICING_TEASERS: PricingTeaser[] = [
  {
    name: "Starter",
    description: "For owners and lean teams getting serious about finance control.",
    positioning: "A strong transaction and bookkeeping foundation for one business",
    bullets: ["Live dashboard", "Core workflow visibility", "Operational setup without clutter"],
  },
  {
    name: "Growth",
    description: "For teams ready to use AI review, tax visibility, and stronger close workflows.",
    positioning: "The best fit for active Nigerian finance operations",
    bullets: ["AI bookkeeping", "Tax engine visibility", "Reconciliation and readiness depth"],
    highlighted: true,
  },
  {
    name: "Firm / Accountant",
    description: "For accountants and portfolio teams managing multiple client businesses.",
    positioning: "Multi-workspace control with cleaner portfolio visibility",
    bullets: ["Client workspace switching", "Portfolio oversight", "Readiness monitoring"],
  },
];

function SurfaceCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <Card className={cn(SURFACE_CARD_CLASSNAME, className)}>{children}</Card>;
}

function SectionShell({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative mx-auto max-w-7xl px-6 py-16 sm:py-20", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan/24 to-transparent"
      />
      {children}
    </section>
  );
}

function HeroVisualPanel() {
  return (
    <div className="relative mx-auto w-full max-w-[44rem]">
      <div
        aria-hidden
        className="absolute inset-x-10 -top-12 h-36 rounded-full bg-cyan/18 blur-3xl"
      />
      <div className={cn(PANEL_CLASSNAME, "relative overflow-hidden p-3 sm:p-4")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.16),transparent_34%)]" />
        <div className="relative grid gap-3 lg:grid-cols-[88px_minmax(0,1fr)]">
          <div className="hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-3 lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-4">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
                TB
              </div>
              <div className="space-y-2">
                {["Overview", "Transactions", "Tax center", "Readiness", "Clients"].map((item, index) => (
                  <div
                    key={item}
                    className={cn(
                      "rounded-2xl px-3 py-2 text-xs",
                      index === 0
                        ? "bg-white/10 text-white"
                        : "text-white/40"
                    )}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] text-white/45">
              Live workspace
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,17,30,0.96),rgba(7,13,24,0.92))] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">TaxBook AI Workspace</p>
                  <Badge className="rounded-full border border-cyan/20 bg-cyan/10 px-2.5 py-0.5 text-[11px] text-cyan hover:bg-cyan/10">
                    Nigeria-first
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-white/45">
                  Transaction review, tax center, and filing readiness in one control plane
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
                <span className="size-2 rounded-full bg-emerald-400" />
                Workspace synced
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Revenue", value: "NGN 18.4m" },
                { label: "Expenses", value: "NGN 7.6m" },
                { label: "Tax due", value: "NGN 1.9m" },
                { label: "Readiness", value: "84 / 100" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/34">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-base font-semibold text-white sm:text-lg">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
              <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Transaction review queue</p>
                    <p className="text-sm text-white/45">
                      Imported activity ready for approval and posting checks
                    </p>
                  </div>
                  <Badge className="rounded-full border border-blue/20 bg-blue/10 text-blue hover:bg-blue/10">
                    31 items
                  </Badge>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="grid grid-cols-[1.1fr_0.8fr_0.65fr_0.55fr] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-white/34">
                    <span>Merchant</span>
                    <span>Status</span>
                    <span>Category</span>
                    <span className="text-right">Confidence</span>
                  </div>
                  {[
                    ["Paystack Settlement", "Posting ready", "Sales", "96%"],
                    ["Office Rent - Victoria Island", "Pending review", "Facilities", "74%"],
                    ["Bluefreight Logistics", "Flagged", "WHT service", "61%"],
                    ["Fuel Station - Lekki", "Reviewed", "Transport", "89%"],
                  ].map(([merchant, status, category, confidence]) => (
                    <div
                      key={merchant}
                      className="grid grid-cols-[1.1fr_0.8fr_0.65fr_0.55fr] gap-3 border-b border-white/8 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-white">{merchant}</p>
                        <p className="text-xs text-white/40">Workspace scoped</p>
                      </div>
                      <div className="pt-0.5">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px]",
                            status === "Posting ready"
                              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                              : status === "Pending review"
                                ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                                : status === "Flagged"
                                  ? "border-red-300/25 bg-red-400/10 text-red-100"
                                  : "border-blue/25 bg-blue/10 text-blue"
                          )}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="pt-1 text-white/62">{category}</div>
                      <div className="pt-1 text-right font-medium text-white">{confidence}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Tax liability center</p>
                      <p className="text-sm text-white/45">Live VAT and WHT position</p>
                    </div>
                    <Badge className="rounded-full border border-cyan/20 bg-cyan/10 text-cyan hover:bg-cyan/10">
                      April
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/34">VAT due</p>
                      <p className="mt-2 text-lg font-semibold text-white">NGN 1.24m</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/34">WHT due</p>
                      <p className="mt-2 text-lg font-semibold text-white">NGN 680k</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3">
                    <p className="text-sm font-medium text-cyan">Main movement driver</p>
                    <p className="mt-1 text-sm leading-6 text-white/70">
                      Services revenue and vendor withholding drove this month&apos;s increase.
                    </p>
                  </div>
                </div>

                <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Filing readiness</p>
                      <p className="text-sm text-white/45">What still needs attention</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-semibold text-white">
                      84
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Uncategorized transactions", "12 items"],
                      ["Missing evidence", "5 records"],
                      ["Flagged tax treatment", "3 items"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <span className="text-sm text-white/68">{label}</span>
                        <span className="text-xs text-white/42">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-start gap-3">
                <MessageSquareMore className="mt-1 size-4 shrink-0 text-cyan" />
                <div>
                  <p className="text-sm font-medium text-white">
                    Explain my numbers: Why is tax due higher this month?
                  </p>
                  <p className="mt-1 text-sm leading-6 text-white/62">
                    VAT payable rose because taxable sales grew faster than input VAT, while WHT
                    exposure increased on logistics and service vendors.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonCell({
  value,
  highlighted = false,
}: {
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 text-sm leading-6",
        highlighted
          ? "border-cyan/20 bg-cyan/10 text-white"
          : "border-white/10 bg-white/[0.04] text-white/62"
      )}
    >
      {value}
    </div>
  );
}

function FeatureSpotlightCard({ feature }: { feature: FeatureSpotlight }) {
  const Icon = feature.icon;

  return (
    <SurfaceCard
      className={cn(
        "relative overflow-hidden",
        feature.featured && "border-cyan/20 shadow-[0_28px_110px_rgba(34,211,238,0.12)]"
      )}
    >
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100", feature.accent)}
      />
      {feature.featured ? (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-primary" />
      ) : null}
      <CardHeader className="relative space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan shadow-glow">
            <Icon className="size-5" />
          </div>
          <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-white/70 hover:bg-white/[0.05]">
            {feature.eyebrow}
          </Badge>
        </div>
        <div className="space-y-2">
          <CardTitle
            className={cn(
              "text-white",
              feature.featured ? "text-3xl leading-10" : "text-2xl leading-8"
            )}
          >
            {feature.title}
          </CardTitle>
          <CardDescription className="max-w-2xl leading-7 text-white/60">
            {feature.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative grid gap-3 text-sm text-white/68 sm:grid-cols-3">
        {feature.bullets.map((bullet) => (
          <div
            key={bullet}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 leading-6"
          >
            {bullet}
          </div>
        ))}
      </CardContent>
    </SurfaceCard>
  );
}

export function PremiumHomepage() {
  return (
    <MarketingShell>
      <section className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-14 pt-16 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] lg:items-center lg:pb-20 lg:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-16 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/24 to-transparent"
        />
        <div className="space-y-8">
          <div className="space-y-5">
            <Badge className="rounded-full border border-cyan/20 bg-cyan/10 px-4 py-1.5 text-cyan hover:bg-cyan/10">
              The finance operations system for Nigerian businesses
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance text-white sm:text-6xl xl:text-[4.55rem] xl:leading-[1.02]">
                Close faster, see tax earlier, and run finance from one premium workspace.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-white/68 sm:text-xl">
                TaxBook AI connects transaction intake, AI bookkeeping, reconciliation, VAT and
                WHT visibility, filing readiness, and accountant collaboration in one serious
                operating layer built for Nigeria.
              </p>
              <p className="max-w-2xl text-sm leading-7 text-white/46 sm:text-base">
                Built for SME owners, finance teams, and accounting firms that want stronger
                control than generic bookkeeping tools and more operational depth than tax-only
                software.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <MarketingCTAGroup
              showViewPricing={false}
              showLogin={false}
              className="gap-4"
            />
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/#preview">
                See product preview
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-white/55">
            <span>Start free with a clean finance foundation</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:inline-block" />
            <span>Book a tailored demo for your finance team or accounting firm</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:inline-block" />
            <span>Designed for operational seriousness, not lightweight bookkeeping</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "One operating layer",
                value: "Transactions, review, tax, readiness, and collaboration stay connected.",
              },
              {
                label: "Human control preserved",
                value: "AI speeds the work up without hiding approvals, notes, or evidence.",
              },
              {
                label: "Built for Nigeria",
                value: "VAT, WHT, filing readiness, and accountant workflows are first-class.",
              },
            ].map((item) => (
              <SurfaceCard key={item.label}>
                <CardContent className="space-y-3 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/36">{item.label}</p>
                  <p className="text-sm leading-6 text-white/72">{item.value}</p>
                </CardContent>
              </SurfaceCard>
            ))}
          </div>
        </div>

        <HeroVisualPanel />
      </section>

      <SectionShell className="pt-8 sm:pt-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {VALUE_STRIP.map((item) => {
            const Icon = item.icon;

            return (
              <SurfaceCard key={item.title}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan shadow-glow">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-white/60">{item.description}</p>
                  </div>
                </CardContent>
              </SurfaceCard>
            );
          })}
        </div>
      </SectionShell>

      <SectionShell id="problems">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <SectionHeading
            badge="Where the pain actually sits"
            title="The real problem is weak flow from transaction activity to tax readiness."
            description="Most teams still run bookkeeping, evidence gathering, tax visibility, and accountant collaboration across disconnected tools. The result is slower close cycles, weaker control, and more filing stress."
          />

          <div className="grid gap-4 md:grid-cols-2">
            {PAIN_POINTS.map((item) => {
              const Icon = item.icon;

              return (
                <SurfaceCard key={item.title}>
                  <CardContent className="space-y-4 p-6">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
                      <Icon className="size-5" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                      <p className="text-sm leading-6 text-white/60">{item.description}</p>
                    </div>
                  </CardContent>
                </SurfaceCard>
              );
            })}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="workflow">
        <SectionHeading
          badge="How it works"
          title="A connected workflow from imported transactions to filing-ready finance operations."
          description="TaxBook AI is built like a real finance system: intake, review, reconciliation, tax movement, readiness, and workspace coordination all stay connected."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {WORKFLOW_STEPS.map((item) => (
            <SurfaceCard key={item.step} className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-primary opacity-80" />
              <CardContent className="space-y-4 p-6">
                <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-white/70 hover:bg-white/[0.05]">
                  Step {item.step}
                </Badge>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                  <p className="text-sm leading-6 text-white/60">{item.description}</p>
                </div>
              </CardContent>
            </SurfaceCard>
          ))}
        </div>
      </SectionShell>

      <SectionShell id="features">
        <SectionHeading
          badge="Platform pillars"
          title="Five product pillars define the platform."
          description="This is where TaxBook AI wins: it is not just a bookkeeping app with extra pages. It is a transaction-to-filing operating layer designed around the real work finance teams and accountants do."
        />

        <div className="mt-10 space-y-4">
          {FEATURE_SPOTLIGHTS.map((feature) => (
            <FeatureSpotlightCard key={feature.title} feature={feature} />
          ))}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {SECONDARY_FEATURES.map((feature) => {
            const Icon = feature.icon;

            return (
              <SurfaceCard key={feature.title}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-cyan">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-white">{feature.title}</p>
                    <p className="text-sm leading-6 text-white/60">{feature.description}</p>
                  </div>
                </CardContent>
              </SurfaceCard>
            );
          })}
        </div>

        <div className="mt-8 rounded-[28px] border border-cyan/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(59,130,246,0.12),rgba(255,255,255,0.03))] p-[1px]">
          <div className="rounded-[27px] bg-primary/92 px-6 py-6 sm:px-8">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-lg font-semibold text-white">
                  Want to see how this fits your current workflow?
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-white/60">
                  Book a demo and we will walk through how TaxBook AI handles transaction review,
                  VAT and WHT visibility, filing readiness, and accountant workspace management in
                  one real product flow.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-95"
                >
                  <Link href="/contact">Book Demo</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/signup">Start Free Trial</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="comparison">
        <SectionHeading
          badge="Why teams switch"
          title="TaxBook AI is built for a category most tools do not cover."
          description="Generic accounting tools stop too early. Tax-only tools begin too late. TaxBook AI sits in the operational middle where transaction review, tax visibility, and filing readiness actually need to work together."
          actions={
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/contact">
                Book Demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />

        <div className={cn(PANEL_CLASSNAME, "mt-10 overflow-hidden p-4 sm:p-5")}>
          <div className="grid gap-3 border-b border-white/10 pb-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
            <div className="hidden text-sm font-medium text-white/42 lg:block">What teams need</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-sm font-medium text-white/78">Generic accounting stack</p>
              <p className="mt-1 text-xs leading-5 text-white/42">
                Good for basic books, but usually disconnected from tax operations.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-sm font-medium text-white/78">Tax-only workflow</p>
              <p className="mt-1 text-xs leading-5 text-white/42">
                Useful near filing time, but weak as a day-to-day finance operating layer.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-4">
              <p className="text-sm font-medium text-cyan">TaxBook AI</p>
              <p className="mt-1 text-xs leading-5 text-white/62">
                Built for transaction control, tax visibility, and readiness in one workspace.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {COMPARISON_ROWS.map((row) => (
              <div
                key={row.label}
                className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1fr)]"
              >
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                  <p className="text-sm font-medium text-white">{row.label}</p>
                </div>
                <ComparisonCell value={row.generic} />
                <ComparisonCell value={row.taxOnly} />
                <ComparisonCell value={row.taxbook} highlighted />
              </div>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="audiences">
        <SectionHeading
          badge="Who it is for"
          title="The platform is strong enough for three different buying motions."
          description="SMEs, finance teams, and accounting firms all need different outcomes, but they benefit from the same transaction-first operating model."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;

            return (
              <SurfaceCard key={audience.title}>
                <CardHeader className="space-y-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan/20 bg-cyan/10 text-cyan shadow-glow">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl text-white">{audience.title}</CardTitle>
                    <CardDescription className="leading-6 text-white/60">
                      {audience.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/68">
                  {audience.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-cyan" />
                      <span className="leading-6">{highlight}</span>
                    </div>
                  ))}
                </CardContent>
              </SurfaceCard>
            );
          })}
        </div>
      </SectionShell>

      <SectionShell id="preview">
        <SectionHeading
          badge="Product preview"
          title="A product surface that feels close to the real TaxBook AI app."
          description="The experience should look like a serious SaaS control layer: dense where teams need data, calm where teams need decisions, and grounded in the workflows the product actually runs."
        />

        <div className="mt-10 grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <div className={cn(PANEL_CLASSNAME, "overflow-hidden p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">Overview dashboard</p>
                <p className="text-sm text-white/46">
                  Live visibility across books, tax, alerts, and readiness
                </p>
              </div>
              <Badge className="rounded-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.05]">
                Dashboard
              </Badge>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Total revenue", "NGN 24.8m"],
                    ["Total expenses", "NGN 9.2m"],
                    ["Net profit", "NGN 15.6m"],
                    ["Tax due", "NGN 2.4m"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/34">
                        {label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="size-4 text-cyan" />
                      <p className="text-sm font-medium text-white">Category breakdown</p>
                    </div>
                    <span className="text-xs text-white/38">Month to date</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Operations", "38%", "w-[38%] bg-gradient-primary"],
                      ["Inventory", "26%", "w-[26%] bg-blue/70"],
                      ["Logistics", "18%", "w-[18%] bg-cyan/70"],
                    ].map(([label, value, className]) => (
                      <div key={label}>
                        <div className="mb-2 flex items-center justify-between text-sm text-white/60">
                          <span>{label}</span>
                          <span>{value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10">
                          <div className={cn("h-2 rounded-full", className)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Alert center</p>
                    <Badge className="rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/10">
                      6 active
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Duplicate transaction candidate", "Critical"],
                      ["VAT due rises 14% this month", "Warning"],
                      ["Missing evidence on 5 records", "Warning"],
                    ].map(([title, severity]) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <p className="text-sm font-medium text-white">{title}</p>
                        <p className="mt-1 text-xs text-white/46">{severity}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cn(INNER_PANEL_CLASSNAME, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Assistant insight</p>
                    <MessageSquareMore className="size-4 text-cyan" />
                  </div>
                  <div className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/10 px-4 py-3">
                    <p className="text-sm font-medium text-cyan">
                      Why did expenses increase this month?
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/72">
                      Logistics and inventory purchases drove most of the increase, led by three
                      vendors and two settlement-linked transaction clusters.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <div className={cn(PANEL_CLASSNAME, "p-5")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">Tax center</p>
                  <p className="text-sm text-white/46">Live VAT and WHT payable with drill-down</p>
                </div>
                <Landmark className="size-5 text-cyan" />
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  ["Current VAT due", "NGN 1.24m"],
                  ["Current WHT due", "NGN 680k"],
                  ["Top driver", "Services revenue and vendor withholding"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/34">{label}</p>
                    <p className="mt-2 text-base font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn(PANEL_CLASSNAME, "p-5")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">Accountant workspace</p>
                  <p className="text-sm text-white/46">Client portfolio visibility with status</p>
                </div>
                <Users className="size-5 text-cyan" />
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Greenfield Foods", "Ready to review", "92"],
                  ["Arvo Logistics", "Tax blockers", "64"],
                  ["Nexa Retail", "Receipts pending", "78"],
                ].map(([name, status, score]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{name}</p>
                      <p className="text-xs text-white/44">{status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/32">
                        Score
                      </p>
                      <p className="text-sm font-semibold text-white">{score}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-5">
          <div>
            <p className="text-base font-semibold text-white">
              See the workflow on your own business or client portfolio
            </p>
            <p className="mt-1 text-sm leading-6 text-white/58">
              The fastest way to understand the product is to see your transaction-to-tax workflow
              mapped into the real interface.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-95"
            >
              <Link href="/signup">Start Free Trial</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/contact">Book Demo</Link>
            </Button>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="pricing-teaser">
        <SectionHeading
          badge="Simple pricing path"
          title="Pick the plan shape that matches how your finance work is organized today."
          description="Keep the homepage simple and high-conviction. Users should understand where they fit and move forward quickly."
          actions={
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/pricing">
                View pricing
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {PRICING_TEASERS.map((plan) => (
            <SurfaceCard
              key={plan.name}
              className={cn(
                "relative overflow-hidden",
                plan.highlighted && "border-cyan/20 shadow-[0_24px_100px_rgba(34,211,238,0.16)]"
              )}
            >
              {plan.highlighted ? (
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-primary" />
              ) : null}
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-2xl text-white">{plan.name}</CardTitle>
                  {plan.highlighted ? (
                    <Badge className="rounded-full border border-cyan/20 bg-cyan/10 text-cyan hover:bg-cyan/10">
                      Most popular
                    </Badge>
                  ) : null}
                </div>
                <CardDescription className="leading-6 text-white/60">
                  {plan.description}
                </CardDescription>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/74">
                  {plan.positioning}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-cyan" />
                    <span className="text-sm leading-6 text-white/70">{bullet}</span>
                  </div>
                ))}
                <div className="pt-3">
                  <Button
                    asChild
                    className={cn(
                      "w-full border-0 text-white transition hover:opacity-95",
                      plan.highlighted
                        ? "bg-gradient-primary shadow-glow"
                        : "bg-white/10 hover:bg-white/14"
                    )}
                  >
                    <Link href={plan.highlighted ? "/signup" : "/pricing"}>
                      {plan.highlighted ? "Start Free Trial" : "View Pricing"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </SurfaceCard>
          ))}
        </div>
      </SectionShell>

      <SectionShell className="pb-20 pt-8 sm:pt-10">
        <div className={cn(PANEL_CLASSNAME, "overflow-hidden p-8 sm:p-10")}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-5">
              <Badge className="rounded-full border border-cyan/20 bg-cyan/10 px-4 py-1.5 text-cyan hover:bg-cyan/10">
                Ready to upgrade the way finance work gets done?
              </Badge>
              <div className="space-y-3">
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
                  Build a cleaner path from transactions to tax readiness with TaxBook AI.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
                  Move beyond basic bookkeeping and give your team or firm one platform for review
                  control, live tax visibility, filing readiness, and accountant-grade workspace
                  management.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-white/48">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="size-4 text-cyan" />
                  Faster month-end execution
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4 text-cyan" />
                  Stronger control and traceability
                </span>
                <span className="inline-flex items-center gap-2">
                  <ChevronRight className="size-4 text-cyan" />
                  Clearer next step into trial or demo
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <MarketingCTAGroup
                compact
                showLogin={false}
                showViewPricing={false}
                tone="inverse"
              />
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/20 bg-white/6 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </SectionShell>
    </MarketingShell>
  );
}
