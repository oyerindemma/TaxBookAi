import "server-only";

type Metadata = Record<string, unknown> | undefined;
const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_DEPTH = 4;
const REDACTED_KEYS = /(authorization|cookie|password|secret|token|api[-_]?key|signature|smtp_pass)/i;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

function formatMessage(scope: string, message: string) {
  return `[TaxBook:${scope}] ${message}`;
}

function sanitizeString(value: string) {
  if (value.length <= MAX_LOG_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}…[truncated ${value.length - MAX_LOG_STRING_LENGTH} chars]`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= MAX_LOG_DEPTH) return "[MaxDepth]";

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => {
        if (REDACTED_KEYS.test(key)) {
          return [key, "[REDACTED]"] as const;
        }

        return [key, sanitizeValue(entryValue, depth + 1)] as const;
      }
    );

    return Object.fromEntries(sanitizedEntries);
  }

  return value;
}

export function logInfo(scope: string, message: string, metadata?: Metadata) {
  if (metadata) {
    console.info(formatMessage(scope, message), sanitizeValue(metadata));
    return;
  }
  console.info(formatMessage(scope, message));
}

export function logWarn(scope: string, message: string, metadata?: Metadata) {
  if (metadata) {
    console.warn(formatMessage(scope, message), sanitizeValue(metadata));
    return;
  }
  console.warn(formatMessage(scope, message));
}

export function logError(scope: string, message: string, error: unknown, metadata?: Metadata) {
  const payload = {
    ...((sanitizeValue(metadata) as Record<string, unknown> | undefined) ?? {}),
    error: sanitizeValue(serializeError(error)),
  };
  console.error(formatMessage(scope, message), payload);
}

export function logRouteError(route: string, error: unknown, metadata?: Metadata) {
  logError("route", route, error, metadata);
}
