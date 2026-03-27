import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BusinessProfileForm from "@/components/business/business-profile-form";
import {
  createBusinessProfileDefaults,
  DEFAULT_BUSINESS_CURRENCY,
} from "@/lib/business-profile";
import { requireUser } from "@/lib/auth";
import {
  getActiveWorkspaceMembership,
  isWorkspaceOnboardingComplete,
} from "@/lib/workspaces";

export default async function OnboardingPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="secondary" className="w-fit rounded-full px-4 py-1.5">
              Onboarding
            </Badge>
            <CardTitle className="text-2xl">No active workspace selected</CardTitle>
            <CardDescription>
              Create or switch to a workspace before completing business onboarding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/workspaces">Open workspaces</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (isWorkspaceOnboardingComplete(membership)) {
    redirect("/dashboard");
  }

  const initialValues = createBusinessProfileDefaults({
    businessName: membership.workspace.businessProfile?.businessName ?? membership.workspace.name,
    businessType: membership.workspace.businessProfile?.businessType ?? "",
    industry: membership.workspace.businessProfile?.industry ?? "",
    country: membership.workspace.businessProfile?.country ?? "Nigeria",
    state: membership.workspace.businessProfile?.state ?? "",
    taxIdentificationNumber:
      membership.workspace.businessProfile?.taxIdentificationNumber ?? "",
    defaultCurrency:
      membership.workspace.businessProfile?.defaultCurrency ?? DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth: String(
      membership.workspace.businessProfile?.fiscalYearStartMonth ?? 1
    ),
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(57,118,88,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(212,168,84,0.14),transparent_24%),linear-gradient(180deg,#f8f4ea_0%,#f8fbf8_48%,#f3f7fb_100%)] px-6 py-16">
      <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
        <div className="space-y-5">
          <Badge variant="secondary" className="rounded-full px-4 py-1.5">
            Workspace onboarding
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance">
            Finish setting up your business before entering TaxBook.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            TaxBook uses this profile to label the workspace, prepare tax defaults, and keep
            future multi-business support scoped to the active workspace instead of your user
            account.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border/60 bg-white/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardDescription>Workspace scope</CardDescription>
                <CardTitle className="text-lg">Saved per workspace</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/60 bg-white/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardDescription>Tax defaults</CardDescription>
                <CardTitle className="text-lg">NGN and fiscal year ready</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        <BusinessProfileForm
          initialValues={initialValues}
          mode="onboarding"
          workspaceLabel={membership.workspace.name}
        />
      </section>
    </main>
  );
}
