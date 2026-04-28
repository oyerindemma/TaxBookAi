import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getEnvironmentHealth, getHealthCheckSecret } from "@/lib/env";
import { attachTraceId, createRouteLogger } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { secureCompareText } from "@/lib/security-guards";

export const runtime = "nodejs";

function getProvidedHealthSecret(req: Request) {
  const authorization = req.headers.get("authorization")?.trim();
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match?.[1]) return match[1].trim();
  }

  return req.headers.get("x-health-check-secret")?.trim() || null;
}

async function isHealthRequestAuthorized(req: Request) {
  const configuredSecret = getHealthCheckSecret();
  const providedSecret = getProvidedHealthSecret(req);

  if (
    configuredSecret &&
    providedSecret &&
    secureCompareText(providedSecret, configuredSecret)
  ) {
    return { ok: true as const };
  }

  const auth = await getAuthContext();
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const access = await requireRoleAtLeast(auth.workspaceId, "ADMIN");
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }

  return { ok: true as const };
}

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/health", req);
  const authorization = await isHealthRequestAuthorized(req);
  if (!authorization.ok) {
    return attachTraceId(authorization.response, logger.traceId);
  }

  const strict = new URL(req.url).searchParams.get("strict") === "1";
  const environment = getEnvironmentHealth({ strict });
  const startedAt = Date.now();

  let database = {
    ok: false,
    latencyMs: 0,
  };

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    database = {
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    logger.error("database connectivity failed", error);
  }

  const ok = environment.errors.length === 0 && database.ok;
  const response = NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      environment: {
        deploymentStage: environment.deploymentStage,
        databaseProvider: environment.databaseProvider,
        appUrl: environment.appUrl,
        allowStubPayments: environment.allowStubPayments,
        hasOpenAiKey: environment.hasOpenAiKey,
        hasPaystackKey: environment.hasPaystackKey,
        hasRedisUrl: environment.hasRedisUrl,
        missing: environment.missing,
        warnings: environment.warnings,
        errors: environment.errors,
      },
      database,
    },
    { status: ok ? 200 : 503 }
  );

  return attachTraceId(response, logger.traceId);
}
