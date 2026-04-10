import { seedBetaDemoAccount } from "../src/lib/demo-account";
import prismaScriptClient from "../prisma/scripts/create-prisma-client.cjs";

const { createScriptPrismaClient } = prismaScriptClient;

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

async function main() {
  const { prisma, disconnect } = createScriptPrismaClient({
    log: ["error", "warn"],
  });

  try {
    const withIssues = parseBoolean(process.env.DEMO_MODE) ?? true;
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
    console.log("2. Use POST /api/system/demo/reset?withIssues=true to reseed and persist scan results.");
    console.log("3. Log in with the credentials above and open /dashboard/integrity.");
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("Beta demo seed failed", error);
  process.exit(1);
});
