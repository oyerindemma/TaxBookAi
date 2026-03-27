"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_TYPE_OPTIONS,
  COUNTRY_OPTIONS,
  createBusinessProfileDefaults,
  DEFAULT_BUSINESS_CURRENCY,
  DEFAULT_COUNTRY,
  type BusinessProfileFieldErrors,
  type BusinessProfileFormValues,
  FISCAL_YEAR_MONTH_OPTIONS,
  NIGERIA_STATE_OPTIONS,
} from "@/lib/business-profile";

type BusinessProfileFormProps = {
  initialValues: BusinessProfileFormValues;
  mode: "onboarding" | "settings";
  workspaceLabel: string;
};

export default function BusinessProfileForm({
  initialValues,
  mode,
  workspaceLabel,
}: BusinessProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(() => createBusinessProfileDefaults(initialValues));
  const [fieldErrors, setFieldErrors] = useState<BusinessProfileFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(
    field: keyof BusinessProfileFormValues,
    value: string
  ) {
    setValues((current) => {
      if (field === "country") {
        return {
          ...current,
          country: value,
          state: value === DEFAULT_COUNTRY ? "" : current.state,
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });

    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Unable to save business settings.");
        setFieldErrors((data?.fieldErrors ?? {}) as BusinessProfileFieldErrors);
        return;
      }

      setMessage(data?.message ?? "Business settings saved.");
      setValues((current) => ({
        ...current,
        businessName: data?.profile?.businessName ?? current.businessName,
        businessType: data?.profile?.businessType ?? current.businessType,
        industry: data?.profile?.industry ?? current.industry,
        country: data?.profile?.country ?? current.country,
        state: data?.profile?.state ?? current.state,
        taxIdentificationNumber:
          data?.profile?.taxIdentificationNumber ?? current.taxIdentificationNumber,
        defaultCurrency: data?.profile?.defaultCurrency ?? DEFAULT_BUSINESS_CURRENCY,
        fiscalYearStartMonth: String(
          data?.profile?.fiscalYearStartMonth ?? current.fiscalYearStartMonth
        ),
      }));

      if (mode === "onboarding") {
        router.replace(data?.redirectTo ?? "/dashboard");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "onboarding" ? "Set up your business" : "Business settings";
  const description =
    mode === "onboarding"
      ? "Tell TaxBook which business this workspace belongs to before you enter the dashboard."
      : "Update the business profile tied to this workspace.";

  return (
    <Card className="border-border/60 bg-white/90 shadow-xl shadow-primary/10">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <p className="text-xs text-muted-foreground">
          Workspace: <span className="font-medium text-foreground">{workspaceLabel}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={values.businessName}
              onChange={(event) => updateField("businessName", event.target.value)}
              placeholder="TaxBook AI Limited"
              aria-invalid={fieldErrors.businessName ? "true" : "false"}
            />
            {fieldErrors.businessName ? (
              <p className="text-sm text-destructive">{fieldErrors.businessName}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="businessType">Business type</Label>
            <select
              id="businessType"
              value={values.businessType}
              onChange={(event) => updateField("businessType", event.target.value)}
              aria-invalid={fieldErrors.businessType ? "true" : "false"}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select business type</option>
              {BUSINESS_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.businessType ? (
              <p className="text-sm text-destructive">{fieldErrors.businessType}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={values.industry}
              onChange={(event) => updateField("industry", event.target.value)}
              placeholder="Accounting software"
              aria-invalid={fieldErrors.industry ? "true" : "false"}
            />
            {fieldErrors.industry ? (
              <p className="text-sm text-destructive">{fieldErrors.industry}</p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="country">Country</Label>
              <select
                id="country"
                value={values.country}
                onChange={(event) => updateField("country", event.target.value)}
                aria-invalid={fieldErrors.country ? "true" : "false"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.country ? (
                <p className="text-sm text-destructive">{fieldErrors.country}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="state">State</Label>
              {values.country === DEFAULT_COUNTRY ? (
                <select
                  id="state"
                  value={values.state}
                  onChange={(event) => updateField("state", event.target.value)}
                  aria-invalid={fieldErrors.state ? "true" : "false"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select state</option>
                  {NIGERIA_STATE_OPTIONS.map((stateOption) => (
                    <option key={stateOption} value={stateOption}>
                      {stateOption}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="state"
                  value={values.state}
                  onChange={(event) => updateField("state", event.target.value)}
                  placeholder="Enter state or region"
                  aria-invalid={fieldErrors.state ? "true" : "false"}
                />
              )}
              {fieldErrors.state ? (
                <p className="text-sm text-destructive">{fieldErrors.state}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="taxIdentificationNumber">Tax identification number</Label>
              <Input
                id="taxIdentificationNumber"
                value={values.taxIdentificationNumber}
                onChange={(event) =>
                  updateField("taxIdentificationNumber", event.target.value)
                }
                placeholder="Optional"
                aria-invalid={fieldErrors.taxIdentificationNumber ? "true" : "false"}
              />
              {fieldErrors.taxIdentificationNumber ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.taxIdentificationNumber}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="defaultCurrency">Default currency</Label>
              <Input
                id="defaultCurrency"
                value={DEFAULT_BUSINESS_CURRENCY}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground">
                TaxBook defaults new workspaces to {DEFAULT_BUSINESS_CURRENCY}.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fiscalYearStartMonth">Fiscal year start month</Label>
            <select
              id="fiscalYearStartMonth"
              value={values.fiscalYearStartMonth}
              onChange={(event) => updateField("fiscalYearStartMonth", event.target.value)}
              aria-invalid={fieldErrors.fiscalYearStartMonth ? "true" : "false"}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FISCAL_YEAR_MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.fiscalYearStartMonth ? (
              <p className="text-sm text-destructive">{fieldErrors.fiscalYearStartMonth}</p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message && mode === "settings" ? (
            <p className="text-sm text-emerald-700">{message}</p>
          ) : null}

          <Button type="submit" disabled={saving} className="w-full">
            {saving
              ? mode === "onboarding"
                ? "Saving setup..."
                : "Saving settings..."
              : mode === "onboarding"
                ? "Complete onboarding"
                : "Save business settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
