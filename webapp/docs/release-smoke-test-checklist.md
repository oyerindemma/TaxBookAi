# TaxBook AI Release Smoke-Test Checklist

Last updated: 2026-04-28

Run this checklist for every preview promotion and production release.

## 1. Automated Gate

- `npm run env:check:strict`
- `npm run prisma:migrate:status:production`
- `npx tsx --test src/lib/release-testing-suite.test.ts src/lib/tax-snapshot-calculation.test.ts src/lib/accounting-report-export.test.ts src/lib/ai-production-safety.test.ts src/lib/payment-production-safety.test.ts src/lib/security-tenant-isolation.test.ts src/lib/offline-friendly-mode.test.ts src/lib/production-readiness.test.ts app/api/compliance/export/route-helpers.test.ts`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`

## 2. Public And Auth

- Public pages load: `/`, `/features`, `/pricing`, `/contact`, `/privacy`, `/terms`.
- Signup creates user, workspace, owner membership, Starter subscription, and session.
- Login, logout, session validation, profile update, password change, forgot password, and reset password work.

## 3. Workspace Isolation

- Workspace switching works online and is blocked safely offline.
- User cannot access another workspace's invoices, transactions, tax records, reports, exports, or team routes by changing URL IDs.
- Invite, member role update, and member removal respect OWNER/ADMIN/MEMBER boundaries.

## 4. SME Golden Path

- Business onboarding completes.
- Bank account creation works.
- Manual transaction creation works.
- CSV import handles valid rows, invalid rows, and duplicates.
- Review, categorisation, bulk categorisation, posting, and reconciliation flows work.
- Transactions remain scoped to the active workspace.

## 5. Tax

- Tax snapshot recalculates when transactions exist.
- Uncategorized transactions produce rough-estimate warnings but do not block snapshots.
- VAT, WHT, CIT, filing readiness, tax record review, and evidence flows load.
- Filing exports download and are labelled estimate/review-needed/filing-ready/filed as appropriate.

## 6. Invoices, Payments, Billing

- Invoice create/edit/send/mark-paid/reminder flows work.
- Payment links and portal links open.
- Paystack checkout, callback, verify, and webhook work in the target environment.
- Duplicate payment and billing webhooks are idempotent.
- Subscription checkout, management link, cancellation, and status display work.

## 7. Reports And Exports

- P&L, balance sheet, cashflow, and trial balance load.
- Financial statement CSV/JSON exports download with workspace metadata.
- Tax summary and filing exports download.
- Compliance export can enqueue, poll, and download when Redis worker is running.

## 8. AI Fallback

- Receipt scan, bookkeeping extraction, categorisation, assistant, and tax-record draft work with OpenAI configured.
- With `OPENAI_API_KEY` absent in a preview-like environment, pages do not crash and fallback/review-needed copy appears.
- AI text avoids final tax/legal claims.

## 9. Offline-Friendly Mode

- Service worker registers.
- Dashboard, review, notifications, and expense-leak pages provide limited cached read access.
- Queued alert and expense-leak actions replay after reconnect.
- Stale queued actions produce visible conflicts.
- Workspace changes clear private offline cache.

## 10. Production Runtime

- Vercel Root Directory is `webapp`.
- `/api/health?strict=1` returns `200` with admin session or `Authorization: Bearer $HEALTH_CHECK_SECRET`.
- Neon production branch has a named pre-release backup/branch.
- `npm run prisma:migrate:deploy:production` has run only after migration status and backup checks.
- Redis worker is running: `npm run worker:compliance-export`.
- SMTP, Paystack, OpenAI, Redis, and Neon env vars are configured in the correct Vercel scopes.
