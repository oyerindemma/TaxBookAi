const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");

function loadDotEnv(cwd = process.cwd()) {
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

function resolveDatabaseUrl(input) {
  loadDotEnv();

  const databaseUrl =
    typeof input?.databaseUrl === "string"
      ? input.databaseUrl.trim()
      : process.env.DATABASE_URL?.trim() || "";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!databaseUrl.startsWith("postgres")) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string for Prisma 7 adapter-based scripts."
    );
  }

  return databaseUrl;
}

function createScriptPrismaClient(input = {}) {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(input),
  });
  const adapter = new PrismaPg(pool, {
    disposeExternalPool: false,
  });
  const prisma = new PrismaClient({
    adapter,
    ...(input.log ? { log: input.log } : {}),
  });

  async function disconnect() {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  }

  return {
    prisma,
    pool,
    disconnect,
  };
}

module.exports = {
  createScriptPrismaClient,
};
