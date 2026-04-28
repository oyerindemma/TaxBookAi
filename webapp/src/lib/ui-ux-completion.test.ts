import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("core dashboard empty states give SMEs a next step", () => {
  const dashboard = source("app/dashboard/page.tsx");
  const banking = source("app/dashboard/banking/_components/BankingClient.tsx");
  const reconcile = source("app/dashboard/banking/reconcile/_components/ReconcileClient.tsx");
  const review = source("app/dashboard/banking/review/_components/TransactionReviewClient.tsx");
  const categorize = source("app/dashboard/categorize/page.tsx");
  const invoices = source("app/dashboard/invoices/_components/InvoicesClient.tsx");
  const reports = source("app/dashboard/reports/page.tsx");

  assert.match(dashboard, /Add transactions/);
  assert.match(banking, /Import bank statement/);
  assert.match(reconcile, /Choose a business, select a bank account, upload a CSV, then preview it/);
  assert.match(review, /Import statement/);
  assert.match(categorize, /Open dashboard/);
  assert.match(invoices, /Create invoice/);
  assert.match(reports, /Review and post bank transactions/);
});

test("reconciliation avoids technical dead-end copy when AI is unavailable", () => {
  const reconcile = source("app/dashboard/banking/reconcile/_components/ReconcileClient.tsx");

  assert.doesNotMatch(reconcile, /OPENAI_API_KEY is not configured/);
  assert.match(reconcile, /AI suggestions are off/);
  assert.match(reconcile, /Import still works with simple rules/);
});

test("table-heavy SME workflows stay horizontally scrollable on small screens", () => {
  const invoices = source("app/dashboard/invoices/_components/InvoicesClient.tsx");
  const reportsUi = source("app/dashboard/reports/_components/ReportsUI.tsx");
  const review = source("app/dashboard/banking/review/_components/TransactionReviewClient.tsx");

  assert.match(invoices, /overflow-x-auto/);
  assert.match(invoices, /min-w-\[780px\]/);
  assert.match(reportsUi, /overflow-x-auto/);
  assert.match(review, /overflow-x-auto/);
});
