import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import { getSystemMonitorSnapshot } from "@/lib/system-monitor";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getSystemMonitorSnapshot({
      workspaceId: auth.workspaceId,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    logRouteError("system monitor snapshot failed", error, {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
    });
    return NextResponse.json(
      { error: "Unable to load the system monitor right now." },
      { status: 500 }
    );
  }
}
