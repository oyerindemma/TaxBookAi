import fs from "node:fs";
import path from "node:path";

const VALID_PROVIDERS = new Set(["sqlite", "postgresql"]);
const SQLITE_FALLBACK_URL = "file:./dev.db";
const POSTGRES_FALLBACK_URL =
  "postgresql://build:build@127.0.0.1:5432/tax_bookkeeping_build?schema=public";

export function loadDotEnv(cwd = process.cwd()) {
  const envPath = path.resolve(cwd, ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function inferProvider(databaseUrl) {
  if (!databaseUrl) return null;
  if (databaseUrl.startsWith("file:")) return "sqlite";
  if (databaseUrl.startsWith("postgres")) return "postgresql";
  return null;
}

function isValidProvider(value) {
  return VALID_PROVIDERS.has(value);
}

function isVercelEnvironment(env) {
  return Boolean(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL);
}

function hasExpectedUrl(url, provider) {
  if (!url) return false;
  return provider === "postgresql" ? url.startsWith("postgres") : url.startsWith("file:");
}

export function resolveDatabaseProvider(env = process.env) {
  const explicitProvider = (env.DATABASE_PROVIDER || "").trim().toLowerCase();
  if (isValidProvider(explicitProvider)) {
    return explicitProvider;
  }

  const inferredProvider = inferProvider((env.DATABASE_URL || "").trim());
  if (inferredProvider) {
    return inferredProvider;
  }

  return isVercelEnvironment(env) ? "postgresql" : "sqlite";
}

export function getSchemaPath(provider) {
  return provider === "postgresql" ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma";
}

export function preparePrismaBuildEnvironment(baseEnv = process.env) {
  const env = { ...baseEnv };
  const provider = resolveDatabaseProvider(env);
  const databaseUrl = (env.DATABASE_URL || "").trim();
  const directUrl = (env.DIRECT_URL || "").trim();

  if (!hasExpectedUrl(databaseUrl, provider)) {
    env.DATABASE_URL =
      provider === "postgresql" ? POSTGRES_FALLBACK_URL : SQLITE_FALLBACK_URL;
  }

  if (provider === "postgresql") {
    if (!hasExpectedUrl(directUrl, provider)) {
      env.DIRECT_URL = env.DATABASE_URL;
    }
  } else if (directUrl && !hasExpectedUrl(directUrl, provider)) {
    delete env.DIRECT_URL;
  }

  return {
    env,
    provider,
    schemaPath: getSchemaPath(provider),
  };
}
