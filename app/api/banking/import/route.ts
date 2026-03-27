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

function parseOptionalId(value: FormDataEntryValue | null) {
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

    const result = await importBankStatementCsv({
      workspaceId: ctx.workspaceId,
      uploadedByUserId: ctx.userId,
      bankAccountId: Number(formData.get("bankAccountId")),
      clientBusinessId: parseOptionalId(formData.get("clientBusinessId")),
      fileName: file.name,
      fileType: file.type || "text/csv",
      uploadSizeBytes: file.size,
      content,
      mapping,
    });

    if (!result.imported) {
      logger.warn("import completed without inserted rows", {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fileName: file.name,
        errorCount: result.errors.length,
      });
      return attachTraceId(
        NextResponse.json(
          {
            error: "No valid rows were imported",
            errors: result.errors,
            guidance: result.guidance,
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
        importId: result.imported.importId,
        importedCount: result.imported.importedCount,
        duplicateCount: result.imported.duplicateCount,
        failedCount: result.imported.failedCount,
      },
    });

    logger.info("import completed", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      importId: result.imported.importId,
      inserted: result.imported.importedCount,
      duplicateCount: result.imported.duplicateCount,
      failedCount: result.imported.failedCount,
    });

    return attachTraceId(
      NextResponse.json({
        ok: true,
        importId: result.imported.importId,
        inserted: result.imported.importedCount,
        duplicateCount: result.imported.duplicateCount,
        failedCount: result.imported.failedCount,
        errors: result.errors,
        guidance: result.guidance,
      }),
      logger.traceId
    );
  } catch (error) {
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
