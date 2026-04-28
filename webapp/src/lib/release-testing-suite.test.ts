import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  validateLoginPayload,
  validateSignupPayload,
} from "./auth-validation";
import {
  validateBankTransactionCategorizationActionPayload,
  validateBulkBankTransactionCategorizationPayload,
} from "./bank-transaction-categorization-validation";
import { validateManualBankTransactionPayload } from "./bank-transaction-validation";
import { isSuccessfulInvoicePaymentReplay } from "./invoice-payment-idempotency";
import { resolveAccountingReportPeriod } from "./report-period";

function routeSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("auth validation normalizes accepted credentials and rejects weak signup payloads", () => {
  const login = validateLoginPayload({
    email: " OWNER@Example.COM ",
    password: "secret",
  });
  assert.equal(login.ok, true);
  if (login.ok) {
    assert.equal(login.data.email, "owner@example.com");
  }

  const signup = validateSignupPayload({
    fullName: "  Ada   SME  ",
    email: "ada@example.com",
    password: "pass",
    confirmPassword: "different",
    acceptedTerms: false,
  });
  assert.equal(signup.ok, false);
  if (!signup.ok) {
    assert.match(signup.fieldErrors.password ?? "", /least 8/i);
    assert.match(signup.fieldErrors.confirmPassword ?? "", /match/i);
    assert.match(signup.fieldErrors.acceptedTerms ?? "", /accept/i);
  }
});

test("manual transaction import validation converts SME input into safe minor units", () => {
  const result = validateManualBankTransactionPayload({
    bankAccountId: "2",
    clientBusinessId: "3",
    date: "2026-04-28",
    description: "  POS settlement   ",
    reference: " REF-001 ",
    amount: "1,250.50",
    currency: "ngn",
    direction: "income",
    status: "review_required",
    categoryId: "",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.amountMinor, 125_050);
    assert.equal(result.data.currency, "NGN");
    assert.equal(result.data.direction, "INCOME");
    assert.equal(result.data.status, "REVIEW_REQUIRED");
    assert.equal(result.data.categoryId, null);
  }
});

test("transaction import validation rejects incomplete or unsafe rows", () => {
  const result = validateManualBankTransactionPayload({
    bankAccountId: "",
    clientBusinessId: "",
    date: "not-a-date",
    description: "",
    amount: "0",
    currency: "naira",
    direction: "sideways",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.fieldErrors.bankAccountId);
    assert.ok(result.fieldErrors.clientBusinessId);
    assert.ok(result.fieldErrors.date);
    assert.ok(result.fieldErrors.description);
    assert.ok(result.fieldErrors.amount);
    assert.ok(result.fieldErrors.currency);
    assert.ok(result.fieldErrors.direction);
  }
});

test("categorisation validation dedupes bulk IDs and caps unsafe batches", () => {
  const single = validateBankTransactionCategorizationActionPayload({
    action: "approve",
    transactionId: "42",
  });
  assert.equal(single.ok, true);
  if (single.ok) {
    assert.equal(single.data.action, "approve");
    assert.equal(single.data.transactionId, 42);
  }

  const bulk = validateBulkBankTransactionCategorizationPayload({
    transactionIds: ["1", "1", 2, "bad", 3],
    limit: "25",
  });
  assert.equal(bulk.ok, true);
  if (bulk.ok) {
    assert.deepEqual(bulk.data.transactionIds, [1, 2, 3]);
    assert.equal(bulk.data.limit, 25);
  }

  const oversized = validateBulkBankTransactionCategorizationPayload({
    transactionIds: Array.from({ length: 201 }, (_, index) => index + 1),
  });
  assert.equal(oversized.ok, false);
});

test("workspace scoping stays explicit on high-risk mutation routes", () => {
  const routes = [
    "app/api/banking/transactions/route.ts",
    "app/api/banking/transactions/categorization/route.ts",
    "app/api/banking/transactions/review/[id]/route.ts",
    "app/api/invoices/[id]/route.ts",
    "app/api/tax-records/[id]/route.ts",
    "app/api/reports/export/route.ts",
  ];

  for (const route of routes) {
    const source = routeSource(route);
    assert.match(source, /getAuthContext|requireRoleAtLeast/, `${route} must authenticate`);
    assert.match(source, /ctx\.workspaceId|access\.ctx\.workspaceId/, `${route} must scope by active workspace`);
  }
});

test("invoice payment replay detection protects duplicate gateway callbacks", () => {
  assert.equal(
    isSuccessfulInvoicePaymentReplay({
      existingPayment: {
        status: "SUCCESS",
        providerTransactionId: "paystack-1",
      },
      providerTransactionId: "paystack-1",
    }),
    true
  );
  assert.equal(
    isSuccessfulInvoicePaymentReplay({
      existingPayment: {
        status: "SUCCESS",
        providerTransactionId: "paystack-1",
      },
      providerTransactionId: "paystack-2",
    }),
    false
  );
});

test("report period parsing rejects inverted ranges and resolves standard exports", () => {
  const now = new Date("2026-04-28T12:00:00.000Z");
  const month = resolveAccountingReportPeriod({ month: "2026-04" }, now);
  assert.equal(month.errorMsg, null);
  assert.equal(month.mode, "month");
  assert.equal(month.fromParam, "2026-04-01");
  assert.equal(month.toParam, "2026-04-30");

  const custom = resolveAccountingReportPeriod({
    from: "2026-05-01",
    to: "2026-04-01",
  }, now);
  assert.match(custom.errorMsg ?? "", /before end date/i);
});

test("compliance export filenames remain deterministic and audit friendly", () => {
  const source = routeSource("src/lib/compliance-export-service.ts");
  assert.match(source, /taxbook-\$\{scope\}-export-\$\{date\}\.json/);
  assert.match(source, /contentType: "application\/json; charset=utf-8"/);
});
