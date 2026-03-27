"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export default function BankingClient({ role }: { role: Role }) {
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Banking</h1>
        <p className="text-muted-foreground">
          The banking workspace now opens inside the dedicated reconciliation module.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bank Statement Reconciliation</CardTitle>
          <CardDescription>
            Upload statement CSVs, map columns, review AI suggestions, approve matches, and
            post reconciled entries into the ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/banking/reconcile">Open reconciliation module</Link>
          </Button>
          {!canEdit ? (
            <p className="text-sm text-muted-foreground">You currently have view-only access.</p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
