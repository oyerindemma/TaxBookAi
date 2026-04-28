import type { OfflineConflictCurrentRecord } from "@/lib/offline-sync-types";

export class OfflineSyncConflictError extends Error {
  current: OfflineConflictCurrentRecord | null;

  constructor(message: string, current: OfflineConflictCurrentRecord | null) {
    super(message);
    this.name = "OfflineSyncConflictError";
    this.current = current;
  }
}

export function isOfflineSyncConflictError(
  error: unknown
): error is OfflineSyncConflictError {
  return error instanceof Error && error.name === "OfflineSyncConflictError";
}
