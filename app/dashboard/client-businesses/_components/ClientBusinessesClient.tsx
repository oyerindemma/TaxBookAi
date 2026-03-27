"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ClientBusiness = {
  id: number;
  name: string;
  legalName: string | null;
  industry: string | null;
  country: string;
  state: string | null;
  taxIdentificationNumber: string | null;
  vatRegistrationNumber: string | null;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  vendorCount: number;
  categoryCount: number;
  transactionCount: number;
  uploadCount: number;
};

type Props = {
  role: Role;
  workspaceName: string;
  initialBusinesses: ClientBusiness[];
  quickLinks: {
    reviewHref: string;
    taxSummaryHref: string;
  };
};

type FormState = {
  name: string;
  legalName: string;
  industry: string;
  country: string;
  state: string;
  taxIdentificationNumber: string;
  vatRegistrationNumber: string;
  defaultCurrency: string;
  fiscalYearStartMonth: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  legalName: "",
  industry: "",
  country: "Nigeria",
  state: "",
  taxIdentificationNumber: "",
  vatRegistrationNumber: "",
  defaultCurrency: "NGN",
  fiscalYearStartMonth: "1",
  notes: "",
};

function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function sortBusinesses(businesses: ClientBusiness[]) {
  return [...businesses].sort((left, right) => {
    if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) {
      return left.archivedAt ? 1 : -1;
    }
    return left.name.localeCompare(right.name);
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function monthLabel(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" });
}

function statusVariant(status: ClientBusiness["status"]) {
  return status === "ARCHIVED" ? "outline" : "secondary";
}

export default function ClientBusinessesClient({
  role,
  workspaceName,
  initialBusinesses,
  quickLinks,
}: Props) {
  const editable = canEdit(role);
  const [businesses, setBusinesses] = useState(() => sortBusinesses(initialBusinesses));
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeBusinesses = businesses.filter((business) => !business.archivedAt);
  const transactionCount = businesses.reduce(
    (total, business) => total + business.transactionCount,
    0
  );
  const uploadCount = businesses.reduce((total, business) => total + business.uploadCount, 0);
  const categoryCount = businesses.reduce(
    (total, business) => total + business.categoryCount,
    0
  );

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editable || saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/client-businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Unable to create client business.");
        return;
      }

      setBusinesses((current) =>
        sortBusinesses([data.clientBusiness as ClientBusiness, ...current])
      );
      setForm(EMPTY_FORM);
      setMessage("Client business created. Default categories were seeded automatically.");
    } catch {
      setError("Network error creating client business.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Client businesses</h1>
          <p className="text-muted-foreground">
            Manage the accounting portfolio inside{" "}
            <span className="font-medium text-foreground">{workspaceName}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Each client business keeps separate categories, vendors, transactions, and AI
            review queues.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={quickLinks.reviewHref}>Open review queue</Link>
          </Button>
          <Button asChild>
            <Link href={quickLinks.taxSummaryHref}>View tax summary</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active businesses</CardDescription>
            <CardTitle className="text-xl">{activeBusinesses.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ledger transactions</CardDescription>
            <CardTitle className="text-xl">{transactionCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upload queue items</CardDescription>
            <CardTitle className="text-xl">{uploadCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seeded categories</CardDescription>
            <CardTitle className="text-xl">{categoryCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create client business</CardTitle>
          <CardDescription>
            Capture the minimum profile needed for multi-entity bookkeeping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Business name</Label>
                <Input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Acme Retail Ltd"
                  disabled={!editable || saving}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="legalName">Legal name</Label>
                <Input
                  id="legalName"
                  name="legalName"
                  value={form.legalName}
                  onChange={handleChange}
                  placeholder="Acme Retail Limited"
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  name="industry"
                  value={form.industry}
                  onChange={handleChange}
                  placeholder="Retail"
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="Lagos"
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="defaultCurrency">Default currency</Label>
                <select
                  id="defaultCurrency"
                  name="defaultCurrency"
                  value={form.defaultCurrency}
                  onChange={handleChange}
                  disabled={!editable || saving}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxIdentificationNumber">TIN</Label>
                <Input
                  id="taxIdentificationNumber"
                  name="taxIdentificationNumber"
                  value={form.taxIdentificationNumber}
                  onChange={handleChange}
                  placeholder="12345678-0001"
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vatRegistrationNumber">VAT registration</Label>
                <Input
                  id="vatRegistrationNumber"
                  name="vatRegistrationNumber"
                  value={form.vatRegistrationNumber}
                  onChange={handleChange}
                  placeholder="VAT-001"
                  disabled={!editable || saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fiscalYearStartMonth">Fiscal year start month</Label>
                <select
                  id="fiscalYearStartMonth"
                  name="fiscalYearStartMonth"
                  value={form.fiscalYearStartMonth}
                  onChange={handleChange}
                  disabled={!editable || saving}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Array.from({ length: 12 }, (_value, index) => {
                    const month = index + 1;
                    return (
                      <option key={month} value={String(month)}>
                        {monthLabel(month)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                disabled={!editable || saving}
                rows={4}
                placeholder="Internal onboarding notes, filing cadence, or reviewer context."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Default transaction categories are created automatically for each new client
                business.
              </p>
              <Button type="submit" disabled={!editable || saving}>
                {saving ? "Creating..." : "Create client business"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
          <CardDescription>
            Active and archived businesses managed by this accounting workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {businesses.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              No client businesses yet. Create your first business to start tracking uploads,
              draft reviews, and VAT/WHT summaries.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {businesses.map((business) => (
                <div key={business.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">{business.name}</h2>
                        <Badge variant={statusVariant(business.status)}>{business.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {business.legalName ?? "No legal name added"}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{business.defaultCurrency}</div>
                      <div>FY starts {monthLabel(business.fiscalYearStartMonth)}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Location
                      </div>
                      <div className="font-medium">
                        {[business.state, business.country].filter(Boolean).join(", ") || "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Tax profile
                      </div>
                      <div className="font-medium">
                        {business.taxIdentificationNumber ?? "TIN pending"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        VAT: {business.vatRegistrationNumber ?? "Pending"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Bookkeeping setup
                      </div>
                      <div className="font-medium">
                        {business.categoryCount} categories, {business.vendorCount} vendors
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Activity
                      </div>
                      <div className="font-medium">
                        {business.transactionCount} transactions, {business.uploadCount} uploads
                      </div>
                    </div>
                  </div>

                  {business.notes ? (
                    <p className="mt-4 text-sm text-muted-foreground">{business.notes}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Created {formatDate(business.createdAt)}</span>
                    <span>Updated {formatDate(business.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
