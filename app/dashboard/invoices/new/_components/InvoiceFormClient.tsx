"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrencyNGN } from "@/lib/dashboard-formatting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type Client = {
  id: number;
  name: string;
  companyName: string | null;
  displayName: string;
  email: string;
};

type LineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

type SubmitLineItem = {
  description: string;
  amountMinor: number;
};

type Props = {
  role: Role;
  initialClients: Client[];
};

const DEFAULT_VAT_RATE = "7.5";
const DEFAULT_WHT_RATE = 5;

function toKobo(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function getLineItemAmountMinor(item: LineItem) {
  const quantity = Number(item.quantity);
  const unitPriceKobo = toKobo(item.unitPrice);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (unitPriceKobo === null || unitPriceKobo <= 0) return null;

  return Math.round(quantity * unitPriceKobo);
}

function normalizeSubmitItems(items: LineItem[]) {
  const normalized: SubmitLineItem[] = [];

  for (const [index, item] of items.entries()) {
    const description = item.description.trim();
    if (!description) {
      return {
        ok: false as const,
        error: `Item ${index + 1} requires a description.`,
      };
    }

    const amountMinor = getLineItemAmountMinor(item);
    if (!amountMinor || amountMinor <= 0) {
      return {
        ok: false as const,
        error: `Item ${index + 1} requires a positive amount.`,
      };
    }

    normalized.push({
      description,
      amountMinor,
    });
  }

  return {
    ok: true as const,
    items: normalized,
  };
}

function ToggleField(props: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
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

export default function InvoiceFormClient({ role, initialClients }: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [useNewClient, setUseNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCompanyName, setNewClientCompanyName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [whtEnabled, setWhtEnabled] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState(true);

  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", taxRate: DEFAULT_VAT_RATE },
  ]);

  const [savingIntent, setSavingIntent] = useState<"DRAFT" | "SENT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      const quantity = Number(item.quantity);
      const unitPriceKobo = toKobo(item.unitPrice);
      const taxRate = Number(item.taxRate);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      if (unitPriceKobo === null) return;
      const lineSubtotal = quantity * unitPriceKobo;
      const lineTax = Math.round(lineSubtotal * ((Number.isFinite(taxRate) ? taxRate : 0) / 100));
      subtotal += lineSubtotal;
      taxAmount += lineTax;
    });

    const expectedWhtAmountMinor = whtEnabled
      ? Math.round(subtotal * (DEFAULT_WHT_RATE / 100))
      : 0;

    return {
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
      expectedWhtAmountMinor,
      expectedCashMinor: subtotal + taxAmount - expectedWhtAmountMinor,
    };
  }, [items, whtEnabled]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        description: "",
        quantity: "1",
        unitPrice: "",
        taxRate: vatEnabled ? DEFAULT_VAT_RATE : "0",
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleVatToggle(next: boolean) {
    setVatEnabled(next);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        taxRate: next ? (item.taxRate === "0" || !item.taxRate ? DEFAULT_VAT_RATE : item.taxRate) : "0",
      }))
    );
  }

  async function ensureClient(): Promise<number | null> {
    if (!canEdit) return null;

    if (!useNewClient) {
      const parsedId = Number(selectedClientId);
      if (!Number.isFinite(parsedId) || parsedId <= 0) {
        setError("Select a client.");
        return null;
      }
      return parsedId;
    }

    if (!newClientName.trim() && !newClientCompanyName.trim()) {
      setError("Primary name or company name is required.");
      return null;
    }

    if (!newClientEmail.trim()) {
      setError("Client email is required.");
      return null;
    }

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newClientName,
        companyName: newClientCompanyName,
        email: newClientEmail,
        phone: newClientPhone,
        address: newClientAddress,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Unable to create client");
      return null;
    }

    setClients((prev) => [data.client, ...prev]);
    setSelectedClientId(String(data.client.id));
    setUseNewClient(false);
    setNewClientName("");
    setNewClientCompanyName("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientAddress("");
    return data.client.id;
  }

  async function handleSubmit(nextStatus: "DRAFT" | "SENT") {
    if (!canEdit) return;
    setError(null);

    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }

    const normalizedItems = normalizeSubmitItems(items);
    if (!normalizedItems.ok) {
      setError(normalizedItems.error);
      return;
    }

    const clientId = await ensureClient();
    if (!clientId) return;

    setSavingIntent(nextStatus);
    try {
      const payload = {
        clientId,
        invoiceNumber: invoiceNumber.trim() || undefined,
        issueDate,
        dueDate,
        notes: notes.trim() || undefined,
        status: nextStatus,
        currency: "NGN",
        vatTreatment: vatEnabled ? "OUTPUT" : "NONE",
        whtTreatment: "NONE" as const,
        taxCategory: null,
        items: normalizedItems.items,
      };
      console.log("INVOICE SUBMIT PAYLOAD", JSON.stringify(payload, null, 2));

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrorMessage =
          data?.fieldErrors && typeof data.fieldErrors === "object"
            ? Object.values(data.fieldErrors).find((value) => typeof value === "string")
            : null;
        setError(
          (typeof fieldErrorMessage === "string" && fieldErrorMessage) ||
            data?.error ||
            "Unable to create invoice"
        );
        return;
      }

      const invoiceId = data.invoice.id;

      if (paymentEnabled && nextStatus !== "DRAFT") {
        const paymentLinkResponse = await fetch(`/api/invoices/${invoiceId}/payment-link`, {
          method: "POST",
        });
        if (!paymentLinkResponse.ok) {
          const paymentData = await paymentLinkResponse.json().catch(() => null);
          setError(paymentData?.error ?? "Invoice created, but payment link could not be generated.");
        }
      }

      router.push(`/dashboard/invoices/${invoiceId}`);
      router.refresh();
    } catch {
      setError("Network error creating invoice");
    } finally {
      setSavingIntent(null);
    }
  }

  if (!canEdit) {
    return (
      <Card className="rounded-2xl bg-primary text-white shadow-glow">
        <CardHeader>
          <CardTitle>Read-only access</CardTitle>
          <CardDescription className="text-slate-300">
            You need member access or higher to create invoices.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
        <CardContent className="p-6 sm:p-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
              Invoice to payment flow
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Create a new invoice</h1>
              <p className="max-w-3xl text-sm text-slate-300">
                Build the invoice once, then let TaxBook carry it through hosted payment,
                automatic ledger posting, and VAT/WHT tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Client</CardTitle>
              <CardDescription className="text-slate-300">
                Select an existing client or add a new one on the fly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={useNewClient ? "secondary" : "outline"}
                  onClick={() => setUseNewClient(false)}
                  aria-label="Use an existing invoice client"
                >
                  Select existing
                </Button>
                <Button
                  type="button"
                  variant={useNewClient ? "outline" : "secondary"}
                  onClick={() => setUseNewClient(true)}
                  aria-label="Create a new invoice client"
                >
                  Add new client
                </Button>
              </div>

              {useNewClient ? (
                <div className="grid max-w-2xl gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="client-name">Primary name</Label>
                    <Input
                      id="client-name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Jane Ade"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client-company-name">Company name</Label>
                    <Input
                      id="client-company-name"
                      value={newClientCompanyName}
                      onChange={(e) => setNewClientCompanyName(e.target.value)}
                      placeholder="Acme Ltd"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client-email">Client email</Label>
                    <Input
                      id="client-email"
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="billing@acme.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client-phone">Phone</Label>
                    <Input
                      id="client-phone"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="client-address">Address</Label>
                    <Input
                      id="client-address"
                      value={newClientAddress}
                      onChange={(e) => setNewClientAddress(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid max-w-lg gap-2">
                  <Label htmlFor="client-select">Client</Label>
                  <select
                    id="client-select"
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-cyan/40"
                  >
                    <option value="">Select client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName} ({client.email})
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No clients yet. Add a new client to create your first invoice.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Invoice details</CardTitle>
              <CardDescription className="text-slate-300">
                Control numbering, issue timing, and client-facing notes.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="invoice-number">Invoice number (optional)</Label>
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-20260324-AB12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-date">Issue date</Label>
                <Input
                  id="issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due-date">Due date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="min-h-[120px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan/40"
                  placeholder="Payment terms, bank instructions, or delivery notes."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription className="text-slate-300">
                Add the services or products billed on this invoice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="grid gap-2">
                    <Label htmlFor={`description-${index}`}>Description</Label>
                    <Input
                      id={`description-${index}`}
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Consulting services"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor={`quantity-${index}`}>Quantity</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`unit-price-${index}`}>Unit price</Label>
                      <Input
                        id={`unit-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`tax-rate-${index}`}>VAT rate (%)</Label>
                      <Input
                        id={`tax-rate-${index}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={item.taxRate}
                        onChange={(e) => updateItem(index, { taxRate: e.target.value })}
                        disabled={!vatEnabled}
                      />
                    </div>
                  </div>
                  {items.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeItem(index)}
                      aria-label={`Remove invoice item ${index + 1}`}
                    >
                      Remove item
                    </Button>
                  ) : null}
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addItem} aria-label="Add another invoice item">
                Add another item
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>Invoice settings</CardTitle>
              <CardDescription className="text-slate-300">
                Drive payment, ledger, and tax flow using the existing backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleField
                id="vat-toggle"
                checked={vatEnabled}
                onChange={handleVatToggle}
                label="VAT enabled"
                description="Apply standard VAT on invoice line items and persist output VAT treatment."
              />
              <ToggleField
                id="wht-toggle"
                checked={whtEnabled}
                onChange={setWhtEnabled}
                label="WHT applicable"
                description="Flag the invoice for WHT receivable tracking so the tax engine can reflect it."
              />
              <ToggleField
                id="payment-toggle"
                checked={paymentEnabled}
                onChange={setPaymentEnabled}
                label="Paystack payment enabled"
                description="Create a hosted payment page after sending. Redirect checkout appears automatically when Paystack is configured."
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Totals</CardTitle>
              <CardDescription className="text-slate-300">
                Live totals from the current invoice items.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Subtotal</span>
                <span className="font-medium text-white">{formatCurrencyNGN(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">VAT</span>
                <span className="font-medium text-white">{formatCurrencyNGN(totals.taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Expected WHT credit</span>
                <span className="font-medium text-white">
                  {whtEnabled ? `${formatCurrencyNGN(totals.expectedWhtAmountMinor)} (${DEFAULT_WHT_RATE}%)` : "₦0"}
                </span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total due</span>
                <span>{formatCurrencyNGN(totals.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Expected cash received</span>
                <span className="font-medium text-cyan">
                  {formatCurrencyNGN(totals.expectedCashMinor)}
                </span>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <Card className="rounded-2xl border border-white/10 bg-primary text-white">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription className="text-slate-300">
                Save a draft or send immediately into payment, ledger, and tax flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit("DRAFT")}
                disabled={savingIntent !== null}
                aria-label="Save invoice as draft"
              >
                {savingIntent === "DRAFT" ? "Saving draft..." : "Save draft"}
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit("SENT")}
                disabled={savingIntent !== null}
                className="rounded-xl border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
                aria-label="Save and send invoice"
              >
                {savingIntent === "SENT" ? "Sending..." : "Save and send"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/dashboard/invoices")}
                aria-label="Back to invoices"
              >
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
