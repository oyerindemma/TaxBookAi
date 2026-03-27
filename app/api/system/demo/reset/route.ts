import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import {
  BETA_DEMO_EMAIL,
  BETA_DEMO_PASSWORD,
  resolveDemoRouteAccess,
  seedBetaDemoAccount,
} from "@/lib/demo-account";
import { recheckFinancialIntegrityWorkspace } from "@/lib/financial-integrity";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DemoBody = {
  withIssues?: unknown;
  secret?: unknown;
};

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

async function readBody(req: Request): Promise<DemoBody> {
  try {
    return (await req.json()) as DemoBody;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const access = resolveDemoRouteAccess({
    requestUrl: req.url,
    headers: req.headers,
    providedSecret: typeof body.secret === "string" ? body.secret : null,
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const url = new URL(req.url);
    const withIssues =
      parseBoolean(url.searchParams.get("withIssues")) ??
      parseBoolean(body.withIssues) ??
      undefined;

    const seeded = await seedBetaDemoAccount(prisma, {
      withIssues,
    });

    const scanSummary = await recheckFinancialIntegrityWorkspace({
      workspaceId: seeded.workspaceId,
      actorUserId: seeded.userId,
    });

    const { token, expiresAt } = await createSession(seeded.userId);
    const response = NextResponse.json(
      {
        ok: true,
        message: "Demo workspace reset and reseeded successfully.",
        credentials: {
          email: BETA_DEMO_EMAIL,
          password: BETA_DEMO_PASSWORD,
        },
        seed: seeded,
        integrityScan: scanSummary,
      },
      { status: 200 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      ...buildSessionCookieOptions(expiresAt),
    });
    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: String(seeded.workspaceId),
      ...buildWorkspaceCookieOptions(),
    });

    return response;
  } catch (error) {
    logRouteError("/api/system/demo/reset", error);
    return NextResponse.json(
      {
        error: "Unable to reset the demo workspace right now.",
        ...(process.env.NODE_ENV !== "production"
          ? {
              details: error instanceof Error ? error.message : String(error),
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
