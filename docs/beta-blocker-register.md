# Beta Blocker Register

Last updated: 2026-04-28

This register tracks issues that can block or materially damage beta success.
Keep it short, current, and linked to fixes.

## Severity

- P0: stop beta immediately for affected workflow or environment.
- P1: fix before expanding the beta cohort.
- P2: fix during beta unless explicitly deferred.
- P3: polish or post-beta.

## Current Register

| ID | Severity | Workflow | Blocker | Current State | Owner | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| BB-001 | P1 | production-env | Strict health still fails until production Redis, SMTP, Paystack webhook secret, and public APP_URL are configured. | Known environment gap. | Ops | Must close before production beta. |
| BB-002 | P1 | tax | Nigerian tax logic needs final expert review before users treat output as filing-ready. | Fixture tests exist; expert review pending. | Tax/Product | Keep outputs labelled estimate/review-needed until reviewed. |
| BB-003 | P1 | payments | Paystack live-mode checkout/webhook must be verified with real test/live credentials in preview. | Code hardened; environment verification pending. | Engineering/Ops | Run payment smoke before invoice pilots. |
| BB-004 | P2 | exports | Large compliance exports require Redis-backed worker running continuously. | Worker exists; runtime process must be supervised. | Ops | Verify before accountant pilots. |
| BB-005 | P2 | offline | Offline mode is limited to cached reads and lightweight queued actions. | Documented launch constraint. | Product | Position as beta limitation, not blocker. |
| BB-006 | P2 | lint | Existing lint warnings remain for unused helpers and hook dependency reviews. | No lint errors. | Engineering | Resolve or explicitly accept before public launch. |

## Fix Priority Rules

1. Tenant isolation, auth, data loss, and payment correctness always outrank polish.
2. Golden-path blockers outrank secondary workflow polish.
3. Repeated pilot confusion outranks one-off preference feedback.
4. Tax confidence issues must be fixed in copy, labelling, or logic before public launch.

## Weekly Review Template

- New P0/P1 issues:
- Fixed this week:
- Deferred with reason:
- Top workflow causing friction:
- Next release target:
