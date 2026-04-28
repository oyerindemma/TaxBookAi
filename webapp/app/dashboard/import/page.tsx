import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

const importOptions = [
  {
    id: "bank-statement",
    title: "Import bank statement",
    description: "Upload CSV bank transactions for review and categorization.",
    href: "/dashboard/banking/reconcile",
    icon: Upload,
  },
  {
    id: "tax-records",
    title: "Import tax records",
    description: "Upload prepared tax records from a spreadsheet.",
    href: "/dashboard/tax-records/import",
    icon: FileText,
  },
] as const;

export default async function ImportWorkflowPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Import</h1>
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>Select a workspace before importing transactions.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Import</h1>
        <p className="text-muted-foreground">
          Bring transactions into TaxBook before review and categorization.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {importOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card key={option.id}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{option.title}</CardTitle>
                <CardDescription>{option.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={option.href}>Open importer</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
