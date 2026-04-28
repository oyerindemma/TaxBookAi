import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  buildFinancialHealthFallbackSnapshot,
  getFinancialHealthSnapshot,
} from "@/lib/financial-health";
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
    const accessibleWorkspaceIds = adminWorkspaces.map((workspace) => workspace.id);
    const selectedWorkspaceId = parseWorkspaceId(url.searchParams.get("workspaceId"));

    let snapshot;
    try {
      snapshot = await getFinancialHealthSnapshot({
        accessibleWorkspaceIds,
        selectedWorkspaceId,
      });
    } catch (error) {
      logRouteError("financial integrity health snapshot fallback", error, {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      });

      snapshot = buildFinancialHealthFallbackSnapshot({
        workspaceIds:
          selectedWorkspaceId && accessibleWorkspaceIds.includes(selectedWorkspaceId)
            ? [selectedWorkspaceId]
            : accessibleWorkspaceIds,
        selectedWorkspaceId:
          selectedWorkspaceId && accessibleWorkspaceIds.includes(selectedWorkspaceId)
            ? selectedWorkspaceId
            : null,
        topDeductions: [
          {
            key: "health_route_fallback",
            label: "Financial health service is temporarily unavailable",
            points: 0,
          },
        ],
      });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    logRouteError("financial integrity health failed", error, {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    });
    return NextResponse.json(
      { error: "Unable to compute financial health right now." },
      { status: 500 }
    );
  }
}
