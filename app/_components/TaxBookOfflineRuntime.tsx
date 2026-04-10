"use client";

import { useEffect } from "react";
import {
  OFFLINE_CONFLICT_STORAGE_KEY,
  OFFLINE_LAST_SYNCED_AT_KEY,
  OFFLINE_QUEUE_STORAGE_KEY,
  OFFLINE_SESSION_USER_KEY,
} from "@/lib/offline-sync-types";

function clearOfflineStorage() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
    localStorage.removeItem(OFFLINE_CONFLICT_STORAGE_KEY);
    localStorage.removeItem(OFFLINE_LAST_SYNCED_AT_KEY);
  } catch {
    return;
  }
}

async function broadcastClearPrivateData() {
  clearOfflineStorage();
  window.dispatchEvent(new Event("taxbook-offline-private-data-cleared"));

  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: "CLEAR_PRIVATE_DATA",
    });
  } catch {
    return;
  }
}

export default function TaxBookOfflineRuntime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/taxbook-sw.js").catch(() => {
      return;
    });

    const handleClear = () => {
      void broadcastClearPrivateData();
    };

    window.addEventListener("taxbook-offline-clear-private-data", handleClear);

    return () => {
      window.removeEventListener("taxbook-offline-clear-private-data", handleClear);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function reconcileSession() {
      try {
        const response = await fetch("/api/session/validate", {
          cache: "no-store",
          credentials: "include",
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          const previousUserId = localStorage.getItem(OFFLINE_SESSION_USER_KEY);
          localStorage.removeItem(OFFLINE_SESSION_USER_KEY);

          if (previousUserId) {
            await broadcastClearPrivateData();
          }
          return;
        }

        const payload = (await response.json()) as {
          ok?: boolean;
          user?: {
            id?: number;
          } | null;
        };

        const nextUserId =
          typeof payload.user?.id === "number" ? String(payload.user.id) : null;
        const previousUserId = localStorage.getItem(OFFLINE_SESSION_USER_KEY);

        if (!nextUserId) {
          localStorage.removeItem(OFFLINE_SESSION_USER_KEY);
          if (previousUserId) {
            await broadcastClearPrivateData();
          }
          return;
        }

        if (previousUserId && previousUserId !== nextUserId) {
          await broadcastClearPrivateData();
        }

        localStorage.setItem(OFFLINE_SESSION_USER_KEY, nextUserId);
      } catch {
        return;
      }
    }

    void reconcileSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
