import {
  Card,
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
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export default async function BusinessSettingsPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Business settings</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No active workspace selected</CardTitle>
            <CardDescription>
              Select a workspace before editing its business profile.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
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
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Business settings</h1>
        <p className="text-muted-foreground">
          Edit the business profile attached to the active workspace.
        </p>
      </div>

      <BusinessProfileForm
        initialValues={initialValues}
        mode="settings"
        workspaceLabel={membership.workspace.name}
      />
    </section>
  );
}
