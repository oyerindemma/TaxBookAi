import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import { getTaxFilingDetail, recordTaxFilingExport } from "@/lib/tax-filing";
import { toCsvRows } from "@/lib/tax-engine";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSummaryHtml(detail: NonNullable<Awaited<ReturnType<typeof getTaxFilingDetail>>>) {
  const checks = detail.checks
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.severity)}</strong>: ${escapeHtml(item.title)} - ${escapeHtml(item.detail)}</li>`
    )
    .join("");
  const exceptions =
    detail.exceptions.length > 0
      ? detail.exceptions
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.severity)}</strong>: ${escapeHtml(item.title)} - ${escapeHtml(item.detail)}</li>`
          )
          .join("")
      : "<li>No unresolved exceptions.</li>";
  const evidence =
    detail.evidence.length > 0
      ? detail.evidence
          .map(
            (item) =>
              `<li>${escapeHtml(item.label)} (${escapeHtml(item.evidenceKind)})${
                item.url ? ` - ${escapeHtml(item.url)}` : ""
              }</li>`
          )
          .join("")
      : "<li>No supporting evidence attached.</li>";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaxBook Filing Pack</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #f6f5ef; color: #1f2937; }
      .shell { max-width: 980px; margin: 0 auto; padding: 24px; }
      .paper { background: white; border: 1px solid #ddd5c5; padding: 28px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid #ddd5c5; padding: 16px; margin-bottom: 16px; }
      .meta { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 20px 0; }
      .meta div { border: 1px solid #ddd5c5; padding: 12px; }
      .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
      .value { margin-top: 6px; font-weight: 700; }
      ul { margin: 12px 0 0; padding-left: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-top: 1px solid #ece5d9; padding: 8px 0; text-align: left; font-size: 14px; }
      @media print { body { background: white; } .shell { padding: 0; } .paper { border: 0; padding: 0; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="paper">
        <h1>${escapeHtml(detail.draft.taxType)} filing pack</h1>
        <p>Prepared by TaxBook AI for manual submission support. Direct government submission is not implemented.</p>
        <div class="meta">
          <div><div class="label">Workspace</div><div class="value">${escapeHtml(detail.workspace.name)}</div></div>
          <div><div class="label">Business</div><div class="value">${escapeHtml(detail.clientBusiness.name ?? detail.workspace.businessName ?? detail.workspace.name)}</div></div>
          <div><div class="label">Period</div><div class="value">${escapeHtml(detail.period.label)}</div></div>
          <div><div class="label">Status</div><div class="value">${escapeHtml(detail.draft.status)}</div></div>
        </div>
        <div class="grid">
          <div class="card">
            <div class="label">${escapeHtml(detail.summary.headlineLabel)}</div>
            <div class="value">${escapeHtml(detail.summary.headlineAmountFormatted)}</div>
          </div>
          <div class="card">
            <div class="label">Adapter</div>
            <div class="value">${escapeHtml(detail.adapter.label)} (${escapeHtml(detail.adapter.mode)})</div>
          </div>
        </div>
        <div class="card">
          <div class="label">Pre-submission checks</div>
          <ul>${checks || "<li>No checks generated.</li>"}</ul>
        </div>
        <div class="card">
          <div class="label">Exceptions</div>
          <ul>${exceptions}</ul>
        </div>
        <div class="card">
          <div class="label">Evidence</div>
          <ul>${evidence}</ul>
        </div>
        <div class="card">
          <div class="label">Schedule preview</div>
          <table>
            <thead>
              <tr><th>Row</th><th>Source</th><th>Amount</th><th>Tax</th></tr>
            </thead>
            <tbody>
              ${detail.sourceItems
                .map(
                  (item) =>
                    `<tr><td>${item.id}</td><td>${escapeHtml(item.label)}</td><td>${item.amountMinor / 100}</td><td>${(item.taxAmountMinor ?? 0) / 100}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildScheduleCsv(detail: NonNullable<Awaited<ReturnType<typeof getTaxFilingDetail>>>) {
  if (detail.draft.taxType === "VAT") {
    return toCsvRows([
      [
        "OccurredOn",
        "SourceType",
        "SourceRecordId",
        "Counterparty",
        "Direction",
        "VATTreatment",
        "TaxCategory",
        "BasisAmountMinor",
        "VatAmountMinor",
        "Currency",
        "Flags",
      ],
      ...detail.scheduleRows.map((row) => [
        String(row.occurredOn ?? ""),
        String(row.sourceType ?? ""),
        Number(row.sourceRecordId ?? 0),
        String(row.counterpartyName ?? ""),
        String(row.direction ?? ""),
        String(row.vatTreatment ?? ""),
        String(row.taxCategory ?? ""),
        Number(row.basisAmountMinor ?? 0),
        Number(row.vatAmountMinor ?? 0),
        String(row.currency ?? ""),
        Array.isArray(row.flags) ? row.flags.join(" | ") : "",
      ]),
    ]);
  }

  if (detail.draft.taxType === "WHT") {
    return toCsvRows([
      [
        "OccurredOn",
        "SourceType",
        "SourceRecordId",
        "Counterparty",
        "Direction",
        "WHTTreatment",
        "TaxCategory",
        "BasisAmountMinor",
        "WhtRate",
        "WhtAmountMinor",
        "Currency",
        "Flags",
      ],
      ...detail.scheduleRows.map((row) => [
        String(row.occurredOn ?? ""),
        String(row.sourceType ?? ""),
        Number(row.sourceRecordId ?? 0),
        String(row.counterpartyName ?? ""),
        String(row.direction ?? ""),
        String(row.whtTreatment ?? ""),
        String(row.taxCategory ?? ""),
        Number(row.basisAmountMinor ?? 0),
        Number(row.whtRate ?? 0),
        Number(row.whtAmountMinor ?? 0),
        String(row.currency ?? ""),
        Array.isArray(row.flags) ? row.flags.join(" | ") : "",
      ]),
    ]);
  }

  return toCsvRows([
    ["Label", "Direction", "AmountMinor", "TaxAmountMinor", "Status", "Flags"],
    ...detail.scheduleRows.map((row) => [
      String(row.label ?? ""),
      String(row.direction ?? ""),
      Number(row.amountMinor ?? 0),
      Number(row.taxAmountMinor ?? 0),
      String(row.status ?? ""),
      Array.isArray(row.flags) ? row.flags.join(" | ") : "",
    ]),
  ]);
}

function buildChecklistCsv(detail: NonNullable<Awaited<ReturnType<typeof getTaxFilingDetail>>>) {
  return toCsvRows([
    ["Code", "Required", "Label", "Detail"],
    ...detail.checklist.map((item) => [
      item.code,
      item.required ? "YES" : "NO",
      item.label,
      item.detail,
    ]),
  ]);
}

export async function GET(req: Request, context: RouteContext) {
  const logger = createRouteLogger("/api/tax-filing/[id]/export", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return attachTraceId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      logger.traceId
    );
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return attachTraceId(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      logger.traceId
    );
  }

  const featureAccess = await getWorkspaceFeatureAccess(
    ctx.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!featureAccess.ok) {
    return attachTraceId(
      NextResponse.json({ error: featureAccess.error }, { status: 402 }),
      logger.traceId
    );
  }

  try {
    const { id } = await context.params;
    const filingDraftId = Number(id);
    if (!Number.isInteger(filingDraftId) || filingDraftId <= 0) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid filing draft id." }, { status: 400 }),
        logger.traceId
      );
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "schedule-csv").trim().toLowerCase();
    if (!["schedule-csv", "summary-html", "json", "checklist-csv"].includes(format)) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid export format." }, { status: 400 }),
        logger.traceId
      );
    }

    const detail = await getTaxFilingDetail({
      workspaceId: ctx.workspaceId,
      filingDraftId,
    });
    if (!detail) {
      return attachTraceId(
        NextResponse.json({ error: "Filing draft not found." }, { status: 404 }),
        logger.traceId
      );
    }

    await recordTaxFilingExport({
      workspaceId: ctx.workspaceId,
      filingDraftId,
      actorUserId: ctx.userId,
      format,
    });

    if (format === "summary-html") {
      return new NextResponse(renderSummaryHtml(detail), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (format === "json") {
      return new NextResponse(JSON.stringify(detail.payloadCandidate, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename=tax-filing-${filingDraftId}.json`,
        },
      });
    }

    if (format === "checklist-csv") {
      return new NextResponse(buildChecklistCsv(detail), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=tax-filing-checklist-${filingDraftId}.csv`,
        },
      });
    }

    return new NextResponse(buildScheduleCsv(detail), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=tax-filing-schedule-${filingDraftId}.csv`,
      },
    });
  } catch (error) {
    logger.error("export failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload("Failed to export the filing pack.", logger.traceId),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
