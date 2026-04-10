import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWorkspaceExportAccess } from "./route-helpers";

test("admin can export workspace data", () => {
  const result = evaluateWorkspaceExportAccess({
    userId: 41,
    workspaceId: 9,
    membershipRole: "ADMIN",
    hasMembership: true,
    includeDebug: true,
  });

  if (!result.ok) {
    assert.fail(`Expected access to succeed, received ${JSON.stringify(result.body)}`);
  }

  assert.equal(result.status, 200);
  assert.deepEqual(result.debug, {
    step: "workspace_role",
    userId: 41,
    workspaceId: 9,
    role: "ADMIN",
  });
});

test("viewer receives an explicit forbidden response", () => {
  const result = evaluateWorkspaceExportAccess({
    userId: 41,
    workspaceId: 9,
    membershipRole: "VIEWER",
    hasMembership: true,
    includeDebug: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected viewer access to fail.");
  }

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, {
    error: "Workspace exports require an admin or owner role.",
    code: "WORKSPACE_EXPORT_FORBIDDEN",
    debug: {
      step: "workspace_role",
      userId: 41,
      workspaceId: 9,
      role: "VIEWER",
    },
  });
});

test("missing active workspace returns a bad request response", () => {
  const result = evaluateWorkspaceExportAccess({
    userId: 41,
    workspaceId: null,
    membershipRole: null,
    hasMembership: false,
    includeDebug: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected missing workspace access to fail.");
  }

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    error: "Select an active workspace before exporting workspace data.",
    code: "ACTIVE_WORKSPACE_REQUIRED",
    debug: {
      step: "active_workspace",
      userId: 41,
      workspaceId: null,
      role: null,
    },
  });
});
