# TaxBook AI Webapp

TaxBook AI is a Nigeria-first accounting SaaS for businesses, finance teams, and accounting firms. The private app already includes workspace management, invoicing, AI bookkeeping capture, bank reconciliation, tax summaries, billing, and accountant review workflows.

## Local Development

1. Copy `.env.example` to `.env`
2. Keep local development on SQLite unless you are explicitly testing Postgres or Neon
3. Run:

```bash
npm install
npm run env:check
npm run prisma:generate:local
npm run dev
```

Useful commands:

```bash
npm run lint
npm run build
npm run health:check
npm run prisma:migrate:status:local
npm run prisma:migrate:deploy
```

## Production Deployment

Production deployment guidance lives in [docs/production-deployment.md](./docs/production-deployment.md).

This repository's Next.js App Router app lives in `webapp/`. In Vercel, set the project Root Directory to `webapp` so the deployed project includes `app/page.tsx` and the homepage resolves at `/`.

That runbook covers:

- Vercel environment variables by environment
- Neon pooled vs direct connection strings
- Prisma migration flow for SQLite and Postgres
- Paystack webhook setup and hardening
- Production smoke tests after deploy

## Notes

- Local billing stub mode is allowed only outside production.
- Production health checks are available at `/api/health?strict=1`.
- If Paystack keys were ever shared in sample env files, rotate them before go-live.
