import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  buildTaxComplianceSummary,
  buildTaxExportPack,
  getReadinessLabel,
  resolveTaxPeriodState,
} from "@/lib/tax-compliance";
import { getFiscalMonthLabel, NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";
import { prisma } from "@/lib/prisma";
import { getWorkspaceTaxRecords } from "@/lib/tax-reporting";

export const runtime = "nodejs";

function formatAmount(amountKobo: number) {
  return (amountKobo / 100).toFixed(2);
}

function csvEscape(value: string) {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }
  if (value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value}"`;
  }
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMetricRow(label: string, value: string) {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value
  )}</strong></div>`;
}

function renderReviewHtml(input: {
  workspaceName: string;
  pack: ReturnType<typeof buildTaxExportPack>;
}) {
  const { workspaceName, pack } = input;
  const { summary } = pack;
  const currency = summary.currency;
  const readinessNotes =
    summary.companyTax.readinessNotes.length > 0
      ? summary.companyTax.readinessNotes
          .map((note) => `<li>${escapeHtml(note)}</li>`)
          .join("")
      : `<li>No additional readiness notes were generated.</li>`;
  const disclaimers = summary.disclaimers
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaxBook Accountant Review Pack</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #f6f5ef;
        color: #14213d;
        font-family: Georgia, "Times New Roman", serif;
      }
      .shell {
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }
      .actions button {
        border: 1px solid #14213d;
        background: white;
        color: #14213d;
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }
      .paper {
        background: white;
        border: 1px solid #ddd5c5;
        padding: 32px;
      }
      h1, h2, h3 { margin: 0; }
      .intro { margin-top: 10px; color: #5b6270; }
      .meta {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin: 24px 0 28px;
      }
      .meta-card, .panel {
        border: 1px solid #ddd5c5;
        padding: 16px;
      }
      .meta-label, .eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #6b7280;
      }
      .meta-value {
        margin-top: 8px;
        font-size: 20px;
        font-weight: 700;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 20px;
      }
      .metric-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #ece5d9;
      }
      .metric-row:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }
      .note-list {
        margin: 12px 0 0;
        padding-left: 18px;
        color: #5b6270;
      }
      .summary-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-bottom: 20px;
      }
      @media print {
        body { background: white; }
        .shell { max-width: none; padding: 0; }
        .actions { display: none; }
        .paper { border: 0; padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="actions">
        <button onclick="window.print()">Print / Save PDF</button>
        <button onclick="window.close()">Close</button>
      </div>
      <div class="paper">
        <h1>Nigerian Tax Compliance Review Pack</h1>
        <p class="intro">Prepared from TaxBook workspace transactions for accountant review before FIRS filing.</p>

        <div class="meta">
          <div class="meta-card">
            <div class="meta-label">Workspace</div>
            <div class="meta-value">${escapeHtml(workspaceName)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Period</div>
            <div class="meta-value">${escapeHtml(summary.period.label)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Generated</div>
            <div class="meta-value">${escapeHtml(pack.generatedAt.slice(0, 10))}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Currency</div>
            <div class="meta-value">${escapeHtml(currency)}</div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="panel">
            <div class="eyebrow">VAT</div>
            ${renderMetricRow("Output VAT", `${currency} ${formatAmount(summary.vat.outputVat)}`)}
            ${renderMetricRow("Input VAT", `${currency} ${formatAmount(summary.vat.inputVat)}`)}
            ${renderMetricRow("Net VAT", `${currency} ${formatAmount(summary.vat.netVat)}`)}
          </div>
          <div class="panel">
            <div class="eyebrow">WHT</div>
            ${renderMetricRow("WHT deducted", `${currency} ${formatAmount(summary.wht.deducted)}`)}
            ${renderMetricRow("WHT suffered", `${currency} ${formatAmount(summary.wht.suffered)}`)}
            ${renderMetricRow("Net WHT position", `${currency} ${formatAmount(summary.wht.netPosition)}`)}
          </div>
        </div>

        <div class="grid">
          <div class="panel">
            <div class="eyebrow">Company tax readiness</div>
            ${renderMetricRow("Status", getReadinessLabel(summary.companyTax.readinessStatus))}
            ${renderMetricRow("Taxable income estimate", `${currency} ${formatAmount(summary.companyTax.taxableIncomeEstimate)}`)}
            ${renderMetricRow("Income base", `${currency} ${formatAmount(summary.companyTax.incomeBase)}`)}
            ${renderMetricRow("Expense base", `${currency} ${formatAmount(summary.companyTax.expenseBase)}`)}
          </div>
          <div class="panel">
            <div class="eyebrow">Review checks</div>
            ${renderMetricRow("Uncategorized expenses", String(summary.companyTax.uncategorizedExpenseCount))}
            ${renderMetricRow("Missing counterparties", String(summary.companyTax.missingCounterpartyCount))}
            ${renderMetricRow("Manual tax assumptions", String(summary.companyTax.manualTaxReviewCount))}
            ${renderMetricRow("Tax-bearing records", String(summary.counts.taxBearingRecords))}
          </div>
          <div class="panel">
            <div class="eyebrow">Configured defaults</div>
            ${renderMetricRow("VAT standard rate", `${NIGERIA_TAX_CONFIG.vat.standardRate}%`)}
            ${renderMetricRow("WHT heuristic default", `${NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate}%`)}
            ${renderMetricRow(
              "Fiscal year starts",
              getFiscalMonthLabel(summary.companyTax.fiscalYearStartMonth)
            )}
            ${renderMetricRow("FIRS adapter", NIGERIA_TAX_CONFIG.firsIntegration.adapterReady ? "Ready" : "Not ready")}
          </div>
        </div>

        <div class="panel" style="margin-bottom: 16px;">
          <div class="eyebrow">Readiness notes</div>
          <ul class="note-list">${readinessNotes}</ul>
        </div>

        <div class="panel">
          <div class="eyebrow">Disclaimers</div>
          <ul class="note-list">${disclaimers}</ul>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildRecordCsvLines(
  rows: ReturnType<typeof buildTaxExportPack>["vatRows"],
  directionKey: "vatDirection" | "whtDirection"
) {
  return [
    [
      "Date",
      "Direction",
      "RecordKind",
      "VendorName",
      "Category",
      "Description",
      "GrossAmount",
      "TaxRate",
      "TaxAmount",
      "NetAmount",
      "Currency",
      "Confidence",
      "Assumptions",
    ],
    ...rows.map((row) => [
      row.occurredOn,
      String(row[directionKey] ?? ""),
      row.kind,
      row.vendorName ?? "",
      row.categoryName ?? "",
      row.description ?? "",
      formatAmount(row.amountKobo),
      row.taxRate.toString(),
      formatAmount(row.taxAmountKobo),
      formatAmount(row.netAmountKobo),
      row.currency,
      row.confidence,
      row.assumptions.join(" | "),
    ]),
  ]
    .map((row) => row.map((value) => csvEscape(String(value))).join(","))
    .join("\n");
}

function buildSummaryCsv(input: {
  workspaceName: string;
  pack: ReturnType<typeof buildTaxExportPack>;
}) {
  const { workspaceName, pack } = input;
  const { summary } = pack;

  return [
    ["TaxBook Nigerian Tax Compliance Summary"],
    ["Workspace", workspaceName],
    ["Period", summary.period.label],
    ["GeneratedAt", pack.generatedAt],
    ["Authority", pack.authority],
    ["SchemaVersion", String(pack.schemaVersion)],
    [],
    ["Section", "Metric", "Amount", "Currency", "Notes"],
    ["VAT", "Output VAT", formatAmount(summary.vat.outputVat), summary.currency, "Income-side VAT and manual output VAT adjustments"],
    ["VAT", "Input VAT", formatAmount(summary.vat.inputVat), summary.currency, "Expense-side VAT and manual input VAT adjustments"],
    ["VAT", "Net VAT", formatAmount(summary.vat.netVat), summary.currency, "Output VAT minus input VAT"],
    ["WHT", "WHT deducted", formatAmount(summary.wht.deducted), summary.currency, "Supplier and outgoing-payment withholding"],
    ["WHT", "WHT suffered", formatAmount(summary.wht.suffered), summary.currency, "Customer-side withholding suffered by the business"],
    ["WHT", "Net WHT position", formatAmount(summary.wht.netPosition), summary.currency, "WHT suffered minus WHT deducted"],
    ["CompanyTax", "Taxable income estimate", formatAmount(summary.companyTax.taxableIncomeEstimate), summary.currency, "Income base minus expense base after VAT treatment"],
    ["CompanyTax", "Income base", formatAmount(summary.companyTax.incomeBase), summary.currency, "Income estimate basis"],
    ["CompanyTax", "Expense base", formatAmount(summary.companyTax.expenseBase), summary.currency, "Expense estimate basis"],
    ["CompanyTax", "Readiness status", getReadinessLabel(summary.companyTax.readinessStatus), "", "Basic readiness classification only"],
    [],
    ["Checks", "Uncategorized expenses", String(summary.companyTax.uncategorizedExpenseCount), "", ""],
    ["Checks", "Missing counterparties", String(summary.companyTax.missingCounterpartyCount), "", ""],
    ["Checks", "Manual tax assumptions", String(summary.companyTax.manualTaxReviewCount), "", ""],
    [],
    ["Disclaimers"],
    ...summary.disclaimers.map((note) => [note]),
    [],
    ["ReadinessNotes"],
    ...summary.companyTax.readinessNotes.map((note) => [note]),
  ]
    .map((row) => row.map((value) => csvEscape(String(value))).join(","))
    .join("\n");
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(
    ctx.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }

  const url = new URL(req.url);
  const rawFormat = url.searchParams.get("format") ?? "summary-csv";
  const format =
    rawFormat === "csv"
      ? "summary-csv"
      : rawFormat === "print"
        ? "review-html"
        : rawFormat;

  if (!["vat-csv", "wht-csv", "summary-csv", "review-html"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const period = resolveTaxPeriodState({
    period: url.searchParams.get("period") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    quarter: url.searchParams.get("quarter") ?? undefined,
    year: url.searchParams.get("year") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  if (period.errorMsg) {
    return NextResponse.json({ error: period.errorMsg }, { status: 400 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      name: true,
      businessProfile: {
        select: {
          defaultCurrency: true,
          fiscalYearStartMonth: true,
        },
      },
    },
  });

  const taxRecordsResult = await getWorkspaceTaxRecords(ctx.workspaceId, {
    fromParam: period.fromParam,
    toParam: period.toParam,
  });
  if (taxRecordsResult.errorMsg) {
    return NextResponse.json({ error: taxRecordsResult.errorMsg }, { status: 400 });
  }

  const summary = buildTaxComplianceSummary({
    records: taxRecordsResult.records,
    period,
    defaultCurrency: workspace?.businessProfile?.defaultCurrency ?? "NGN",
    fiscalYearStartMonth:
      workspace?.businessProfile?.fiscalYearStartMonth ??
      NIGERIA_TAX_CONFIG.companyTax.fiscalYearDefaultStartMonth,
  });
  const pack = buildTaxExportPack(summary);
  const workspaceName = workspace?.name ?? `Workspace ${ctx.workspaceId}`;

  await logAudit({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "TAX_COMPLIANCE_EXPORTED",
    metadata: {
      format,
      periodMode: summary.period.mode,
      periodLabel: summary.period.label,
      vatOutput: summary.vat.outputVat,
      vatInput: summary.vat.inputVat,
      whtDeducted: summary.wht.deducted,
      whtSuffered: summary.wht.suffered,
      taxableIncomeEstimate: summary.companyTax.taxableIncomeEstimate,
    },
  });

  if (format === "review-html") {
    return new NextResponse(
      renderReviewHtml({
        workspaceName,
        pack,
      }),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  }

  if (format === "vat-csv") {
    return new NextResponse(buildRecordCsvLines(pack.vatRows, "vatDirection"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=vat-records.csv",
      },
    });
  }

  if (format === "wht-csv") {
    return new NextResponse(buildRecordCsvLines(pack.whtRows, "whtDirection"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=wht-records.csv",
      },
    });
  }

  return new NextResponse(
    buildSummaryCsv({
      workspaceName,
      pack,
    }),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=tax-compliance-summary.csv",
      },
    }
  );
}
