# Beta Feedback Tracker

Last updated: 2026-04-28

Use this tracker during pilot sessions and weekly triage. One row equals one
specific workflow observation, not a whole interview.

## Workflow Tags

- `auth`
- `workspace`
- `onboarding`
- `banking-import`
- `review`
- `categorisation`
- `tax-snapshot`
- `tax-filing`
- `reports`
- `exports`
- `invoices`
- `payments`
- `billing`
- `ai`
- `offline`
- `mobile`
- `settings`
- `support`

## Status Values

- `new`
- `triaged`
- `blocked`
- `fixing`
- `fixed`
- `deferred`
- `closed`

## Tracker Table

| ID | Date | Pilot | Role | Workflow | Severity | Observation | Evidence | Trace ID | Owner | Status | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BETA-001 | 2026-04-28 | Demo pilot | Accountant | banking-import | P2 | CSV import needs clear business/account setup guidance. | Session notes | n/a | Product | fixed | Verify in next walkthrough. |
| BETA-002 | 2026-04-28 | Demo pilot | SME | tax-snapshot | P1 | Tax estimate must generate even before all transactions are categorised. | Step 4 test suite | n/a | Engineering | fixed | Recheck during live pilot. |
| BETA-003 | 2026-04-28 | Demo pilot | Accountant | reports | P2 | Empty reports need a clear next step to review/post banking data. | UI pass | n/a | Product | fixed | Confirm accountant understands report source. |

## CSV Header

```csv
id,date,pilot,role,workflow,severity,observation,evidence,trace_id,owner,status,next_action
```

## Triage Rules

- Promote repeated P2 issues to P1 when they block more than one pilot from
  completing a workflow.
- Keep tax/legal confidence feedback separate from UI copy feedback.
- Mark feedback as `closed` only after the pilot confirms the fix or the team
  records a clear post-beta decision.
- Link all P0/P1 items to `docs/beta-blocker-register.md`.
