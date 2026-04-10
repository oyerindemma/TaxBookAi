import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import {
  previewBankStatementCsv,
  importBankStatementCsv,
  type BankImportColumnMapping,
} from "@/lib/banking";

export const runtime = "nodejs";
const MAX_BANK_IMPORT_CSV_BYTES = 5 * 1024 * 1024;

function isBankImportValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
    "Bank account not found",
    "Select a client business before importing a statement",
    "Select a bank account that belongs to the chosen client business.",
    "Client business not found",
    ].includes(error.message)
  );
}

function parseOptionalId(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseRequiredId(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseMapping(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      transactionDate:
        typeof parsed.transactionDate === "string" && parsed.transactionDate.trim()
          ? parsed.transactionDate.trim()
          : null,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : null,
      debit:
        typeof parsed.debit === "string" && parsed.debit.trim()
          ? parsed.debit.trim()
          : null,
      credit:
        typeof parsed.credit === "string" && parsed.credit.trim()
          ? parsed.credit.trim()
          : null,
      amount:
        typeof parsed.amount === "string" && parsed.amount.trim()
          ? parsed.amount.trim()
          : null,
      balance:
        typeof parsed.balance === "string" && parsed.balance.trim()
          ? parsed.balance.trim()
          : null,
      reference:
        typeof parsed.reference === "string" && parsed.reference.trim()
          ? parsed.reference.trim()
          : null,
    } satisfies BankImportColumnMapping;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/banking/import", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return attachTraceId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      logger.traceId
    );
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return attachTraceId(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      logger.traceId
    );
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
  if (!featureAccess.ok) {
    return attachTraceId(
      NextResponse.json(
        {
          error: featureAccess.error,
          currentPlan: featureAccess.plan,
          requiredPlan: featureAccess.requiredPlan,
        },
        { status: 402 }
      ),
      logger.traceId
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = typeof formData.get("mode") === "string" ? String(formData.get("mode")) : "preview";

    if (!(file instanceof File)) {
      return attachTraceId(
        NextResponse.json({ error: "A CSV file is required" }, { status: 400 }),
        logger.traceId
      );
    }

    if (file.size > MAX_BANK_IMPORT_CSV_BYTES) {
      return attachTraceId(
        NextResponse.json(
          {
            error:
              "The CSV file is too large. Keep bank statement CSV uploads under 5 MB.",
          },
          { status: 400 }
        ),
        logger.traceId
      );
    }

    const content = await file.text();
    if (!content.trim()) {
      return attachTraceId(
        NextResponse.json({ error: "The CSV file is empty" }, { status: 400 }),
        logger.traceId
      );
    }

    if (mode === "preview") {
      const preview = previewBankStatementCsv(content);
      logger.info("preview generated", {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fileName: file.name,
        uploadSizeBytes: file.size,
        previewRows: preview.previewRows.length,
      });
      return attachTraceId(NextResponse.json({ preview }), logger.traceId);
    }

    const mapping = parseMapping(formData.get("mapping"));
    if (!mapping) {
      return attachTraceId(
        NextResponse.json(
          { error: "A valid column mapping is required before import" },
          { status: 400 }
        ),
        logger.traceId
      );
    }

    const bankAccountId = parseRequiredId(formData.get("bankAccountId"));
    if (!bankAccountId) {
      return attachTraceId(
        NextResponse.json(
          { error: "Select a valid bank account before importing this CSV." },
          { status: 400 }
        ),
        logger.traceId
      );
    }

    const result = await importBankStatementCsv({
      workspaceId: ctx.workspaceId,
      uploadedByUserId: ctx.userId,
      bankAccountId,
      clientBusinessId: parseOptionalId(formData.get("clientBusinessId")),
      fileName: file.name,
      fileType: file.type || "text/csv",
      uploadSizeBytes: file.size,
      content,
      mapping,
    });

    if (!result.importId) {
      logger.warn("import completed without inserted rows", {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fileName: file.name,
        invalidRows: result.summary.invalidRows,
      });
      return attachTraceId(
        NextResponse.json(
          {
            error: "No valid rows were imported",
            summary: result.summary,
            categorization: result.categorization,
            pipeline: result.pipeline,
            errors: result.errors,
            guidance: result.guidance,
            links: result.links,
          },
          { status: 400 }
        ),
        logger.traceId
      );
    }

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "BANK_STATEMENT_IMPORTED",
      metadata: {
        importId: result.importId,
        importedCount: result.summary.importedRows,
        duplicateCount: result.summary.duplicateRows,
        failedCount: result.summary.invalidRows,
        queuedForReviewCount: result.pipeline.rowsQueuedForReview,
        categorizedCount: result.pipeline.rowsCategorized,
        taxReviewCount: result.pipeline.rowsFlaggedForTaxReview,
      },
    });

    logger.info("import completed", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      importId: result.importId,
      inserted: result.summary.importedRows,
      duplicateCount: result.summary.duplicateRows,
      failedCount: result.summary.invalidRows,
    });

    return attachTraceId(
      NextResponse.json({
        ok: true,
        importId: result.importId,
        summary: result.summary,
        categorization: result.categorization,
        pipeline: result.pipeline,
        errors: result.errors,
        guidance: result.guidance,
        createdTransactionIds: result.createdTransactionIds,
        links: result.links,
      }),
      logger.traceId
    );
  } catch (error) {
    if (isBankImportValidationError(error)) {
      return attachTraceId(
        NextResponse.json({ error: error.message }, { status: 400 }),
        logger.traceId
      );
    }

    logger.error("import failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload(
          error instanceof Error ? error.message : "Failed to import bank statement",
          logger.traceId
        ),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
