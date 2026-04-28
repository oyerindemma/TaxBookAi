import { seedDefaultChartOfAccounts } from "../src/lib/chart-of-accounts";
import prismaScriptClient from "../prisma/scripts/create-prisma-client.cjs";

const { createScriptPrismaClient } = prismaScriptClient;

function readFlagValue(args: string[], name: string) {
  const prefixed = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);

  const index = args.findIndex((arg) => arg === name);
  if (index >= 0 && index < args.length - 1) {
    return args[index + 1];
  }

  return undefined;
}

function parseWorkspaceId(args: string[]) {
  const raw = readFlagValue(args, "--workspace-id") ?? process.env.WORKSPACE_ID;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function printHelp() {
  console.log("Usage: npx tsx scripts/seedAccounts.ts --workspace-id <id>");
  console.log("");
  console.log("Seeds the default TaxBook chart of accounts for a workspace:");
  console.log("- Cash");
  console.log("- Bank");
  console.log("- Accounts Receivable");
  console.log("- Accounts Payable");
  console.log("- Tax Payable");
  console.log("- Owner Equity");
  console.log("- Sales Revenue");
  console.log("- Operating Expense");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const workspaceId = parseWorkspaceId(args);
  if (!workspaceId) {
    printHelp();
    throw new Error("Provide a valid workspace id with --workspace-id or WORKSPACE_ID.");
  }

  const { prisma, disconnect } = createScriptPrismaClient({
    log: ["error", "warn"],
  });

  try {
    await seedDefaultChartOfAccounts(prisma, workspaceId);
    console.log(`Default chart of accounts seeded for workspace #${workspaceId}.`);
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("Default account seed failed", error);
  process.exit(1);
});
