"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AccountantWorkspacePortfolioResponse,
  ClientBusinessPortfolioSummary,
} from "@/lib/accountant-workspace-types";

type Props = {
  initialPortfolio: AccountantWorkspacePortfolioResponse;
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

type SortValue = "exposure" | "activity" | "name";
type StatusFilterValue = "ALL" | "ACTIVE" | "ARCHIVED";

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

function sortBusinesses(
  businesses: ClientBusinessPortfolioSummary[],
  sortValue: SortValue
) {
  return [...businesses].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "ACTIVE" ? -1 : 1;
    }

    if (sortValue === "name") {
      return left.name.localeCompare(right.name);
    }

    if (sortValue === "activity") {
      const rightTime = new Date(right.lastActivityAt ?? 0).getTime();
      const leftTime = new Date(left.lastActivityAt ?? 0).getTime();
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
    }

    if (sortValue === "exposure") {
      if (right.taxExposure.estimatedTaxExposureMinor !== left.taxExposure.estimatedTaxExposureMinor) {
        return right.taxExposure.estimatedTaxExposureMinor - left.taxExposure.estimatedTaxExposureMinor;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

function formatDate(value: string | null) {
  if (!value) return "No activity yet";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatCompactCurrency(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

function monthLabel(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" });
}

function statusVariant(status: ClientBusinessPortfolioSummary["status"]) {
  return status === "ARCHIVED" ? "outline" : "secondary";
}

function activityTypeLabel(item: ClientBusinessPortfolioSummary) {
  switch (item.lastActivityType) {
    case "TRANSACTION":
      return "Transaction activity";
    case "UPLOAD":
      return "Upload activity";
    default:
      return "Profile activity";
  }
}

function buildBusinessFilters(
  businesses: ClientBusinessPortfolioSummary[],
  query: string,
  statusFilter: StatusFilterValue,
  sortValue: SortValue
) {
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = businesses.filter((business) => {
    if (statusFilter !== "ALL" && business.status !== statusFilter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      business.name,
      business.legalName,
      business.industry,
      business.country,
      business.state,
      business.taxIdentificationNumber,
      business.vatRegistrationNumber,
      business.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  return sortBusinesses(filtered, sortValue);
}

export default function ClientBusinessesClient({
  initialPortfolio,
  quickLinks,
}: Props) {
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [sortValue, setSortValue] = useState<SortValue>("exposure");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const editable = portfolio.access.canCreateClientBusinesses;
  const filteredBusinesses = useMemo(
    () =>
      buildBusinessFilters(
        portfolio.clientBusinesses,
        query,
        statusFilter,
        sortValue
      ),
    [portfolio.clientBusinesses, query, sortValue, statusFilter]
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

      if (!data?.clientBusiness) {
        setError("Client business was created, but the refreshed summary was unavailable.");
        return;
      }

      setPortfolio((current) => ({
        workspace: data.workspace ?? current.workspace,
        access: data.access ?? current.access,
        clientBusinesses: sortBusinesses(
          [
            data.clientBusiness as ClientBusinessPortfolioSummary,
            ...current.clientBusinesses.filter(
              (business) => business.id !== data.clientBusiness.id
            ),
          ],
          sortValue
        ),
      }));
      setForm(EMPTY_FORM);
      setMessage("Client business created. Portfolio summaries refreshed.");
    } catch {
      setError("Network error creating client business.");
    } finally {
      setSaving(false);
    }
  }

  const workspaceSummary = portfolio.workspace;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Client businesses</h1>
            <Badge variant="secondary">{workspaceSummary.workspaceKind}</Badge>
            {portfolio.access.isReadOnly ? <Badge variant="outline">Read-only</Badge> : null}
          </div>
          <p className="text-muted-foreground">
            Manage the accountant portfolio inside{" "}
            <span className="font-medium text-foreground">
              {workspaceSummary.workspaceName}
            </span>
            .
          </p>
          <p className="text-sm text-muted-foreground">
            Each client business stays workspace-scoped while exposing transaction coverage,
            tax exposure, and latest activity in one list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={quickLinks.reviewHref}>Open transaction review</Link>
          </Button>
          <Button asChild>
            <Link href={quickLinks.taxSummaryHref}>Open tax center</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active clients</CardDescription>
            <CardTitle className="text-xl">
              {workspaceSummary.activeClientBusinessCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned transactions</CardDescription>
            <CardTitle className="text-xl">
              {workspaceSummary.transactionCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs review</CardDescription>
            <CardTitle className="text-xl">
              {workspaceSummary.reviewQueueCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              Tax exposure · {workspaceSummary.taxExposureDateLabel}
            </CardDescription>
            <CardTitle className="text-xl">
              {formatCompactCurrency(
                workspaceSummary.estimatedTaxExposureMinor,
                workspaceSummary.currency
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Last activity {formatDate(workspaceSummary.lastActivityAt)}
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Portfolio controls</CardTitle>
          <CardDescription>
            Search, filter, and prioritize the client businesses that need attention first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="portfolioQuery">Search businesses</Label>
              <Input
                id="portfolioQuery"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by business, industry, TIN, VAT, or note"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="portfolioStatus">Status</Label>
              <select
                id="portfolioStatus"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilterValue)
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="ALL">All businesses</option>
                <option value="ACTIVE">Active only</option>
                <option value="ARCHIVED">Archived only</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="portfolioSort">Sort by</Label>
              <select
                id="portfolioSort"
                value={sortValue}
                onChange={(event) => setSortValue(event.target.value as SortValue)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                <option value="exposure">Tax exposure</option>
                <option value="activity">Last activity</option>
                <option value="name">Business name</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create client business</CardTitle>
          <CardDescription>
            Capture the core profile for a new business inside this accountant workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

          {!editable ? (
            <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
              Your role is view-only in this workspace, so you can review the client portfolio
              but not add new businesses.
            </div>
          ) : (
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
                    disabled={saving}
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
                    disabled={saving}
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
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    value={form.country}
                    onChange={handleChange}
                    disabled={saving}
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
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="defaultCurrency">Default currency</Label>
                  <select
                    id="defaultCurrency"
                    name="defaultCurrency"
                    value={form.defaultCurrency}
                    onChange={handleChange}
                    disabled={saving}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
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
                    disabled={saving}
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
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscalYearStartMonth">Fiscal year start month</Label>
                  <select
                    id="fiscalYearStartMonth"
                    name="fiscalYearStartMonth"
                    value={form.fiscalYearStartMonth}
                    onChange={handleChange}
                    disabled={saving}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
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
                  disabled={saving}
                  rows={4}
                  placeholder="Internal onboarding notes, filing cadence, or reviewer context."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Filing readiness and alert hooks are reserved in the portfolio summary response
                  so later compliance workflows can layer in without changing this screen shape.
                </p>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create client business"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
          <CardDescription>
            {filteredBusinesses.length} of {portfolio.clientBusinesses.length} businesses shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredBusinesses.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              No client businesses match the current filters. Adjust the search or create a new
              business to expand the portfolio.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredBusinesses.map((business) => (
                <div key={business.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">{business.name}</h2>
                        <Badge variant={statusVariant(business.status)}>{business.status}</Badge>
                        {business.reviewQueueCount > 0 ? (
                          <Badge variant="outline">
                            {business.reviewQueueCount} need review
                          </Badge>
                        ) : null}
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

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Transactions
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {business.transactionCount}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {business.reviewStatusBreakdown.postedCount} posted,{" "}
                        {business.reviewStatusBreakdown.reviewedCount} reviewed
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Tax exposure
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatCurrency(
                          business.taxExposure.estimatedTaxExposureMinor,
                          business.taxExposure.currency
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {business.taxExposure.dateLabel}
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
                        Last activity
                      </div>
                      <div className="font-medium">{formatDate(business.lastActivityAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {activityTypeLabel(business)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Workspace setup
                      </div>
                      <div className="font-medium">
                        {business.categoryCount} categories, {business.vendorCount} vendors
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {business.uploadCount} uploads, {business.ledgerTransactionCount} ledger
                        entries
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Exposure split
                      </div>
                      <div className="font-medium">
                        VAT net{" "}
                        {formatCompactCurrency(
                          business.taxExposure.vatNetMinor,
                          business.taxExposure.currency
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        WHT payable{" "}
                        {formatCompactCurrency(
                          business.taxExposure.whtPayableMinor,
                          business.taxExposure.currency
                        )}
                      </div>
                    </div>
                  </div>

                  {business.notes ? (
                    <p className="mt-4 text-sm text-muted-foreground">{business.notes}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Created {formatDate(business.createdAt)} · Updated {formatDate(business.updatedAt)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`${quickLinks.reviewHref}?clientBusinessId=${business.id}`}
                        >
                          Review queue
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link
                          href={`${quickLinks.taxSummaryHref}?clientBusinessId=${business.id}`}
                        >
                          Tax drill-down
                        </Link>
                      </Button>
                    </div>
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
