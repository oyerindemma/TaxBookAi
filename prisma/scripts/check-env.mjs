import { loadDotEnv, resolveDatabaseProvider } from "./prisma-build-env.mjs";

loadDotEnv();

const provider = resolveDatabaseProvider(process.env);
const databaseUrl = (process.env.DATABASE_URL || "").trim();
const directUrl = (process.env.DIRECT_URL || "").trim();
const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
const deploymentStage =
  vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development"
    ? vercelEnv
    : process.env.NODE_ENV === "production"
      ? "production"
      : "development";
const strict = process.argv.includes("--strict") || deploymentStage === "production";
const smtpEnvNames = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];

const errors = [];
const warnings = [];
const missing = [];

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasAnyEnv(names) {
  return names.some((name) => Boolean(readEnv(name)));
}

function parseBooleanEnv(name) {
  const value = readEnv(name).toLowerCase();
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeAbsoluteUrl(value, label) {
  const candidate = value.includes("://") ? value : `https://${value}`;

  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
}

function getVercelUrlFallback() {
  const raw =
    readEnv("VERCEL_PROJECT_PRODUCTION_URL") ||
    readEnv("VERCEL_BRANCH_URL") ||
    readEnv("VERCEL_URL");

  if (!raw) return null;

  try {
    return normalizeAbsoluteUrl(raw, "VERCEL_URL");
  } catch {
    return null;
  }
}

function resolveAppUrl() {
  const raw = readEnv("APP_URL") || getVercelUrlFallback() || "http://localhost:3000";
  return normalizeAbsoluteUrl(raw, "APP_URL");
}

function isLikelyNeonConnection(url) {
  return /neon\.tech/i.test(url);
}

function isLikelyPooledPostgresUrl(url) {
  return /pooler/i.test(url) || /pgbouncer/i.test(url);
}

const explicitStubSetting = parseBooleanEnv("ALLOW_STUB_PAYMENTS");
const allowStubPayments =
  deploymentStage === "production"
    ? false
    : (explicitStubSetting ?? deploymentStage === "development");

if (!databaseUrl) {
  missing.push("DATABASE_URL");
  errors.push("DATABASE_URL is required");
} else if (provider === "sqlite" && !databaseUrl.startsWith("file:")) {
  errors.push("DATABASE_URL must start with file: for sqlite");
} else if (provider === "postgresql" && !databaseUrl.startsWith("postgres")) {
  errors.push("DATABASE_URL must be a PostgreSQL connection string for postgresql");
}

if (provider === "sqlite" && directUrl && !directUrl.startsWith("file:")) {
  errors.push("DIRECT_URL must start with file: for sqlite");
}

if (provider === "postgresql" && directUrl && !directUrl.startsWith("postgres")) {
  errors.push("DIRECT_URL must be a PostgreSQL connection string for postgresql");
}

if (provider === "postgresql" && deploymentStage === "production" && !directUrl) {
  missing.push("DIRECT_URL");
  errors.push("DIRECT_URL is required in production for Prisma migrations");
} else if (provider === "postgresql" && !directUrl && strict) {
  warnings.push("DIRECT_URL is not set; Prisma migrations will fall back to DATABASE_URL");
}

let appUrl = "http://localhost:3000";
try {
  appUrl = resolveAppUrl();
} catch (error) {
  errors.push(error instanceof Error ? error.message : "APP_URL must be a valid absolute URL");
}

if (!readEnv("APP_URL")) {
  if (deploymentStage === "production") {
    missing.push("APP_URL");
    errors.push("APP_URL must be set explicitly in production");
  } else if (getVercelUrlFallback()) {
    warnings.push("APP_URL not set; falling back to the current Vercel deployment URL");
  } else {
    warnings.push("APP_URL not set; defaulting to http://localhost:3000");
  }
}

if (deploymentStage === "production" && appUrl.includes("localhost")) {
  errors.push("APP_URL cannot point to localhost in production");
}

if (!readEnv("OPENAI_API_KEY")) {
  warnings.push("OPENAI_API_KEY is not set; AI features will be unavailable");
}

if (!readEnv("OPENAI_MODEL")) {
  warnings.push("OPENAI_MODEL is not set; defaulting to gpt-4o-mini");
}

if (!readEnv("PAYSTACK_SECRET_KEY")) {
  missing.push("PAYSTACK_SECRET_KEY");
  if (deploymentStage === "production") {
    errors.push("PAYSTACK_SECRET_KEY is required in production");
  } else {
    warnings.push("PAYSTACK_SECRET_KEY is not set; billing checkout will be unavailable");
  }
}

if (!readEnv("PAYSTACK_WEBHOOK_SECRET")) {
  missing.push("PAYSTACK_WEBHOOK_SECRET");
  if (deploymentStage === "production") {
    errors.push("PAYSTACK_WEBHOOK_SECRET is required in production");
  } else {
    warnings.push(
      "PAYSTACK_WEBHOOK_SECRET is not set; webhook signature verification will fall back to PAYSTACK_SECRET_KEY"
    );
  }
}

if (!hasAnyEnv(["PAYSTACK_PLAN_GROWTH"])) {
  missing.push("PAYSTACK_PLAN_GROWTH");
  if (deploymentStage === "production") {
    errors.push("PAYSTACK_PLAN_GROWTH is required in production");
  } else {
    warnings.push("PAYSTACK_PLAN_GROWTH is not set; Growth monthly checkout will be unavailable");
  }
}

if (!hasAnyEnv(["PAYSTACK_PLAN_GROWTH_ANNUAL"])) {
  missing.push("PAYSTACK_PLAN_GROWTH_ANNUAL");
  if (deploymentStage === "production") {
    errors.push("PAYSTACK_PLAN_GROWTH_ANNUAL is required in production");
  } else {
    warnings.push(
      "PAYSTACK_PLAN_GROWTH_ANNUAL is not set; Growth annual checkout will be unavailable"
    );
  }
}

if (!hasAnyEnv(["PAYSTACK_PLAN_PROFESSIONAL", "PAYSTACK_PLAN_BUSINESS"])) {
  missing.push("PAYSTACK_PLAN_PROFESSIONAL");
  if (deploymentStage === "production") {
    errors.push("PAYSTACK_PLAN_PROFESSIONAL or PAYSTACK_PLAN_BUSINESS is required in production");
  } else {
    warnings.push(
      "PAYSTACK_PLAN_PROFESSIONAL or PAYSTACK_PLAN_BUSINESS is not set; Professional monthly checkout will be unavailable"
    );
  }
}

if (!hasAnyEnv(["PAYSTACK_PLAN_PROFESSIONAL_ANNUAL", "PAYSTACK_PLAN_BUSINESS_ANNUAL"])) {
  missing.push("PAYSTACK_PLAN_PROFESSIONAL_ANNUAL");
  if (deploymentStage === "production") {
    errors.push(
      "PAYSTACK_PLAN_PROFESSIONAL_ANNUAL or PAYSTACK_PLAN_BUSINESS_ANNUAL is required in production"
    );
  } else {
    warnings.push(
      "PAYSTACK_PLAN_PROFESSIONAL_ANNUAL or PAYSTACK_PLAN_BUSINESS_ANNUAL is not set; Professional annual checkout will be unavailable"
    );
  }
}

if (!hasAnyEnv(["PAYSTACK_PLAN_ENTERPRISE", "PAYSTACK_PLAN_ACCOUNTANT"])) {
  warnings.push(
    "PAYSTACK_PLAN_ENTERPRISE is not set; Enterprise checkout automation remains unavailable and sales-led"
  );
}

if (!readEnv("PAYSTACK_PUBLIC_KEY")) {
  warnings.push(
    "PAYSTACK_PUBLIC_KEY is not set; redirect checkout still works, but client-side Paystack flows cannot be enabled"
  );
}

if (!smtpEnvNames.every((name) => Boolean(readEnv(name)))) {
  if (deploymentStage === "production") {
    errors.push(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM must be configured in production"
    );
  } else {
    warnings.push(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM are not fully configured; password reset emails will fail outside local preview mode"
    );
  }
}

if (provider === "postgresql" && databaseUrl) {
  if (isLikelyNeonConnection(databaseUrl) && !isLikelyPooledPostgresUrl(databaseUrl)) {
    warnings.push(
      "DATABASE_URL appears to be a direct Neon connection; use the pooled connection string for app runtime"
    );
  }

  if (directUrl && isLikelyPooledPostgresUrl(directUrl)) {
    warnings.push(
      "DIRECT_URL appears to be pooled; use the direct Neon connection string for Prisma migrations"
    );
  }
}

if (deploymentStage === "production" && readEnv("ALLOW_STUB_PAYMENTS") === "true") {
  errors.push("ALLOW_STUB_PAYMENTS must not be true in production");
}

console.log(
  JSON.stringify(
    {
      deploymentStage,
      databaseProvider: provider,
      appUrl,
      allowStubPayments,
      hasOpenAiKey: Boolean(readEnv("OPENAI_API_KEY")),
      hasPaystackKey: Boolean(readEnv("PAYSTACK_SECRET_KEY")),
      missing,
      warnings,
      errors,
    },
    null,
    2
  )
);

if (errors.length > 0) {
  process.exit(1);
}
