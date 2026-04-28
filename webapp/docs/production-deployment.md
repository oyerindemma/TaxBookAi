# TaxBook AI Production Deployment Runbook

Last updated: 2026-04-28

This runbook is the source of truth for deploying TaxBook AI on Vercel with Neon Postgres and Paystack billing.

## Current App Baseline

The current app is an advanced pre-beta Next.js App Router SaaS. It includes
workspace management, banking, transaction review, reconciliation, bookkeeping,
invoicing, Paystack billing, tax snapshots, transaction VAT/WHT, CIT, filing
workflows, financial reports, AI assistance, integrity monitoring, alerts, and
compliance exports.

Before deployment, review:

- `docs/current-state-roadmap.md`
- `docs/module-inventory.md`
- `../../docs/beta-launch-checklist.md`

## Deployment Model

- Development: local Next.js + local SQLite
- Preview: Vercel preview deployment + Neon preview branch
- Production: Vercel production deployment + Neon production branch
- Optional staging/test: long-lived Neon staging branch plus a dedicated Vercel project or protected preview env

## Environment Matrix

| Variable | Development | Preview | Production | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_PROVIDER` | Required | Required | Required | `sqlite` locally, `postgresql` on Vercel |
| `DATABASE_URL` | Required | Required | Required | Use Neon pooled URL for preview/production runtime |
| `DIRECT_URL` | Optional for SQLite | Recommended | Required | Use Neon direct URL for Prisma migrations |
| `REDIS_URL` | Optional | Recommended | Required | Redis connection for BullMQ async exports; `BULLMQ_REDIS_URL` and `UPSTASH_REDIS_URL` are also supported |
| `APP_URL` | Recommended | Recommended | Required | Must match deployed domain in production |
| `SESSION_COOKIE_DOMAIN` | Optional | Optional | Optional | Set only if cookies must span subdomains |
| `HEALTH_CHECK_SECRET` | Optional | Recommended | Recommended | Lets monitors call `/api/health?strict=1` with `Authorization: Bearer ...` without an admin browser session |
| `OPENAI_API_KEY` | Optional | Optional | Optional | Missing key disables AI safely |
| `OPENAI_MODEL` | Optional | Optional | Optional | Defaults to `gpt-4o-mini` |
| `OPENAI_VISION_MODEL` | Optional | Optional | Optional | Defaults to `OPENAI_MODEL` |
| `OPENAI_ASSISTANT_MODEL` | Optional | Optional | Optional | Defaults to `OPENAI_MODEL` |
| `PAYSTACK_SECRET_KEY` | Optional | Recommended | Required | Required for self-serve billing |
| `PAYSTACK_PUBLIC_KEY` | Optional | Optional | Optional | Not required for the current redirect checkout flow |
| `PAYSTACK_WEBHOOK_SECRET` | Optional | Recommended | Required | Required for strict production webhook verification |
| `PAYSTACK_PLAN_GROWTH` | Optional | Recommended | Required | Monthly Growth plan code |
| `PAYSTACK_PLAN_GROWTH_ANNUAL` | Optional | Recommended | Required | Annual Growth plan code |
| `PAYSTACK_PLAN_PROFESSIONAL` | Optional | Recommended | Required | Monthly Professional plan code |
| `PAYSTACK_PLAN_PROFESSIONAL_ANNUAL` | Optional | Recommended | Required | Annual Professional plan code |
| `PAYSTACK_PLAN_ENTERPRISE` | Optional | Optional | Optional | Enterprise is sales-led today |
| `PAYSTACK_PLAN_ENTERPRISE_ANNUAL` | Optional | Optional | Optional | Enterprise is sales-led today |
| `PORTAL_LINK_SECRET` | Optional | Recommended | Recommended | Stable signing secret for client invoice portal links |
| `SMTP_HOST` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_PORT` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_SECURE` | Optional | Optional | Optional | Set when the SMTP provider requires explicit TLS mode |
| `SMTP_USER` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_PASS` | Optional | Recommended | Required | Password reset delivery |
| `EMAIL_FROM` | Optional | Recommended | Required | Password reset delivery |
| `EMAIL_REPLY_TO` | Optional | Optional | Optional | Reply-to address for transactional emails |
| `ALLOW_STUB_PAYMENTS` | Local only | Optional | Never | Forced off in production runtime |
| `PAYMENT_WEBHOOK_SECRET` | Optional | Optional | Optional | Only for the non-Paystack payment webhook path |
| `INVOICE_REMINDER_CRON_SECRET` | Optional | Recommended | Recommended | Protects invoice reminder cron route |
| `RECURRING_INVOICE_CRON_SECRET` | Optional | Recommended | Recommended | Protects recurring invoice cron route |
| `SLACK_WEBHOOK_URL` | Optional | Optional | Optional | Integrity/payment alert notifications |
| `ALERT_EMAIL_FROM` | Optional | Optional | Optional | Alert email sender; falls back to `EMAIL_FROM` where supported |
| `ALERT_EMAIL_TO` | Optional | Optional | Optional | Alert recipient list |

## Vercel Setup

0. Set the Vercel project Root Directory to `webapp`. This repository is not a root-level Next.js app, so deploying the repository root can produce a successful "Ready" deployment that still returns `404` at `/`. Confirm this in Vercel Project Settings -> General -> Root Directory before the first production deploy.
1. Set env vars separately for `Development`, `Preview`, and `Production`.
2. After changing a Vercel env var, trigger a new deployment. Running instances do not retroactively pick up new env values.
3. Use `APP_URL` that matches the exact public domain for production, for example `https://taxbook.ai`.
4. Keep preview `APP_URL` aligned with the preview deployment hostname if preview callbacks or emails depend on absolute URLs.
5. Use the `vercel-build` command so env validation runs before `next build`.

### Required production env outcome

`GET /api/health?strict=1` must return `200` after deployment. In production,
strict health fails when any of the following are missing or invalid:

- public HTTPS `APP_URL`
- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`, `BULLMQ_REDIS_URL`, or `UPSTASH_REDIS_URL`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- Growth and Professional Paystack plan codes
- SMTP settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

Production `APP_URL` must not point to localhost.

## Neon Setup

### Connection strings

- `DATABASE_URL`: pooled connection string for the running Next.js app
- `DIRECT_URL`: direct connection string for Prisma migrations

### Branch strategy

- Production: protected primary branch only
- Preview: one Neon branch per preview environment or PR
- Staging/test: one long-lived staging branch if the team wants a stable pre-production DB
- Local verification: prefer SQLite for daily work; use a separate Neon dev branch only when Postgres-specific verification matters

### Safety guidance

- Do not point preview deployments at the production Neon branch
- Do not run destructive reset commands against Neon production
- Keep `DIRECT_URL` out of client bundles and out of shared screenshots/docs

## Prisma Flows

### Local SQLite

```bash
npm run prisma:generate:local
npm run prisma:migrate:dev
npm run prisma:migrate:status:local
```

### Optional local Neon/Postgres verification

Set:

- `DATABASE_PROVIDER=postgresql`
- `DATABASE_URL=<pooled neon url>`
- `DIRECT_URL=<direct neon url>`

Then run:

```bash
npm run prisma:generate:production
npm run prisma:migrate:status:production
npm run prisma:migrate:deploy:production
```

### Production Postgres

Run migrations before or during deploy using the production env:

```bash
npm run env:check:strict
npm run prisma:generate:production
npm run prisma:migrate:deploy:production
npm run health:check
```

Never use `prisma migrate reset` or `prisma db push` against production.

## Billing And Webhooks

### Paystack webhook URL

Set the production webhook to:

```text
${APP_URL}/api/billing/webhook
```

### Webhook behavior

- Signature verification is enforced with `PAYSTACK_WEBHOOK_SECRET`
- Deliveries are stored in `BillingWebhookEvent`
- Duplicate deliveries are ignored safely after the first successful processing
- Failed deliveries remain retryable

### Recommended events

- `charge.success`
- `charge.failed`
- `invoice.payment_failed`
- `subscription.create`
- `subscription.enable`
- `subscription.not_renew`
- `subscription.disable`

### Webhook testing

- Use Paystack test mode in preview
- Confirm `/api/billing/webhook` stays unchanged between deploys
- Verify at least one successful `charge.success` end to end before launch

## Async Workers

Compliance data exports use BullMQ so large exports do not run inside the request lifecycle.

Required runtime pieces:

- Redis reachable through `REDIS_URL` or `BULLMQ_REDIS_URL`
- One always-on worker process running:

```bash
npm run worker:compliance-export
```

The web app enqueues exports through `POST /api/compliance/export?scope=account|workspace`, polls `/api/compliance/export/jobs/:id`, and downloads from `/api/compliance/export/jobs/:id?download=1` when the job completes. The legacy synchronous `GET /api/compliance/export` path remains available as a fallback.

Worker deployment options:

- A separate always-on process in the same hosting provider.
- A small VM/container worker with the same production env vars.
- A platform-specific background worker pointed at the same Redis and database.

The worker must be restarted after schema changes and after env var rotations.

## Observability

Routes now emit trace-aware server logs for:

- signup
- login
- billing webhook handling
- AI bookkeeping extraction
- bank CSV import
- tax engine overview

Each request emits an `x-trace-id` response header to help correlate errors.

## Production Smoke Test Checklist

Run these checks after each production deploy:

1. `GET /api/health?strict=1` returns `200` using either an admin browser session or `Authorization: Bearer $HEALTH_CHECK_SECRET`
2. Home page, features, pricing, contact, login, and signup load
3. `POST /api/signup` works in a controlled test tenant
4. `POST /api/login` works and sets session/workspace cookies
5. `/dashboard` loads for a real workspace
6. `/dashboard/import`, `/dashboard/review`, and `/dashboard/categorize` load
7. `/dashboard/reports` loads and report APIs return `200`
8. `POST /api/tax/compute` returns `200` for a workspace with transactions
9. `/dashboard/tax-center`, `/dashboard/tax-summary`, and `/dashboard/tax-records` load
10. `/dashboard/tax-filing` and at least one filing detail page load
11. `/dashboard/billing` loads and shows the current plan
12. A Paystack upgrade initializes successfully
13. A Paystack webhook delivery reaches `/api/billing/webhook`
14. `/dashboard/bookkeeping/review` loads without AI key crashes
15. `/dashboard/banking/reconcile` loads for an eligible workspace
16. `/dashboard/integrity`, `/dashboard/expense-leaks`, and `/dashboard/filing-readiness` load
17. Compliance export job can be enqueued, polled, and downloaded through the worker path

## Rotation And Hygiene

- Never commit real secrets into `.env.example`
- Rotate any Paystack keys that were previously shared in docs or sample env files
- Keep `.env` local and out of version control
- Review Vercel env scopes before every launch

## Backup And Restore

Use Neon's managed point-in-time restore as the primary production recovery path. Keep it enabled on the production branch and document the retention window in the launch notes.

Before every production migration:

1. Create a named Neon branch or snapshot from the production branch.
2. Record the current migration status:

```bash
npm run env:check:strict
npm run prisma:migrate:status:production
```

3. Run a logical backup from a secure operator machine when a high-risk migration touches money, tax, or tenant tables:

```bash
pg_dump "$DIRECT_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "taxbook-production-$(date +%Y%m%d%H%M%S).dump"
```

Restore drill for staging:

```bash
createdb taxbook_restore_drill
pg_restore \
  --dbname "$RESTORE_DRILL_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  taxbook-production-YYYYMMDDHHMMSS.dump
npm run prisma:migrate:status:production
```

Do not restore directly into production during an incident. Restore to a new Neon branch, validate `/api/health?strict=1`, run smoke tests, then promote/switch traffic according to the incident plan.

## Failure Handling Rules

- Missing OpenAI key: UI still loads; AI features degrade gracefully
- Missing workspace cookie: server falls back to the first active workspace membership
- Missing subscription row: billing code creates defaults when needed
- Failed uploads or failed extraction: errors are surfaced without crashing the app
- Duplicate webhook deliveries: ignored after durable event logging
- Stale migration state: detect with `prisma migrate status` and `/api/health?strict=1`

## Beta Demo Data

Use `npm run seed:beta` only in local development or controlled preview
environments. The demo seed creates invoice, payment, ledger, tax, VAT/WHT, and
integrity scenarios for walkthroughs.

Use `npm run seed:beta -- --with-issues true` for issue-rich beta walkthroughs
and `npm run seed:beta -- --clean` for a cleaner first-user demo. The script
refuses to run in a production-like environment unless `ALLOW_BETA_DEMO_SEED=true`
is set for a controlled preview operation.

Do not run demo seed scripts against production. Production demo routes require
`DEMO_ACCESS_SECRET`; without it, demo access is disabled in production.
