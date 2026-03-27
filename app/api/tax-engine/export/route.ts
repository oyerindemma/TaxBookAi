import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import {
  buildTaxEngineExportQuery,
  getWorkspaceTaxEngineOverview,
  parseClientBusinessFilter,
  parseReviewedFilter,
  parseTaxTypeFilter,
  toCsvRows,
} from "@/lib/tax-engine";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";

export const runtime = "nodejs";

function buildVatSummaryCsv(overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>) {
  return toCsvRows([
    ["Period", overview.period.label],
    [],
    [
      "Date",
      "ClientBusiness",
      "Counterparty",
      "Direction",
      "VATTreatment",
      "TaxCategory",
      "BasisAmount",
      "VATAmount",
      "Currency",
      "SourceType",
      "SourceRecordId",
      "SourceDocument",
      "Reviewed",
      "Flags",
    ],
    ...overview.vatRows.map((row) => [
      row.occurredOn?.slice(0, 10) ?? "",
      row.clientBusinessName ?? "",
      row.counterpartyName ?? "",
      row.direction,
      row.vatTreatment,
      row.taxCategory ?? "",
      (row.basisAmountMinor / 100).toFixed(2),
      (row.vatAmountMinor / 100).toFixed(2),
      row.currency,
      row.sourceType,
      row.sourceRecordId ?? "",
      row.sourceDocumentNumber ?? "",
      row.reviewed ? "Yes" : "No",
      row.flags.join(" | "),
    ]),
  ]);
}

function buildWhtScheduleCsv(
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>
) {
  return toCsvRows([
    ["Period", overview.period.label],
    [],
    [
      "Date",
      "ClientBusiness",
      "Counterparty",
      "CounterpartyTIN",
      "Direction",
      "WHTTreatment",
      "TaxCategory",
      "BasisAmount",
      "WHTRate",
      "WHTAmount",
      "Currency",
      "SourceType",
      "SourceRecordId",
      "Reviewed",
      "Flags",
    ],
    ...overview.whtRows.map((row) => [
      row.occurredOn?.slice(0, 10) ?? "",
      row.clientBusinessName ?? "",
      row.counterpartyName ?? "",
      row.counterpartyTaxId ?? "",
      row.direction,
      row.whtTreatment,
      row.taxCategory ?? "",
      (row.basisAmountMinor / 100).toFixed(2),
      row.whtRate.toFixed(1),
      (row.whtAmountMinor / 100).toFixed(2),
      row.currency,
      row.sourceType,
      row.sourceRecordId ?? "",
      row.reviewed ? "Yes" : "No",
      row.flags.join(" | "),
    ]),
  ]);
}

function buildPeriodSummaryCsv(
  overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>
) {
  return toCsvRows([
    ["Period", overview.period.label],
    ["Output VAT", (overview.totals.outputVatMinor / 100).toFixed(2)],
    ["Input VAT", (overview.totals.inputVatMinor / 100).toFixed(2)],
    ["Net VAT", (overview.totals.netVatMinor / 100).toFixed(2)],
    ["WHT Deducted", (overview.totals.whtDeductedMinor / 100).toFixed(2)],
    ["WHT Suffered", (overview.totals.whtSufferedMinor / 100).toFixed(2)],
    ["Accounting Profit Before Tax", (overview.totals.accountingProfitMinor / 100).toFixed(2)],
    ["Add-backs", (overview.totals.addBacksMinor / 100).toFixed(2)],
    ["Deductions", (overview.totals.deductionsMinor / 100).toFixed(2)],
    ["Tax-adjusted Profit", (overview.totals.taxAdjustedProfitMinor / 100).toFixed(2)],
    [],
    ["Business", "OutputVAT", "InputVAT", "NetVAT", "WHTDeducted", "WHTSuffered", "RecordCount"],
    ...overview.businesses.map((row) => [
      row.clientBusinessName,
      (row.outputVatMinor / 100).toFixed(2),
      (row.inputVatMinor / 100).toFixed(2),
      (row.netVatMinor / 100).toFixed(2),
      (row.whtDeductedMinor / 100).toFixed(2),
      (row.whtSufferedMinor / 100).toFixed(2),
      row.recordCount,
    ]),
  ]);
}

function buildExceptionCsv(overview: Awaited<ReturnType<typeof getWorkspaceTaxEngineOverview>>) {
  return toCsvRows([
    ["Period", overview.period.label],
    [],
    ["TaxType", "Severity", "ClientBusiness", "SourceType", "SourceRecordId", "Title", "Detail", "Reviewed"],
    ...overview.exceptions.map((row) => [
      row.taxType,
      row.severity,
      row.clientBusinessName ?? "",
      row.sourceType,
      row.sourceRecordId ?? "",
      row.title,
      row.detail,
      row.reviewed ? "Yes" : "No",
    ]),
  ]);
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

  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "period-summary-csv").trim();
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

    const overview = await getWorkspaceTaxEngineOverview({
      workspaceId: ctx.workspaceId,
      clientBusinessId: parseClientBusinessFilter(
        url.searchParams.get("clientBusinessId") ?? undefined
      ),
      reviewed: parseReviewedFilter(url.searchParams.get("reviewed") ?? undefined),
      taxType: parseTaxTypeFilter(url.searchParams.get("taxType") ?? undefined),
      period,
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_ENGINE_EXPORTED",
      metadata: {
        format,
        periodLabel: overview.period.label,
        query: buildTaxEngineExportQuery({
          period,
          clientBusinessId: overview.filters.clientBusinessId,
          reviewed: overview.filters.reviewed,
          taxType: overview.filters.taxType,
        }),
      },
    });

    if (format === "json") {
      return NextResponse.json({ overview });
    }

    const payload =
      format === "vat-summary-csv"
        ? buildVatSummaryCsv(overview)
        : format === "wht-schedule-csv"
          ? buildWhtScheduleCsv(overview)
          : format === "exception-report-csv"
            ? buildExceptionCsv(overview)
            : buildPeriodSummaryCsv(overview);

    const fileName =
      format === "vat-summary-csv"
        ? "vat-summary.csv"
        : format === "wht-schedule-csv"
          ? "wht-schedule.csv"
          : format === "exception-report-csv"
            ? "tax-exceptions.csv"
            : "tax-period-summary.csv";

    return new NextResponse(payload, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${fileName}`,
      },
    });
  } catch (error) {
    logRouteError("tax engine export failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error exporting tax engine data" },
      { status: 500 }
    );
  }
}
