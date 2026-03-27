"use client";

import { useId, useState } from "react";
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

export type ClientRecordFormValues = {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  notes: string;
};

type ClientRecordFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  initialValues: ClientRecordFormValues;
  saving: boolean;
  error?: string | null;
  disabled?: boolean;
  onSubmit: (values: ClientRecordFormValues) => Promise<void>;
  onCancel?: () => void;
};

export const EMPTY_CLIENT_FORM_VALUES: ClientRecordFormValues = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
  notes: "",
};

function validateClient(values: ClientRecordFormValues) {
  if (!values.name.trim() && !values.companyName.trim()) {
    return "Primary name or company name is required.";
  }
  if (!values.email.trim()) {
    return "Email is required.";
  }
  return null;
}

export default function ClientRecordForm({
  title,
  description,
  submitLabel,
  initialValues,
  saving,
  error,
  disabled = false,
  onSubmit,
  onCancel,
}: ClientRecordFormProps) {
  const idPrefix = useId().replace(/:/g, "");
  const [values, setValues] = useState(() => initialValues);
  const [localError, setLocalError] = useState<string | null>(null);

  function updateField<K extends keyof ClientRecordFormValues>(
    field: K,
    value: ClientRecordFormValues[K]
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;

    const validationError = validateClient(values);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    await onSubmit(values);
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(error || localError) && (
            <p className="text-sm text-destructive">{error ?? localError}</p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-name`}>Primary name</Label>
              <Input
                id={`${idPrefix}-client-name`}
                value={values.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Jane Ade"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-company`}>Company name</Label>
              <Input
                id={`${idPrefix}-client-company`}
                value={values.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
                placeholder="Acme Industries Ltd"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-email`}>Email</Label>
              <Input
                id={`${idPrefix}-client-email`}
                type="email"
                value={values.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="billing@acme.com"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-phone`}>Phone</Label>
              <Input
                id={`${idPrefix}-client-phone`}
                value={values.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="+234 800 000 0000"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-tax-id`}>Tax ID</Label>
              <Input
                id={`${idPrefix}-client-tax-id`}
                value={values.taxId}
                onChange={(event) => updateField("taxId", event.target.value)}
                placeholder="TIN or registration number"
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client-address`}>Address</Label>
              <Input
                id={`${idPrefix}-client-address`}
                value={values.address}
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="12 Marina, Lagos"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-client-notes`}>Notes</Label>
            <textarea
              id={`${idPrefix}-client-notes`}
              rows={4}
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Payment terms, account notes, or filing context"
              disabled={disabled}
              className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={disabled || saving}>
              {saving ? "Saving..." : submitLabel}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled || saving}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
