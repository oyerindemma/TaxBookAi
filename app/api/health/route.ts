import { NextResponse } from "next/server";
import { getEnvironmentHealth } from "@/lib/env";
import { attachTraceId, createRouteLogger } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/health", req);
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
