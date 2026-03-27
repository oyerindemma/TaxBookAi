import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./prisma-build-env.mjs";

loadDotEnv();

async function main() {
  const startedAt = Date.now();
  const prisma = new PrismaClient({
    log: ["error"],
  });

  try {
    await prisma.$queryRawUnsafe("SELECT 1");

    console.log(
      JSON.stringify(
        {
          ok: true,
          checkedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          checkedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "Database health check failed",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Health check failed",
      },
      null,
      2
    )
  );
  process.exit(1);
});
