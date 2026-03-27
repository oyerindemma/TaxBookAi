import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    kind?: string;
    id?: string;
  }>;
};

function parseId(value?: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseKind(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "vat" || normalized === "wht") return normalized;
  return null;
}

export async function POST(req: Request, context: RouteContext) {
  const { kind, id } = await context.params;
  const recordKind = parseKind(kind);
  const recordId = parseId(id);
  if (!recordKind || !recordId) {
    return NextResponse.json({ error: "Invalid tax-engine record" }, { status: 400 });
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await req.json()) as {
      label?: string;
      note?: string;
      url?: string;
      bookkeepingUploadId?: number | string;
      evidenceKind?: string;
    };
    const label = body.label?.trim();
    if (!label) {
      return NextResponse.json({ error: "Evidence label is required" }, { status: 400 });
    }

    const bookkeepingUploadId =
      body.bookkeepingUploadId === undefined || body.bookkeepingUploadId === null || body.bookkeepingUploadId === ""
        ? null
        : Number(body.bookkeepingUploadId);
    if (
      bookkeepingUploadId !== null &&
      (!Number.isInteger(bookkeepingUploadId) || bookkeepingUploadId <= 0)
    ) {
      return NextResponse.json({ error: "Invalid bookkeepingUploadId" }, { status: 400 });
    }

    if (bookkeepingUploadId) {
      const upload = await prisma.bookkeepingUpload.findFirst({
        where: { id: bookkeepingUploadId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!upload) {
        return NextResponse.json({ error: "Upload not found" }, { status: 404 });
      }
    }

    if (recordKind === "vat") {
      const row = await prisma.vATRecord.findFirst({
        where: { id: recordId, workspaceId: ctx.workspaceId },
        include: {
          taxPeriod: {
            select: {
              id: true,
            },
          },
        },
      });
      if (!row) {
        return NextResponse.json({ error: "VAT record not found" }, { status: 404 });
      }

      const filingDraft = await prisma.filingDraft.findFirst({
        where: {
          taxPeriodId: row.taxPeriod.id,
          taxType: "VAT",
        },
        select: { id: true },
      });

      const evidence = await prisma.filingEvidence.create({
        data: {
          workspaceId: ctx.workspaceId,
          clientBusinessId: row.clientBusinessId,
          filingDraftId: filingDraft?.id ?? null,
          vatRecordId: row.id,
          bookkeepingUploadId,
          label,
          evidenceKind: body.evidenceKind === "NOTE" ? "NOTE" : "SOURCE_DOCUMENT",
          note: body.note?.trim() || null,
          url: body.url?.trim() || null,
          uploadedByUserId: ctx.userId,
        },
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "TAX_ENGINE_VAT_EVIDENCE_ATTACHED",
        metadata: {
          recordId: row.id,
          evidenceId: evidence.id,
          bookkeepingUploadId,
        },
      });

      return NextResponse.json({ evidence }, { status: 201 });
    }

    const row = await prisma.wHTRecord.findFirst({
      where: { id: recordId, workspaceId: ctx.workspaceId },
      include: {
        taxPeriod: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "WHT record not found" }, { status: 404 });
    }

    const filingDraft = await prisma.filingDraft.findFirst({
      where: {
        taxPeriodId: row.taxPeriod.id,
        taxType: "WHT",
      },
      select: { id: true },
    });

    const evidence = await prisma.filingEvidence.create({
      data: {
        workspaceId: ctx.workspaceId,
        clientBusinessId: row.clientBusinessId,
        filingDraftId: filingDraft?.id ?? null,
        whtRecordId: row.id,
        bookkeepingUploadId,
        label,
        evidenceKind: body.evidenceKind === "NOTE" ? "NOTE" : "SOURCE_DOCUMENT",
        note: body.note?.trim() || null,
        url: body.url?.trim() || null,
        uploadedByUserId: ctx.userId,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "TAX_ENGINE_WHT_EVIDENCE_ATTACHED",
      metadata: {
        recordId: row.id,
        evidenceId: evidence.id,
        bookkeepingUploadId,
      },
    });

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    logRouteError("tax engine evidence attach failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      recordId,
      kind: recordKind,
    });
    return NextResponse.json(
      { error: "Server error attaching evidence" },
      { status: 500 }
    );
  }
}
