"use client";

import Link from "next/link";
import { useState } from "react";
import type { SubscriptionPlan } from "@prisma/client";
import { Button } from "@/components/ui/button";

type ButtonVariant = "default" | "outline" | "secondary";
type BillingInterval = "MONTHLY" | "ANNUAL";

type SubscriptionActionButtonProps = {
  plan: SubscriptionPlan;
  planName: string;
  currentPlan: SubscriptionPlan | null;
  loggedIn: boolean;
  hasActiveWorkspace: boolean;
  billingInterval?: BillingInterval;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string;
};

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  GROWTH: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function isPlanIncluded(currentPlan: SubscriptionPlan | null, plan: SubscriptionPlan) {
  if (!currentPlan) return false;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[plan];
}

function buildLabel(input: {
  plan: SubscriptionPlan;
  planName: string;
  currentPlan: SubscriptionPlan | null;
  loggedIn: boolean;
  hasActiveWorkspace: boolean;
  loading: boolean;
}) {
  if (
    input.currentPlan &&
    PLAN_RANK[input.currentPlan] > PLAN_RANK[input.plan]
  ) {
    return "Included already";
  }
  if (input.currentPlan === input.plan) return "Current plan";
  if (input.loading) return "Redirecting...";
  if (input.plan === "ENTERPRISE") return "Contact Sales";
  if (input.plan === "STARTER") return "Start Free";
  if (!input.loggedIn) return `Get ${input.planName}`;
  if (!input.hasActiveWorkspace) return "Create workspace";
  return `Upgrade to ${input.planName}`;
}

function getHref(input: {
  plan: SubscriptionPlan;
  currentPlan: SubscriptionPlan | null;
  loggedIn: boolean;
  hasActiveWorkspace: boolean;
}) {
  if (isPlanIncluded(input.currentPlan, input.plan)) return null;
  if (input.currentPlan === input.plan) return null;
  if (input.plan === "ENTERPRISE") return "/contact";
  if (!input.loggedIn) return "/signup";
  if (!input.hasActiveWorkspace) return "/dashboard/workspaces";
  if (input.plan === "STARTER") return "/dashboard/billing";
  return null;
}

export function SubscriptionActionButton({
  plan,
  planName,
  currentPlan,
  loggedIn,
  hasActiveWorkspace,
  billingInterval = "MONTHLY",
  disabled = false,
  variant = "default",
  className,
}: SubscriptionActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = getHref({
    plan,
    currentPlan,
    loggedIn,
    hasActiveWorkspace,
  });

  const label = buildLabel({
    plan,
    planName,
    currentPlan,
    loggedIn,
    hasActiveWorkspace,
    loading,
  });
  const planIncluded = isPlanIncluded(currentPlan, plan);

  async function handleCheckout() {
    if (disabled || loading || planIncluded) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: billingInterval }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to start checkout");
        return;
      }
      if (!data?.url) {
        setError("Checkout URL missing");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Network error starting checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {href ? (
        <Button asChild variant={variant} className={className}>
          <Link href={href}>{label}</Link>
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleCheckout}
          disabled={disabled || loading || planIncluded}
          variant={planIncluded ? "secondary" : variant}
          className={className}
        >
          {label}
        </Button>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
