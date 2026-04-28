import Link from "next/link";
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
import { canManageWorkspace } from "@/lib/workspaces";
import {
  adminEmail,
  adminEmailHref,
  billingEmail,
  billingEmailHref,
  phoneHref,
  phoneNumber,
  supportEmail,
  supportEmailHref,
} from "@/lib/config/contact";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ComplianceToolsCard from "./_components/ComplianceToolsCard";

const SETTINGS_LINKS = [
  {
    href: "/dashboard/settings/business",
    title: "Business settings",
    description: "Manage the business profile attached to the active workspace.",
  },
  {
    href: "/dashboard/settings/categories",
    title: "Categories",
    description: "Review category structure and mapping defaults for transactions.",
  },
  {
    href: "/dashboard/settings/payments",
    title: "Payments and tax integration",
    description: "Configure payment ingestion and tax-related settlement sync.",
  },
  {
    href: "/dashboard/settings/whatsapp",
    title: "WhatsApp receipt capture",
    description: "Set up receipt forwarding and capture preferences for the workspace.",
  },
] as const;

const SUPPORT_CONTACTS = [
  {
    label: "Technical Support",
    value: supportEmail,
    href: supportEmailHref,
    description: "Product help, import issues, and workflow support.",
  },
  {
    label: "Billing Support",
    value: billingEmail,
    href: billingEmailHref,
    description: "Plan questions, invoicing help, and subscription changes.",
  },
  {
    label: "Administration",
    value: adminEmail,
    href: adminEmailHref,
    description: "Compliance, partnership, and administrative requests.",
  },
] as const;

function SupportSection() {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <Badge variant="secondary" className="w-fit rounded-full">
          Support
        </Badge>
        <div className="space-y-1">
          <CardTitle>Need help with TaxBook AI?</CardTitle>
          <CardDescription>
            Reach the right team directly from one place. All contacts are safe to use on mobile
            and desktop.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SUPPORT_CONTACTS.map((contact) => (
          <div key={contact.label} className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">{contact.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{contact.description}</p>
            <Button asChild variant="link" className="mt-3 h-auto px-0 text-left">
              <a href={contact.href}>{contact.value}</a>
            </Button>
          </div>
        ))}
        <div className="rounded-2xl border bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">Phone</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Call for urgent rollout and support coordination.
          </p>
          <Button asChild variant="link" className="mt-3 h-auto px-0 text-left">
            <a href={phoneHref}>{phoneNumber}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Manage workspace configuration and know exactly where to reach TaxBook AI support.
        </p>
      </div>

      {membership ? (
        <Card>
          <CardHeader>
            <CardTitle>{membership.workspace.name}</CardTitle>
            <CardDescription>
              Workspace-scoped configuration for your active environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {SETTINGS_LINKS.map((item) => (
              <div key={item.href} className="rounded-2xl border bg-background p-4">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={item.href}>Open</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No active workspace selected</CardTitle>
            <CardDescription>
              Select a workspace to edit settings. Support contacts are still available below if
              you need help getting set up.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <SupportSection />
      <ComplianceToolsCard
        workspaceId={membership?.workspaceId ?? null}
        workspaceName={membership?.workspace.name ?? null}
        workspaceRole={membership?.role ?? null}
        canArchiveWorkspace={membership ? canManageWorkspace(membership.role) : false}
      />
    </section>
  );
}
