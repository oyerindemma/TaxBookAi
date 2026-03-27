"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type Mapping = {
  date: string;
  kind: string;
  amount: string;
  taxRate: string;
  currency: string;
  description: string;
};

function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let current: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "," || char === "\n" || char === "\r")) {
      current.push(value);
      value = "";

      if (char === "\n") {
        rows.push(current);
        current = [];
      }
      if (char === "\r") {
        if (text[i + 1] === "\n") {
          i += 1;
        }
        rows.push(current);
        current = [];
      }
      continue;
    }

    value += char;
  }

  current.push(value);
  rows.push(current);

  const cleaned = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = (cleaned.shift() ?? []).map((cell) => cell.trim());
  return { headers, rows: cleaned };
}

function suggestMapping(headers: string[]): Mapping {
  const lowered = headers.map((header) => header.toLowerCase());
  const findHeader = (keys: string[]) => {
    const index = lowered.findIndex((header) =>
      keys.some((key) => header.includes(key))
    );
    return index >= 0 ? headers[index] : "";
  };

  return {
    date: findHeader(["date", "occurred", "occured"]),
    kind: findHeader(["kind", "type", "category"]),
    amount: findHeader(["amount", "gross", "value"]),
    taxRate: findHeader(["tax", "rate", "vat", "wht"]),
    currency: findHeader(["currency", "curr"]),
    description: findHeader(["description", "desc", "note", "memo"]),
  };
}

type Props = {
  role: Role;
};

export default function TaxRecordsImportClient({ role }: Props) {
  const router = useRouter();
  const canImport = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    date: "",
    kind: "",
    amount: "",
    taxRate: "",
    currency: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    const headerIndex = new Map<string, number>();
    parsed.headers.forEach((header, index) => headerIndex.set(header, index));

    const getCell = (row: string[], header: string) => {
      const idx = headerIndex.get(header);
      if (idx === undefined) return "";
      return row[idx] ?? "";
    };

    return parsed.rows.slice(0, 6).map((row) => ({
      date: mapping.date ? getCell(row, mapping.date) : "",
      kind: mapping.kind ? getCell(row, mapping.kind) : "",
      amount: mapping.amount ? getCell(row, mapping.amount) : "",
      taxRate: mapping.taxRate ? getCell(row, mapping.taxRate) : "",
      currency: mapping.currency ? getCell(row, mapping.currency) : "",
      description: mapping.description ? getCell(row, mapping.description) : "",
    }));
  }, [parsed, mapping]);

  const readyToImport =
    canImport &&
    parsed &&
    parsed.rows.length > 0 &&
    mapping.date &&
    mapping.kind &&
    mapping.amount &&
    !importing;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setMessage(null);
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();
    const parsedCsv = parseCsv(text);
    setParsed(parsedCsv);
    setMapping(suggestMapping(parsedCsv.headers));
  }

  async function handleImport() {
    if (!parsed || !canImport) return;
    setError(null);
    setMessage(null);

    if (!mapping.date || !mapping.kind || !mapping.amount) {
      setError("Map date, kind, and amount before importing.");
      return;
    }

    const headerIndex = new Map<string, number>();
    parsed.headers.forEach((header, index) => headerIndex.set(header, index));
    const getCell = (row: string[], header: string) => {
      const idx = headerIndex.get(header);
      if (idx === undefined) return "";
      return row[idx] ?? "";
    };

    const rows = parsed.rows.map((row) => ({
      date: mapping.date ? getCell(row, mapping.date) : "",
      kind: mapping.kind ? getCell(row, mapping.kind) : "",
      amount: mapping.amount ? getCell(row, mapping.amount) : "",
      taxRate: mapping.taxRate ? getCell(row, mapping.taxRate) : "",
      currency: mapping.currency ? getCell(row, mapping.currency) : "",
      description: mapping.description ? getCell(row, mapping.description) : "",
    }));

    setImporting(true);
    try {
      const res = await fetch("/api/tax-records/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data?.errors)) {
          const first = data.errors[0];
          setError(
            `Row ${first.row}: ${first.field} ${first.message}. ${data.errors.length} error(s).`
          );
        } else {
          setError(data?.error ?? "Import failed");
        }
        return;
      }
      setMessage(`Imported ${data?.inserted ?? 0} records.`);
      router.push("/dashboard/tax-records");
      router.refresh();
    } catch {
      setError("Network error importing records");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Import tax records</h1>
        <p className="text-muted-foreground">
          Upload a CSV and map columns before importing.
        </p>
        <p className="text-xs text-muted-foreground">
          Need a template?{" "}
          <a className="underline" href="/docs/sample-tax-records.csv">
            Download sample CSV
          </a>
        </p>
      </div>

      {!canImport && (
        <Card>
          <CardHeader>
            <CardTitle>Read-only access</CardTitle>
            <CardDescription>
              You need member access or higher to import records.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
          <CardDescription>Select a CSV file to import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={!canImport}
            />
          </div>
          {fileName && <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>}
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>Rows detected: {parsed.rows.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 max-w-md">
              {([
                ["date", "Date (required)"],
                ["kind", "Kind (required)"],
                ["amount", "Amount (required)"],
                ["taxRate", "Tax rate"],
                ["currency", "Currency"],
                ["description", "Description"],
              ] as const).map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm">
                  {label}
                  <select
                    value={mapping[key]}
                    onChange={(event) =>
                      setMapping((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    disabled={!canImport}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Ignore</option>
                    {parsed.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="grid gap-2">
              <strong className="text-sm">Preview</strong>
              {previewRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rows to preview.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Kind</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">TaxRate</th>
                      <th className="pb-3 font-medium">Currency</th>
                      <th className="pb-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index} className="border-b last:border-b-0">
                        <td className="py-3">{row.date || "-"}</td>
                        <td className="py-3">{row.kind || "-"}</td>
                        <td className="py-3">{row.amount || "-"}</td>
                        <td className="py-3">{row.taxRate || "-"}</td>
                        <td className="py-3">{row.currency || "-"}</td>
                        <td className="py-3">{row.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-emerald-600">{message}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!readyToImport} onClick={handleImport}>
                {importing ? "Importing..." : "Import records"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/tax-records")}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
