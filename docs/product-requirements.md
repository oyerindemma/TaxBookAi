# Product Requirements

Last updated: 2026-04-28

TaxBook AI is now an advanced pre-beta accounting and tax SaaS, not an early MVP
concept. This document describes the current product requirements from the
implemented webapp baseline and the remaining requirements needed before beta
and public launch.

## Product Purpose

Help Nigerian SMEs, informal businesses, finance teams, and accounting firms
record business activity, keep trustworthy books, understand tax exposure, and
produce audit-ready compliance outputs with clear explanations.

## Current Implemented Scope

### 1. Identity, Workspace, Team

- Signup, login, logout, session validation, profile, password reset, and password change.
- Workspace creation, selection, switching, update, archive, invites, members, and roles.
- Business profile, onboarding state, clients, client businesses, categories, and vendors.

### 2. Banking And Transaction Intake

- Bank account management.
- CSV import and manual transaction paths.
- Transaction review queues, filters, bulk actions, duplicate detection, categorisation, posting, and reconciliation.
- Split lines, invoice matching, tax treatment fields, and auto-bookkeeping support.

### 3. Bookkeeping And Receipts

- Bookkeeping uploads and drafts.
- Receipt review and extraction flows.
- WhatsApp receipt capture support.
- AI extraction and review-first bookkeeping workflows.

### 4. Invoicing, Payments, Billing

- Invoice creation, editing, detail pages, payment links, reminders, portal links, and mark-paid flows.
- Recurring invoices and runner endpoint.
- Invoice portal and Paystack checkout/verification.
- Paystack subscription checkout, callback, cancellation, verification, sync, and webhook handling.

### 5. Accounting And Reports

- Ledger and journal infrastructure.
- Profit and loss, balance sheet, cashflow, trial balance, report exports, and dashboard summaries.
- Financial health, integrity, and monitoring views.

### 6. Tax Engine And Filing

- Tax snapshots and recalculation.
- Rough tax estimates from transactions, including uncategorised transaction warnings.
- Tax records, import, evidence, VAT/WHT transaction tax centre, CIT workflow, filing workflow, filing evidence, and exports.
- Filing readiness, expense leaks, workspace alerts, and system integrity checks.

### 7. AI And Assistant

- Assistant chat.
- Accounting assistant.
- Receipt scan.
- Bookkeeping extraction.
- Transaction categorisation.
- Tax-record draft generation.
- Insights and anomaly routes.
- Fallback behaviour when AI providers are unavailable.

### 8. Compliance And Operations

- Compliance data export routes and BullMQ worker support.
- Audit logging and trace-aware route logging.
- Health check endpoint with strict production validation.
- Offline-friendly service worker and limited queued actions.

## Required Before Controlled Beta

- Clean release baseline from the current dirty working tree.
- Manual verification of the SME golden path in fresh and seeded workspaces.
- Fixture tests for tax snapshot, reports, transaction import, tenant isolation, and payment sync.
- Nigerian tax/accounting expert review of VAT, WHT, CIT, and filing readiness logic.
- Paystack test-mode end-to-end verification.
- Redis/BullMQ worker verification for compliance exports.
- SMTP verification for password reset delivery.
- AI evaluation fixtures and clear confidence/review language.
- Production env validation with `/api/health?strict=1`.
- Updated release notes listing known risks and limitations.

## Required Before Public Launch

- Security review of auth, role checks, and workspace scoping.
- External tax/accounting review sign-off or documented caveats.
- Backup and restore drill.
- Monitoring for route errors, worker failures, webhook failures, AI failures, and export failures.
- Privacy, retention, deletion, portability, and incident response documentation.
- Resolution or explicit acceptance of lint warnings.
- Beta feedback triage and top-blocker fixes.

## Deferred / Post-Beta Scope

- Full Android-first or native mobile experience.
- Full offline bookkeeping parity.
- Direct government filing integrations where available and reliable.
- Advanced education module and guided tax literacy journeys.
- Enterprise assurance programme such as SOC 2/ISO readiness.
- Cross-border tax support.
- Deep multi-subsidiary enterprise workflows.
