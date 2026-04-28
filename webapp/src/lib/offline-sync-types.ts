export const OFFLINE_QUEUE_STORAGE_KEY = "taxbook.offline.queue.v1";
export const OFFLINE_CONFLICT_STORAGE_KEY = "taxbook.offline.conflicts.v1";
export const OFFLINE_LAST_SYNCED_AT_KEY = "taxbook.offline.last-synced-at.v1";
export const OFFLINE_SESSION_USER_KEY = "taxbook.offline.session-user.v1";
export const OFFLINE_WORKSPACE_KEY = "taxbook.offline.workspace.v1";

export type OfflineSyncConnectionState =
  | "ONLINE"
  | "OFFLINE"
  | "SYNCING"
  | "CONFLICT";

export type OfflineQueueActionKind =
  | "WORKSPACE_ALERT_STATUS_UPDATE"
  | "EXPENSE_LEAK_STATUS_UPDATE";

export type OfflineQueueTarget = {
  workspaceId: number | null;
  recordType: string;
  recordId: number | null;
  label: string;
  href: string | null;
};

export type OfflineQueuedAction = {
  id: string;
  kind: OfflineQueueActionKind;
  method: "PATCH" | "POST";
  url: string;
  body: Record<string, unknown>;
  target: OfflineQueueTarget;
  actionLabel: string;
  successMessage: string;
  queuedMessage: string;
  createdAt: string;
};

export type OfflineConflictCurrentRecord = {
  label: string;
  status: string | null;
  lastKnownChangeAt: string | null;
  href: string | null;
  recordType: string | null;
  recordId: number | null;
};

export type OfflineActionConflictResponse = {
  error: string;
  code: "OFFLINE_SYNC_CONFLICT";
  current: OfflineConflictCurrentRecord | null;
};

export type OfflineSyncConflict = {
  id: string;
  action: OfflineQueuedAction;
  message: string;
  current: OfflineConflictCurrentRecord | null;
  detectedAt: string;
};

export function isOfflineQueuedActionForWorkspace(
  action: Pick<OfflineQueuedAction, "target">,
  activeWorkspaceId: number | null
) {
  return (
    action.target.workspaceId === null ||
    activeWorkspaceId === null ||
    action.target.workspaceId === activeWorkspaceId
  );
}

export type OfflineSyncSnapshot = {
  connectionState: OfflineSyncConnectionState;
  isOnline: boolean;
  queuedCount: number;
  syncingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
};
