import Link from "next/link";
import type { SubscriptionPlan } from "@prisma/client";
import { CheckCircle2 } from "lucide-react";
import {
  formatAiScanLimit,
  formatAnnualSavings,
  formatLimit,
  formatPlanPricePerInterval,
  getPaystackPlanCode,
  getPlanConfig,
  PLAN_ORDER,
  type BillingInterval,
} from "@/lib/billing";
import { SubscriptionActionButton } from "@/components/billing/subscription-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const planFit: Record<(typeof PLAN_ORDER)[number], string> = {
  STARTER: "Small Nigerian businesses validating their bookkeeping workflow before paying for automation.",
  GROWTH: "Startups and lean finance teams that want AI capture without moving into advanced controls yet.",
  PROFESSIONAL: "Accounting firms and finance operators managing multiple businesses with reconciliation and review needs.",
  ENTERPRISE: "Larger firms that need unlimited scale, integrations, and priority operational support.",
};

const planHighlights: Record<(typeof PLAN_ORDER)[number], string[]> = {
  STARTER: [
    "Manual bookkeeping, VAT summary, and core reports",
    "One business and one user to get started cleanly",
    "Best for testing the workflow before automation",
  ],
  GROWTH: [
    "Everything in Starter",
    "AI receipt scanning and bookkeeping automation",
    "Invoice management plus more businesses and AI volume",
  ],
  PROFESSIONAL: [
    "Everything in Growth",
    "Bank statement AI reconciliation and advanced reporting",
    "Tax filing assistant, audit logs, and team collaboration",
  ],
  ENTERPRISE: [
    "Everything in Professional",
    "Unlimited businesses, users, and AI scans",
    "API integrations, tax automation, and priority support",
  ],
};

type PricingGridProps = {
  compact?: boolean;
  interactive?: boolean;
  currentPlan?: SubscriptionPlan | null;
  loggedIn?: boolean;
  hasActiveWorkspace?: boolean;
  interval?: BillingInterval;
};

export function PricingGrid({
  compact = false,
  interactive = false,
  currentPlan = null,
  loggedIn = false,
  hasActiveWorkspace = false,
  interval = "MONTHLY",
}: PricingGridProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {PLAN_ORDER.map((plan) => {
        const config = getPlanConfig(plan);
        const savings = formatAnnualSavings(plan);
        const isFeatured = config.featured === true;
        const isConfigured =
          plan === "STARTER" || plan === "ENTERPRISE"
            ? true
            : Boolean(getPaystackPlanCode(plan, interval));

        return (
          <Card
            key={plan}
            className={
              isFeatured
                ? "overflow-hidden border-cyan/30 bg-primary/60 shadow-glow backdrop-blur-2xl"
                : "overflow-hidden border-white/10 bg-primary/45 shadow-[0_28px_100px_rgba(11,15,26,0.42)] backdrop-blur-2xl"
            }
          >
            <div className={isFeatured ? "h-1.5 bg-gradient-primary" : "h-px bg-white/10"} />
            <CardHeader className={compact ? "space-y-3" : undefined}>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-white">{config.name}</CardTitle>
                {isFeatured ? (
                  <Badge className="rounded-full border border-cyan/20 bg-cyan/10 text-cyan hover:bg-cyan/10">
                    Recommended
                  </Badge>
                ) : null}
              </div>
              <CardDescription className="text-white/60">{config.description}</CardDescription>
            </CardHeader>
            <CardContent className={compact ? "space-y-4" : "space-y-5"}>
              <div>
                <p className="text-sm text-white/55">
                  {interval === "ANNUAL" ? "Annual subscription" : "Monthly subscription"}
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {formatPlanPricePerInterval(plan, interval)}
                </p>
                {interval === "ANNUAL" && savings ? (
                  <p className="mt-2 text-xs text-emerald-300">Save {savings} per year</p>
                ) : null}
              </div>

              <p className="text-sm leading-6 text-white/65">{planFit[plan]}</p>
              <p className="text-xs uppercase tracking-wide text-white/45">
                Best for: {config.target}
              </p>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Businesses</span>
                  <span className="font-medium text-white">{formatLimit(config.maxBusinesses)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Users</span>
                  <span className="font-medium text-white">{formatLimit(config.maxUsers)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">AI scans / month</span>
                  <span className="font-medium text-white">
                    {formatAiScanLimit(config.aiScansPerMonth)}
                  </span>
                </div>
              </div>

              {!compact ? (
                <div className="space-y-2 text-sm text-white/65">
                  {planHighlights[plan].map((capability) => (
                    <div key={capability} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 text-cyan" />
                      <span>{capability}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {interactive ? (
                <div className="space-y-2">
                  <SubscriptionActionButton
                    plan={plan}
                    planName={config.name}
                    currentPlan={currentPlan}
                    loggedIn={loggedIn}
                    hasActiveWorkspace={hasActiveWorkspace}
                    billingInterval={interval}
                    disabled={!isConfigured}
                    variant={isFeatured ? "default" : "outline"}
                    className={
                      isFeatured
                        ? "w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                        : "w-full border-white/15 bg-primary/40 text-white hover:bg-primary/55 hover:text-white"
                    }
                  />
                  {!isConfigured ? (
                    <p className="text-xs text-white/45">
                      Checkout is unavailable in this environment. Contact us if you need help
                      activating this plan.
                    </p>
                  ) : null}
                </div>
              ) : plan === "STARTER" ? (
                <Button
                  asChild
                  className={
                    isFeatured
                      ? "w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                      : "w-full border-white/15 bg-primary/40 text-white hover:bg-primary/55 hover:text-white"
                  }
                  variant={isFeatured ? "default" : "outline"}
                >
                  <Link href="/signup">Start Free</Link>
                </Button>
              ) : plan === "ENTERPRISE" ? (
                <Button
                  asChild
                  className={
                    isFeatured
                      ? "w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                      : "w-full border-white/15 bg-primary/40 text-white hover:bg-primary/55 hover:text-white"
                  }
                  variant={isFeatured ? "default" : "outline"}
                >
                  <Link href="/contact">Contact Sales</Link>
                </Button>
              ) : (
                <Button
                  asChild
                  className={
                    isFeatured
                      ? "w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                      : "w-full border-white/15 bg-primary/40 text-white hover:bg-primary/55 hover:text-white"
                  }
                  variant={isFeatured ? "default" : "outline"}
                >
                  <Link href="/pricing">View plan</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
