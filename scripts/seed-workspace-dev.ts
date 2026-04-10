import {
  resolveDevWorkspaceSeedTarget,
  seedPhase2DevWorkspace,
} from "../src/lib/dev-workspace-seed";
import prismaScriptClient from "../prisma/scripts/create-prisma-client.cjs";

const { createScriptPrismaClient } = prismaScriptClient;

type ParsedArgs = {
  workspaceId?: number;
  userId?: number;
  email?: string;
  resetExisting: boolean;
  help: boolean;
};

function readFlagValue(args: string[], name: string) {
  const prefixed = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) {
    return inline.slice(prefixed.length);
  }

  const index = args.findIndex((arg) => arg === name);
  if (index >= 0 && index < args.length - 1) {
    return args[index + 1];
  }

  return undefined;
}

function parseIntFlag(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  return {
    workspaceId: parseIntFlag(readFlagValue(argv, "--workspace-id")),
    userId: parseIntFlag(readFlagValue(argv, "--user-id")),
    email: readFlagValue(argv, "--email"),
    resetExisting: argv.includes("--reset"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log("Usage: npm run seed:workspace:dev -- [options]");
  console.log("");
  console.log("Options:");
  console.log("  --workspace-id <id>   Seed a specific workspace id.");
  console.log("  --user-id <id>        Resolve the workspace from a specific user.");
  console.log("  --email <address>     Resolve the workspace from a user email.");
  console.log("  --reset               Remove previously seeded Phase 2 records before reseeding.");
  console.log("  --help                Show this help text.");
  console.log("");
  console.log("Examples:");
  console.log("  npm run seed:workspace:dev -- --workspace-id 3");
  console.log("  npm run seed:workspace:dev -- --email owner@local.test --reset");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const { prisma, disconnect } = createScriptPrismaClient({
    log: ["error", "warn"],
  });

  try {
    const target = await resolveDevWorkspaceSeedTarget(prisma, {
      workspaceId: args.workspaceId,
      userId: args.userId,
      email: args.email,
    });

    const result = await seedPhase2DevWorkspace(prisma, {
      workspaceId: target.workspaceId,
      actorUserId: target.actorUserId,
      resetExisting: args.resetExisting,
    });

    console.log("Phase 2 workspace seed complete");
    console.log(`Workspace: ${result.workspaceName} (#${result.workspaceId})`);
    console.log(`Actor: ${result.actorEmail} (#${result.actorUserId})`);
    console.log(`Reset existing seed data: ${result.resetExisting ? "yes" : "no"}`);
    console.log(
      `Transactions: ${result.transactionSummary.total} total (${result.transactionSummary.posted} posted / ${result.transactionSummary.pendingReview} pending review / ${result.transactionSummary.flagged} flagged / ${result.transactionSummary.reviewedReadyToPost} reviewed-ready)`
    );
    console.log(
      `Created records: ${result.counters.clientBusinesses} businesses, ${result.counters.bankAccounts} bank accounts, ${result.counters.transactions} bank transactions, ${result.counters.ledgerTransactions} ledger rows, ${result.counters.taxRecords} tax records, ${result.counters.vatRecords} VAT rows, ${result.counters.whtRecords} WHT rows`
    );
    console.log("");
    console.log("Expected product scenarios:");
    for (const scenario of result.scenarios) {
      console.log(`- ${scenario}`);
    }
    console.log("");
    console.log("Next steps:");
    console.log("1. Start the app with npm run dev if it is not already running.");
    console.log("2. Open /dashboard in the seeded workspace.");
    console.log("3. Optionally call POST /api/system/dev/seed-workspace to run the full post-seed automation flow for alerts, expense leaks, and assistant state.");
    console.log("4. Open /dashboard/banking/review, /dashboard/tax-center, /dashboard/notifications, and /dashboard/assistant to verify Phase 2 flows.");
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("Workspace Phase 2 seed failed", error);
  process.exit(1);
});
