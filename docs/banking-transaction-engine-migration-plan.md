# Banking Transaction Engine Migration Plan

## Schema changes

The transaction engine extends `BankTransaction` with:

- `source` to distinguish CSV imports from manual entries
- `categoryId` so transactions can be filtered and prepared for later reconciliation
- `fingerprintHash` so imports can skip duplicates consistently

It also adds the reverse `bankTransactions` relation on `TransactionCategory`.

## Rollout order

1. Deploy the schema changes first.
2. Run Prisma client generation so the app and API compile against the new fields.
3. Run the database migration in each environment before deploying the UI and API routes.
4. Deploy the application code after the migration succeeds.

## Backfill approach

- Existing rows can safely keep `fingerprintHash = NULL`.
- New imports write `fingerprintHash` for dedupe.
- Existing rows are still protected during import because the importer computes fallback fingerprints from historical rows when the stored hash is missing.

## Production checklist

- Run the migration against staging first.
- Smoke-test:
  - CSV preview
  - CSV import with invalid rows
  - CSV import with duplicate rows
  - manual transaction creation
  - transaction list filters
  - transaction detail drawer
- After deploy, verify the active workspace scoping by switching workspaces and checking that transactions do not leak across tenants.
