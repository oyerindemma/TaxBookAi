import { seedBetaDemoAccount } from "../src/lib/demo-account";
import prismaScriptClient from "../prisma/scripts/create-prisma-client.cjs";

const { createScriptPrismaClient } = prismaScriptClient;

type ParsedArgs = {
  withIssues?: boolean;
  help: boolean;
};

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function readFlagValue(args: string[], name: string) {
  const prefixed = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);

  const index = args.findIndex((arg) => arg === name);
  if (index >= 0 && index < args.length - 1) return args[index + 1];

  return undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  return {
    withIssues:
      parseBoolean(readFlagValue(argv, "--with-issues")) ??
      (argv.includes("--clean") ? false : undefined),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log("Usage: npm run seed:beta -- [options]");
  console.log("");
  console.log("Options:");
  console.log("  --with-issues <true|false>  Include deliberate integrity/payment/tax issues.");
  console.log("  --clean                     Alias for --with-issues false.");
  console.log("  --help                      Show this help text.");
  console.log("");
  console.log("Safety:");
  console.log("  Refuses to run when NODE_ENV=production or VERCEL_ENV=production unless");
  console.log("  ALLOW_BETA_DEMO_SEED=true is set for a controlled preview operation.");
}

function assertSeedAllowed() {
  const productionLike =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const overrideAllowed = parseBoolean(process.env.ALLOW_BETA_DEMO_SEED) === true;

  if (productionLike && !overrideAllowed) {
    throw new Error(
      "Refusing to seed beta demo data in a production-like environment. Set ALLOW_BETA_DEMO_SEED=true only for a controlled preview operation."
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  assertSeedAllowed();

  const { prisma, disconnect } = createScriptPrismaClient({
    log: ["error", "warn"],
  });

  try {
    const withIssues = args.withIssues ?? parseBoolean(process.env.DEMO_WITH_ISSUES) ?? true;
    const seeded = await seedBetaDemoAccount(prisma, {
      withIssues,
    });

    console.log("Beta demo seed ready");
    console.log(`Email: ${seeded.email}`);
    console.log(`Password: ${seeded.password}`);
    console.log(`Workspace: ${seeded.workspaceName} (#${seeded.workspaceId})`);
    console.log(`With issues: ${seeded.withIssues ? "yes" : "no"}`);
    console.log(
      `Invoices: ${seeded.invoiceCounts.total} total (${seeded.invoiceCounts.paid} paid / ${seeded.invoiceCounts.sent} sent / ${seeded.invoiceCounts.overdue} overdue)`
    );
    console.log(
      `Payments: ${seeded.paymentCount}, Ledger rows: ${seeded.ledgerCount}, Tax records: ${seeded.taxRecordCount}, VAT rows: ${seeded.vatRecordCount}, WHT rows: ${seeded.whtRecordCount}`
    );

    if (seeded.primaryScenarios.length > 0) {
      console.log("Primary demo scenarios:");
      for (const scenario of seeded.primaryScenarios) {
        console.log(
          `- ${scenario.scenario}: ${scenario.invoiceNumber} (#${scenario.invoiceId})`
        );
      }
    }

    console.log("");
    console.log("Next steps:");
    console.log("1. Start the web app if it is not already running.");
    console.log("2. Log in with the credentials above and open /dashboard.");
    console.log("3. Walk /dashboard/banking/review, /dashboard/tax, /dashboard/reports, /dashboard/invoices, and /dashboard/integrity.");
    console.log("4. Use POST /api/system/demo/reset?withIssues=true to reseed and persist scan results in controlled preview environments.");
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("Beta demo seed failed", error);
  process.exit(1);
});
