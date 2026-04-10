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
import { requireUser } from "@/lib/auth";
import NigerianOnboardingClient from "@/app/onboarding/_components/NigerianOnboardingClient";
import { buildWorkspaceOnboardingSnapshot } from "@/lib/workspace-onboarding";
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

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="secondary" className="w-fit rounded-full px-4 py-1.5">
              Workspace onboarding
            </Badge>
            <CardTitle className="text-2xl">An admin needs to finish this setup</CardTitle>
            <CardDescription>
              This workspace is not ready yet. Ask the owner or an admin to complete the
              Nigerian onboarding questions so the dashboard can open cleanly.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/workspaces">Open workspaces</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/team">View team</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const initialOnboarding = buildWorkspaceOnboardingSnapshot({
    workspaceName: membership.workspace.name,
    onboarding: membership.workspace.onboardingProfile,
    businessProfile: membership.workspace.businessProfile,
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(57,118,88,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(212,168,84,0.14),transparent_24%),linear-gradient(180deg,#f8f4ea_0%,#f8fbf8_48%,#f3f7fb_100%)] px-6 py-16">
      <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
        <div className="space-y-5">
          <Badge variant="secondary" className="rounded-full px-4 py-1.5">
            Nigerian onboarding
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance">
            Set up your Nigerian workspace once, then let TaxBook carry the defaults.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            We keep this setup short and simple. Your answers help TaxBook decide which
            modules show up first, what tax guidance to surface early, and the next steps
            that make sense for your business.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-border/60 bg-white/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardDescription>Saved per workspace</CardDescription>
                <CardTitle className="text-lg">Resume anytime</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/60 bg-white/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardDescription>Nigeria-first</CardDescription>
                <CardTitle className="text-lg">NGN, VAT, and WHT ready</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/60 bg-white/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardDescription>Dashboard defaults</CardDescription>
                <CardTitle className="text-lg">Tools ordered for your role</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        <NigerianOnboardingClient
          initialOnboarding={initialOnboarding}
          workspaceLabel={membership.workspace.name}
        />
      </section>
    </main>
  );
}
