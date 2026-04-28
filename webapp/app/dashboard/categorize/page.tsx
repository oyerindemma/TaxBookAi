import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function transactionDirectionLabel(type: "CREDIT" | "DEBIT") {
  return type === "CREDIT" ? "Money In" : "Money Out";
}

export default async function CategorizeWorkflowPage() {
  const user = await requireUser();
  const membership = await getActiveWorkspaceMembership(user.id);

  if (!membership) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Categorize</h1>
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>Select a workspace before categorizing transactions.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId: membership.workspaceId,
      categoryId: null,
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      currency: true,
      type: true,
      suggestedCategoryName: true,
    },
  });

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Categorize</h1>
        <p className="text-muted-foreground">
          Assign business categories after transactions have been imported and reviewed.
        </p>
      </div>

      {transactions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No transactions need categories</CardTitle>
            <CardDescription>
              Import new transactions or calculate tax from the dashboard when you are ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/import">Import transactions</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Needs a category</CardTitle>
            <CardDescription>
              Open review to assign or approve a category for each transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Date</th>
                    <th className="py-3 pr-4 font-medium">Description</th>
                    <th className="py-3 pr-4 font-medium">Type</th>
                    <th className="py-3 pr-4 font-medium">Amount</th>
                    <th className="py-3 font-medium">Suggestion</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="py-3 pr-4">
                        {transaction.transactionDate.toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">{transaction.description}</td>
                      <td className="py-3 pr-4">{transactionDirectionLabel(transaction.type)}</td>
                      <td className="py-3 pr-4">
                        {formatMoney(transaction.amount, transaction.currency)}
                      </td>
                      <td className="py-3">
                        {transaction.suggestedCategoryName ?? "No suggestion yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Button asChild>
                <Link href="/dashboard/review">Open review</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
