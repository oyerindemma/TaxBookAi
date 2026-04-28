import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserFromSession, getWorkspaceAuth } from "@/lib/auth";
import {
  buildComplianceExportPayload,
  type ComplianceExportScope,
} from "@/lib/compliance-export-service";
import {
  enqueueComplianceExportJob,
  hasComplianceExportQueueConfig,
} from "@/lib/jobs/compliance-export-queue";
import { logRouteError } from "@/lib/logger";
import { WORKSPACE_COOKIE_NAME } from "@/lib/workspaces";
import {
  buildComplianceExportErrorBody,
  parseActiveWorkspaceId,
  evaluateWorkspaceExportAccess,
  type ComplianceExportDebug,
} from "./route-helpers";

export const runtime = "nodejs";
const INCLUDE_DEBUG = process.env.NODE_ENV !== "production";

function resolveInternalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

async function resolveExportContext(scope: ComplianceExportScope) {
  let step: ComplianceExportDebug["step"] = "authenticated_user";
  let userId: number | null = null;
  let workspaceId: number | null = null;
  let role: ComplianceExportDebug["role"] = null;

  const user = await getUserFromSession();
  if (!user) {
    return {
      ok: false as const,
      status: 401,
      body: buildComplianceExportErrorBody({
        error: "Unauthorized",
        code: "UNAUTHENTICATED",
        includeDebug: INCLUDE_DEBUG,
        debug: {
          step,
          userId,
          workspaceId,
          role,
        },
      }),
      debug: {
        step,
        userId,
        workspaceId,
        role,
      },
    };
  }

  userId = user.id;

  if (scope === "workspace") {
    step = "active_workspace";
    const cookieStore = await cookies();
    workspaceId = parseActiveWorkspaceId(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);

    step = "workspace_membership";
    const membership = workspaceId ? await getWorkspaceAuth(workspaceId, user.id) : null;
    role = membership?.role ?? null;

    const access = evaluateWorkspaceExportAccess({
      userId,
      workspaceId,
      membershipRole: role,
      hasMembership: Boolean(membership),
      includeDebug: INCLUDE_DEBUG,
    });

    if (!access.ok) {
      return {
        ok: false as const,
        status: access.status,
        body: access.body,
        debug: access.debug,
      };
    }
  }

  return {
    ok: true as const,
    user,
    userId,
    scope,
    workspaceId,
    role,
    debug: {
      step,
      userId,
      workspaceId,
      role,
    },
  };
}

function parseScopeFromRequest(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("scope") === "account" ? "account" : "workspace";
}

export async function GET(req: Request) {
  const scope = parseScopeFromRequest(req);
  let step: ComplianceExportDebug["step"] = "authenticated_user";
  let userId: number | null = null;
  let workspaceId: number | null = null;
  let role: ComplianceExportDebug["role"] = null;

  try {
    const context = await resolveExportContext(scope);
    if (!context.ok) {
      return NextResponse.json(context.body, { status: context.status });
    }

    userId = context.userId;
    workspaceId = context.workspaceId;
    role = context.role;
    step = "build_snapshot";
    const payload = await buildComplianceExportPayload({
      userId: context.user.id,
      scope,
      workspaceId,
    });

    return new NextResponse(payload.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": payload.contentType,
        "Content-Disposition": `attachment; filename="${payload.filename}"`,
      },
    });
  } catch (error) {
    logRouteError("compliance export failed", error, {
      userId,
      scope,
      workspaceId,
      role,
      step,
    });
    return NextResponse.json(
      buildComplianceExportErrorBody({
        error: "We could not prepare your export right now.",
        code: "COMPLIANCE_EXPORT_FAILED",
        includeDebug: INCLUDE_DEBUG,
        debug: {
          step,
          userId,
          workspaceId,
          role,
        },
        internalErrorMessage: resolveInternalErrorMessage(error),
      }),
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const scope = parseScopeFromRequest(req);
  let userId: number | null = null;
  let workspaceId: number | null = null;
  let role: ComplianceExportDebug["role"] = null;
  let step: ComplianceExportDebug["step"] = "authenticated_user";

  try {
    if (!hasComplianceExportQueueConfig()) {
      return NextResponse.json(
        buildComplianceExportErrorBody({
          error: "Async export processing is not configured.",
          code: "COMPLIANCE_EXPORT_QUEUE_UNAVAILABLE",
          includeDebug: INCLUDE_DEBUG,
          debug: {
            step,
            userId,
            workspaceId,
            role,
          },
        }),
        { status: 503 }
      );
    }

    const context = await resolveExportContext(scope);
    if (!context.ok) {
      return NextResponse.json(context.body, { status: context.status });
    }

    userId = context.userId;
    workspaceId = context.workspaceId;
    role = context.role;
    step = "build_snapshot";

    const job = await enqueueComplianceExportJob({
      userId,
      scope,
      workspaceId,
    });

    return NextResponse.json(
      {
        jobId: job.id,
        status: "queued",
        statusUrl: `/api/compliance/export/jobs/${job.id}`,
        downloadUrl: `/api/compliance/export/jobs/${job.id}?download=1`,
      },
      { status: 202 }
    );
  } catch (error) {
    logRouteError("compliance export enqueue failed", error, {
      userId,
      scope,
      workspaceId,
      role,
      step,
    });
    return NextResponse.json(
      buildComplianceExportErrorBody({
        error: "We could not queue your export right now.",
        code: "COMPLIANCE_EXPORT_QUEUE_FAILED",
        includeDebug: INCLUDE_DEBUG,
        debug: {
          step,
          userId,
          workspaceId,
          role,
        },
        internalErrorMessage: resolveInternalErrorMessage(error),
      }),
      { status: 500 }
    );
  }
}
