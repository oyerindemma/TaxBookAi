# TaxBook AI Production Deployment Runbook

This runbook is the source of truth for deploying TaxBook AI on Vercel with Neon Postgres and Paystack billing.

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
| `APP_URL` | Recommended | Recommended | Required | Must match deployed domain in production |
| `SESSION_COOKIE_DOMAIN` | Optional | Optional | Optional | Set only if cookies must span subdomains |
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
| `SMTP_HOST` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_PORT` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_USER` | Optional | Recommended | Required | Password reset delivery |
| `SMTP_PASS` | Optional | Recommended | Required | Password reset delivery |
| `EMAIL_FROM` | Optional | Recommended | Required | Password reset delivery |
| `ALLOW_STUB_PAYMENTS` | Local only | Optional | Never | Forced off in production runtime |
| `PAYMENT_WEBHOOK_SECRET` | Optional | Optional | Optional | Only for the non-Paystack payment webhook path |

## Vercel Setup

0. Set the Vercel project Root Directory to `webapp`. This repository is not a root-level Next.js app, so deploying the repository root can produce a successful "Ready" deployment that still returns `404` at `/`.
1. Set env vars separately for `Development`, `Preview`, and `Production`.
2. After changing a Vercel env var, trigger a new deployment. Running instances do not retroactively pick up new env values.
3. Use `APP_URL` that matches the exact public domain for production, for example `https://taxbook.ai`.
4. Keep preview `APP_URL` aligned with the preview deployment hostname if preview callbacks or emails depend on absolute URLs.
5. Use the `vercel-build` command so env validation runs before `next build`.

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

1. `GET /api/health?strict=1` returns `200`
2. Home page, pricing, login, and signup load
3. `POST /api/signup` works in a controlled test tenant
4. `POST /api/login` works and sets session/workspace cookies
5. Dashboard loads for a real workspace
6. `/dashboard/billing` loads and shows the current plan
7. A Paystack upgrade can initialize successfully
8. A Paystack webhook delivery reaches `/api/billing/webhook`
9. `/dashboard/bookkeeping/review` loads without AI key crashes
10. `/dashboard/banking/reconcile` loads for a Professional workspace
11. `/dashboard/tax-summary` and `/dashboard/tax-records` load without runtime errors

## Rotation And Hygiene

- Never commit real secrets into `.env.example`
- Rotate any Paystack keys that were previously shared in docs or sample env files
- Keep `.env` local and out of version control
- Review Vercel env scopes before every launch

## Failure Handling Rules

- Missing OpenAI key: UI still loads; AI features degrade gracefully
- Missing workspace cookie: server falls back to the first active workspace membership
- Missing subscription row: billing code creates defaults when needed
- Failed uploads or failed extraction: errors are surfaced without crashing the app
- Duplicate webhook deliveries: ignored after durable event logging
- Stale migration state: detect with `prisma migrate status` and `/api/health?strict=1`
