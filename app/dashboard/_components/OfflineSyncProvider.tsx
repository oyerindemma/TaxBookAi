"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  OfflineActionConflictResponse,
  OfflineQueuedAction,
  OfflineQueueActionKind,
  OfflineQueueTarget,
  OfflineSyncConflict,
  OfflineSyncSnapshot,
} from "@/lib/offline-sync-types";
import {
  OFFLINE_CONFLICT_STORAGE_KEY,
  OFFLINE_LAST_SYNCED_AT_KEY,
  OFFLINE_QUEUE_STORAGE_KEY,
} from "@/lib/offline-sync-types";

type SubmitOfflineActionInput = {
  kind: OfflineQueueActionKind;
  url: string;
  body: Record<string, unknown>;
  target: OfflineQueueTarget;
  method?: "PATCH" | "POST";
  actionLabel: string;
  successMessage: string;
  queuedMessage: string;
};

type SubmitOfflineActionResult<TPayload> =
  | {
      status: "synced";
      payload: TPayload;
    }
  | {
      status: "queued";
      action: OfflineQueuedAction;
    }
  | {
      status: "conflict";
      payload: OfflineActionConflictResponse;
    };

type OfflineSyncContextValue = {
  snapshot: OfflineSyncSnapshot;
  queuedActions: OfflineQueuedAction[];
  conflicts: OfflineSyncConflict[];
  submitAction: <TPayload>(
    input: SubmitOfflineActionInput
  ) => Promise<SubmitOfflineActionResult<TPayload>>;
  syncNow: () => Promise<void>;
  dismissConflict: (conflictId: string) => void;
  retryConflict: (conflictId: string) => Promise<void>;
  clearPrivateData: () => void;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function removeStoredValue(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function buildConflict(
  action: OfflineQueuedAction,
  payload: OfflineActionConflictResponse | { error?: string } | null
): OfflineSyncConflict {
  const current =
    payload && "current" in payload && payload.current ? payload.current : null;

  return {
    id: createId(),
    action,
    message: payload?.error ?? "This change could not be synced automatically.",
    current,
    detectedAt: new Date().toISOString(),
  };
}

async function dispatchQueuedRequest(action: OfflineQueuedAction) {
  const response = await fetch(action.url, {
    method: action.method,
    headers: {
      "Content-Type": "application/json",
      "X-TaxBook-Offline-Sync": "1",
    },
    body: JSON.stringify(action.body),
  });

  const payload = await parseJson<
    OfflineActionConflictResponse & { error?: string; ok?: boolean }
  >(response);

  return {
    response,
    payload,
  };
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [queuedActions, setQueuedActions] = useState<OfflineQueuedAction[]>([]);
  const [conflicts, setConflicts] = useState<OfflineSyncConflict[]>([]);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const queuedActionsRef = useRef<OfflineQueuedAction[]>([]);
  const syncNowRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    setQueuedActions(readStoredJson<OfflineQueuedAction[]>(OFFLINE_QUEUE_STORAGE_KEY, []));
    setConflicts(readStoredJson<OfflineSyncConflict[]>(OFFLINE_CONFLICT_STORAGE_KEY, []));
    setLastSyncedAt(
      readStoredJson<string | null>(OFFLINE_LAST_SYNCED_AT_KEY, null)
    );
  }, []);

  useEffect(() => {
    queuedActionsRef.current = queuedActions;
    writeStoredJson(OFFLINE_QUEUE_STORAGE_KEY, queuedActions);
  }, [queuedActions]);

  useEffect(() => {
    writeStoredJson(OFFLINE_CONFLICT_STORAGE_KEY, conflicts);
  }, [conflicts]);

  useEffect(() => {
    if (lastSyncedAt) {
      writeStoredJson(OFFLINE_LAST_SYNCED_AT_KEY, lastSyncedAt);
      return;
    }

    removeStoredValue(OFFLINE_LAST_SYNCED_AT_KEY);
  }, [lastSyncedAt]);

  async function syncNow() {
    if (syncingRef.current || !navigator.onLine || queuedActionsRef.current.length === 0) {
      return;
    }

    syncingRef.current = true;

    try {
      while (queuedActionsRef.current.length > 0 && navigator.onLine) {
        const currentAction = queuedActionsRef.current[0];
        setSyncingIds([currentAction.id]);

        try {
          const { response, payload } = await dispatchQueuedRequest(currentAction);

          if (response.ok) {
            setQueuedActions((current) =>
              current.filter((action) => action.id !== currentAction.id)
            );
            setLastSyncedAt(new Date().toISOString());
            continue;
          }

          if (response.status === 409) {
            setQueuedActions((current) =>
              current.filter((action) => action.id !== currentAction.id)
            );
            setConflicts((current) => [...current, buildConflict(currentAction, payload)]);
            setLastSyncedAt(new Date().toISOString());
            continue;
          }

          setQueuedActions((current) =>
            current.filter((action) => action.id !== currentAction.id)
          );
          setConflicts((current) => [
            ...current,
            buildConflict(currentAction, {
              error:
                payload?.error ??
                "This queued change could not be applied automatically. Review it before retrying.",
              code: "OFFLINE_SYNC_CONFLICT",
              current: null,
            }),
          ]);
          setLastSyncedAt(new Date().toISOString());
        } catch {
          break;
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncingIds([]);
    }
  }

  syncNowRef.current = syncNow;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncNowRef.current();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handlePrivateDataCleared = () => {
      setQueuedActions([]);
      setConflicts([]);
      setLastSyncedAt(null);
      setSyncingIds([]);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(
      "taxbook-offline-private-data-cleared",
      handlePrivateDataCleared
    );

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        "taxbook-offline-private-data-cleared",
        handlePrivateDataCleared
      );
    };
  }, []);

  async function submitAction<TPayload>(
    input: SubmitOfflineActionInput
  ): Promise<SubmitOfflineActionResult<TPayload>> {
    const action: OfflineQueuedAction = {
      id: createId(),
      kind: input.kind,
      url: input.url,
      body: input.body,
      target: input.target,
      method: input.method ?? "PATCH",
      actionLabel: input.actionLabel,
      successMessage: input.successMessage,
      queuedMessage: input.queuedMessage,
      createdAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      setQueuedActions((current) => [...current, action]);
      return {
        status: "queued",
        action,
      };
    }

    try {
      const { response, payload } = await dispatchQueuedRequest(action);

      if (response.ok) {
        setLastSyncedAt(new Date().toISOString());
        return {
          status: "synced",
          payload: (payload ?? {}) as TPayload,
        };
      }

      if (response.status === 409) {
        setConflicts((current) => [...current, buildConflict(action, payload)]);
        return {
          status: "conflict",
          payload: {
            error:
              payload?.error ??
              "This change could not be applied because the record changed first.",
            code: "OFFLINE_SYNC_CONFLICT",
            current: payload?.current ?? null,
          },
        };
      }

      throw new Error(payload?.error ?? "Failed to sync this change.");
    } catch (error) {
      const networkError = error instanceof TypeError || !navigator.onLine;

      if (!networkError) {
        throw error;
      }

      setQueuedActions((current) => [...current, action]);
      return {
        status: "queued",
        action,
      };
    }
  }

  function dismissConflict(conflictId: string) {
    setConflicts((current) => current.filter((conflict) => conflict.id !== conflictId));
  }

  async function retryConflict(conflictId: string) {
    const conflict = conflicts.find((entry) => entry.id === conflictId);
    if (!conflict) return;

    const nextAction: OfflineQueuedAction = {
      ...conflict.action,
      id: createId(),
      body: conflict.current?.lastKnownChangeAt
        ? {
            ...conflict.action.body,
            lastKnownChangeAt: conflict.current.lastKnownChangeAt,
          }
        : conflict.action.body,
      createdAt: new Date().toISOString(),
    };

    setConflicts((current) => current.filter((entry) => entry.id !== conflictId));
    setQueuedActions((current) => [...current, nextAction]);

    if (navigator.onLine) {
      await syncNow();
    }
  }

  function clearPrivateData() {
    setQueuedActions([]);
    setConflicts([]);
    setLastSyncedAt(null);
    setSyncingIds([]);
    removeStoredValue(OFFLINE_QUEUE_STORAGE_KEY);
    removeStoredValue(OFFLINE_CONFLICT_STORAGE_KEY);
    removeStoredValue(OFFLINE_LAST_SYNCED_AT_KEY);
    window.dispatchEvent(new Event("taxbook-offline-clear-private-data"));
  }

  const snapshot: OfflineSyncSnapshot = {
    connectionState:
      conflicts.length > 0
        ? "CONFLICT"
        : syncingIds.length > 0
          ? "SYNCING"
          : isOnline
            ? "ONLINE"
            : "OFFLINE",
    isOnline,
    queuedCount: queuedActions.length,
    syncingCount: syncingIds.length,
    conflictCount: conflicts.length,
    lastSyncedAt,
  };

  return (
    <OfflineSyncContext.Provider
      value={{
        snapshot,
        queuedActions,
        conflicts,
        submitAction,
        syncNow,
        dismissConflict,
        retryConflict,
        clearPrivateData,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);

  if (!context) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider.");
  }

  return context;
}
