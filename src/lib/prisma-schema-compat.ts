import "server-only";

import { Prisma } from "@prisma/client";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type PrismaSchemaCompatibilityInput = {
  tables?: string[];
  columns?: string[];
};

export type PrismaDatabaseSupportInput = {
  tables?: readonly string[];
  columns?: readonly string[];
};

type DatabaseSupportSnapshot = {
  tables: Set<string>;
  columns: Set<string>;
};

let databaseSupportSnapshotPromise: Promise<DatabaseSupportSnapshot | null> | null = null;
let didLogDatabaseSupportProbeFailure = false;

function normalizeCandidate(value: string) {
  return value.trim().toLowerCase();
}

function matchesAnyCandidate(value: string, candidates: string[]) {
  const normalizedValue = normalizeCandidate(value);

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeCandidate(candidate);
    return normalizedCandidate.length > 0 && normalizedValue.includes(normalizedCandidate);
  });
}

function getKnownRequestError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
}

function getKnownRequestMetaStringValue(
  error: Prisma.PrismaClientKnownRequestError,
  key: "table" | "column"
) {
  const meta = error.meta as
    | {
        table?: unknown;
        column?: unknown;
        driverAdapterError?: {
          cause?: {
            table?: unknown;
            column?: unknown;
          };
        };
      }
    | undefined;

  const directValue = meta?.[key];
  if (typeof directValue === "string") {
    return directValue;
  }

  const adapterCauseValue = meta?.driverAdapterError?.cause?.[key];
  if (typeof adapterCauseValue === "string") {
    return adapterCauseValue;
  }

  return null;
}

function getKnownRequestErrorSearchText(error: Prisma.PrismaClientKnownRequestError) {
  const metaText = (() => {
    try {
      return JSON.stringify(error.meta ?? {});
    } catch {
      return "";
    }
  })();

  return `${error.message} ${metaText}`;
}

async function loadDatabaseSupportSnapshot(): Promise<DatabaseSupportSnapshot | null> {
  try {
    const [tables, columns] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
        select table_name
        from information_schema.tables
        where table_schema = current_schema()
      `),
      prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
        select table_name, column_name
        from information_schema.columns
        where table_schema = current_schema()
      `),
    ]);

    return {
      tables: new Set(tables.map((row) => normalizeCandidate(row.table_name))),
      columns: new Set(
        columns.map((row) => normalizeCandidate(`${row.table_name}.${row.column_name}`))
      ),
    };
  } catch (error) {
    if (!didLogDatabaseSupportProbeFailure) {
      didLogDatabaseSupportProbeFailure = true;
      logWarn("prisma-schema-compat", "Database support probe failed; runtime query guards will handle compatibility instead.", {
        errorCode:
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : null,
        errorMessage:
          error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error",
      });
    }

    return null;
  }
}

async function getDatabaseSupportSnapshot() {
  if (!databaseSupportSnapshotPromise) {
    databaseSupportSnapshotPromise = loadDatabaseSupportSnapshot();
  }

  return databaseSupportSnapshotPromise;
}

export async function hasPrismaDatabaseSupport(input: PrismaDatabaseSupportInput) {
  const snapshot = await getDatabaseSupportSnapshot();
  if (!snapshot) {
    return true;
  }

  const tables = input.tables ?? [];
  const columns = input.columns ?? [];

  return (
    tables.every((table) => snapshot.tables.has(normalizeCandidate(table))) &&
    columns.every((column) => snapshot.columns.has(normalizeCandidate(column)))
  );
}

export function isPrismaMissingTableError(error: unknown, tables: string[]) {
  const knownRequestError = getKnownRequestError(error);
  if (!knownRequestError || knownRequestError.code !== "P2021") {
    return false;
  }

  const table = getKnownRequestMetaStringValue(knownRequestError, "table");
  return typeof table === "string"
    ? matchesAnyCandidate(table, tables)
    : matchesAnyCandidate(getKnownRequestErrorSearchText(knownRequestError), tables);
}

export function isPrismaMissingColumnError(error: unknown, columns: string[]) {
  const knownRequestError = getKnownRequestError(error);
  if (!knownRequestError || knownRequestError.code !== "P2022") {
    return false;
  }

  const column = getKnownRequestMetaStringValue(knownRequestError, "column");
  return typeof column === "string"
    ? matchesAnyCandidate(column, columns)
    : matchesAnyCandidate(getKnownRequestErrorSearchText(knownRequestError), columns);
}

export function isPrismaSchemaCompatibilityError(
  error: unknown,
  input: PrismaSchemaCompatibilityInput
) {
  return (
    (input.tables?.length
      ? isPrismaMissingTableError(error, input.tables)
      : false) ||
    (input.columns?.length
      ? isPrismaMissingColumnError(error, input.columns)
      : false)
  );
}
