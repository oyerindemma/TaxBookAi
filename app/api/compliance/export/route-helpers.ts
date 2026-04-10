export type WorkspaceExportRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type ComplianceExportDebug = {
  step:
    | "authenticated_user"
    | "active_workspace"
    | "workspace_membership"
    | "workspace_role"
    | "build_snapshot"
    | "audit_log";
  userId: number | null;
  workspaceId: number | null;
  role: WorkspaceExportRole | null;
  internalErrorMessage?: string;
};

export type ComplianceExportErrorBody = {
  error: string;
  code: string;
  debug?: ComplianceExportDebug;
};

type WorkspaceExportAccessInput = {
  userId: number | null;
  workspaceId: number | null;
  membershipRole: WorkspaceExportRole | null;
  hasMembership: boolean;
  includeDebug: boolean;
};

type WorkspaceExportAccessFailure = {
  ok: false;
  status: 400 | 401 | 403;
  body: ComplianceExportErrorBody;
  debug: ComplianceExportDebug;
};

type WorkspaceExportAccessSuccess = {
  ok: true;
  status: 200;
  debug: ComplianceExportDebug;
};

export type WorkspaceExportAccessResult =
  | WorkspaceExportAccessFailure
  | WorkspaceExportAccessSuccess;

export function parseActiveWorkspaceId(rawWorkspace: string | undefined) {
  const workspaceId = rawWorkspace ? Number(rawWorkspace) : NaN;
  if (!Number.isFinite(workspaceId) || !Number.isInteger(workspaceId) || workspaceId <= 0) {
    return null;
  }

  return workspaceId;
}

export function buildComplianceExportErrorBody(input: {
  error: string;
  code: string;
  debug: ComplianceExportDebug;
  includeDebug: boolean;
  internalErrorMessage?: string;
}): ComplianceExportErrorBody {
  if (!input.includeDebug) {
    return {
      error: input.error,
      code: input.code,
    };
  }

  return {
    error: input.error,
    code: input.code,
    debug: {
      ...input.debug,
      ...(input.internalErrorMessage
        ? { internalErrorMessage: input.internalErrorMessage }
        : {}),
    },
  };
}

export function evaluateWorkspaceExportAccess(
  input: WorkspaceExportAccessInput
): WorkspaceExportAccessResult {
  const debugBase = {
    userId: input.userId,
    workspaceId: input.workspaceId,
    role: input.membershipRole,
  };

  if (!input.userId) {
    const debug: ComplianceExportDebug = {
      step: "authenticated_user",
      userId: null,
      workspaceId: null,
      role: null,
    };

    return {
      ok: false,
      status: 401,
      debug,
      body: buildComplianceExportErrorBody({
        error: "Unauthorized",
        code: "UNAUTHENTICATED",
        includeDebug: input.includeDebug,
        debug,
      }),
    };
  }

  if (!input.workspaceId) {
    const debug: ComplianceExportDebug = {
      step: "active_workspace",
      ...debugBase,
    };

    return {
      ok: false,
      status: 400,
      debug,
      body: buildComplianceExportErrorBody({
        error: "Select an active workspace before exporting workspace data.",
        code: "ACTIVE_WORKSPACE_REQUIRED",
        includeDebug: input.includeDebug,
        debug,
      }),
    };
  }

  if (!input.hasMembership) {
    const debug: ComplianceExportDebug = {
      step: "workspace_membership",
      ...debugBase,
    };

    return {
      ok: false,
      status: 403,
      debug,
      body: buildComplianceExportErrorBody({
        error: "You do not have access to the selected workspace.",
        code: "WORKSPACE_MEMBERSHIP_REQUIRED",
        includeDebug: input.includeDebug,
        debug,
      }),
    };
  }

  if (input.membershipRole !== "ADMIN" && input.membershipRole !== "OWNER") {
    const debug: ComplianceExportDebug = {
      step: "workspace_role",
      ...debugBase,
    };

    return {
      ok: false,
      status: 403,
      debug,
      body: buildComplianceExportErrorBody({
        error: "Workspace exports require an admin or owner role.",
        code: "WORKSPACE_EXPORT_FORBIDDEN",
        includeDebug: input.includeDebug,
        debug,
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    debug: {
      step: "workspace_role",
      ...debugBase,
    },
  };
}
