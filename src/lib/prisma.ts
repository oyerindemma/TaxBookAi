import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { validateDatabaseEnvironment } from "@/lib/env";
import { logWarn } from "@/lib/logger";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

const TRANSIENT_PRISMA_ERROR_CODES = new Set([
  "P1001",
  "P1002",
  "P1017",
  "P2024",
  "P2037",
]);

const TRANSIENT_PRISMA_ERROR_PATTERNS = [
  /connection.*closed/i,
  /server has closed the connection/i,
  /terminating connection/i,
  /can't reach database server/i,
  /timed out fetching a new connection/i,
  /connection pool/i,
  /econnreset/i,
  /socket hang up/i,
];

function createPrismaPool() {
  const { provider, databaseUrl } = validateDatabaseEnvironment();

  if (provider !== "postgresql") {
    throw new Error(
      "This Prisma 7 runtime is configured for PostgreSQL. Set DATABASE_URL to a PostgreSQL connection string."
    );
  }

  return new Pool({
    connectionString: databaseUrl,
  });
}

function getPrismaPool() {
  if (!globalForPrisma.prismaPool) {
    globalForPrisma.prismaPool = createPrismaPool();
  }

  return globalForPrisma.prismaPool;
}

function createPrismaClient() {
  const adapter = new PrismaPg(getPrismaPool(), {
    disposeExternalPool: false,
    onPoolError(error) {
      logWarn("prisma", "PostgreSQL pool emitted an error", {
        errorMessage: error.message,
      });
    },
    onConnectionError(error) {
      logWarn("prisma", "PostgreSQL connection emitted an error", {
        errorMessage: error.message,
      });
    },
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

const prismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

export const prisma = prismaClient;

function getPrismaErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function getPrismaErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isTransientPrismaError(error: unknown) {
  const code = getPrismaErrorCode(error);
  if (code && TRANSIENT_PRISMA_ERROR_CODES.has(code)) {
    return true;
  }

  const message = getPrismaErrorMessage(error);
  return TRANSIENT_PRISMA_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options?: {
    label?: string;
    attempts?: number;
    baseDelayMs?: number;
  }
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 200);
  const label = options?.label ?? "prisma_operation";

  let attempt = 0;
  while (true) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      attempt += 1;

      if (!isTransientPrismaError(error) || attempt >= attempts) {
        throw error;
      }

      logWarn("prisma", "Retrying transient Prisma operation", {
        label,
        attempt,
        attempts,
        delayMs: baseDelayMs * attempt,
        errorCode: getPrismaErrorCode(error),
        errorMessage: getPrismaErrorMessage(error),
      });

      await sleep(baseDelayMs * attempt);
    }
  }

  throw new Error(`Prisma retry loop exited unexpectedly for ${label}.`);
}
