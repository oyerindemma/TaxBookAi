import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getInvoiceReminderRuntimeConfig } from "@/lib/env";
import { runInvoiceReminderSweep } from "@/lib/invoice-reminders";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

function parseWorkspaceId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: unknown };
  const headerSecret = req.headers.get("x-invoice-reminder-secret")?.trim() ?? null;
  const cronSecret = getInvoiceReminderRuntimeConfig().cronSecret;
  const requestedWorkspaceId = parseWorkspaceId(body.workspaceId);

  try {
    if (cronSecret && headerSecret && headerSecret === cronSecret) {
      const result = await runInvoiceReminderSweep({
        workspaceId: requestedWorkspaceId ?? undefined,
        initiatedByUserId: null,
      });
      return NextResponse.json({
        ok: true,
        mode: "cron",
        ...result,
      });
    }

    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await runInvoiceReminderSweep({
      workspaceId: ctx.workspaceId,
      initiatedByUserId: ctx.userId,
    });

    return NextResponse.json({
      ok: true,
      mode: "workspace",
      ...result,
    });
  } catch (error) {
    logRouteError("invoice reminders run failed", error, {
      workspaceId: requestedWorkspaceId,
    });
    return NextResponse.json(
      { error: "Unable to run invoice reminders right now." },
      { status: 500 }
    );
  }
}
