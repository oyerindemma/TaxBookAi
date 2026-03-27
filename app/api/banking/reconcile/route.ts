import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import {
  BANK_TRANSACTION_STATUSES,
  createManualLedgerMatch,
  getWorkspaceBankingDashboard,
  ignoreBankTransaction,
  linkBankTransactionToLedger,
  linkBankTransactionToInvoice,
  splitBankTransaction,
  updateBankTransactionClassification,
} from "@/lib/banking";

export const runtime = "nodejs";

function parseOptionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseStatus(value: string | null) {
  if (!value) return null;
  return BANK_TRANSACTION_STATUSES.includes(value.toUpperCase() as (typeof BANK_TRANSACTION_STATUSES)[number])
    ? (value.toUpperCase() as (typeof BANK_TRANSACTION_STATUSES)[number])
    : null;
}

function parseMinorAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function parseVatTreatment(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "INPUT" || normalized === "OUTPUT" || normalized === "EXEMPT"
    ? normalized
    : "NONE";
}

function parseWhtTreatment(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "PAYABLE" || normalized === "RECEIVABLE" ? normalized : "NONE";
}

function parseSuggestedType(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "INCOME" ||
    normalized === "EXPENSE" ||
    normalized === "TRANSFER" ||
    normalized === "OWNER_DRAW"
    ? normalized
    : "UNKNOWN";
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

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
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

  try {
    const url = new URL(req.url);
    const dashboard = await getWorkspaceBankingDashboard({
      workspaceId: ctx.workspaceId,
      status: parseStatus(url.searchParams.get("status")),
      bankAccountId: parseOptionalId(url.searchParams.get("bankAccountId")),
      clientBusinessId: parseOptionalId(url.searchParams.get("clientBusinessId")),
      importId: parseOptionalId(url.searchParams.get("importId")),
      query: url.searchParams.get("query"),
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    logRouteError("banking reconcile dashboard failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to load banking dashboard" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
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

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const transactionId = parseOptionalId(body.transactionId);

    if (!transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
    }

    if (action === "ignore") {
      const transaction = await ignoreBankTransaction({
        workspaceId: ctx.workspaceId,
        transactionId,
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_IGNORED",
        metadata: {
          transactionId,
        },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "reclassify") {
      const transaction = await updateBankTransactionClassification({
        workspaceId: ctx.workspaceId,
        transactionId,
        clientBusinessId: parseOptionalId(body.clientBusinessId),
        suggestedType: parseSuggestedType(body.suggestedType),
        counterpartyName:
          typeof body.counterpartyName === "string" ? body.counterpartyName : null,
        categoryName:
          typeof body.categoryName === "string" ? body.categoryName : null,
        vatTreatment: parseVatTreatment(body.vatTreatment),
        whtTreatment: parseWhtTreatment(body.whtTreatment),
        notes: typeof body.notes === "string" ? body.notes : null,
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_RECLASSIFIED",
        metadata: {
          transactionId,
        },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "create_ledger") {
      const transaction = await createManualLedgerMatch({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        payload: {
          transactionId,
          clientBusinessId: parseOptionalId(body.clientBusinessId),
          description: typeof body.description === "string" ? body.description : null,
          reference: typeof body.reference === "string" ? body.reference : null,
          vendorName: typeof body.vendorName === "string" ? body.vendorName : null,
          categoryId: parseOptionalId(body.categoryId),
          categoryName: typeof body.categoryName === "string" ? body.categoryName : null,
          suggestedType: parseSuggestedType(body.suggestedType),
          vatTreatment: parseVatTreatment(body.vatTreatment),
          whtTreatment: parseWhtTreatment(body.whtTreatment),
          vatAmountMinor: parseMinorAmount(body.vatAmountMinor),
          whtAmountMinor: parseMinorAmount(body.whtAmountMinor),
          notes: typeof body.notes === "string" ? body.notes : null,
        },
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_POSTED",
        metadata: {
          transactionId,
          mode: "manual",
        },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "link_invoice") {
      const invoiceId = parseOptionalId(body.invoiceId);
      if (!invoiceId) {
        return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
      }

      const transaction = await linkBankTransactionToInvoice({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        payload: {
          transactionId,
          invoiceId,
          clientBusinessId: parseOptionalId(body.clientBusinessId),
        },
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_LINKED_TO_INVOICE",
        metadata: {
          transactionId,
          invoiceId,
        },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "link_ledger") {
      const ledgerTransactionId = parseOptionalId(body.ledgerTransactionId);
      if (!ledgerTransactionId) {
        return NextResponse.json(
          { error: "ledgerTransactionId is required" },
          { status: 400 }
        );
      }

      const transaction = await linkBankTransactionToLedger({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        payload: {
          transactionId,
          ledgerTransactionId,
          clientBusinessId: parseOptionalId(body.clientBusinessId),
        },
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_LINKED_TO_LEDGER",
        metadata: {
          transactionId,
          ledgerTransactionId,
        },
      });

      return NextResponse.json({ transaction });
    }

    if (action === "split") {
      const rawLines = Array.isArray(body.lines) ? body.lines : [];
      if (rawLines.length < 2) {
        return NextResponse.json(
          { error: "Provide at least two split lines" },
          { status: 400 }
        );
      }

      const transaction = await splitBankTransaction({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        transactionId,
        clientBusinessId: parseOptionalId(body.clientBusinessId),
        lines: rawLines.map((line) => {
          const value = line as Record<string, unknown>;
          return {
            description: typeof value.description === "string" ? value.description : "",
            reference: typeof value.reference === "string" ? value.reference : null,
            amountMinor: parseMinorAmount(value.amountMinor) ?? 0,
            vendorName: typeof value.vendorName === "string" ? value.vendorName : null,
            categoryId: parseOptionalId(value.categoryId),
            categoryName: typeof value.categoryName === "string" ? value.categoryName : null,
            suggestedType: parseSuggestedType(value.suggestedType),
            vatTreatment: parseVatTreatment(value.vatTreatment),
            whtTreatment: parseWhtTreatment(value.whtTreatment),
            vatAmountMinor: parseMinorAmount(value.vatAmountMinor),
            whtAmountMinor: parseMinorAmount(value.whtAmountMinor),
            notes: typeof value.notes === "string" ? value.notes : null,
          };
        }),
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "BANK_TRANSACTION_SPLIT",
        metadata: {
          transactionId,
          lineCount: rawLines.length,
        },
      });

      return NextResponse.json({ transaction });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    logRouteError("bank reconcile action failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process reconcile action",
      },
      { status: 500 }
    );
  }
}
