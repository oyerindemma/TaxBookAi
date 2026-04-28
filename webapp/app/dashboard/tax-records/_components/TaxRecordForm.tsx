"use client";

import Link from "next/link";
import { useState } from "react";
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

export type TaxRecordFormValues = {
  kind: string;
  amount: string;
  taxRate: string;
  occurredOn: string;
  description: string;
  currency: string;
  categoryId: string;
  vendorName: string;
  recurring: boolean;
};

type Category = {
  id: number;
  name: string;
};

type TaxRecordFormProps = {
  initialValues: TaxRecordFormValues;
  onSubmit: (values: TaxRecordFormValues) => Promise<void>;
  onCancel?: () => void;
  saving: boolean;
  message?: string | null;
  error?: string | null;
  disabled?: boolean;
  categories?: Category[];
};

const TAX_TYPES = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "VAT", label: "VAT" },
  { value: "WHT", label: "WHT" },
];

export default function TaxRecordForm({
  initialValues,
  onSubmit,
  onCancel,
  saving,
  message,
  error,
  disabled = false,
  categories = [],
}: TaxRecordFormProps) {
  const [kind, setKind] = useState(initialValues.kind);
  const [amount, setAmount] = useState(initialValues.amount);
  const [taxRate, setTaxRate] = useState(initialValues.taxRate);
  const [occurredOn, setOccurredOn] = useState(initialValues.occurredOn);
  const [description, setDescription] = useState(initialValues.description);
  const [currency, setCurrency] = useState(initialValues.currency);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId);
  const [vendorName, setVendorName] = useState(initialValues.vendorName);
  const [recurring, setRecurring] = useState(initialValues.recurring);
  const [localError, setLocalError] = useState<string | null>(null);

  function validate() {
    if (!kind.trim()) return "Tax type is required";
    if (!occurredOn) return "Date is required";
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return "Amount must be greater than 0";
    }
    if (taxRate.trim() !== "") {
      const numericRate = Number(taxRate);
      if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100) {
        return "Tax rate must be between 0 and 100";
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setLocalError(null);
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    await onSubmit({
      kind,
      amount,
      taxRate,
      occurredOn,
      description,
      currency,
      categoryId,
      vendorName,
      recurring,
    });
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <CardHeader>
          <CardTitle>{onCancel ? "Edit record" : "New record"}</CardTitle>
          <CardDescription>Keep your tax activity up to date.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tax-kind">Tax type</Label>
            <select
              id="tax-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={disabled}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TAX_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-category">
              {kind === "EXPENSE" ? "Expense category" : "Category"}
            </Label>
            <select
              id="tax-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={disabled}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Manage workspace categories in{" "}
              <Link
                href="/dashboard/settings/categories"
                className="font-medium text-primary hover:underline"
              >
                Categories settings
              </Link>
              .
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-amount">Amount</Label>
            <Input
              id="tax-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-rate">Tax rate (%)</Label>
            <Input
              id="tax-rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="0"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-vendor">Vendor</Label>
            <Input
              id="tax-vendor"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Vendor or merchant name"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-currency">Currency</Label>
            <Input
              id="tax-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="NGN"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-date">Date</Label>
            <Input
              id="tax-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-description">Description</Label>
            <textarea
              id="tax-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              disabled={disabled}
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              disabled={disabled}
            />
            Recurring item
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || disabled}>
              {saving ? "Saving..." : onCancel ? "Update record" : "Create record"}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={saving || disabled}
              >
                Cancel
              </Button>
            )}
          </div>

          {(localError || error) && (
            <p className="text-sm text-destructive">{localError ?? error}</p>
          )}
          {message && <p className="text-sm text-emerald-600">{message}</p>}
        </CardContent>
      </form>
    </Card>
  );
}
