"use client";

import { useId, useMemo, useState } from "react";
import { formatCurrencyNGN } from "@/lib/dashboard-formatting";
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

type ClientOption = {
  id: number;
  displayName: string;
  email: string;
};

type RecurringLineItemFormValue = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type RecurringInvoiceFormValues = {
  clientId: string;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  startDate: string;
  nextRunAt: string;
  endDate: string;
  dueInDays: string;
  invoiceStatus: "DRAFT" | "SENT";
  paymentEnabled: boolean;
  currency: string;
  vatTreatment: "NONE" | "OUTPUT" | "EXEMPT";
  whtTreatment: "NONE" | "PAYABLE" | "RECEIVABLE";
  taxCategory: string;
  active: boolean;
  notes: string;
  items: RecurringLineItemFormValue[];
};

type Props = {
  title: string;
  description: string;
  submitLabel: string;
  clients: ClientOption[];
  initialValues: RecurringInvoiceFormValues;
  saving: boolean;
  error?: string | null;
  disabled?: boolean;
  onSubmit: (values: RecurringInvoiceFormValues) => Promise<void>;
  onCancel?: () => void;
};

export const EMPTY_RECURRING_INVOICE_FORM_VALUES: RecurringInvoiceFormValues = {
  clientId: "",
  frequency: "MONTHLY",
  startDate: new Date().toISOString().slice(0, 10),
  nextRunAt: new Date().toISOString().slice(0, 10),
  endDate: "",
  dueInDays: "0",
  invoiceStatus: "SENT",
  paymentEnabled: true,
  currency: "NGN",
  vatTreatment: "OUTPUT",
  whtTreatment: "NONE",
  taxCategory: "SALES_SERVICES",
  active: true,
  notes: "",
  items: [{ description: "", quantity: "1", unitPrice: "", taxRate: "7.5" }],
};

function toKobo(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function ToggleField(props: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={props.id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan/30"
    >
      <div className="space-y-1">
        <p className="font-medium text-white">{props.label}</p>
        <p className="text-sm text-slate-300">{props.description}</p>
      </div>
      <span
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full transition ${
          props.checked ? "bg-cyan shadow-glow" : "bg-white/10"
        }`}
      >
        <input
          id={props.id}
          type="checkbox"
          checked={props.checked}
          onChange={(event) => props.onChange(event.target.checked)}
          disabled={props.disabled}
          className="peer sr-only"
        />
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition ${
            props.checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

export default function RecurringInvoiceForm({
  title,
  description,
  submitLabel,
  clients,
  initialValues,
  saving,
  error,
  disabled = false,
  onSubmit,
  onCancel,
}: Props) {
  const idPrefix = useId().replace(/:/g, "");
  const [values, setValues] = useState(() => initialValues);
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    values.items.forEach((item) => {
      const quantity = Number(item.quantity);
      const unitPriceKobo = toKobo(item.unitPrice);
      const taxRate = Number(item.taxRate);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      if (unitPriceKobo === null) return;
      if (!Number.isFinite(taxRate)) return;

      const lineSubtotal = quantity * unitPriceKobo;
      const lineTax =
        values.vatTreatment === "NONE"
          ? 0
          : Math.round(lineSubtotal * ((Number.isFinite(taxRate) ? taxRate : 0) / 100));
      subtotal += lineSubtotal;
      taxAmount += lineTax;
    });

    return {
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
    };
  }, [values.items, values.vatTreatment]);

  function updateField<K extends keyof RecurringInvoiceFormValues>(
    field: K,
    value: RecurringInvoiceFormValues[K]
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index: number, patch: Partial<RecurringLineItemFormValue>) {
    setValues((current) => ({
      ...current,
      items: current.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item
      ),
    }));
  }

  function addItem() {
    setValues((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          description: "",
          quantity: "1",
          unitPrice: "",
          taxRate: current.vatTreatment === "NONE" ? "0" : "7.5",
        },
      ],
    }));
  }

  function removeItem(index: number) {
    setValues((current) => ({
      ...current,
      items: current.items.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function handleVatTreatmentChange(
    next: RecurringInvoiceFormValues["vatTreatment"]
  ) {
    setValues((current) => ({
      ...current,
      vatTreatment: next,
      items: current.items.map((item) => ({
        ...item,
        taxRate:
          next === "NONE"
            ? "0"
            : item.taxRate === "0" || !item.taxRate
              ? "7.5"
              : item.taxRate,
      })),
    }));
  }

  function handleWhtToggle(next: boolean) {
    setValues((current) => ({
      ...current,
      whtTreatment: next ? "RECEIVABLE" : "NONE",
      taxCategory: next && !current.taxCategory ? "SALES_SERVICES" : current.taxCategory,
    }));
  }

  function validate() {
    if (!values.clientId) {
      return "Select a client.";
    }
    if (!values.startDate) {
      return "Start date is required.";
    }
    if (!values.nextRunAt) {
      return "Next run date is required.";
    }
    if (values.items.length === 0) {
      return "Add at least one line item.";
    }
    const dueInDays = Number(values.dueInDays);
    if (!Number.isFinite(dueInDays) || dueInDays < 0) {
      return "Due in days must be 0 or more.";
    }
    if (values.nextRunAt < values.startDate) {
      return "Next run date cannot be before the start date.";
    }
    if (values.endDate && values.endDate < values.startDate) {
      return "End date cannot be before the start date.";
    }
    if (values.endDate && values.nextRunAt > values.endDate) {
      return "Next run date cannot be after the end date.";
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    await onSubmit(values);
  }

  return (
    <Card className="rounded-2xl border border-white/10 bg-primary text-white">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="text-slate-300">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(error || localError) && (
            <p className="text-sm text-red-200">{error ?? localError}</p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-client`}>Client</Label>
              <select
                id={`${idPrefix}-client`}
                value={values.clientId}
                onChange={(event) => updateField("clientId", event.target.value)}
                disabled={disabled || clients.length === 0}
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName} ({client.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-frequency`}>Frequency</Label>
              <select
                id={`${idPrefix}-frequency`}
                value={values.frequency}
                onChange={(event) =>
                  updateField(
                    "frequency",
                    event.target.value as RecurringInvoiceFormValues["frequency"]
                  )
                }
                disabled={disabled}
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-start-date`}>Start date</Label>
              <Input
                id={`${idPrefix}-start-date`}
                type="date"
                value={values.startDate}
                onChange={(event) => updateField("startDate", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-next-run`}>Next run</Label>
              <Input
                id={`${idPrefix}-next-run`}
                type="date"
                value={values.nextRunAt}
                onChange={(event) => updateField("nextRunAt", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-end-date`}>End date</Label>
              <Input
                id={`${idPrefix}-end-date`}
                type="date"
                value={values.endDate}
                onChange={(event) => updateField("endDate", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-due-days`}>Due in days</Label>
              <Input
                id={`${idPrefix}-due-days`}
                type="number"
                min="0"
                value={values.dueInDays}
                onChange={(event) => updateField("dueInDays", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-invoice-status`}>Generated invoice status</Label>
              <select
                id={`${idPrefix}-invoice-status`}
                value={values.invoiceStatus}
                onChange={(event) =>
                  updateField(
                    "invoiceStatus",
                    event.target.value as RecurringInvoiceFormValues["invoiceStatus"]
                  )
                }
                disabled={disabled}
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
              >
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-currency`}>Currency</Label>
              <Input
                id={`${idPrefix}-currency`}
                value={values.currency}
                onChange={(event) => updateField("currency", event.target.value.toUpperCase())}
                disabled={disabled}
                maxLength={8}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <ToggleField
                id={`${idPrefix}-active`}
                checked={values.active}
                onChange={(next) => updateField("active", next)}
                label="Active template"
                description="Due runs will generate invoices automatically while the template stays active."
                disabled={disabled}
              />

              <ToggleField
                id={`${idPrefix}-payments`}
                checked={values.paymentEnabled}
                onChange={(next) => updateField("paymentEnabled", next)}
                label="Prepare hosted payment link"
                description="Create a client payment path as soon as a generated invoice is sent."
                disabled={disabled}
              />

              <ToggleField
                id={`${idPrefix}-wht`}
                checked={values.whtTreatment !== "NONE"}
                onChange={handleWhtToggle}
                label="Track WHT on generated invoices"
                description="Use this when your client usually deducts withholding tax from payments."
                disabled={disabled}
              />
            </div>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-vat-treatment`}>VAT treatment</Label>
                <select
                  id={`${idPrefix}-vat-treatment`}
                  value={values.vatTreatment}
                  onChange={(event) =>
                    handleVatTreatmentChange(
                      event.target.value as RecurringInvoiceFormValues["vatTreatment"]
                    )
                  }
                  disabled={disabled}
                  className="h-11 rounded-xl border border-white/10 bg-primary px-3 text-sm text-white shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
                >
                  <option value="OUTPUT">Output VAT</option>
                  <option value="EXEMPT">VAT exempt</option>
                  <option value="NONE">No VAT</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-tax-category`}>Tax category</Label>
                <select
                  id={`${idPrefix}-tax-category`}
                  value={values.taxCategory}
                  onChange={(event) => updateField("taxCategory", event.target.value)}
                  disabled={disabled}
                  className="h-11 rounded-xl border border-white/10 bg-primary px-3 text-sm text-white shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
                >
                  <option value="SALES_SERVICES">Sales services</option>
                  <option value="SALES_GOODS">Sales goods</option>
                  <option value="RENT">Rent</option>
                  <option value="PROFESSIONAL_SERVICE">Professional service</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
            <textarea
              id={`${idPrefix}-notes`}
              rows={3}
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Optional notes copied into each generated invoice"
              disabled={disabled}
              className="min-h-[96px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Template items</p>
                <p className="text-xs text-slate-300">
                  These lines will be copied into each generated invoice.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={disabled}
              >
                Add item
              </Button>
            </div>

            <div className="space-y-3">
              {values.items.map((item, index) => (
                <div
                  key={`${idPrefix}-item-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor={`${idPrefix}-description-${index}`}>Description</Label>
                      <Input
                        id={`${idPrefix}-description-${index}`}
                        value={item.description}
                        onChange={(event) =>
                          updateItem(index, { description: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`${idPrefix}-quantity-${index}`}>Quantity</Label>
                      <Input
                        id={`${idPrefix}-quantity-${index}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(index, { quantity: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`${idPrefix}-unit-price-${index}`}>Unit price</Label>
                      <Input
                        id={`${idPrefix}-unit-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateItem(index, { unitPrice: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`${idPrefix}-tax-rate-${index}`}>Tax rate (%)</Label>
                      <Input
                        id={`${idPrefix}-tax-rate-${index}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={item.taxRate}
                        onChange={(event) =>
                          updateItem(index, { taxRate: event.target.value })
                        }
                        disabled={disabled || values.vatTreatment === "NONE"}
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={disabled || values.items.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan/20 bg-white/5 p-4">
            <p className="text-sm font-medium text-cyan">Template preview</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-slate-300">Subtotal</p>
                <p className="font-medium text-white">
                  {formatCurrencyNGN(preview.subtotal)}
                </p>
              </div>
              <div>
                <p className="text-slate-300">VAT</p>
                <p className="font-medium text-white">
                  {formatCurrencyNGN(preview.taxAmount)}
                </p>
              </div>
              <div>
                <p className="text-slate-300">Total per run</p>
                <p className="font-medium text-white">
                  {formatCurrencyNGN(preview.totalAmount)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={disabled || saving}
              className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              {saving ? "Saving..." : submitLabel}
            </Button>
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
