# Financial Integrity Demo

## Seed the demo workspace

```bash
npm run seed:integrity
```

Demo credentials:

- Email: `integrity-demo@taxbook.app`
- Password: `Integrity123!`

## Pages to open

1. `/dashboard`
2. `/dashboard/integrity`

## Suggested live flow

1. Start on `/dashboard` and point out the Financial Health card.
2. Open `/dashboard/integrity`.
3. Show the seeded scenarios:
   - `PAYMENT_VERIFICATION_FAILED` -> medium confidence, review-first
   - `LEDGER_MISSING` -> high confidence, auto-fix
   - `TAX_NOT_SYNCED` -> high confidence, auto-fix
   - `AMOUNT_MISMATCH` -> low confidence, manual-only
4. Click `Run integrity scan` to show issue detection and scoring.
5. Click `Auto-fix safe issues` to repair only high-confidence cases.
6. Show the health score improving while `AMOUNT_MISMATCH` remains manual-only.

## Helpful API routes

- Dry run: `/api/system/integrity/run?mode=scan`
- Safe repair sweep: `/api/system/integrity/run?mode=repair`
- Health snapshot: `/api/system/integrity/health`
