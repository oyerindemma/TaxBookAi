# TaxBook AI Beta Onboarding Guide

Last updated: 2026-04-28

Use this guide for the first controlled beta cohort of Nigerian SMEs and
accountants. The goal is to prove that a real user can move from account setup
to a first tax estimate, useful reports, and exportable records without a
dead-end workflow.

## 1. Cohort Shape

- Start with 5 to 8 pilot users.
- Include at least 3 SMEs that own their bookkeeping directly.
- Include at least 2 accountants/bookkeepers who manage client businesses.
- Prefer businesses with bank statements, invoices, receipts, VAT/WHT exposure,
  and willingness to give workflow feedback.
- Avoid highly regulated or complex enterprise tax cases in the first cohort.

## 2. Pilot Invite Script

Hi [Name],

We are running a controlled beta for TaxBook AI, a Nigerian SME bookkeeping and
tax workflow tool. We would like you to test account setup, transaction import,
review, tax estimates, reports, and exports with either demo data or your own
sample records.

The beta is for product feedback, not final tax filing advice. We will ask for
short workflow notes after each session and will prioritise fixes that block
setup, import, review, tax snapshots, reports, payments, or exports.

## 3. Onboarding Session

1. Create account or log in.
2. Create or select workspace.
3. Complete business profile.
4. Add a client business where relevant.
5. Add bank account.
6. Import CSV or add manual transactions.
7. Review and categorise transactions.
8. Generate first tax snapshot.
9. Open dashboard, tax centre, reports, invoices, and exports.
10. Record blockers and confusing copy immediately.

Target session length: 45 to 60 minutes.

## 4. Demo Data Setup

Run demo seeding only in local development or a controlled preview database:

```bash
cd webapp
npm run seed:beta -- --with-issues true
```

For a cleaner walkthrough without deliberate integrity issues:

```bash
cd webapp
npm run seed:beta -- --clean
```

The seed prints the demo email, password, workspace id, invoice counts, payment
counts, ledger rows, tax rows, and primary demo scenarios. Do not run it against
production.

## 5. Beta User Tasks

- Add one manual income transaction.
- Add one manual expense transaction.
- Import a sample bank CSV.
- Resolve one duplicate or review-required transaction.
- Categorise at least 5 transactions.
- Generate a tax estimate.
- Explain what made the tax estimate feel trusted or untrusted.
- Export one report for an accountant.
- Create or review one invoice/payment flow if relevant.

## 6. Success Metrics

- Time to first tax estimate: target under 20 minutes with sample data.
- Time to first useful report: target under 30 minutes.
- Import completion: at least 80% of users can preview/import without help.
- Categorisation confidence: users understand what needs review.
- Tax confidence: users understand estimate vs review-needed vs filing-ready.
- Export usefulness: accountants can identify the period, workspace, source, and totals.

## 7. Beta Exit Criteria

- No P0 or P1 blockers remain open.
- Every pilot can complete the SME golden path or the blocker is documented.
- Support process captures trace id, workspace, workflow, severity, and outcome.
- Top 5 workflow issues have fixes, workarounds, or explicit post-beta decisions.
