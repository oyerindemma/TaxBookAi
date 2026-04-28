import { NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/auth";
import {
  getComplianceExportJob,
  hasComplianceExportQueueConfig,
} from "@/lib/jobs/compliance-export-queue";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

function serializeProgress(progress: unknown) {
  if (typeof progress === "number") {
    return progress;
  }

  if (progress && typeof progress === "object") {
    return progress;
  }

  return null;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  try {
    const user = await getUserFromSession();
    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          code: "UNAUTHENTICATED",
        },
        { status: 401 }
      );
    }

    if (!hasComplianceExportQueueConfig()) {
      return NextResponse.json(
        {
          error: "Async export processing is not configured.",
          code: "COMPLIANCE_EXPORT_QUEUE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    const job = await getComplianceExportJob(id);
    if (!job) {
      return NextResponse.json(
        {
          error: "Export job was not found.",
          code: "COMPLIANCE_EXPORT_JOB_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    if (job.data.userId !== user.id) {
      return NextResponse.json(
        {
          error: "You do not have access to this export job.",
          code: "COMPLIANCE_EXPORT_JOB_FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const state = await job.getState();
    const result = job.returnvalue;

    if (download) {
      if (state !== "completed" || !result) {
        return NextResponse.json(
          {
            error: "Export is not ready yet.",
            code: "COMPLIANCE_EXPORT_NOT_READY",
            status: state,
          },
          { status: 409 }
        );
      }

      return new NextResponse(result.body, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        },
      });
    }

    return NextResponse.json({
      jobId: job.id,
      status: state,
      scope: job.data.scope,
      workspaceId: job.data.workspaceId,
      requestedAt: job.data.requestedAt,
      processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason || null,
      progress: serializeProgress(job.progress),
      downloadUrl:
        state === "completed" ? `/api/compliance/export/jobs/${job.id}?download=1` : null,
    });
  } catch (error) {
    logRouteError("compliance export job lookup failed", error, { jobId: id });
    return NextResponse.json(
      {
        error: "We could not read the export job right now.",
        code: "COMPLIANCE_EXPORT_JOB_LOOKUP_FAILED",
      },
      { status: 500 }
    );
  }
}
