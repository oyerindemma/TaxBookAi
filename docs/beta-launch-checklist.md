# TaxBook AI Beta Launch Checklist

Last updated: 2026-04-28

This checklist reflects the current TaxBook AI webapp, which uses Next.js,
Prisma 7, Neon/Postgres for production, Redis/BullMQ for async exports, Paystack
for billing/payment flows, SMTP for password reset delivery, and OpenAI-backed AI
features with safe fallback behaviour.

## 1. Codebase Baseline

- Run `npm run env:check`.
- Run `npm run prisma:generate:local`.
- Run `npm run prisma:migrate:status:local`.
- Run the release smoke-test suite listed in `webapp/docs/release-smoke-test-checklist.md`.
- Run `npx tsc --noEmit --pretty false`.
- Run `npm run lint`; warnings are acceptable only when documented.
- Run `npm run build`.
- Run `npm run health:check`.
- Confirm the working tree is grouped into reviewable release workstreams.
- Confirm new routes, services, and migrations are intentional.

## 2. Demo And Seed Data

- Run `npm run seed:beta` only in development or controlled non-production environments.
- Use `npm run seed:beta -- --with-issues true` for integrity/payment/tax issue walkthroughs.
- Use `npm run seed:beta -- --clean` for a calmer first-user walkthrough.
- Verify demo credentials from the seed output.
- Verify seeded workspace can load `/dashboard`.
- Walk `/dashboard/banking/review`, `/dashboard/tax`, `/dashboard/reports`, `/dashboard/invoices`, and `/dashboard/integrity`.
- Verify `POST /api/tax/compute` creates or reuses a completed rough snapshot.
- Do not run demo seeds against shared production databases.
- Confirm `ALLOW_BETA_DEMO_SEED` is not set in production.
- Confirm production demo routes require `DEMO_ACCESS_SECRET` or are disabled.

## 3. Public And Auth Flows

- Verify `/`, `/features`, `/pricing`, `/contact`, `/privacy`, `/terms`, `/cookies`, and `/dpa`.
- Verify signup creates a user, workspace, membership, default categories, and session.
- Verify login, logout, session validation, profile update, and password change.
- Verify forgot-password and reset-password email delivery with real SMTP in preview.
- Verify secure cookies behind HTTPS.

## 4. Workspace And Team Flows

- Verify workspace creation, selection, switching, rename/update, archive, and fallback selection.
- Verify team invite creation, acceptance, role changes, and member removal.
- Verify role boundaries for OWNER, ADMIN, MEMBER, and read-only behaviours where applicable.
- Verify client and client-business creation and update.
- Verify business profile and onboarding state.

## 5. Banking And Bookkeeping

- Verify bank account creation and update.
- Verify Starter-plan SME workspaces can add transactions and use review/categorisation without a plan-upgrade dead end.
- Verify CSV import preview and import.
- Verify invalid rows, duplicates, unknown columns, and partial uploads.
- Verify transaction review list, filters, detail drawer, bulk actions, and status changes.
- Verify AI categorisation suggestions and fallback heuristics.
- Verify manual categorisation and uncategorised states.
- Verify transaction posting and bulk posting.
- Verify split lines and reconciliation suggestions.
- Verify invoice matching and reconciliation match lifecycle.
- Verify no transaction data leaks across workspaces.

## 6. Tax And Filing

- Verify tax dashboard and tax summary routes.
- Verify tax record CRUD, import, categories, vendors, evidence, and review.
- Verify tax snapshot recalculation with categorised and uncategorised transactions.
- Verify stale/failed tax snapshot states and recovery.
- Verify transaction tax centre VAT/WHT summaries.
- Verify CIT period creation, blockers, adjustments, evidence, and export.
- Verify tax filing list, filing detail, evidence upload/link, approvals, export, and status transitions.
- Confirm estimates clearly show rough/uncategorised warnings.

## 7. Reports And Exports

- Verify `/dashboard/reports`.
- Verify P&L, balance sheet, cashflow, trial balance, and report export APIs.
- Verify exported CSV/PDF or generated files are readable and workspace-scoped.
- Verify compliance export enqueue, polling, download, retry, and fallback paths.
- Run `npm run worker:compliance-export` in a Redis-backed environment.

## 8. AI Features

- Verify AI receipt scan.
- Verify bookkeeping extraction.
- Verify transaction categorisation.
- Verify tax-record draft generation.
- Verify assistant chat and accounting assistant.
- Verify insights and anomaly APIs.
- Verify missing `OPENAI_API_KEY` does not crash pages.
- Confirm AI copy presents suggestions and confidence, not final tax/legal advice.

## 9. Invoicing, Payments, And Billing

- Verify invoice creation, editing, sending, reminders, mark-paid, portal links, and portal access.
- Verify recurring invoice creation and runner.
- Verify invoice payment links and Paystack checkout.
- Verify payment callback and verification.
- Verify Paystack billing checkout, callback, manage, cancellation, sync, and webhook.
- Verify duplicate webhook delivery is idempotent.
- Confirm `ALLOW_STUB_PAYMENTS` is not enabled in production.

## 10. Alerts, Integrity, And Monitoring

- Verify filing readiness page and API.
- Verify expense leaks page and actions.
- Verify workspace alerts and notifications.
- Verify integrity page, admin integrity control centre, scans, repair, resolve, and health.
- Verify system monitor loads and reports ledger/tax/payment issues.
- Verify route errors emit trace IDs.
- Verify Slack/email alert settings if configured.

## 11. Offline-Friendly Mode

- Verify service worker registration.
- Verify cached dashboard/review/notifications/expense-leaks views.
- Verify queued alert and expense-leak actions replay after reconnect.
- Verify workspace switching is blocked or safe while offline.
- Verify stale-action conflict handling.

## 12. Production Environment

- Set `DATABASE_PROVIDER=postgresql`.
- Set pooled Neon `DATABASE_URL`.
- Set direct Neon `DIRECT_URL`.
- Set public HTTPS `APP_URL`.
- Set `REDIS_URL` or `BULLMQ_REDIS_URL`.
- Set `OPENAI_API_KEY` and model overrides as needed.
- Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, and plan codes.
- Set SMTP variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.
- Set `SESSION_COOKIE_DOMAIN` only if cookies must span subdomains.
- Disable stub payments in production.
- Run `npm run env:check:strict`.
- Run production migrations.
- Run `/api/health?strict=1`.

## 13. Known Risks Before Beta

- Tax logic still needs Nigerian tax/accounting expert review.
- AI routes depend on third-party model availability and may degrade under rate limits.
- Strict production health fails until Redis, SMTP, Paystack webhook secret, and production `APP_URL` are configured.
- Offline mode is limited to selected cached views and lightweight queued actions.
- Large compliance exports require a running Redis-backed worker.
- Remaining lint warnings should be resolved or accepted explicitly before public launch.
- The working tree must be cleaned into reviewable commits before release.

## 14. Beta Launch Preparation

- Use `docs/beta-onboarding-guide.md` for pilot sessions.
- Use `docs/beta-support-error-logging.md` for support intake and trace-id triage.
- Use `docs/beta-feedback-tracker.md` to track feedback by workflow.
- Use `docs/beta-blocker-register.md` to prioritise top beta blockers.
- Recruit 5 to 8 pilot users across SMEs and accountants/bookkeepers.
- Capture time to first tax estimate, time to first useful report, import success, categorisation confidence, export usefulness, support requests, and tax confidence.
- Fix or document the top 5 workflow blockers before adding more pilots.

## 15. Verified Golden Path

Manual fresh-SME verification passed on 2026-04-28 using workspace #50:

- Signup/login.
- Workspace creation.
- Business onboarding.
- Client business and default category creation.
- Bank account creation.
- Manual transaction capture.
- Transaction review and categorisation.
- First tax snapshot generation.
- Dashboard, banking, review, categorise, reports, tax centre, and tax filing page loads.
- Profit and loss, balance sheet, cashflow, and trial balance API loads.
- Workspace compliance export download.
