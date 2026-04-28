# TaxBook AI Module Inventory

Last updated: 2026-04-28

This inventory maps the current webapp surface by product domain. It is intended
to help release planning, QA, onboarding, and future refactors.

## Application Shape

- Framework: Next.js App Router.
- Runtime: server-rendered dashboard pages plus route handlers.
- Data layer: Prisma 7 with SQLite for local development and Postgres/Neon for preview and production.
- Async jobs: BullMQ/Redis for compliance export jobs.
- Payments: Paystack subscription and invoice-payment flows.
- AI: OpenAI-backed assistant, extraction, categorisation, insights, and fallback heuristics.
- Offline layer: limited service worker caching and lightweight action replay.

## Public Pages

- `/`
- `/features`
- `/pricing`
- `/contact`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/onboarding`
- `/portal`
- `/portal/access/[token]`
- `/portal/invoices/[invoiceId]`
- `/pay/[reference]`
- `/privacy`
- `/terms`
- `/cookies`
- `/dpa`

## Dashboard Pages

- `/dashboard`
- `/dashboard/admin/integrity`
- `/dashboard/assistant`
- `/dashboard/audit`
- `/dashboard/banking`
- `/dashboard/banking/reconcile`
- `/dashboard/banking/review`
- `/dashboard/banking/tax-center`
- `/dashboard/banking/tax-centre`
- `/dashboard/billing`
- `/dashboard/bookkeeping/review`
- `/dashboard/categorize`
- `/dashboard/cit`
- `/dashboard/client-businesses`
- `/dashboard/clients`
- `/dashboard/clients/[id]`
- `/dashboard/expense-leaks`
- `/dashboard/filing-readiness`
- `/dashboard/import`
- `/dashboard/integrity`
- `/dashboard/invoices`
- `/dashboard/invoices/[id]`
- `/dashboard/invoices/new`
- `/dashboard/invoices/recurring`
- `/dashboard/invoices/recurring/[id]`
- `/dashboard/invoices/recurring/new`
- `/dashboard/notifications`
- `/dashboard/profile`
- `/dashboard/receipts`
- `/dashboard/receipts/upload`
- `/dashboard/recurring-invoices`
- `/dashboard/reports`
- `/dashboard/review`
- `/dashboard/settings`
- `/dashboard/settings/business`
- `/dashboard/settings/categories`
- `/dashboard/settings/payments`
- `/dashboard/settings/whatsapp`
- `/dashboard/system-monitor`
- `/dashboard/tax`
- `/dashboard/tax/[periodId]`
- `/dashboard/tax-center`
- `/dashboard/tax-centre`
- `/dashboard/tax-filing`
- `/dashboard/tax-filing/[id]`
- `/dashboard/tax-records`
- `/dashboard/tax-records/import`
- `/dashboard/tax-records/new`
- `/dashboard/tax-summary`
- `/dashboard/team`
- `/dashboard/workspaces`

## API Route Groups

### Auth, Profile, Session

- `/api/signup`
- `/api/login`
- `/api/logout`
- `/api/session/validate`
- `/api/forgot-password`
- `/api/reset-password`
- `/api/profile`
- `/api/profile/password`

### Workspace, Team, Business Setup

- `/api/workspaces`
- `/api/workspaces/[id]`
- `/api/workspaces/select`
- `/api/workspaces/switch`
- `/api/workspaces/[id]/invites`
- `/api/workspaces/[id]/members`
- `/api/workspaces/[id]/members/[userId]`
- `/api/invites/accept`
- `/api/onboarding`
- `/api/business-profile`
- `/api/client-businesses`
- `/api/clients`
- `/api/clients/[id]`
- `/api/expense-categories`
- `/api/transaction-categories`

### Banking, Review, Reconciliation

- `/api/banking/accounts`
- `/api/banking/import`
- `/api/banking/reconcile`
- `/api/banking/matches/[id]`
- `/api/banking/transactions`
- `/api/banking/transactions/import`
- `/api/banking/transactions/review`
- `/api/banking/transactions/review/[id]`
- `/api/banking/transactions/review/bulk`
- `/api/banking/transactions/categorization`
- `/api/banking/transactions/categorization/bulk`
- `/api/banking/transactions/auto-bookkeeping`
- `/api/banking/transactions/auto-bookkeeping/bulk`
- `/api/banking/transactions/posting`
- `/api/banking/transactions/posting/bulk`

### Bookkeeping And Receipts

- `/api/bookkeeping/drafts/[id]`
- `/api/bookkeeping/uploads/[id]/file`
- `/api/receipts/drafts/[id]`
- `/api/whatsapp/receipts/webhook`

### Invoicing And Payments

- `/api/invoices`
- `/api/invoices/[id]`
- `/api/invoices/[id]/mark-paid`
- `/api/invoices/[id]/pay`
- `/api/invoices/[id]/payment-link`
- `/api/invoices/[id]/portal-link`
- `/api/invoices/[id]/reminders/send`
- `/api/invoices/reminders/run`
- `/api/recurring-invoices`
- `/api/recurring-invoices/[id]`
- `/api/recurring-invoices/run`
- `/api/payments/checkout/[reference]`
- `/api/payments/verify/[reference]`
- `/api/payments/webhook`
- `/api/payments/paystack/callback`
- `/api/payments/integrations/paystack/sync`
- `/api/payments/integrations/paystack/webhook`
- `/api/paystack/webhook`
- `/api/portal/invoices/[invoiceId]/checkout`
- `/api/portal/invoices/[invoiceId]/verify`

### Billing

- `/api/billing/checkout`
- `/api/billing/callback`
- `/api/billing/cancel`
- `/api/billing/manage`
- `/api/billing/verify`
- `/api/billing/webhook`

### Tax, CIT, Filing, Reports

- `/api/tax/compute`
- `/api/tax/summary`
- `/api/tax/periods`
- `/api/tax/periods/[periodId]/compute`
- `/api/tax-engine`
- `/api/tax-engine/export`
- `/api/tax-engine/records/[kind]/[id]`
- `/api/tax-engine/records/[kind]/[id]/evidence`
- `/api/tax-records`
- `/api/tax-records/[id]`
- `/api/tax-records/import`
- `/api/tax-filing`
- `/api/tax-filing/[id]`
- `/api/tax-filing/[id]/evidence`
- `/api/tax-filing/[id]/export`
- `/api/tax-filing/export`
- `/api/cit/periods`
- `/api/cit/periods/[id]`
- `/api/cit/periods/[id]/adjustments`
- `/api/cit/periods/[id]/evidence`
- `/api/cit/periods/[id]/export`
- `/api/cit/adjustments/[id]`
- `/api/reports/pl`
- `/api/reports/profit-loss`
- `/api/reports/balance-sheet`
- `/api/reports/cashflow`
- `/api/reports/trial-balance`
- `/api/reports/export`

### AI And Assistant

- `/api/assistant/chat`
- `/api/ai/accounting-assistant`
- `/api/ai/anomalies`
- `/api/ai/auto-post`
- `/api/ai/bookkeeping-extract`
- `/api/ai/categorize`
- `/api/ai/insights`
- `/api/ai/receipt-scan`
- `/api/ai/tax-record-draft`

### Alerts, Integrity, Monitoring, Compliance

- `/api/alerts`
- `/api/alerts/[id]`
- `/api/expense-leaks`
- `/api/expense-leaks/[id]`
- `/api/filing-readiness`
- `/api/system-monitor`
- `/api/system/integrity/health`
- `/api/system/integrity/issues`
- `/api/system/integrity/issues/[id]/recheck`
- `/api/system/integrity/issues/[id]/repair`
- `/api/system/integrity/issues/[id]/resolve`
- `/api/system/integrity/run`
- `/api/compliance/account`
- `/api/compliance/export`
- `/api/compliance/export/jobs/[id]`
- `/api/health`
- `/api/system/demo/create`
- `/api/system/demo/reset`
- `/api/system/dev/seed-workspace`

## Service Modules By Domain

### Auth, Workspace, Tenant Context

- `auth.ts`
- `auth-api.ts`
- `auth-client.ts`
- `auth-email.ts`
- `auth-validation.ts`
- `auth-workspace.ts`
- `session-constants.ts`
- `workspaces.ts`
- `workspace-fallback.ts`
- `workspace-onboarding.ts`
- `workspace-product-automation.ts`
- `workspace-state.ts`

### Banking And Transaction Engine

- `banking.ts`
- `bank-transaction-engine.ts`
- `bank-transaction-normalization.ts`
- `bank-transaction-fingerprint.ts`
- `bank-transaction-duplicates.ts`
- `bank-transaction-validation.ts`
- `bank-transaction-review.ts`
- `bank-transaction-review-validation.ts`
- `bank-transaction-categorization.ts`
- `bank-transaction-categorization-validation.ts`
- `bank-transaction-auto-bookkeeping.ts`
- `bank-transaction-auto-bookkeeping-validation.ts`
- `bank-transaction-account-mapping.ts`
- `bank-transaction-posting.ts`
- `bank-transaction-posting-status.ts`
- `bank-transaction-posting-validation.ts`

### Accounting, Ledger, Reports

- `ledger.ts`
- `chart-of-accounts.ts`
- `journal-entries.ts`
- `journal-entry-validation.ts`
- `accounting/*`
- `accounting-reports.ts`
- `accounting-report-types.ts`
- `accounting-types.ts`
- `financial-reports.ts`
- `cashflow-classification.ts`
- `dashboard-data.ts`
- `dashboard-formatting.ts`

### Bookkeeping, Receipts, AI Extraction

- `bookkeeping-ai.ts`
- `bookkeeping-extract.ts`
- `bookkeeping-ingestion.ts`
- `bookkeeping-receipts.ts`
- `bookkeeping-review.ts`
- `receipt-review.ts`
- `whatsapp-receipt-capture.ts`
- `whatsapp-receipt-provider.ts`
- `whatsapp-receipt-types.ts`

### Invoices, Payments, Billing

- `invoices.ts`
- `invoice-records.ts`
- `invoice-payments.ts`
- `invoice-portal.ts`
- `invoice-reminders.ts`
- `recurring-invoices.ts`
- `payment-provider-adapters.ts`
- `payment-integration-types.ts`
- `payment-lifecycle-logs.ts`
- `payment-tax-integration.ts`
- `paystack.ts`
- `paystack-billing.ts`
- `billing.ts`
- `billing-operations.ts`
- `billing-webhooks.ts`

### Tax, Filing, Compliance

- `nigeria-tax-config.ts`
- `tax-dashboard.ts`
- `tax-engine.ts`
- `tax-snapshot-service.ts`
- `tax-compliance.ts`
- `tax-filing.ts`
- `tax-filing-adapters.ts`
- `tax-record-ai.ts`
- `tax-reporting.ts`
- `transaction-tax.ts`
- `cit-workflow.ts`
- `filing-readiness.ts`
- `compliance-data-tools.ts`
- `compliance-export-service.ts`
- `jobs/compliance-export-queue.ts`

### AI And Assistant

- `assistant-context.ts`
- `assistant-prompt.ts`
- `assistant-provider.ts`
- `assistant-types.ts`
- `accounting-assistant.ts`
- `finance-assistant.ts`
- `ai/*`

### Alerts, Integrity, Monitoring, Offline

- `workspace-alert-types.ts`
- `workspace-alerts.ts`
- `expense-leak-types.ts`
- `expense-leaks.ts`
- `financial-health.ts`
- `financial-integrity.ts`
- `integrity-alerts.ts`
- `integrity-confidence.ts`
- `system-monitor.ts`
- `system-monitor-types.ts`
- `alerts/sync-anomalies.ts`
- `offline-sync-server.ts`
- `offline-sync-types.ts`
- `notification-channel.ts`
- `audit.ts`
- `observability.ts`
- `logger.ts`

### Configuration, Seeds, Utilities

- `env.ts`
- `config/*`
- `prisma.ts`
- `prisma-schema-compat.ts`
- `db.ts`
- `clients.ts`
- `business-profile.ts`
- `expense-categories.ts`
- `transaction-categories.ts`
- `accountant-workspace.ts`
- `accountant-workspace-types.ts`
- `accounting-firm.ts`
- `demo-account.ts`
- `dev-workspace-seed.ts`
- `dev-workspace-seed-fixtures.ts`
- `dev/initializeWorkspace.ts`
- `marketing-metadata.ts`

## Prisma Models

Identity and tenancy:

- `User`
- `Workspace`
- `WorkspaceMember`
- `Session`
- `PasswordResetToken`
- `Invite`
- `AuditLog`

Business setup:

- `BusinessProfile`
- `WorkspaceOnboarding`
- `ClientBusiness`
- `Client`
- `Vendor`
- `ExpenseCategory`
- `TransactionCategory`

Accounting and ledger:

- `Account`
- `Transaction`
- `ChartOfAccount`
- `JournalEntry`
- `JournalLine`
- `LedgerTransaction`

Bookkeeping and receipts:

- `BookkeepingUpload`
- `BookkeepingDraft`
- `WhatsAppReceiptConnection`
- `WhatsAppReceiptSenderMapping`
- `WhatsAppReceiptMessage`

Banking and reconciliation:

- `BankAccount`
- `BankStatementImport`
- `BankTransaction`
- `BankTransactionCategorizationFeedback`
- `BankTransactionBookkeepingFeedback`
- `ReconciliationMatch`
- `BankTransactionSplitLine`

Invoicing and payments:

- `Invoice`
- `InvoiceItem`
- `RecurringInvoice`
- `Payment`
- `PaymentProviderConnection`
- `PaymentProviderEvent`
- `PaymentSettlement`
- `PaymentTransactionCandidate`

Billing:

- `WorkspaceSubscription`
- `BillingWebhookEvent`

Tax and filing:

- `TaxSnapshot`
- `RecalcQueue`
- `TaxRecord`
- `TaxPeriod`
- `TaxComputation`
- `VATRecord`
- `WHTRecord`
- `TaxAdjustment`
- `FilingDraft`
- `CITPeriod`
- `CITBlocker`
- `FilingItem`
- `FilingEvidence`
- `SubmissionLog`

Alerts and integrity:

- `WorkspaceAlert`
- `ExpenseLeakFinding`
- `IntegrityIssue`

## Current Verification Status

The most recent smoke verification used `npm run seed:beta`, logged in as the
seeded demo account, and checked the main dashboard routes, core report APIs,
tax APIs, filing readiness, expense leaks, and tax recomputation. See
`current-state-roadmap.md` for exact results.
