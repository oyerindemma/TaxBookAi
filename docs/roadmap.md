# Roadmap

Last updated: 2026-04-28

TaxBook AI has moved beyond the original discovery/MVP scaffold. The current
webapp is an advanced pre-beta SaaS product with implemented modules for
workspaces, banking, bookkeeping, invoicing, tax, reports, filing workflows, AI,
billing, alerts, integrity monitoring, and production deployment.

The roadmap below starts from the current verified baseline rather than the old
week-by-week MVP plan.

## Current Verified Baseline

The following checks are green in `webapp/`:

- `npm run env:check`
- `npm run prisma:migrate:status:local`
- `npm run prisma:generate:local`
- `npx tsc --noEmit --pretty false`
- `npm run lint` with warnings only
- `npm run build`
- `npm run health:check`

Smoke testing with the seeded beta workspace confirmed that the main SME pages,
report APIs, tax APIs, filing readiness, expense leaks, and `POST /api/tax/compute`
respond successfully.

Reference:

- `webapp/docs/current-state-roadmap.md`
- `webapp/docs/module-inventory.md`
- `webapp/docs/production-deployment.md`

## Phase 1: Release Baseline Stabilisation

Goal: turn the current large working tree into a reliable release baseline.

- Group current changes into logical workstreams: dashboard, banking, tax engine, reports, billing, AI, migrations, and documentation.
- Review all untracked routes, services, and migrations to confirm they are intentional product code.
- Keep the app passing typecheck, lint, build, Prisma generation, migration status, and health checks after each workstream.
- Resolve or document remaining lint warnings.
- Update screenshots or walkthrough notes for the verified product flows.
- Produce a release branch or clean commit set suitable for beta deployment.

Exit criteria:

- Build pipeline remains green.
- No unexplained untracked production code.
- Known warnings and launch blockers are documented.

## Phase 2: SME Golden Path Completion

Goal: make the primary SME workflow usable without dead ends.

Status: manually verified in a fresh SME workspace on 2026-04-28. Signup,
workspace creation, onboarding, transaction capture, review, categorisation, tax
snapshot generation, dashboard/report views, and compliance export all completed
successfully. Starter-plan SMEs can now use transaction capture and review
without being forced into a plan-upgrade dead end.

Golden path:

1. Sign up or log in.
2. Create/select workspace.
3. Complete minimal business onboarding.
4. Add or import transactions.
5. Review and categorise transactions.
6. Generate first tax estimate, even when categorisation is incomplete.
7. Review tax assumptions and dashboard figures.
8. Open reports.
9. Export compliance/report evidence.

Work items:

- Verify every step in a fresh workspace and a seeded workspace.
- Remove hard blockers where warnings are enough.
- Make empty states explicit and action-oriented.
- Show rough-estimate language when records are uncategorised or incomplete.
- Verify mobile layout for each page in the path.
- Confirm workspace scoping on every API used by the path.

Exit criteria:

- A non-accountant SME user can reach a first tax estimate from transactions.
- Missing setup produces soft warnings rather than dead-end UX.
- Reports and exports are available from the same workspace context.

## Phase 3: Tax And Accounting Correctness

Goal: make the numbers explainable, testable, and defensible.

- Add regression tests for tax snapshot creation, uncategorised transactions, stale snapshots, queue recovery, and failed recalculation recovery.
- Validate VAT, WHT, CIT, filing readiness, and tax-record rules with Nigerian tax/accounting expertise.
- Version tax rules by effective date and rule source.
- Ensure tax outputs expose source transactions, assumptions, uncategorised counts, and confidence.
- Confirm ledger postings reconcile with reports, invoices, payments, and tax records.
- Add fixture tests for common Nigerian SME scenarios.

Exit criteria:

- Core tax/report outputs have fixture coverage.
- Tax estimates are clearly separated from filing-ready outputs.
- Expert review has documented sign-off or documented exceptions.

## Phase 4: Banking, Bookkeeping, And Reconciliation Hardening

Goal: make transaction intake and ledger creation dependable.

- Test bank CSV import with valid, invalid, duplicate, partial, and messy real-world statements.
- Verify duplicate detection and review statuses.
- Verify transaction categorisation, auto-bookkeeping, posting, split lines, and reconciliation.
- Verify invoice matching and payment-to-ledger-to-tax sync.
- Add or extend tenant isolation tests for banking APIs.

Exit criteria:

- Imported transactions can move through review, categorisation, posting, and reports without manual database repair.
- Cross-workspace leakage tests pass for banking and review endpoints.

## Phase 5: Reports, Filing, And Exports

Goal: make outputs accountant-readable and exportable.

- Validate profit and loss, balance sheet, cashflow, trial balance, tax summary, tax filing, CIT, VAT, and WHT outputs against seeded data.
- Configure Redis/BullMQ and run the compliance export worker outside the request lifecycle.
- Verify export queue, polling, download, retry, and fallback paths.
- Improve export labels, provenance, and assumptions where needed.

Exit criteria:

- Reports match known fixtures.
- Compliance exports complete through the worker path.
- Filing package outputs are understandable to accountants.

## Phase 6: AI Productionisation

Goal: keep AI useful, grounded, and safe.

- Build evaluation fixtures for receipt scan, bank narration categorisation, bookkeeping extraction, tax-record draft, anomalies, and assistant responses.
- Track extraction accuracy, categorisation accuracy, hallucination risk, fallback behaviour, latency, and cost.
- Ensure AI suggestions include confidence and review language.
- Ensure missing or rate-limited OpenAI access degrades safely.
- Avoid overconfident tax/legal advice in assistant copy.

Exit criteria:

- AI paths fail gracefully.
- High-risk AI outputs are marked as suggestions, not final tax advice.
- Evaluation results are recorded before beta.

## Phase 7: Billing And Payment Readiness

Goal: make subscription and invoice-payment paths reliable.

- Configure Paystack test and production plans.
- Verify checkout, callback, verification, subscription update, cancellation, and webhook idempotency.
- Lock stub payment behaviour out of production.
- Verify invoice payment links, invoice portal checkout, payment verification, and ledger/tax sync.
- Confirm webhook events are stored and retryable.

Exit criteria:

- Paystack test mode passes end to end.
- Production env validation rejects missing payment secrets.
- Payment state changes are reflected in invoices, ledger, and tax workflows.

## Phase 8: Security, Privacy, And Compliance Readiness

Goal: earn trust before public launch.

- Review auth, role checks, and workspace scoping.
- Add tenant isolation tests for high-risk APIs.
- Validate audit logs for financial changes.
- Document NDPA-aligned privacy, retention, deletion, export, and incident response processes.
- Confirm demo/dev seed routes are disabled or secret-protected in production.
- Run dependency review and vulnerability scan.
- Plan external security review before public launch.

Exit criteria:

- Critical workspace-scope tests pass.
- Production seed/demo paths cannot be abused.
- Privacy and incident-response documents are ready for beta users.

## Phase 9: Production Environment Readiness

Goal: deploy repeatably and observe failures.

- Configure production `APP_URL`, Postgres pooled `DATABASE_URL`, direct `DIRECT_URL`, Redis/BullMQ, SMTP, Paystack, OpenAI, and cookie settings.
- Run production migrations with the documented Prisma flow.
- Run `/api/health?strict=1` after deployment.
- Verify backups and restore drills.
- Verify route error logging, trace IDs, webhook monitoring, worker monitoring, and alerting.

Exit criteria:

- Strict health returns `200`.
- Production smoke tests pass.
- Backup and restore process has been tested.

## Phase 10: Controlled Beta

Goal: validate real-world usability and correctness before public launch.

- Recruit a small group of Nigerian SMEs and accounting firms.
- Use controlled demo data and real-world transaction samples.
- Track time to first tax estimate, categorisation accuracy, report usefulness, confusion points, support requests, and tax confidence.
- Fix top workflow blockers before wider launch.

Exit criteria:

- Beta users can complete the golden path with limited support.
- Top issues are triaged and resolved or documented.
- Launch/no-launch decision is evidence-based.

## Phase 11: Full Product Purpose

Goal: expand from pre-beta SaaS to the full TaxBook AI vision.

- Extend offline mode beyond lightweight cached workflows.
- Improve mobile/PWA or Android-first usage.
- Add tax education and compliance guidance journeys.
- Add direct government/payment integrations where available and reliable.
- Add advanced accountant collaboration and enterprise assurance evidence.
- Build continuous tax-rule update operations.
