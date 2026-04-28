import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getFinancialIntegrityIssuesSnapshot } from "@/lib/financial-integrity";
import { logRouteError } from "@/lib/logger";
import { listUserWorkspaceSummaries } from "@/lib/workspaces";

export const runtime = "nodejs";

function parseWorkspaceId(value: string | null) {
  if (!value || value === "all") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaces = await listUserWorkspaceSummaries(auth.userId);
    const adminWorkspaces = workspaces.filter(
      (workspace) =>
        !workspace.archivedAt &&
        (workspace.role === "OWNER" || workspace.role === "ADMIN")
    );

    if (adminWorkspaces.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const snapshot = await getFinancialIntegrityIssuesSnapshot({
      accessibleWorkspaceIds: adminWorkspaces.map((workspace) => workspace.id),
      selectedWorkspaceId: parseWorkspaceId(url.searchParams.get("workspaceId")),
      issueType: url.searchParams.get("issueType"),
      severity: url.searchParams.get("severity"),
      status: url.searchParams.get("status"),
      autoRepairable: url.searchParams.get("autoRepairable"),
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    logRouteError("financial integrity issues failed", error, {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    });
    return NextResponse.json(
      { error: "Unable to load integrity issues right now." },
      { status: 500 }
    );
  }
}
