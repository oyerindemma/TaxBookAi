import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  isProductionDemoRouteAllowed,
  secureCompareText,
  serializeAuditMetadata,
} from "./security-guards";

const repoRoot = process.cwd();

function routeSource(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("audit metadata redacts secrets recursively before persistence", () => {
  const serialized = serializeAuditMetadata({
    action: "INVITE_CREATED",
    token: "invite-token",
    nested: {
      apiKey: "sk_live_secret",
      safe: "kept",
    },
    entries: [
      {
        password: "never-store",
        label: "row",
      },
    ],
  });

  assert.equal(
    serialized,
    JSON.stringify({
      action: "INVITE_CREATED",
      token: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        safe: "kept",
      },
      entries: [
        {
          password: "[REDACTED]",
          label: "row",
        },
      ],
    })
  );
});

test("production demo routes require both demo mode and a configured secret", () => {
  assert.equal(
    isProductionDemoRouteAllowed({
      deploymentStage: "production",
      demoModeEnabled: false,
      accessSecretConfigured: true,
    }),
    false
  );
  assert.equal(
    isProductionDemoRouteAllowed({
      deploymentStage: "production",
      demoModeEnabled: true,
      accessSecretConfigured: false,
    }),
    false
  );
  assert.equal(
    isProductionDemoRouteAllowed({
      deploymentStage: "production",
      demoModeEnabled: true,
      accessSecretConfigured: true,
    }),
    true
  );
  assert.equal(secureCompareText("secret", "secret"), true);
  assert.equal(secureCompareText("wrong", "secret"), false);
});

test("high-risk workspace routes enforce role checks before mutations", () => {
  const routes = [
    "app/api/workspaces/[id]/route.ts",
    "app/api/workspaces/[id]/invites/route.ts",
    "app/api/workspaces/[id]/members/route.ts",
    "app/api/workspaces/[id]/members/[userId]/route.ts",
    "app/api/invoices/[id]/route.ts",
    "app/api/invoices/[id]/payment-link/route.ts",
    "app/api/invoices/[id]/portal-link/route.ts",
    "app/api/tax-records/[id]/route.ts",
    "app/api/tax-engine/records/[kind]/[id]/route.ts",
  ];

  for (const route of routes) {
    const source = routeSource(route);
    assert.match(source, /requireRoleAtLeast/, `${route} must enforce a workspace role`);
    assert.match(source, /workspaceId/, `${route} must carry workspace scoping`);
  }
});

test("production-only demo and dev seed routes keep explicit guards", () => {
  assert.match(
    routeSource("app/api/system/dev/seed-workspace/route.ts"),
    /production[\s\S]+disabled in production/i
  );

  const demoCreate = routeSource("app/api/system/demo/create/route.ts");
  const demoReset = routeSource("app/api/system/demo/reset/route.ts");
  assert.match(demoCreate, /resolveDemoRouteAccess/);
  assert.match(demoReset, /resolveDemoRouteAccess/);
});
