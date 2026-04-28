import "server-only";

import crypto from "node:crypto";
import type { NextResponse } from "next/server";
import { getDeploymentStage } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";

type Metadata = Record<string, unknown> | undefined;

function safeHeaderValue(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function hashForLogs(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function getRequestTraceId(req: Request) {
  return (
    safeHeaderValue(req.headers.get("x-request-id")) ??
    safeHeaderValue(req.headers.get("x-correlation-id")) ??
    safeHeaderValue(req.headers.get("x-vercel-id")) ??
    crypto.randomUUID()
  );
}

export function attachTraceId<T extends NextResponse>(response: T, traceId: string) {
  response.headers.set("x-trace-id", traceId);
  return response;
}

export function buildTraceErrorPayload(message: string, traceId: string) {
  return {
    error: message,
    traceId,
  };
}

export function createRouteLogger(
  routeName: string,
  req: Request,
  baseMetadata?: Record<string, unknown>
) {
  const url = new URL(req.url);
  const traceId = getRequestTraceId(req);
  const requestMetadata = {
    traceId,
    route: routeName,
    method: req.method,
    pathname: url.pathname,
    deploymentStage: getDeploymentStage(),
    vercelId: safeHeaderValue(req.headers.get("x-vercel-id")),
    ...baseMetadata,
  } satisfies Record<string, unknown>;

  return {
    traceId,
    metadata: requestMetadata,
    info(message: string, metadata?: Metadata) {
      logInfo("route", `${routeName} ${message}`, {
        ...requestMetadata,
        ...(metadata ?? {}),
      });
    },
    warn(message: string, metadata?: Metadata) {
      logWarn("route", `${routeName} ${message}`, {
        ...requestMetadata,
        ...(metadata ?? {}),
      });
    },
    error(message: string, error: unknown, metadata?: Metadata) {
      logError("route", `${routeName} ${message}`, error, {
        ...requestMetadata,
        ...(metadata ?? {}),
      });
    },
  };
}
