import Link from "next/link";
import type { SubscriptionPlan } from "@prisma/client";
import type { PlanFeature } from "@/lib/billing";
import {
  formatAiScanLimit,
  formatPlanPricePerMonth,
  formatPlanPricePerYear,
  getFeatureConfig,
  getPlanConfig,
} from "@/lib/billing";
import { SubscriptionActionButton } from "@/components/billing/subscription-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FeatureGateCardProps = {
  feature: PlanFeature;
  currentPlan: SubscriptionPlan;
  requiredPlan: SubscriptionPlan;
  note?: string;
};

export function FeatureGateCard({
  feature,
  currentPlan,
  requiredPlan,
  note,
}: FeatureGateCardProps) {
  const featureConfig = getFeatureConfig(feature);
  const currentPlanConfig = getPlanConfig(currentPlan);
  const requiredPlanConfig = getPlanConfig(requiredPlan);

  return (
    <Card className="border-border/60 bg-white/85">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Upgrade required</Badge>
          <Badge variant="outline">Current: {currentPlanConfig.name}</Badge>
          <Badge variant="outline">Required: {requiredPlanConfig.name}</Badge>
        </div>
        <CardTitle>{featureConfig.name} is not available on this workspace plan.</CardTitle>
        <CardDescription className="max-w-3xl leading-6">
          {featureConfig.description} Upgrade to {requiredPlanConfig.name} for{" "}
          {formatPlanPricePerMonth(requiredPlan)} or {formatPlanPricePerYear(requiredPlan)} to unlock
          it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Businesses</div>
            <div className="mt-1 text-lg font-semibold">
              {requiredPlanConfig.maxBusinesses === null
                ? "Unlimited"
                : `Up to ${requiredPlanConfig.maxBusinesses.toLocaleString()}`}
            </div>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Users</div>
            <div className="mt-1 text-lg font-semibold">
              {requiredPlanConfig.maxUsers === null
                ? "Unlimited"
                : `Up to ${requiredPlanConfig.maxUsers.toLocaleString()}`}
            </div>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">AI scans</div>
            <div className="mt-1 text-lg font-semibold">
              {formatAiScanLimit(requiredPlanConfig.aiScansPerMonth)}
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {requiredPlanConfig.includes.slice(0, 4).map((item) => (
            <p key={item}>{item}</p>
          ))}
          {note ? <p className="text-foreground">{note}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <SubscriptionActionButton
            plan={requiredPlan}
            planName={requiredPlanConfig.name}
            currentPlan={currentPlan}
            loggedIn
            hasActiveWorkspace
            billingInterval="MONTHLY"
          />
          <Button asChild variant="outline">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
