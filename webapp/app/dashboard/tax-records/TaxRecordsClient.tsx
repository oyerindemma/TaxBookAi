"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TAX_TYPES = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "VAT", label: "VAT" },
  { value: "WHT", label: "WHT" },
];

const TAX_RATE_PRESETS = [
  { value: "VAT_7_5", label: "VAT 7.5%", rate: 7.5 },
  { value: "WHT_5", label: "WHT 5%", rate: 5 },
  { value: "WHT_10", label: "WHT 10%", rate: 10 },
  { value: "CUSTOM", label: "Custom", rate: null },
] as const;

type TaxRatePreset = (typeof TAX_RATE_PRESETS)[number]["value"];

type TaxRecord = {
  id: number;
  kind: string;
  amountKobo: number;
  taxRate: number;
  computedTax: number;
  netAmount: number;
  currency: string;
  occurredOn: string;
  description: string | null;
};

function toDateInputValue(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatAmount(amountKobo: number, currency: string) {
  return `${currency} ${(amountKobo / 100).toFixed(2)}`;
}

function parseTaxRate(raw: string) {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return parsed;
}

function computeTax(amountKobo: number, taxRate: number) {
  const computedTax = Math.round(amountKobo * (taxRate / 100));
  const netAmount = Math.round(amountKobo - computedTax);
  return { computedTax, netAmount };
}

function findPresetByRate(rate: number): TaxRatePreset {
  const match = TAX_RATE_PRESETS.find(
    (preset) => preset.rate !== null && Math.abs(preset.rate - rate) < 0.001
  );
  return match?.value ?? "CUSTOM";
}

export default function TaxRecordsClient() {
  const router = useRouter();
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [taxType, setTaxType] = useState("INCOME");
  const [amount, setAmount] = useState("");
  const [taxRatePreset, setTaxRatePreset] = useState<TaxRatePreset>("CUSTOM");
  const [taxRate, setTaxRate] = useState("0");
  const [occurredOn, setOccurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const isEditing = editingId !== null;
  const amountValue =
    amount.trim() === "" ? null : Number(amount);
  const amountKoboPreview =
    amountValue !== null && Number.isFinite(amountValue)
      ? Math.round(amountValue * 100)
      : null;
  const ratePreview = parseTaxRate(taxRate);
  const computedPreview =
    amountKoboPreview !== null && ratePreview !== null
      ? computeTax(amountKoboPreview, ratePreview)
      : null;

  const loadRecords = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/tax-records", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setListError(data?.error ?? "Failed to load records");
        return;
      }
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch {
      setListError("Network error loading records");
    } finally {
      setLoadingList(false);
    }
  }, [router]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function resetForm() {
    setEditingId(null);
    setTaxType("INCOME");
    setAmount("");
    setTaxRatePreset("CUSTOM");
    setTaxRate("0");
    setCurrency("NGN");
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setDescription("");
    setFormError(null);
  }

  function startEdit(record: TaxRecord) {
    setEditingId(record.id);
    setTaxType(record.kind);
    setAmount((record.amountKobo / 100).toFixed(2));
    setTaxRate(String(record.taxRate ?? 0));
    setTaxRatePreset(findPresetByRate(record.taxRate ?? 0));
    setCurrency(record.currency || "NGN");
    setOccurredOn(toDateInputValue(record.occurredOn));
    setDescription(record.description ?? "");
    setFormError(null);
    setFormMsg(null);
  }

  function onTaxPresetChange(value: TaxRatePreset) {
    setTaxRatePreset(value);
    const preset = TAX_RATE_PRESETS.find((item) => item.value === value);
    if (preset && preset.rate !== null) {
      setTaxRate(String(preset.rate));
    }
  }

  function validateForm() {
    if (!taxType.trim()) {
      return "Tax type is required";
    }
    if (!occurredOn) {
      return "Date is required";
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return "Amount must be greater than 0";
    }
    const parsedRate = parseTaxRate(taxRate);
    if (parsedRate === null) {
      return "Tax rate must be between 0 and 100";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormMsg(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const amountKobo = Math.round(Number(amount) * 100);
    const parsedRate = parseTaxRate(taxRate);
    if (parsedRate === null) {
      setFormError("Tax rate must be between 0 and 100");
      return;
    }
    const payload = {
      id: editingId ?? undefined,
      kind: taxType,
      amountKobo,
      taxRate: parsedRate,
      currency,
      occurredOn,
      description,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/tax-records", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to save tax record");
        return;
      }

      setFormMsg(isEditing ? "Record updated" : "Record created");
      resetForm();
      await loadRecords();
    } catch {
      setFormError("Network error saving record");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(recordId: number) {
    if (!confirm("Delete this record?")) return;
    setDeletingId(recordId);
    setListError(null);
    try {
      const res = await fetch("/api/tax-records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data?.error ?? "Failed to delete record");
        return;
      }
      await loadRecords();
    } catch {
      setListError("Network error deleting record");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 6, fontWeight: 600, color: "#0f172a" }}>
          Tax records
        </h1>
        <p style={{ color: "#475569" }}>Capture income, expenses, and tax events.</p>
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
          display: "grid",
          gap: 12,
          maxWidth: 640,
        }}
      >
        <div style={{ fontWeight: 600, color: "#0f172a" }}>
          {isEditing ? "Edit record" : "New record"}
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Tax type
          <select value={taxType} onChange={(e) => setTaxType(e.target.value)}>
            {TAX_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Tax rate preset
          <select
            value={taxRatePreset}
            onChange={(e) => onTaxPresetChange(e.target.value as TaxRatePreset)}
          >
            {TAX_RATE_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {taxRatePreset === "CUSTOM" ? (
          <label style={{ display: "grid", gap: 6 }}>
            Custom tax rate (%)
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="0"
            />
          </label>
        ) : (
          <div style={{ color: "#475569" }}>Applied rate: {taxRate}%</div>
        )}

        <div style={{ color: "#475569", display: "grid", gap: 4 }}>
          <div>
            Computed tax:{" "}
            {computedPreview
              ? formatAmount(computedPreview.computedTax, currency)
              : "--"}
          </div>
          <div>
            Net amount:{" "}
            {computedPreview
              ? formatAmount(computedPreview.netAmount, currency)
              : "--"}
          </div>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Date
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes"
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update record" : "Create record"}
          </button>
          {isEditing && (
            <button type="button" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>

        {formError && <p style={{ color: "#b91c1c" }}>{formError}</p>}
        {formMsg && <p style={{ color: "#15803d" }}>{formMsg}</p>}
      </form>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }}
      >
        {loadingList ? (
          <p style={{ color: "#475569" }}>Loading records...</p>
        ) : records.length === 0 ? (
          <p style={{ color: "#475569" }}>No tax records yet. Add your first entry.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ paddingBottom: 8 }}>Date</th>
                <th style={{ paddingBottom: 8 }}>Type</th>
                <th style={{ paddingBottom: 8 }}>Amount</th>
                <th style={{ paddingBottom: 8 }}>Rate</th>
                <th style={{ paddingBottom: 8 }}>Tax</th>
                <th style={{ paddingBottom: 8 }}>Net</th>
                <th style={{ paddingBottom: 8 }}>Description</th>
                <th style={{ paddingBottom: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 0" }}>
                    {new Date(record.occurredOn).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px 0" }}>{record.kind}</td>
                  <td style={{ padding: "8px 0" }}>
                    {formatAmount(record.amountKobo, record.currency)}
                  </td>
                  <td style={{ padding: "8px 0" }}>{record.taxRate}%</td>
                  <td style={{ padding: "8px 0" }}>
                    {formatAmount(record.computedTax, record.currency)}
                  </td>
                  <td style={{ padding: "8px 0" }}>
                    {formatAmount(record.netAmount, record.currency)}
                  </td>
                  <td style={{ padding: "8px 0" }}>{record.description ?? "-"}</td>
                  <td style={{ padding: "8px 0" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => startEdit(record)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(record.id)}
                        disabled={deletingId === record.id}
                      >
                        {deletingId === record.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {listError && <p style={{ marginTop: 12, color: "#b91c1c" }}>{listError}</p>}
      </div>
    </section>
  );
}
