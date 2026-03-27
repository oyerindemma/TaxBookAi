import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getWorkspaceClientDetail } from "@/lib/clients";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";
import ClientDetailActions from "./_components/ClientDetailActions";

type PageProps = {
  params: Promise<{ id?: string }>;
};

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatAmount(amountKobo: number) {
  return `NGN ${(amountKobo / 100).toFixed(2)}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString();
}

function invoiceStatusVariant(status: string) {
  switch (status) {
    case "PAID":
      return "secondary" as const;
    case "OVERDUE":
      return "destructive" as const;
    case "SENT":
      return "outline" as const;
    default:
      return "default" as const;
  }
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const clientId = parseId(id);
  if (!clientId) {
    notFound();
  }

  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Client detail</h1>
          <p className="text-muted-foreground">No workspace assigned.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Select a workspace</CardTitle>
            <CardDescription>Switch to a workspace to review client records.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const client = await getWorkspaceClientDetail(membership.workspaceId, clientId);
  if (!client) {
    notFound();
  }

  const showContactName =
    client.companyName &&
    client.name.trim() &&
    client.name.trim() !== client.companyName.trim();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{client.displayName}</h1>
            <p className="text-muted-foreground">
              Workspace:{" "}
              <span className="font-medium text-foreground">
                {membership.workspace.name}
              </span>
            </p>
            <p className="text-muted-foreground">{client.email}</p>
          </div>
          <Badge variant="secondary">Client record</Badge>
        </div>

        <ClientDetailActions role={membership.role} client={client} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total billed</CardDescription>
            <CardTitle className="text-xl">{formatAmount(client.totalBilled)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total paid</CardDescription>
            <CardTitle className="text-xl">{formatAmount(client.totalPaid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
            <CardTitle className="text-xl">
              {formatAmount(client.outstandingBalance)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoice count</CardDescription>
            <CardTitle className="text-xl">{client.invoiceCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Invoice history</CardTitle>
            <CardDescription>Invoices and balances for this client.</CardDescription>
          </CardHeader>
          <CardContent>
            {client.invoices.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No invoices have been created for this client yet.
                </p>
                <Button asChild size="sm">
                  <Link href="/dashboard/invoices/new">Create first invoice</Link>
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="pb-3 font-medium">Invoice</th>
                    <th className="pb-3 font-medium">Issue</th>
                    <th className="pb-3 font-medium">Due</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Total</th>
                    <th className="pb-3 font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {client.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-b-0">
                      <td className="py-3">
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="py-3">{formatDate(invoice.issueDate)}</td>
                      <td className="py-3">{formatDate(invoice.dueDate)}</td>
                      <td className="py-3">
                        <Badge variant={invoiceStatusVariant(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="py-3">{formatAmount(invoice.totalAmount)}</td>
                      <td className="py-3">
                        {formatAmount(
                          invoice.status === "PAID" ? 0 : invoice.totalAmount
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client profile</CardTitle>
              <CardDescription>Business and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Display name</p>
                <p className="font-medium">{client.displayName}</p>
              </div>
              {showContactName && (
                <div>
                  <p className="text-muted-foreground">Primary contact</p>
                  <p className="font-medium">{client.name}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{client.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{client.phone ?? "Not provided"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Address</p>
                <p className="font-medium whitespace-pre-line">
                  {client.address ?? "Not provided"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tax ID</p>
                <p className="font-medium">{client.taxId ?? "Not provided"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Internal bookkeeping or billing context.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {client.notes ?? "No notes added."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
