import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { scanFinancialIntegrity } from "@/lib/financial-integrity";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireRoleAtLeast(auth.workspaceId, "ADMIN");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedMode = searchParams.get("mode")?.trim().toLowerCase() ?? "repair";

    if (requestedMode !== "scan" && requestedMode !== "repair") {
      return NextResponse.json(
        { error: "Invalid integrity mode. Use ?mode=scan or ?mode=repair." },
        { status: 400 }
      );
    }

    const summary = await scanFinancialIntegrity({
      workspaceId: auth.workspaceId,
      actorUserId: auth.userId,
      options: {
        autoRepair: requestedMode === "repair",
      },
    });

    return NextResponse.json(summary);
  } catch (error) {
    logRouteError("financial integrity run failed", error, {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
    });
    return NextResponse.json(
      { error: "Unable to run the financial integrity engine right now." },
      { status: 500 }
    );
  }
}
