import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDateParam(raw: string | null, boundary: "start" | "end") {
  if (!raw) return null;
  const iso =
    boundary === "start"
      ? `${raw}T00:00:00.000Z`
      : `${raw}T23:59:59.999Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

function formatAmount(amountKobo: number) {
  return (amountKobo / 100).toFixed(2);
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

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = parseDateParam(fromRaw, "start");
  const to = parseDateParam(toRaw, "end");

  if ((fromRaw && !from) || (toRaw && !to)) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
  }

  if (from && to && from > to) {
    return NextResponse.json(
      { error: "from date must be before to date" },
      { status: 400 }
    );
  }

  const where: {
    workspaceId: number;
    occurredOn?: { gte?: Date; lte?: Date };
  } = { workspaceId: ctx.workspaceId };

  if (from || to) {
    where.occurredOn = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const records = await prisma.taxRecord.findMany({
    where,
    orderBy: { occurredOn: "desc" },
  });

  let totalGross = 0;
  let totalTax = 0;
  let totalNet = 0;
  const currencySet = new Set<string>();

  for (const record of records) {
    totalGross += record.amountKobo;
    totalTax += record.computedTax;
    totalNet += record.netAmount;
    currencySet.add(record.currency);
  }

  const totalCurrency = currencySet.size === 1 ? [...currencySet][0] : "MIXED";

  const lines: string[] = [];
  lines.push(
    [
      "Date",
      "Type",
      "Amount",
      "TaxRate",
      "ComputedTax",
      "NetAmount",
      "Currency",
      "Description",
    ]
      .map(csvEscape)
      .join(",")
  );

  for (const record of records) {
    lines.push(
      [
        new Date(record.occurredOn).toISOString().slice(0, 10),
        record.kind,
        formatAmount(record.amountKobo),
        record.taxRate.toString(),
        formatAmount(record.computedTax),
        formatAmount(record.netAmount),
        record.currency,
        record.description ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  lines.push(
    [
      "TOTALS",
      "",
      formatAmount(totalGross),
      "",
      formatAmount(totalTax),
      formatAmount(totalNet),
      totalCurrency,
      "",
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=tax-records-report.csv",
    },
  });
}
