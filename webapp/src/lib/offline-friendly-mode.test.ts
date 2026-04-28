import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isOfflineQueuedActionForWorkspace } from "./offline-sync-types";

test("offline queue only replays workspace-owned actions in the active workspace", () => {
  const action = {
    target: {
      workspaceId: 10,
      recordType: "WORKSPACE_ALERT",
      recordId: 5,
      label: "Review alert",
      href: "/dashboard/notifications",
    },
  };

  assert.equal(isOfflineQueuedActionForWorkspace(action, 10), true);
  assert.equal(isOfflineQueuedActionForWorkspace(action, 11), false);
  assert.equal(
    isOfflineQueuedActionForWorkspace(
      { target: { ...action.target, workspaceId: null } },
      11
    ),
    true
  );
});

test("service worker caches only safe dashboard and review reads", () => {
  const source = readFileSync(
    join(process.cwd(), "public/taxbook-sw.js"),
    "utf8"
  );

  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /pathname\.startsWith\("\/dashboard\/banking\/review"\)/);
  assert.match(source, /pathname\.startsWith\("\/api\/banking\/transactions\/review"\)/);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/banking\/transactions"\)\s*\|\|/);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/tax-records"\)/);
});

test("session validation exposes active workspace for cache isolation", () => {
  const source = readFileSync(
    join(process.cwd(), "app/api/session/validate/route.ts"),
    "utf8"
  );

  assert.match(source, /getAuthContext/);
  assert.match(source, /activeWorkspaceId/);
});
