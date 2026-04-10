import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserFromSession, getWorkspaceAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildComplianceExportSnapshot } from "@/lib/compliance-data-tools";
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

function buildExportFilename(scope: "workspace" | "account") {
  const date = new Date().toISOString().slice(0, 10);
  return `taxbook-${scope}-export-${date}.json`;
}

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "account" ? "account" : "workspace";
  let step: ComplianceExportDebug["step"] = "authenticated_user";
  let userId: number | null = null;
  let workspaceId: number | null = null;
  let role: ComplianceExportDebug["role"] = null;

  try {
    const user = await getUserFromSession();
    if (!user) {
      return NextResponse.json(
        buildComplianceExportErrorBody({
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
        { status: 401 }
      );
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
        return NextResponse.json(access.body, { status: access.status });
      }
    }

    step = "build_snapshot";
    const snapshot = await buildComplianceExportSnapshot({
      userId: user.id,
      scope,
      workspaceId: scope === "workspace" ? workspaceId : null,
    });

    if (scope === "workspace" && workspaceId) {
      step = "audit_log";
      await logAudit({
        workspaceId,
        actorUserId: user.id,
        action: "COMPLIANCE_DATA_EXPORTED",
        metadata: {
          scope,
        },
      });
    }

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(scope)}"`,
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
