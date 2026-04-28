# TaxBook AI Current State And Completion Roadmap

Last updated: 2026-04-28

## Product Purpose

TaxBook AI is a Nigeria-first accounting and tax compliance SaaS for SMEs,
informal businesses, accounting firms, and finance teams. Its purpose is to help
users record activity, keep trustworthy books, understand tax exposure, and
produce audit-ready compliance outputs without needing deep accounting expertise.

## Current Baseline

The webapp has moved beyond an early MVP scaffold. It now contains substantial
private-app coverage across:

- Authentication, sessions, password reset, profiles, workspace switching, team management, and invites.
- Business onboarding, business profiles, clients, and client businesses.
- Banking accounts, CSV import, transaction review, duplicate detection, categorisation, posting, reconciliation, and tax treatment.
- Bookkeeping capture, receipt/draft review, AI extraction, auto-bookkeeping, and review queues.
- Invoicing, recurring invoices, invoice reminders, payment links, invoice portal flows, and Paystack paths.
- Tax records, tax snapshots, tax centre views, transaction VAT/WHT summaries, CIT workflow, filing workflow, evidence, and exports.
- Financial reports including profit and loss, balance sheet, cashflow, trial balance, and export APIs.
- AI assistant, categorisation, receipt scan, tax-record drafting, anomalies, insights, and accounting assistant routes.
- Filing readiness, expense leaks, workspace alerts, integrity monitoring, system monitoring, audit-oriented routes, and compliance export jobs.
- Deployment documentation for Vercel, Neon Postgres, Redis workers, Paystack, SMTP, and OpenAI.

For the full page, API, service, and Prisma model inventory, see
`module-inventory.md`.

## Baseline Checks

These checks passed on 2026-04-28:

- `npm run env:check`
- `npm run prisma:migrate:status:local`
- `npm run prisma:generate:local`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`
- `npm run health:check`

Additional smoke verification completed on 2026-04-28:

- Seeded beta demo workspace with `npm run seed:beta`.
- Demo account: `demo@taxbook.ai`; workspace: `Demo Workspace` (#44).
- Authenticated production-server smoke checks returned `200` for:
  - `/dashboard`
  - `/dashboard/import`
  - `/dashboard/review`
  - `/dashboard/categorize`
  - `/dashboard/reports`
  - `/dashboard/tax-center`
  - `/dashboard/tax-filing`
  - `/dashboard/integrity`
  - `/dashboard/billing`
- Authenticated API smoke checks returned `200` for:
  - `/api/workspaces`
  - `/api/banking/transactions/review`
  - `/api/tax/summary`
  - `/api/tax-engine`
  - `/api/reports/pl`
  - `/api/reports/balance-sheet`
  - `/api/reports/cashflow`
  - `/api/reports/trial-balance`
  - `/api/filing-readiness`
  - `/api/expense-leaks`
- `POST /api/tax/compute` returned `200` and produced/reused a completed rough tax snapshot with 5 transactions, 0 categorised transactions, income of NGN 3,700, expenses of NGN 900, and estimated tax of NGN 840.

Fresh SME golden-path verification completed on 2026-04-28:

- Test account: `sme-golden-1777360440530@taxbook.test`.
- Workspace: `Golden Path SME 1777360440530` (#50).
- Client business: `Golden Path Trading Ltd` (#29).
- Bank account: `Golden Path Operating Account` (#46).
- Verified `201`/`200` responses for signup, login, workspace creation, business onboarding, client-business creation, default category inventory, bank-account creation, manual transaction capture, transaction review queue, transaction categorisation/review, tax snapshot generation, core dashboard pages, report APIs, and audit-ready compliance export.
- Added two transactions (#188 and #189), categorised them, marked both as `REVIEWED`, then generated a tax snapshot with `POST /api/tax/compute`.
- Verified pages returned `200` HTML for `/dashboard`, `/dashboard/import`, `/dashboard/banking`, `/dashboard/banking/review`, `/dashboard/categorize`, `/dashboard/reports`, `/dashboard/tax-center`, and `/dashboard/tax-filing`.
- Verified report APIs returned `200` for profit and loss, balance sheet, cashflow, and trial balance.
- Verified `GET /api/compliance/export?scope=workspace` returned `200` with an attachment named `taxbook-workspace-export-2026-04-28.json`.

Current non-blocking warnings:

- `REDIS_URL` is missing, so async compliance exports are not production-ready in this environment.
- `PAYSTACK_WEBHOOK_SECRET` is missing, so webhook verification falls back to Paystack secret behaviour.
- SMTP settings are incomplete, so password reset email delivery is not production-ready.
- Lint has warnings for unused helpers and hook dependency reviews, but no errors.
- Health check reports a PostgreSQL SSL-mode compatibility warning; production URLs should explicitly use the desired SSL mode.

Production-mode strict health currently fails in the local production server
because required production environment variables are intentionally missing in
this local `.env`: production `APP_URL`, `REDIS_URL`/`BULLMQ_REDIS_URL`,
`PAYSTACK_WEBHOOK_SECRET`, and SMTP settings.

## Working Tree Note

The repository currently has a large dirty working tree with many modified and
untracked feature files, APIs, migrations, and docs. Do not treat the current
tree as a clean release candidate until changes are grouped, reviewed, and
committed or otherwise reconciled.

## Immediate Completion Sequence

### 1. Stabilise The Release Baseline

- Group current changes into logical workstreams: dashboard, banking, reports, tax engine, billing, AI, migrations, docs.
- Review untracked routes and libraries to confirm they are intentional product code.
- Keep the app passing typecheck, lint, build, migration status, and health checks after each workstream.
- Remove or document remaining lint warnings.
- Produce a release branch or commit set that can be deployed repeatably.

### 2. Verify The SME Golden Path

The first production-quality journey must work without dead ends:

1. Sign up or log in.
2. Create or select a workspace.
3. Complete minimal business onboarding.
4. Add/import transactions.
5. Review and categorise transactions.
6. Generate a first tax estimate, even when categorisation is incomplete.
7. Review dashboard figures and tax assumptions.
8. View reports.
9. Export tax/reporting evidence.

Acceptance:

- Every step has clear empty states.
- Missing setup shows warnings, not hard blockers, unless data is truly absent.
- Tenant scope is enforced on every API in the path.
- Outputs clearly distinguish rough estimates from filing-ready results.

Status: verified manually in a fresh SME workspace on 2026-04-28. Starter plan
feature access now permits transaction capture and review so a new SME can reach
the first tax snapshot without upgrading plans.

### 3. Harden Tax And Accounting Correctness

- Add regression tests for tax snapshot creation, uncategorised transactions, stale snapshots, and failed queue recovery.
- Validate VAT, WHT, CIT, and filing readiness with Nigerian tax/accounting expertise.
- Version tax rules by effective date and rule source.
- Make all tax outputs explain source transactions, assumptions, uncategorised counts, and confidence.
- Confirm ledger postings reconcile with reports and tax records.

### 4. Productionise Banking And Bookkeeping

- Test CSV import against valid, invalid, duplicate, and messy real bank statements.
- Verify duplicate detection and review states.
- Verify posting creates expected ledger entries.
- Verify reconciliation suggestions and invoice matching.
- Verify workspace isolation across banking, review, reconciliation, and posting APIs.

### 5. Productionise Reports And Exports

- Validate profit and loss, balance sheet, cashflow, and trial balance against seeded fixtures.
- Confirm tax summaries and filing exports are accountant-readable.
- Configure Redis and run the compliance export worker outside the web request lifecycle.
- Confirm export download and retry paths.

### 6. Productionise AI

- Build an evaluation set for receipt scan, transaction categorisation, bookkeeping extraction, tax-record draft, and assistant responses.
- Track extraction accuracy, categorisation accuracy, hallucination risk, and fallback quality.
- Ensure AI outputs include confidence and user-review language.
- Ensure missing or rate-limited OpenAI access degrades safely.
- Add cost and latency monitoring for AI routes.

### 7. Billing And Payment Readiness

- Configure Paystack production/test plans.
- Verify checkout, callback, subscription updates, cancellation, and webhook idempotency.
- Lock stub payment behaviour out of production.
- Verify invoice payment links, invoice portal checkout, payment verification, and ledger/tax sync.

### 8. Security, Privacy, And Compliance Readiness

- Review all role checks and workspace scoping.
- Add tenant isolation tests for high-risk APIs.
- Validate audit logging for financial changes.
- Document NDPA-aligned privacy, retention, deletion, export, and incident response processes.
- Confirm demo/dev seed routes are disabled in production.
- Run dependency review and vulnerability scan.
- Plan external security review before public launch.

### 9. Production Environment Readiness

- Set required production env vars: Postgres, direct migration URL, Redis, SMTP, Paystack, OpenAI, app URL, cookie domain if needed.
- Run production migrations through the documented Prisma flow.
- Run `/api/health?strict=1` after deploy.
- Verify backups and restore drills.
- Verify log collection, trace IDs, route error monitoring, webhook monitoring, and worker monitoring.

### 10. Beta Launch

- Recruit a small set of Nigerian SMEs/accounting firms.
- Use controlled demo and real-world data through `docs/beta-onboarding-guide.md`.
- Track time to first estimate, categorisation accuracy, report usefulness, support requests, and tax confidence in `docs/beta-feedback-tracker.md`.
- Triage support and route failures with `docs/beta-support-error-logging.md`.
- Fix top workflow blockers from `docs/beta-blocker-register.md` before public launch.

### 11. Full Purpose Completion

- Expand offline mode beyond lightweight cached workflows.
- Improve mobile/PWA or Android-first experience.
- Add education content and compliance guidance journeys.
- Add direct government/payment integrations where available and reliable.
- Add advanced accountant collaboration and enterprise assurance evidence.

## Current Definition Of Done For Pre-Beta

TaxBook AI is pre-beta ready when:

- Full build pipeline is green.
- SME golden path is manually verified.
- Core tax calculations are fixture-tested and expert-reviewed.
- Reports and exports are validated against known data.
- Payments and webhooks work in test mode.
- AI degrades safely and avoids overconfident tax advice.
- Production env requirements are documented and configured.
- Workspace isolation and role access are tested for critical APIs.
- Known risks are documented in release notes.
