# Architecture Overview

Last updated: 2026-04-28

## Current Approach

TaxBook AI is implemented as a modular Next.js App Router monolith in `webapp/`.
The architecture favours fast product iteration while keeping clear domain
boundaries in `src/lib/*`, route handlers in `app/api/*`, and dashboard/product
surfaces in `app/dashboard/*`.

The codebase is ready for controlled beta hardening, but not yet a clean public
launch baseline because the working tree contains many uncommitted product
changes and production environment dependencies still need to be configured.

## Runtime Components

- Next.js App Router web application.
- Server-rendered dashboard pages.
- Route handlers for product APIs.
- Prisma 7 data layer.
- SQLite-supported local development.
- Postgres/Neon preview and production deployment.
- BullMQ/Redis for asynchronous compliance export jobs.
- Paystack for billing, subscriptions, invoice checkout, callbacks, and webhooks.
- OpenAI-backed AI routes with fallback behaviour.
- Service worker for limited offline-friendly cached views and lightweight replay.

## Core Domains

- Identity, sessions, password reset, profile, and RBAC.
- Workspace, team, client, client-business, and business profile management.
- Banking, transaction import, review, categorisation, posting, and reconciliation.
- Ledger, journal entries, chart of accounts, accounting reports, and financial health.
- Bookkeeping uploads, drafts, receipts, WhatsApp receipt capture, and AI extraction.
- Invoicing, recurring invoices, reminders, invoice portal, payments, and billing.
- Tax snapshots, transaction VAT/WHT, tax records, CIT, filing, evidence, and exports.
- AI assistant, accounting assistant, categorisation, insights, and anomaly detection.
- Alerts, expense leaks, integrity monitoring, system monitoring, compliance exports, and audit logs.

## Data Model Essentials

The Prisma schema contains 58 models across:

- Identity and tenancy.
- Business setup.
- Accounting and ledger.
- Bookkeeping and receipts.
- Banking and reconciliation.
- Invoicing and payments.
- Billing.
- Tax and filing.
- Alerts and integrity.

See `webapp/docs/module-inventory.md` for the full model inventory.

## Deployment Architecture

- Development: local Next.js with local SQLite or an explicit Postgres/Neon branch.
- Preview: Vercel preview deployment with Neon preview branch.
- Production: Vercel production deployment with Neon production branch.
- Worker: a separate always-on process running `npm run worker:compliance-export`.
- Redis: required in production for BullMQ-backed async exports.
- SMTP: required in production for password reset delivery.
- Paystack: required in production for self-serve billing and invoice payment flows.

## Reliability And Operations

- `npm run env:check` validates development/preview configuration.
- `npm run env:check:strict` validates production requirements.
- `/api/health?strict=1` validates runtime readiness.
- Route handlers emit trace-aware logs and `x-trace-id` responses.
- Compliance export work is designed to run outside the request lifecycle.
- Prisma migrations must use direct Postgres URLs; runtime must use pooled URLs.
- Production backup and restore drills are required before public launch.

## Security And Compliance Considerations

- Workspace scoping and role checks are first-order concerns across APIs.
- Financial changes should be audit logged.
- Demo/dev seed routes must be disabled or secret-protected in production.
- Secrets must stay out of docs, screenshots, and client bundles.
- NDPA-aligned privacy, retention, deletion, portability, and incident response documentation is required before public launch.
- External security review should happen before broad public release.

## Future Architecture Direction

- Keep the modular monolith until product-market workflows stabilise.
- Extract workers or services only around clear operational pressure, such as exports, AI batch processing, or payment/webhook processing.
- Extend offline mode carefully with IndexedDB and conflict-aware mutations.
- Add mobile/PWA or native Android surfaces after the web SME golden path is stable.
