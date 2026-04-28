import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readEnvExample() {
  return readFileSync(join(process.cwd(), ".env.example"), "utf8");
}

function parseEnvNames(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim());
}

test(".env.example documents production-critical runtime variables", () => {
  const names = new Set(parseEnvNames(readEnvExample()));
  const required = [
    "DATABASE_PROVIDER",
    "DATABASE_URL",
    "DIRECT_URL",
    "APP_URL",
    "HEALTH_CHECK_SECRET",
    "REDIS_URL",
    "BULLMQ_REDIS_URL",
    "UPSTASH_REDIS_URL",
    "OPENAI_API_KEY",
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_WEBHOOK_SECRET",
    "PAYSTACK_PLAN_GROWTH",
    "PAYSTACK_PLAN_GROWTH_ANNUAL",
    "PAYSTACK_PLAN_PROFESSIONAL",
    "PAYSTACK_PLAN_PROFESSIONAL_ANNUAL",
    "PORTAL_LINK_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
  ];

  for (const name of required) {
    assert.equal(names.has(name), true, `${name} must be present in .env.example`);
  }
});

test(".env.example does not define duplicate variables", () => {
  const names = parseEnvNames(readEnvExample());
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);
});

test("deployment runbook records Vercel root, health, migrations, and restore process", () => {
  const runbook = readFileSync(
    join(process.cwd(), "docs/production-deployment.md"),
    "utf8"
  );

  assert.match(runbook, /Root Directory to `webapp`/);
  assert.match(runbook, /\/api\/health\?strict=1/);
  assert.match(runbook, /prisma:migrate:deploy:production/);
  assert.match(runbook, /Backup And Restore/);
  assert.match(runbook, /pg_dump/);
  assert.match(runbook, /pg_restore/);
});
